import workletUrl from "./latency-worklet.ts?worker&url";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Source = "midi" | "key" | "auto";
interface Pending { id: number; t0: number; source: Source; handlerLag: number; burst: boolean }
interface Result { source: Source; totalMs: number; handlerLagMs: number }

let ctx: AudioContext | null = null;
let synth: AudioWorkletNode | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const results: Result[] = [];
const acoustic: number[] = [];
const logLines: string[] = [];
let midiNames: string[] = [];

function log(s: string) {
  logLines.push(s);
  if (logLines.length > 400) logLines.shift();
  const el = $("log");
  el.textContent = logLines.join("\n");
  el.scrollTop = el.scrollHeight;
}

// ---------- engine ----------

async function startAudio() {
  if (ctx) await ctx.close();
  const hintSel = ($("hint") as HTMLSelectElement).value;
  const rateSel = ($("rate") as HTMLSelectElement).value;
  const opts: AudioContextOptions = {
    latencyHint: isNaN(Number(hintSel)) ? (hintSel as AudioContextLatencyCategory) : Number(hintSel),
  };
  if (rateSel) opts.sampleRate = Number(rateSel);
  const sink = ($("sink") as HTMLSelectElement).value;
  // sinkId is Chrome 110+; not yet in the TS DOM lib.
  if (sink) (opts as AudioContextOptions & { sinkId?: string }).sinkId = sink;
  ctx = new AudioContext(opts);
  await ctx.audioWorklet.addModule(workletUrl);
  synth = new AudioWorkletNode(ctx, "probe-synth", { outputChannelCount: [2] });
  synth.connect(ctx.destination);
  synth.port.onmessage = (e) => onStarted(e.data.id, e.data.frame);
  await ctx.resume();
  // outputLatency is only filled in once audio is actually flowing.
  setTimeout(showEngine, 400);
  showEngine();
  for (const id of ["midiBtn", "autoBtn", "resetBtn", "micBtn"]) ($(id) as HTMLButtonElement).disabled = false;
  $("start").textContent = "Restart audio with these settings";
  log(`audio started: hint=${hintSel} rate=${ctx.sampleRate} device=${sinkLabel()}`);
}

function sinkLabel(): string {
  const sel = $("sink") as HTMLSelectElement;
  return sel.selectedOptions[0]?.textContent ?? "Windows default";
}

async function listSinks(unlock: boolean) {
  if (unlock) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch { /* names stay hidden; ids still work */ }
  }
  const sel = $("sink") as HTMLSelectElement;
  const keep = sel.value;
  const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
  sel.innerHTML = `<option value="">Windows default</option>` +
    outs.filter((d) => d.deviceId && d.deviceId !== "default")
      .map((d, i) => `<option value="${d.deviceId}">${d.label || `output ${i + 1}`}</option>`).join("");
  sel.value = keep;
  const def = outs.find((d) => d.deviceId === "default");
  if (def?.label) sel.options[0].textContent = `Windows default (${def.label.replace(/^Default - /, "")})`;
}

function showEngine() {
  if (!ctx) return;
  const base = ctx.baseLatency * 1000;
  const out = (ctx.outputLatency ?? 0) * 1000;
  $("engineInfo").innerHTML =
    `Sample rate <b>${ctx.sampleRate}</b> Hz · base latency <b>${base.toFixed(1)}</b> ms · ` +
    `reported output latency <b>${out.toFixed(1)}</b> ms · state ${ctx.state}`;
}

function trigger(source: Source, t0: number, note: number) {
  if (!ctx || !synth) return;
  const id = nextId++;
  const handlerLag = performance.now() - t0;
  const burst = micOn;
  pending.set(id, { id, t0, source, handlerLag, burst });
  synth.port.postMessage({ type: "on", id, note, burst });
  if (micOn) scheduleAcoustic(t0);
}

function onStarted(id: number, frame: number) {
  const p = pending.get(id);
  if (!p || !ctx) return;
  pending.delete(id);
  const ts = ctx.getOutputTimestamp();
  if (ts.contextTime === undefined || ts.performanceTime === undefined) return;
  const startCtx = frame / ctx.sampleRate;
  // performanceTime is when the frame at contextTime reaches the output device.
  // That makes this frame's arrival time a straight extrapolation from it.
  const soundOut = ts.performanceTime + (startCtx - ts.contextTime) * 1000;
  const total = soundOut - p.t0;
  results.push({ source: p.source, totalMs: total, handlerLagMs: p.handlerLag });
  $("last").textContent = `${total.toFixed(1)} ms`;
  renderStats();
  log(`${p.source.padEnd(4)} total ${total.toFixed(2)} ms  (event→handler ${p.handlerLag.toFixed(2)} ms)`);
}

// ---------- stats ----------

function summarize(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const q = (p: number) => s[Math.min(n - 1, Math.floor(p * (n - 1) + 0.5))];
  return { n, min: s[0], median: q(0.5), mean, p95: q(0.95), max: s[n - 1], sd };
}

