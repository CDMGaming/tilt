// Seeded random numbers (mulberry32): the same seed always gives the same rolls.

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  weighted<T>(xs: readonly (readonly [T, number])[]): T {
    const total = xs.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [x, w] of xs) if ((r -= w) < 0) return x;
    return xs[xs.length - 1][0];
  }
  chance(p: number): boolean { return this.next() < p; }
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
