// Web MIDI input, with an auto-detected profile for the Arturia MiniLab mkII.

export interface MidiSink {
  /** Keys (and pads on non-drum tracks route elsewhere, see onPad). `time` is event.timeStamp (ms, performance clock). */
  onKey(pitch: number, vel: number, on: boolean, time: number): void;
  /** MiniLab pads: index 0..15. */
  onPad(index: number, vel: number, on: boolean, time: number): void;
  /** 8 macro knobs of the selected track. Either an absolute 0..1 position or a relative step count. */
  onMacro(index: number, v: { abs?: number; delta?: number }): void;
  /** Bottom-row knobs: track volumes. */
  onTrackVolume(index: number, v: { abs?: number; delta?: number }): void;
  onTransport(what: "play"): void;
  onDevicesChanged(): void;
}

export interface MonitorLine { time: number; device: string; text: string }

// MiniLab mkII factory map (Arturia's default template).
// Knobs are endless encoders; in the factory template they send relative values.
const MINILAB_TOP = [112, 74, 71, 76, 77, 93, 73, 75];
const MINILAB_BOTTOM = [114, 18, 19, 16, 17, 91, 79, 72];
const MINILAB_KNOB1_CLICK = 113;
const MINILAB_PAD_CHANNEL = 9; // channel 10, zero-based
const MINILAB_PAD_BASE = 36;

type KnobMode = "unknown" | "abs" | "rel64" | "rel2c";

export class Midi {
  access: MIDIAccess | null = null;
  error = "";
  monitor: MonitorLine[] = [];
  private knobMode = new Map<string, KnobMode>();

  constructor(private sink: MidiSink) {}

  get supported() { return !!navigator.requestMIDIAccess; }

  async enable() {
    if (!this.supported) { this.error = "This browser has no Web MIDI (use Chrome or Edge)."; return; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => { this.bind(); this.sink.onDevicesChanged(); };
      this.bind();
      this.sink.onDevicesChanged();
    } catch (e) {
      this.error = `MIDI permission refused: ${e}`;
    }
  }

  inputs(): MIDIInput[] {
    const out: MIDIInput[] = [];
    this.access?.inputs.forEach((i) => { if (i.state === "connected") out.push(i); });
    return out;
  }

  isMiniLab(name: string | null | undefined) { return /minilab\s*mk\s*ii|minilab\s*mkii/i.test(name ?? ""); }

  get miniLabConnected() { return this.inputs().some((i) => this.isMiniLab(i.name)); }

  private bind() {
    for (const input of this.inputs()) {
      input.onmidimessage = (e) => this.onMessage(input, e as MIDIMessageEvent);
    }
  }

  private log(device: string, text: string) {
    this.monitor.push({ time: performance.now(), device, text });
    if (this.monitor.length > 60) this.monitor.shift();
  }

  private onMessage(input: MIDIInput, e: MIDIMessageEvent) {
    const d = e.data;
    if (!d || d.length < 1) return;
    const status = d[0] & 0xf0, ch = d[0] & 0x0f;
    const name = input.name ?? "MIDI";
    const mini = this.isMiniLab(name);
    if (status === 0xf0 || d[0] >= 0xf8) return; // sysex / realtime (clock comes in Phase 3)
    const hex = Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    if (status === 0x90 || status === 0x80) {
      const on = status === 0x90 && d[2] > 0;
      this.log(name, `${hex}  note ${on ? "on " : "off"} ch${ch + 1} n${d[1]} v${d[2]}`);
      if (mini && ch === MINILAB_PAD_CHANNEL && d[1] >= MINILAB_PAD_BASE && d[1] < MINILAB_PAD_BASE + 16) {
        this.sink.onPad(d[1] - MINILAB_PAD_BASE, d[2], on, e.timeStamp);
      } else this.sink.onKey(d[1], d[2], on, e.timeStamp);
      return;
    }
    if (status === 0xb0) {
      const cc = d[1], val = d[2];
      this.log(name, `${hex}  CC ch${ch + 1} #${cc} = ${val}`);
      if (mini && cc === MINILAB_KNOB1_CLICK) { if (val > 0) this.sink.onTransport("play"); return; }
      const top = MINILAB_TOP.indexOf(cc), bottom = MINILAB_BOTTOM.indexOf(cc);
      if (!mini || (top < 0 && bottom < 0)) return; // other CCs: MIDI learn arrives in Phase 2
      const v = this.knobValue(`${name}:${cc}`, val);
      if (top >= 0) this.sink.onMacro(top, v);
      else this.sink.onTrackVolume(bottom, v);
      return;
    }
    this.log(name, hex);
  }

  /**
   * Decide per knob whether it sends absolute positions or relative steps.
   * Relative encoders hover around 64 (Arturia "Relative #1") or 0/127
   * (two's complement); an absolute knob soon sends something else.
   */
  private knobValue(key: string, val: number): { abs?: number; delta?: number } {
    let mode = this.knobMode.get(key) ?? "unknown";
    const near64 = val >= 56 && val <= 72 && val !== 64;
    const twos = (val >= 1 && val <= 8) || (val >= 120 && val <= 127);
    if (mode === "unknown") mode = near64 ? "rel64" : twos ? "rel2c" : "abs";
    else if (mode === "rel64" && !near64) mode = "abs";
    else if (mode === "rel2c" && !twos) mode = "abs";
    this.knobMode.set(key, mode);
    if (mode === "rel64") return { delta: val - 64 };
    if (mode === "rel2c") return { delta: val < 64 ? val : val - 128 };
    return { abs: val / 127 };
  }

  knobModes(): string[] {
    return [...this.knobMode.entries()].map(([k, m]) => `${k.split(":").pop()}: ${m}`);
  }
}
