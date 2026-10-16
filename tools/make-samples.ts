// Turns downloaded CC0 recordings into TILT's compact sample files (16-bit mono WAV at 32 kHz):
// trims the silence before the onset, resamples (windowed sinc), cuts to a length, fades out, normalises.
//   deno run -A tools/make-samples.ts piano <download dir>    -> public/piano/<note>-<soft|hard>.wav
//   deno run -A tools/make-samples.ts garage <download dir>   -> public/garage/<name>.wav
// Sources and licences: public/piano/LICENSE.txt, public/garage/LICENSE.txt.

const RATE = 32000;

/** Reads PCM 16 / 24-bit or float WAV, mixed to mono. */
export function readWav(bytes: Uint8Array): { data: Float32Array; rate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12, fmt = 1, ch = 2, rate = 44100, bits = 16;
  let data: Float32Array | null = null;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(pos, pos + 4)), size = v.getUint32(pos + 4, true), body = pos + 8;
    if (id === "fmt ") { fmt = v.getUint16(body, true); ch = v.getUint16(body + 2, true); rate = v.getUint32(body + 4, true); bits = v.getUint16(body + 14, true); }
    if (id === "data") {
      const bps = bits / 8, frames = Math.floor(Math.min(size, bytes.length - body) / (bps * ch));
      data = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < ch; c++) {
          const o = body + (i * ch + c) * bps;
          let x = 0;
          if (fmt === 3) x = bits === 32 ? v.getFloat32(o, true) : v.getFloat64(o, true);
          else if (bits === 16) x = v.getInt16(o, true) / 32768;
          else if (bits === 24) x = ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16))) / 8388608;
          else if (bits === 32) x = v.getInt32(o, true) / 2147483648;
          sum += x;
        }
        data[i] = sum / ch;
      }
    }
    pos = body + size + (size & 1);
  }
  if (!data) throw new Error("no data chunk");
  return { data, rate };
}

/** Lanczos (a = 8) resampling. */
function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const ratio = from / to, n = Math.floor(x.length / ratio), out = new Float32Array(n), a = 8, cut = Math.min(1, to / from);
  for (let i = 0; i < n; i++) {
    const c = i * ratio, c0 = Math.floor(c);
    let s = 0, w = 0;
    for (let k = c0 - a + 1; k <= c0 + a; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = (c - k) * cut;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      const win = Math.abs(d) < a ? (d === 0 ? 1 : Math.sin((Math.PI * d) / a) / ((Math.PI * d) / a)) : 0;
      s += x[k] * sinc * win; w += sinc * win;
    }
    out[i] = w ? s / w : 0;
  }
  return out;
}

/** Trims to the onset (2 ms before the first sample above 2% of the peak), cuts to `seconds`, fades the last `fade` s. */
export function shape(x: Float32Array, rate: number, seconds: number, fade: number, peak = 0.89): Float32Array {
  let pk = 0;
  for (const s of x) pk = Math.max(pk, Math.abs(s));
  let start = 0;
  while (start < x.length && Math.abs(x[start]) < pk * 0.02) start++;
  start = Math.max(0, start - Math.round(0.002 * rate));
  let y = resample(x.subarray(start), rate, RATE);
  y = y.slice(0, Math.min(y.length, Math.round(seconds * RATE)));
  const f = Math.min(y.length, Math.round(fade * RATE));
  for (let i = 0; i < f; i++) y[y.length - 1 - i] *= i / f;
  let p2 = 0;
  for (const s of y) p2 = Math.max(p2, Math.abs(s));
  return p2 ? y.map((s) => (s * peak) / p2) : y;
}

export function wav16(data: Float32Array): Uint8Array {
  const buf = new ArrayBuffer(44 + data.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return new Uint8Array(buf);
}

if (import.meta.main) {
  const [what, dir] = Deno.args;
  if (what === "piano") {
    const out = new URL("../public/piano/", import.meta.url);
    Deno.mkdirSync(out, { recursive: true });
    const notes = ["C0", "G0", "C1", "G1", "C2", "G2", "C3", "G3", "C4", "G4", "C5", "G5", "C6"];
    for (const note of notes) {
      const oct = Number(note.slice(1)), secs = oct <= 1 ? 6 : oct <= 3 ? 5 : oct <= 4 ? 4 : 3;
      for (const [layer, vl] of [["soft", note === "C6" ? 2 : 1], ["hard", 3]] as const) {
        const src = readWav(Deno.readFileSync(`${dir}/Upright1_Sus_${note}_vl${vl}_rr1.wav`));
        // Both layers normalised: velocity sets loudness; the layer only changes the tone.
        Deno.writeFileSync(new URL(`${note}-${layer}.wav`, out), wav16(shape(src.data, src.rate, secs, 0.8)));
      }
      console.log(note);
    }
    Deno.writeTextFileSync(new URL("LICENSE.txt", out), [
      "Piano samples: from the Versilian Community Sample Library (VCSL), \"Upright Piano, Yamaha\",",
      "https://github.com/sgossner/VCSL  -  released under CC0 1.0 (public domain dedication).",
      "Trimmed, mixed to mono and resampled to 32 kHz for TILT by tools/make-samples.ts.", "",
    ].join("\n"));
  }
  if (what === "garage") {
    const out = new URL("../public/garage/", import.meta.url);
    Deno.mkdirSync(out, { recursive: true });
    // Seconds kept per sound (with a fade at the end).
    const LEN: Record<string, number> = { kick: 1.2, snare: 0.9, snare2: 0.9, oldsnare: 0.7, deadsnare: 0.8, rim: 0.6, oldrim: 0.5, chat: 0.6, ohat: 1.8, tomh: 1.3, toml: 1.6, cym: 3, ride: 2.5 };
    for (const f of Deno.readDirSync(dir)) {
      if (!f.name.endsWith(".wav")) continue;
      const name = f.name.replace(".wav", ""), len = LEN[name.replace(/-(soft|hard)$/, "")] ?? 1;
      const src = readWav(Deno.readFileSync(`${dir}/${f.name}`));
      Deno.writeFileSync(new URL(`${name}.wav`, out), wav16(shape(src.data, src.rate, len, Math.min(0.3, len / 3))));
      console.log(name);
    }
    Deno.writeTextFileSync(new URL("LICENSE.txt", out), [
      "Acoustic drum samples for Garage, all CC0 1.0 (public domain dedication):",
      "  Versilian Community Sample Library (VCSL), https://github.com/sgossner/VCSL",
      "    kick (Bass Drum 1), old snare and rim, hi-hats, toms 1 and 2 (stick), suspended cymbal 1 (stick hits, bell)",
      "  VSCO 2 Community Edition, https://github.com/sgossner/VSCO-2-CE (VSCO 1 Percussion)",
      "    snares drum1 and drum2, rimshots, snares-off hits",
      "Trimmed, mixed to mono and resampled to 32 kHz for TILT by tools/make-samples.ts.", "",
    ].join("\n"));
  }
}
