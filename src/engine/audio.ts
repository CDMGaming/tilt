// Audio engine: owns the AudioContext, one worklet node per track, the master
// bus, the look-ahead scheduler, live notes and offline rendering.
// Uses Web Audio but never the DOM.

import processorUrl from "./dsp/processor.ts?worker&url";
import type { InstrumentMessage, InstrumentOptions, TimedEvent } from "./dsp/processor";
import { KIT_SAMPLES } from "./instruments";
import { PPQ, sceneTicks, sceneTempo, type Master, type Song, type Track } from "./model";
import { workletParams } from "./params";
import {
  eventsInWindow, expandPitch, firstInstance, nextInstance, secPerTick, wholeSong,
  type NoteEvent, type PlayMode, type SceneInstance,
} from "./timeline";

const LOOKAHEAD = 0.12; // seconds of events posted ahead of the audio clock
const TICK_MS = 25;

interface TrackNodes {
  id: number;
  kind: Track["kind"];
  node: AudioWorkletNode;
  gain: GainNode; // mute / solo only; volume and pan live in the worklet (automatable)
  sendGain: GainNode;
  meter: AnalyserNode;
  paramsJson: string;
}

export interface Position { sceneId: number; tick: number; ticks: number; repeat: number; repeats: number; instStart: number }

export class AudioEngine {
  ctx!: AudioContext;
  private master!: MasterNodes;
  private tracks = new Map<number, TrackNodes>();
  private samples: Float32Array[] = [];
  private samplesRate = 48000;
  private song!: Song;

  // transport
  playing = false;
  private mode: PlayMode = { kind: "scene", sceneId: 0 };
  private instances: SceneInstance[] = [];
  private scheduledUntil = 0;
  private timer: number | undefined;
  private liveChords = new Map<string, number[]>();
  onEnded: (() => void) | null = null;

  async init(song: Song, opts: AudioContextOptions = { latencyHint: "interactive" }) {
    this.ctx = new AudioContext(opts);
    await this.ctx.audioWorklet.addModule(processorUrl);
    this.master = buildMaster(this.ctx);
    await this.loadKit();
    this.sync(song);
  }

  /** Output delay the listener hears on top of the context clock. */
  get latency(): number {
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
  }

  private async loadKit() {
    const bufs = await Promise.all(KIT_SAMPLES.map(async (name) => {
      const res = await fetch(`${import.meta.env.BASE_URL}kit/${name}.wav`);
      return this.ctx.decodeAudioData(await res.arrayBuffer());
    }));
    this.samplesRate = this.ctx.sampleRate; // decodeAudioData resamples to the context rate
    this.samples = bufs.map((b) => b.getChannelData(0).slice());
  }

  // ------------------------------------------------------------ track graph

  /** Bring audio nodes in line with the song. Cheap; call after every edit. */
  sync(song: Song) {
    this.song = song;
    const soloing = song.tracks.some((t) => t.solo);
    const seen = new Set<number>();
    for (const t of song.tracks) {
      seen.add(t.id);
      let tn = this.tracks.get(t.id);
      if (tn && tn.kind !== t.kind) { this.dispose(tn); tn = undefined; }
      if (!tn) {
        tn = createTrackNodes(this.ctx, t, {
          kind: t.kind, params: workletParams(t), samples: t.kind === "drums" ? this.samples : undefined,
          samplesRate: this.samplesRate, clock: { bpm: song.tempo, zero: 0 },
        }, this.master);
        this.tracks.set(t.id, tn);
      }
      const params = workletParams(t);
      const json = JSON.stringify(params);
      if (json !== tn.paramsJson) {
        tn.paramsJson = json;
        this.post(tn, { t: "params", params });
      }
      const audible = !t.mute && (!soloing || t.solo) ? 1 : 0;
      tn.gain.gain.setTargetAtTime(audible, this.ctx.currentTime, 0.01);
      tn.sendGain.gain.setTargetAtTime(audible, this.ctx.currentTime, 0.01);
    }
    for (const [id, tn] of this.tracks) if (!seen.has(id)) { this.dispose(tn); this.tracks.delete(id); }
    applyMaster(this.master, song.master, this.ctx.currentTime);
    if (this.playing) this.reanchor();
  }

