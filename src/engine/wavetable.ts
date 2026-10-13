// Wavetables: parse the factory tables (33 frames x 2048 float32 samples) and
// build band-limited mip levels with an FFT, so high notes don't alias.

import { WT_FRAMES, WT_LEVELS, WT_SIZE } from "./instruments3";

/** In-place iterative radix-2 FFT (inverse when `inv`). */
export function fft(re: Float64Array, im: Float64Array, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Mip levels for one table: level L keeps harmonics up to 1024 >> L.
 * Each level is a Float32Array of WT_FRAMES * WT_SIZE samples.
 */
export function buildMips(table: Float32Array): Float32Array[] {
  const levels = Array.from({ length: WT_LEVELS }, () => new Float32Array(WT_FRAMES * WT_SIZE));
  const re = new Float64Array(WT_SIZE), im = new Float64Array(WT_SIZE);
  const specRe = new Float64Array(WT_SIZE), specIm = new Float64Array(WT_SIZE);
  for (let f = 0; f < WT_FRAMES; f++) {
    for (let i = 0; i < WT_SIZE; i++) { specRe[i] = table[f * WT_SIZE + i]; specIm[i] = 0; }
    fft(specRe, specIm);
    specRe[0] = 0; specIm[0] = 0; // no DC
    for (let L = 0; L < WT_LEVELS; L++) {
      const maxH = 1024 >> L;
      for (let k = 0; k < WT_SIZE; k++) {
        const h = k <= WT_SIZE / 2 ? k : WT_SIZE - k;
        const keep = h <= maxH;
        re[k] = keep ? specRe[k] : 0;
        im[k] = keep ? specIm[k] : 0;
      }
      fft(re, im, true);
      const out = levels[L];
      for (let i = 0; i < WT_SIZE; i++) out[f * WT_SIZE + i] = re[i];
    }
  }
  // Normalise every level by the loudest frame of level 0 so levels match in volume.
  let peak = 0;
  for (const v of levels[0]) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (const lv of levels) for (let i = 0; i < lv.length; i++) lv[i] /= peak;
  return levels;
}

/** Read a float32 (format 3) or 16-bit PCM WAV's first channel. */
export function parseWav(buf: ArrayBuffer): { data: Float32Array; rate: number } {
  const v = new DataView(buf);
  let p = 12, fmt = 1, ch = 1, bits = 16, rate = 48000;
  while (p + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
    const len = v.getUint32(p + 4, true);
    if (id === "fmt ") { fmt = v.getUint16(p + 8, true); ch = v.getUint16(p + 10, true); rate = v.getUint32(p + 12, true); bits = v.getUint16(p + 22, true); }
    if (id === "data") {
      const frames = Math.floor(len / (ch * (bits / 8)));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const o = p + 8 + i * ch * (bits / 8);
        out[i] = fmt === 3 ? v.getFloat32(o, true) : bits === 16 ? v.getInt16(o, true) / 32768 : bits === 24 ? ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608) : 0;
      }
      return { data: out, rate };
    }
    p += 8 + len + (len & 1);
  }
  throw new Error("No audio data in WAV");
}
