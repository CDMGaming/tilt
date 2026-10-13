// MIDI clock: follow an external clock (tempo + beat lock), or send ours.

import type { App } from "./app";

/** Tempo from MIDI clock pulse times (ms): 24 pulses per quarter note. */
export function estimateBpm(times: number[]): number | null {
  if (times.length < 7) return null;
  const span = times[times.length - 1] - times[0];
  const pulses = times.length - 1;
  if (span <= 0) return null;
  return 60000 / ((span / pulses) * 24);
}

export type SyncMode = "int" | "ext" | "auto";

export class MidiClock {
  private pulses: number[] = []; // recent pulse timestamps (ms)
  private lastPulse = 0;
  private count = 0; // pulses since Start
  private following = false; // playback was started by the external clock
  bpm: number | null = null;

  constructor(private app: App) {}

  get mode(): SyncMode { return this.app.settings.midiSync; }

  /** True while an external clock is in charge. */
  get external(): boolean {
    if (this.mode === "int") return false;
    if (this.mode === "ext") return true;
    return performance.now() - this.lastPulse < 500;
  }

  /** Realtime bytes from any MIDI input (0xF8 clock, 0xFA start, 0xFB continue, 0xFC stop). */
  onRealtime(byte: number, t: number) {
    if (this.mode === "int") return;
    const app = this.app, eng = app.engine;
    switch (byte) {
      case 0xf8: {
        this.lastPulse = performance.now();
        this.pulses.push(t);
        if (this.pulses.length > 25) this.pulses.shift();
        const bpm = estimateBpm(this.pulses);
        if (bpm && bpm > 20 && bpm < 400) {
          const rounded = Math.round(bpm * 10) / 10;
          if (this.bpm === null || Math.abs(rounded - this.bpm) >= 0.3) {
            this.bpm = rounded;
            eng.setTempoOverride(rounded);
            app.renderHeader();
          }
        }
        if (this.following && eng.playing) {
          // The first pulse after Start is position 0; each pulse is 4 ticks (96 / 24) further.
          const pulse = this.count++;
          // Every beat: that song position should be heard when this pulse arrived.
          if (pulse % 24 === 0) eng.alignTo(pulse * 4, eng.heardTime(t));
        }
        break;
      }
      case 0xfa: // start
      case 0xfb: // continue (treated as start: Rollbox loops scenes, it has no song pointer)
        this.count = 0;
        this.following = true;
        if (this.bpm) eng.setTempoOverride(this.bpm);
        if (eng.playing) eng.stop();
        eng.play(app.playMode()); // the first pulse that follows lines beat 1 up exactly
        app.renderHeader();
        break;
      case 0xfc: // stop
        if (this.following && eng.playing) { eng.stop(); app.renderHeader(); }
        this.following = false;
        break;
    }
  }

  /** Called every frame: drop the external tempo once the clock has gone quiet (Auto). */
  tick() {
    if (this.bpm !== null && !this.external) {
      this.bpm = null;
      this.pulses = [];
      this.app.engine.setTempoOverride(null);
      this.app.renderHeader();
    }
  }

  // ------------------------------------------------------------ clock out

  /** Wire the engine so internal playback sends clock + start/stop to the chosen output. */
  bindOutput() {
    const eng = this.app.engine;
    eng.onClockOut = (times) => {
      const out = this.output();
      if (!out || this.external) return;
      for (const t of times) out.send([0xf8], eng.perfTimeOf(t));
    };
    eng.onTransport = (what, t) => {
      const out = this.output();
      if (!out || this.external) return;
      if (what === "start") out.send([0xfa], eng.perfTimeOf(t) - 1);
      else out.send([0xfc]);
    };
  }

  private output(): MIDIOutput | null {
    const id = this.app.settings.clockOut;
    if (!id) return null;
    return this.app.midi.outputs().find((o) => o.id === id) ?? null;
  }
}