  /** Peak level (0..1) of a track's output, for meters. */
  meter(trackId: number): number {
    const tn = this.tracks.get(trackId);
    return tn ? peak(tn.meter) : 0;
  }

  masterMeter(): number { return peak(this.master.analyser); }

  get analyser() { return this.master.analyser; }

  private dispose(tn: TrackNodes) {
    this.post(tn, { t: "stop" });
    tn.node.disconnect();
    tn.gain.disconnect();
    tn.sendGain.disconnect();
  }

  private post(tn: TrackNodes, m: InstrumentMessage) {
    tn.node.port.postMessage(m);
  }

  // ------------------------------------------------------------ live input

  noteOn(trackId: number, pitch: number, vel: number) {
    const t = this.song.tracks.find((x) => x.id === trackId);
    const tn = this.tracks.get(trackId);
    if (!t || !tn) return;
    if (this.ctx.state !== "running") void this.ctx.resume();
    const pitches = expandPitch(this.song, t, pitch);
    this.liveChords.set(`${trackId}:${pitch}`, pitches);
    for (const p of pitches) this.post(tn, { t: "live", type: "on", pitch: p, vel });
  }

  noteOff(trackId: number, pitch: number) {
    const tn = this.tracks.get(trackId);
    const key = `${trackId}:${pitch}`;
    const pitches = this.liveChords.get(key) ?? [pitch];
    this.liveChords.delete(key);
    if (tn) for (const p of pitches) this.post(tn, { t: "live", type: "off", pitch: p, vel: 0 });
  }

  /** Short preview note (piano-roll note preview, pad taps). */
  preview(trackId: number, pitch: number, vel = 100, dur = 0.18) {
    this.noteOn(trackId, pitch, vel);
    setTimeout(() => this.noteOff(trackId, pitch), dur * 1000);
  }

  // ------------------------------------------------------------ transport

