// PCM WAV encoding of rendered audio.

export function encodeWav(buf: AudioBuffer, bits: 16 | 24 = 16): Uint8Array<ArrayBuffer> {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const bps = bits / 8;
  const data = new Uint8Array(44 + n * ch * bps);
  const v = new DataView(data.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * ch * bps, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * bps, true);
  v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true);
  str(36, "data"); v.setUint32(40, n * ch * bps, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      if (bits === 16) { v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
      else {
        const x = Math.round(s < 0 ? s * 8388608 : s * 8388607);
        v.setUint8(o, x & 0xff); v.setUint8(o + 1, (x >> 8) & 0xff); v.setUint8(o + 2, (x >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return data;
}

/** Peak level in dBFS, for the export summary. */
export function peakDb(buf: AudioBuffer): number {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const s of buf.getChannelData(c)) p = Math.max(p, Math.abs(s));
  return p > 0 ? 20 * Math.log10(p) : -Infinity;
}