function statGrid(el: HTMLElement, xs: number[]) {
  if (!xs.length) { el.innerHTML = ""; return; }
  const m = summarize(xs);
  const cells: [string, string][] = [
    ["notes", String(m.n)], ["median", m.median.toFixed(1) + " ms"], ["mean", m.mean.toFixed(1) + " ms"],
    ["min", m.min.toFixed(1) + " ms"], ["95th pct", m.p95.toFixed(1) + " ms"], ["max", m.max.toFixed(1) + " ms"],
    ["jitter (sd)", m.sd.toFixed(2) + " ms"],
  ];
  el.innerHTML = cells.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

function renderStats() {
  statGrid($("stats"), results.map((r) => r.totalMs));
  statGrid($("acStats"), acoustic);
  const ref = acoustic.length >= 5 ? summarize(acoustic).median : results.length ? summarize(results.map((r) => r.totalMs)).median : NaN;
  if (!isNaN(ref)) {
    const v = $("verdict");
    // Rough guide: under ~12 ms feels like hardware; 12-20 is fine for
    // sequencing and most live play; above ~25 is noticeable on drums.
    if (ref < 12) v.innerHTML = `<span class="ok">Feels immediate. Web audio is fine.</span>`;
    else if (ref < 20) v.innerHTML = `<span class="ok">Playable. Fine for a sequencer-first app.</span>`;
    else if (ref < 30) v.innerHTML = `Noticeable when finger-drumming. Try the smallest latency hint.`;
    else v.innerHTML = `<span class="bad">Too slow for live play. Check the audio device, or consider native.</span>`;
  }
}

// ---------- inputs ----------

async function enableMidi() {
  if (!navigator.requestMIDIAccess) { $("midiInfo").textContent = "This browser has no Web MIDI."; return; }
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const bind = () => {
      midiNames = [];
      access.inputs.forEach((input) => {
        midiNames.push(input.name ?? "?");
        input.onmidimessage = (e: MIDIMessageEvent) => {
          const d = e.data;
          if (!d || d.length < 3) return;
          const isOn = (d[0] & 0xf0) === 0x90 && d[2] > 0;
          if (isOn) trigger("midi", e.timeStamp, d[1]);
        };
      });
      $("midiInfo").textContent = midiNames.length ? `Listening to: ${midiNames.join(", ")}` : "MIDI enabled, but no input devices found. Plug one in. It is picked up live.";
      log(`midi inputs: ${midiNames.join(", ") || "(none)"}`);
    };
    access.onstatechange = bind;
    bind();
  } catch (err) {
    $("midiInfo").textContent = `MIDI permission refused: ${err}`;
  }
}

const KEYMAP = "awsedftgyhujk";
window.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const i = KEYMAP.indexOf(e.key.toLowerCase());
  if (i >= 0) trigger("key", e.timeStamp, 60 + i);
});

function autoTest() {
  let n = 0;
  const btn = $("autoBtn") as HTMLButtonElement;
  btn.disabled = true;
  const tick = () => {
    trigger("auto", performance.now(), 60 + (n % 12));
    if (++n < 40) setTimeout(tick, 180 + Math.random() * 120);
    else btn.disabled = false;
  };
  tick();
}

// ---------- acoustic ----------

let micOn = false;
const MIC_SECONDS = 3;
let micBuf: Float32Array | null = null;
let micWrite = 0; // total frames written (monotonic, in mic-tap frame units)
let micFrameAtWrite = 0; // context frame of the newest sample

async function enableMic() {
  if (!ctx) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = ctx.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(ctx, "mic-tap", { numberOfInputs: 1, numberOfOutputs: 0 });
    src.connect(tap);
    micBuf = new Float32Array(ctx.sampleRate * MIC_SECONDS);
    tap.port.onmessage = (e) => {
      const data: Float32Array = e.data.data;
      for (let i = 0; i < data.length; i++) micBuf![(micWrite + i) % micBuf!.length] = data[i];
      micWrite += data.length;
      micFrameAtWrite = e.data.frame + data.length;
    };
    micOn = true;
    $("micInfo").textContent = `On (${stream.getAudioTracks()[0]?.label ?? "mic"}). Notes now play a 4 kHz beep. Tap pads firmly, about a second apart.`;
    log("mic enabled");
  } catch (err) {
    $("micInfo").textContent = `Microphone refused: ${err}`;
  }
}

function scheduleAcoustic(t0: number) {
  // Wait long enough that both sounds are in the buffer, then analyse.
  setTimeout(() => analyseAcoustic(t0), 700);
}

