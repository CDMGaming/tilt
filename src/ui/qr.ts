// A small QR code generator for share links: byte mode, error correction level M,
// versions 1-10 (up to 213 bytes, plenty for a short link). Follows ISO/IEC 18004.

const EC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // level M, versions 1-10
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

export interface Qr { size: number; dark: boolean[][]; version: number; mask: number }

function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}
const dataCodewords = (ver: number) => Math.floor(rawModules(ver) / 8) - EC_PER_BLOCK[ver - 1] * BLOCKS[ver - 1];

// ---- GF(256) and Reed-Solomon
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
export function rsDivisor(degree: number): number[] {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}
export function rsRemainder(data: number[], divisor: number[]): number[] {
  const out = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift()!;
    out.push(0);
    divisor.forEach((c, i) => (out[i] ^= gfMul(c, factor)));
  }
  return out;
}

/** The data, error correction added and the blocks interleaved, as laid into the symbol. */
export function codewords(text: Uint8Array, ver: number): number[] {
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4); // byte mode
  put(text.length, ver < 10 ? 8 : 16);
  for (const b of text) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  const nBlocks = BLOCKS[ver - 1], ecLen = EC_PER_BLOCK[ver - 1];
  const total = Math.floor(rawModules(ver) / 8);
  const nShort = nBlocks - (total % nBlocks), shortLen = Math.floor(total / nBlocks);
  const div = rsDivisor(ecLen);
  const blocks: { d: number[]; e: number[] }[] = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const d = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1));
    k += d.length;
    blocks.push({ d, e: rsRemainder(d, div) });
  }
  const out: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** 15 format bits for level M and a mask (BCH(15,5), XOR 0x5412). */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // level M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

/** The fixed parts of a symbol (finders, timing, alignment, format and version bits) and where they are. */
export function functionPatterns(ver: number, mask: number) {
  const size = ver * 4 + 17;
  const dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, v: boolean) => { dark[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignmentPositions(ver), last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // Reserve the format and version areas (written for real below).
  const f = formatBits(mask), bit = (v: number, i: number) => ((v >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
  set(8, 7, bit(f, 6)); set(8, 8, bit(f, 7)); set(7, 8, bit(f, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
  set(8, size - 8, true); // the dark module
  if (ver >= 7) {
    const v = versionBits(ver);
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(v, i)); set(b, a, bit(v, i)); }
  }
  return { size, dark, fn };
}

/** Data module positions in placement order: two columns at a time from the right, up then down, skipping column 6. */
export function* zigzag(size: number, fn: boolean[][]): Generator<[number, number]> {
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x]) yield [x, y];
    }
  }
}

export const maskAt = (mask: number, x: number, y: number) => MASKS[mask](x, y);

function build(cw: number[], ver: number, mask: number): Qr {
  const { size, dark, fn } = functionPatterns(ver, mask);
  const bit = (v: number, i: number) => ((v >>> i) & 1) === 1;
  let i = 0;
  for (const [x, y] of zigzag(size, fn)) {
    const v = i < cw.length * 8 ? bit(cw[i >>> 3], 7 - (i & 7)) : false;
    i++;
    dark[y][x] = v !== MASKS[mask](x, y);
  }
  return { size, dark, version: ver, mask };
}

/** Lower is better: runs of 5+, 2x2 blocks, and how far from half dark (finder-like runs left out). */
function penalty(q: Qr): number {
  const { size, dark } = q;
  let p = 0, nDark = 0;
  for (let a = 0; a < size; a++) {
    let runR = 1, runC = 1;
    for (let b = 1; b < size; b++) {
      if (dark[a][b] === dark[a][b - 1]) { runR++; if (runR === 5) p += 3; else if (runR > 5) p++; } else runR = 1;
      if (dark[b][a] === dark[b - 1][a]) { runC++; if (runC === 5) p += 3; else if (runC > 5) p++; } else runC = 1;
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (dark[y][x]) nDark++;
    if (x < size - 1 && y < size - 1 && dark[y][x] === dark[y][x + 1] && dark[y][x] === dark[y + 1][x] && dark[y][x] === dark[y + 1][x + 1]) p += 3;
  }
  return p + Math.floor(Math.abs(nDark * 20 - size * size * 10) / (size * size)) * 10;
}

/** The QR code for `text`, or null when it won't fit in version 10. */
export function makeQr(text: string): Qr | null {
  const bytes = new TextEncoder().encode(text);
  for (let ver = 1; ver <= 10; ver++) {
    if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) continue;
    const cw = codewords(bytes, ver);
    let best: Qr | null = null, bestP = Infinity;
    for (let m = 0; m < 8; m++) { const q = build(cw, ver, m), p = penalty(q); if (p < bestP) { best = q; bestP = p; } }
    return best;
  }
  return null;
}

/** As an SVG (dark on light, with the 4-module quiet zone). */
export function qrSvg(q: Qr, px = 6): string {
  const n = q.size + 8;
  let path = "";
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.dark[y][x]) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * px}" height="${n * px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
