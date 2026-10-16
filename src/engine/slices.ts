// Slice points for a loop (Chop): the strongest onsets, at least ~60 ms apart, filling in evenly
// when the loop has fewer hits than slices. Shared by the worklet and the waveform on screen.

/** Start positions (in samples) of `n` slices: by onsets, or `even` for equal slices. */
export function computeSlices(data: Float32Array, rate: number, n = 16, even = false): number[] {
  const len = data.length;
  if (!len) return Array(n).fill(0);
  if (even) return Array.from({ length: n }, (_, i) => Math.floor((i * len) / n));
  // Onset strength: the rise of a short-window energy envelope (10 ms frames).
  const hop = Math.max(1, Math.round(rate * 0.01)), frames = Math.floor(len / hop);
  const e = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) s += data[i] * data[i]; e[f] = Math.sqrt(s / hop); }
  const flux: { f: number; v: number }[] = [];
  for (let f = 1; f < frames - 1; f++) {
    const d = e[f] - e[f - 1];
    if (d > 0 && e[f] >= e[f + 1]) flux.push({ f, v: d });
  }
  flux.sort((a, b) => b.v - a.v);
  const minGap = Math.round(0.06 * rate / hop), picked: number[] = [0];
  for (const c of flux) {
    if (picked.length >= n) break;
    if (picked.every((p) => Math.abs(p - c.f) >= minGap)) picked.push(c.f);
  }
  let starts = picked.map((f) => Math.max(0, f * hop - Math.round(0.003 * rate))).sort((a, b) => a - b);
  starts[0] = 0;
  // Fewer onsets than slices: split the longest slices until there are n.
  while (starts.length < n) {
    let best = 0, bestLen = 0;
    for (let i = 0; i < starts.length; i++) { const l = (starts[i + 1] ?? len) - starts[i]; if (l > bestLen) { bestLen = l; best = i; } }
    starts.splice(best + 1, 0, starts[best] + Math.floor(bestLen / 2));
  }
  starts = starts.slice(0, n);
  return starts;
}
