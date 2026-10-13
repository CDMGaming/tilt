// AudioWorklet side of the latency test.
//
// "probe-synth": a tiny synth driven by port messages. When a note-on arrives it
// starts on the very next render quantum and reports back the frame it started
// at, so the main thread can turn that into a wall-clock "sound leaves the DAC"
// time. Each note is a sharp-onset tone burst so the acoustic test can find it.
//
// "mic-tap": copies microphone input into blocks for the acoustic test.

declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: unknown): void;

interface Voice {
  id: number;
  freq: number;
  phase: number;
  age: number; // samples since start
  len: number; // total samples
}

class ProbeSynth extends AudioWorkletProcessor {
  private voices: Voice[] = [];
  private pending: { id: number; note: number; burst: boolean }[] = [];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "on") this.pending.push(m);
    };
  }

  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] ?? out[0];
    if (this.pending.length) {
      for (const p of this.pending) {
        // Burst mode: a fixed 4 kHz tone so the acoustic detector can tell it
        // apart from the key's mechanical thud. Otherwise play the key's pitch.
        const freq = p.burst ? 4000 : 440 * Math.pow(2, (p.note - 69) / 12);
        const len = Math.round(sampleRate * (p.burst ? 0.06 : 0.25));
        this.voices.push({ id: p.id, freq, phase: 0, age: 0, len });
        this.port.postMessage({ type: "started", id: p.id, frame: currentFrame });
      }
      this.pending.length = 0;
    }
    for (let i = 0; i < L.length; i++) {
      let s = 0;
      for (const v of this.voices) {
        if (v.age >= v.len) continue;
        // Instant attack (that is the point), short linear release at the end.
        const rel = Math.min(1, (v.len - v.age) / (sampleRate * 0.01));
        s += Math.sin(v.phase) * 0.35 * rel;
        v.phase += (2 * Math.PI * v.freq) / sampleRate;
        if (v.phase > 2 * Math.PI) v.phase -= 2 * Math.PI;
        v.age++;
      }
      L[i] = s;
      R[i] = s;
    }
    this.voices = this.voices.filter((v) => v.age < v.len);
    return true;
  }
}

class MicTap extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage({ frame: currentFrame, data: ch.slice() });
    return true;
  }
}

registerProcessor("probe-synth", ProbeSynth);
registerProcessor("mic-tap", MicTap);