function analyseAcoustic(t0: number) {
  if (!ctx || !micBuf) return;
  const sr = ctx.sampleRate;
  const ts = ctx.getOutputTimestamp();
  if (ts.contextTime === undefined || ts.performanceTime === undefined) return;
  // Rough position of the key event on the context timeline. Mic input arrives
  // late by the input latency, so the window is generous on the late side.
  const ctxAtT0 = ts.contextTime + (t0 - ts.performanceTime) / 1000;
  const startFrame = Math.round((ctxAtT0 - 0.15) * sr);
  const endFrame = Math.round((ctxAtT0 + 0.5) * sr);
  const oldest = micFrameAtWrite - Math.min(micWrite, micBuf.length);
  if (startFrame < oldest || endFrame > micFrameAtWrite) { log("acoustic: window not in buffer, skipped"); return; }
  const len = endFrame - startFrame;
  const seg = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const back = micFrameAtWrite - (startFrame + i); // frames before newest
    seg[i] = micBuf[(((micWrite - back) % micBuf.length) + micBuf.length) % micBuf.length];
  }
  const low = biquad(seg, sr, "lowpass", 1500, 0.7);
  const band = biquad(biquad(seg, sr, "bandpass", 4000, 6), sr, "bandpass", 4000, 6);
  const hop = Math.round(sr / 2000); // 0.5 ms
  const envLow = envelope(low, hop);
  const envBand = envelope(band, hop);
  const beep = onset(envBand, 8, 0.3);
  if (beep < 0) { log("acoustic: no beep heard, so turn the speakers up or move the mic closer"); return; }
  // The tap must come before the beep. Search only up to the beep.
  const tap = onset(envLow.slice(0, beep), 6, 0.3);
  if (tap < 0) { log("acoustic: beep heard but no tap before it. Tap harder, mic closer to the pad"); return; }
  const gap = ((beep - tap) * hop / sr) * 1000;
  if (gap < 1 || gap > 300) { log(`acoustic: implausible gap ${gap.toFixed(1)} ms, skipped`); return; }
  acoustic.push(gap);
  renderStats();
  log(`acoustic tap→beep ${gap.toFixed(1)} ms`);
}

function envelope(x: Float32Array, hop: number): Float32Array {
  const n = Math.floor(x.length / hop);
  const e = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < hop; i++) s += x[k * hop + i] ** 2;
    e[k] = Math.sqrt(s / hop);
  }
  return e;
}

// First index where the envelope rises past max(noise floor x factor, peak x frac).
function onset(env: Float32Array, factor: number, frac: number): number {
  if (env.length < 20) return -1;
  const head = Array.from(env.slice(0, Math.max(10, Math.floor(env.length * 0.15)))).sort((a, b) => a - b);
  const floor = head[Math.floor(head.length / 2)] + 1e-6;
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  const thr = Math.max(floor * factor, peak * frac);
  if (peak < floor * factor) return -1;
  for (let i = 0; i < env.length; i++) if (env[i] >= thr) return i;
  return -1;
}

function biquad(x: Float32Array, sr: number, type: "lowpass" | "bandpass", f: number, q: number): Float32Array {
  const w = (2 * Math.PI * f) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === "lowpass") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// ---------- report ----------

function report(): string {
  const lines = [
    `Rollbox latency report: ${new Date().toISOString()}`,
    `UA: ${navigator.userAgent}`,
    ctx ? `engine: rate=${ctx.sampleRate} base=${(ctx.baseLatency * 1000).toFixed(2)}ms output=${((ctx.outputLatency ?? 0) * 1000).toFixed(2)}ms hint=${($("hint") as HTMLSelectElement).value} device=${sinkLabel()}` : "engine: not started",
    `midi inputs: ${midiNames.join(", ") || "(none)"}`,
  ];
  for (const src of ["midi", "key", "auto"] as Source[]) {
    const xs = results.filter((r) => r.source === src);
    if (!xs.length) continue;
    const m = summarize(xs.map((r) => r.totalMs));
    const lag = summarize(xs.map((r) => r.handlerLagMs));
    lines.push(`${src}: n=${m.n} median=${m.median.toFixed(1)} mean=${m.mean.toFixed(1)} min=${m.min.toFixed(1)} p95=${m.p95.toFixed(1)} max=${m.max.toFixed(1)} sd=${m.sd.toFixed(2)} ms | event→handler median ${lag.median.toFixed(2)} ms`);
  }
  if (acoustic.length) {
    const m = summarize(acoustic);
    lines.push(`acoustic tap→sound: n=${m.n} median=${m.median.toFixed(1)} mean=${m.mean.toFixed(1)} min=${m.min.toFixed(1)} p95=${m.p95.toFixed(1)} max=${m.max.toFixed(1)} sd=${m.sd.toFixed(2)} ms`);
  }
  return lines.join("\n");
}

$("start").onclick = () => void startAudio();
$("sinkBtn").onclick = () => void listSinks(true);
void listSinks(false);
$("midiBtn").onclick = () => void enableMidi();
$("autoBtn").onclick = autoTest;
$("micBtn").onclick = () => void enableMic();
$("resetBtn").onclick = () => { results.length = 0; acoustic.length = 0; $("last").textContent = "—"; renderStats(); $("verdict").textContent = ""; };
$("copyBtn").onclick = async () => {
  const r = report();
  log("\n" + r);
  try { await navigator.clipboard.writeText(r); $("copyInfo").textContent = "Copied. Paste it into the chat."; }
  catch { $("copyInfo").textContent = "Clipboard blocked. Copy it from the box below."; }
};

// Expose for automated checks.
(window as unknown as { __latency: unknown }).__latency = { results, acoustic, report };