  /**
   * Start playback. `countIn` beats of metronome clicks play first (the
   * recording lead-in); returns the context time the song itself starts.
   */
  play(mode: PlayMode, countIn = 0): number {
    if (this.playing) this.stop();
    if (this.ctx.state !== "running") void this.ctx.resume();
    this.mode = mode;
    const now = this.ctx.currentTime + 0.06;
    const first = firstInstance(this.song, mode, now);
    if (!first) return now;
    const beat = first.secPerTick * PPQ;
    const start = now + countIn * beat;
    first.startTime = start;
    for (let k = 0; k < countIn; k++) this.click(now + k * beat, k === 0);
    this.instances = [first];
    this.scheduledUntil = start;
    this.playing = true;
    this.master.fade.gain.cancelScheduledValues(0);
    this.master.fade.gain.setValueAtTime(1, this.ctx.currentTime);
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS) as unknown as number;
    return start;
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    for (const tn of this.tracks.values()) {
      this.post(tn, { t: "stop" });
      // Automation moved params inside the worklet: put every knob back where the song says.
      tn.paramsJson = "";
    }
    this.instances = [];
    this.master.fade.gain.cancelScheduledValues(0);
    this.master.fade.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02);
    this.sync(this.song);
  }

  /** Change which scene loops (or switch to song mode) without stopping; takes effect at the next scene boundary. */
  queue(mode: PlayMode) {
    this.mode = mode;
    if (!this.playing) return;
    const cur = this.currentInstance(this.scheduledUntil);
    this.instances = cur ? [cur] : this.instances.slice(0, 1);
  }

  get playMode(): PlayMode { return this.mode; }

  private currentInstance(t: number): SceneInstance | undefined {
    return this.instances.find((i) => t >= i.startTime && t < i.startTime + i.ticks * i.secPerTick);
  }

  /** After a song edit while playing: keep the playhead where it is but pick up new tempo / scene length. */
  private reanchor() {
    const t = this.scheduledUntil;
    const cur = this.currentInstance(t);
    if (!cur) return;
    const sc = this.song.scenes.find((s) => s.id === cur.sceneId);
    if (!sc) return;
    const tick = (t - cur.startTime) / cur.secPerTick;
    const spt = secPerTick(sceneTempo(this.song, sc));
    const ticks = sceneTicks(this.song, sc.id);
    if (spt === cur.secPerTick && ticks === cur.ticks) return;
    cur.secPerTick = spt;
    cur.startTime = t - tick * spt;
    cur.ticks = Math.max(ticks, Math.ceil(tick)); // never jump backwards mid-scene
    this.instances = [cur];
  }

  private tick() {
    const now = this.ctx.currentTime;
    const until = now + LOOKAHEAD;
    if (this.scheduledUntil < now) this.scheduledUntil = now; // tab was throttled; don't play a backlog
    // Extend the instance list to cover the window.
    let last = this.instances[this.instances.length - 1];
    while (last && last.startTime + last.ticks * last.secPerTick < until) {
      const next = nextInstance(this.song, this.mode, last);
      if (!next) break;
      this.instances.push(next);
      last = next;
    }
    const byTrack = new Map<number, TimedEvent[]>();
    for (const inst of this.instances) {
      const end = inst.startTime + inst.ticks * inst.secPerTick;
      if (end <= this.scheduledUntil || inst.startTime >= until) continue;
      if (inst.startTime >= this.scheduledUntil) this.onInstanceStart(inst);
      for (const ev of eventsInWindow(this.song, inst, this.scheduledUntil, until)) push(byTrack, ev);
      if (this.song.metronome) this.clicks(inst, this.scheduledUntil, until);
    }
    for (const [id, evs] of byTrack) {
      const tn = this.tracks.get(id);
      if (tn) this.post(tn, { t: "events", events: evs });
    }
    this.scheduledUntil = until;
    // Drop finished instances (keep one for position lookups) and detect song end.
    while (this.instances.length > 1 && this.instances[0].startTime + this.instances[0].ticks * this.instances[0].secPerTick < now - 0.5) this.instances.shift();
    const tail = this.instances[this.instances.length - 1];
    if (tail && !nextInstance(this.song, this.mode, tail) && now > tail.startTime + tail.ticks * tail.secPerTick + 0.1) {
      this.stop();
      this.onEnded?.();
    }
  }

  private onInstanceStart(inst: SceneInstance) {
    const bpm = 60 / (inst.secPerTick * PPQ);
    for (const tn of this.tracks.values()) this.post(tn, { t: "clock", clock: { bpm, zero: inst.startTime } });
    scheduleFade(this.master.fade.gain, inst);
  }

  private clicks(inst: SceneInstance, t0: number, t1: number) {
    for (let tick = 0; tick < inst.ticks; tick += PPQ) {
      const t = inst.startTime + tick * inst.secPerTick;
      if (t < t0 || t >= t1) continue;
      this.click(t, tick % (PPQ * 4) === 0);
    }
  }

  private click(t: number, accent: boolean) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.master.limiter);
    o.start(t);
    o.stop(t + 0.06);
  }

  /** What the listener is hearing right now. */
  position(): Position | null {
    if (!this.playing) return null;
    const t = this.heardTime(performance.now());
    const inst = this.currentInstance(t) ?? this.instances[0];
    if (!inst) return null;
    const tick = Math.max(0, Math.min(inst.ticks - 1, (t - inst.startTime) / inst.secPerTick));
    return { sceneId: inst.sceneId, tick, ticks: inst.ticks, repeat: inst.repeat, repeats: inst.repeats, instStart: inst.startTime };
  }

  /**
   * The context time the listener was hearing at a performance.now() moment
   * (MIDI/keyboard event timestamps). Players play along with what they hear,
   * so recording uses this, which compensates for the output latency.
   */
  heardTime(perfMs: number): number {
    const ts = this.ctx.getOutputTimestamp();
    if (ts.contextTime === undefined || ts.performanceTime === undefined || ts.performanceTime === 0) {
      return this.ctx.currentTime - this.latency;
    }
    return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
  }

  /** Scene and tick being heard at context time `heard`. */
  tickAtHeard(heard: number): { sceneId: number; tick: number; secPerTick: number } | null {
    const first = this.instances[0];
    // During a count-in: the last half beat counts as beat 1 (players often rush the downbeat); earlier is ignored.
    const early = first && heard < first.startTime ? (first.startTime - heard <= first.secPerTick * PPQ * 0.5 ? first : null) : undefined;
    if (early === null) return null;
    const inst = this.currentInstance(heard) ?? early;
    if (!inst) return null;
    return { sceneId: inst.sceneId, tick: Math.max(0, (heard - inst.startTime) / inst.secPerTick), secPerTick: inst.secPerTick };
  }

  async setOutputDevice(id: string) {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (c.setSinkId) await c.setSinkId(id);
  }

  // ------------------------------------------------------------ offline render

  /**
   * Render the whole song once (no loop) plus a tail.
   * `onlyTrack` renders a single track (stems / single-track export).
   */
  async render(song: Song, opts: { tail: number; sampleRate?: number; onlyTrack?: number }): Promise<AudioBuffer> {
    const sr = opts.sampleRate ?? 44100;
    const { events, duration, instances } = wholeSong(song);
    const length = Math.ceil((duration + opts.tail) * sr);
    const off = new OfflineAudioContext(2, Math.max(1, length), sr);
    await off.audioWorklet.addModule(processorUrl);
    const m = buildMaster(off);
    const soloing = song.tracks.some((t) => t.solo);
    const byTrack = new Map<number, TimedEvent[]>();
    for (const ev of events) push(byTrack, ev);
    // Re-decode the kit at the offline rate so drums play at the right pitch.
    const samples = this.samplesRate === sr ? this.samples : await resample(this.samples, this.samplesRate, sr);
    for (const t of song.tracks) {
      if (opts.onlyTrack !== undefined && t.id !== opts.onlyTrack) continue;
      const tn = createTrackNodes(off, t, {
        kind: t.kind, params: workletParams(t), samples: t.kind === "drums" ? samples : undefined, samplesRate: sr,
        events: byTrack.get(t.id) ?? [], clock: { bpm: song.tempo, zero: 0 },
      }, m);
      const audible = opts.onlyTrack !== undefined || (!t.mute && (!soloing || t.solo)) ? 1 : 0;
      tn.gain.gain.value = audible;
      tn.sendGain.gain.value = audible;
    }
    applyMaster(m, song.master, 0);
    for (const inst of instances) scheduleFade(m.fade.gain, inst);
    return off.startRendering();
  }
}

// ---------------------------------------------------------------- helpers

function push(map: Map<number, TimedEvent[]>, ev: NoteEvent) {
  let a = map.get(ev.trackId);
  if (!a) map.set(ev.trackId, (a = []));
  a.push({ time: ev.time, type: ev.type, pitch: ev.pitch, vel: ev.vel, key: ev.key, value: ev.value });
}

function peak(an: AnalyserNode): number {
  const buf = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(buf);
  let p = 0;
  for (const v of buf) p = Math.max(p, Math.abs(v));
  return p;
}

interface MasterNodes {
  ctx: BaseAudioContext;
  input: GainNode; // tracks sum here
  reverbIn: GainNode; // track sends sum here
  convolver: ConvolverNode;
  reverbReturn: GainNode;
  volume: GainNode;
  fade: GainNode;
  limiter: DynamicsCompressorNode;
  makeup: GainNode;
  analyser: AnalyserNode;
  irTime: number;
}

function buildMaster(ctx: BaseAudioContext): MasterNodes {
  const input = ctx.createGain();
  const reverbIn = ctx.createGain();
  const convolver = ctx.createConvolver();
  const reverbReturn = ctx.createGain();
  const volume = ctx.createGain();
  const fade = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.knee.value = 0;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const makeup = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  // Last stage: a soft clipper, so peaks the limiter lets through round off below 0 dBFS.
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1, a = Math.abs(x);
    curve[i] = a < 0.8 ? x : Math.sign(x) * (0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19));
  }
  clip.curve = curve;
  clip.oversample = "2x";
  input.connect(volume);
  reverbIn.connect(convolver).connect(reverbReturn).connect(volume);
  volume.connect(fade).connect(limiter).connect(makeup).connect(clip).connect(analyser).connect(ctx.destination);
  return { ctx, input, reverbIn, convolver, reverbReturn, volume, fade, limiter, makeup, analyser, irTime: -1 };
}

/** Apply the song's master section: volume, limiter on/depth, reverb on/time. */
function applyMaster(m: MasterNodes, s: Master, now: number) {
  m.volume.gain.setTargetAtTime(s.volume * s.volume * 1.2, now, 0.02);
  if (s.limiter) {
    // Depth pushes the level into the limiter: louder and denser.
    m.limiter.threshold.setValueAtTime(-1 - s.limitDepth * 14, now);
    m.limiter.ratio.setValueAtTime(20, now);
    m.makeup.gain.setTargetAtTime(Math.pow(10, (s.limitDepth * 14 * 0.6) / 20), now, 0.02);
  } else {
    m.limiter.threshold.setValueAtTime(0, now);
    m.limiter.ratio.setValueAtTime(1, now);
    m.makeup.gain.setTargetAtTime(1, now, 0.02);
  }
  m.reverbReturn.gain.setTargetAtTime(s.reverb ? 1 : 0, now, 0.02);
  if (Math.abs(m.irTime - s.reverbTime) > 0.02) {
    m.irTime = s.reverbTime;
    m.convolver.buffer = reverbIR(m.ctx, 0.4 + s.reverbTime * 4.6);
  }
}

/** Synthetic stereo impulse response: decaying noise that gets darker over time. */
function reverbIR(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = 0.15 + 0.8 * Math.exp((-t * 3) / seconds); // high frequencies die first
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * Math.pow(1 - i / n, 2.2) * (i < sr * 0.01 ? i / (sr * 0.01) : 1) * 0.5;
    }
  }
  return buf;
}

function createTrackNodes(ctx: BaseAudioContext, t: Track, opts: InstrumentOptions, m: MasterNodes): TrackNodes {
  const node = new AudioWorkletNode(ctx, "rb-instrument", {
    numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2], processorOptions: opts,
  });
  const gain = ctx.createGain();
  const sendGain = ctx.createGain();
  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  node.connect(gain, 0).connect(m.input);
  gain.connect(meter);
  node.connect(sendGain, 1).connect(m.reverbIn);
  return { id: t.id, kind: t.kind, node, gain, sendGain, meter, paramsJson: JSON.stringify(opts.params) };
}

function scheduleFade(g: AudioParam, inst: SceneInstance) {
  const end = inst.startTime + inst.ticks * inst.secPerTick;
  if (inst.fadeIn) {
    g.setValueAtTime(0.0001, inst.startTime);
    g.linearRampToValueAtTime(1, end);
  } else if (inst.fadeOut) {
    g.setValueAtTime(1, inst.startTime);
    g.linearRampToValueAtTime(0.0001, end);
  } else {
    g.setValueAtTime(1, inst.startTime);
  }
}

async function resample(data: Float32Array[], from: number, to: number): Promise<Float32Array[]> {
  return Promise.all(data.map(async (d) => {
    const len = Math.ceil((d.length * to) / from);
    const off = new OfflineAudioContext(1, len, to);
    const b = off.createBuffer(1, d.length, from);
    b.getChannelData(0).set(d);
    const src = off.createBufferSource();
    src.buffer = b;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0).slice();
  }));
}
