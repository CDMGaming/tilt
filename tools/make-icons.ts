// App icons (home screen, install): a cyan die face (five) on navy, drawn
// pixel by pixel and written as PNGs, so no image tools are needed.
// Run: deno run -A tools/make-icons.ts   -> public/icons/*.png

const BG = [0x0d, 0x12, 0x20], TILE = [0x15, 0x1c, 0x2e], EDGE = [0x36, 0xe2, 0xff], PIP = [0x36, 0xe2, 0xff];

/** `pad`: the safe-zone margin (maskable icons get cropped to a circle by Android). */
function draw(size: number, pad: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const s = size, m = s * pad, box = s - 2 * m, r = box * 0.2, border = Math.max(2, box * 0.035);
  const pipR = box * 0.085, at = [0.27, 0.5, 0.73].map((f) => m + f * box);
  const pips = [[at[0], at[0]], [at[2], at[0]], [at[1], at[1]], [at[0], at[2]], [at[2], at[2]]];
  // Distance outside a rounded rectangle (negative inside).
  const rrect = (x: number, y: number, x0: number, y0: number, w: number, hh: number, rad: number) => {
    const qx = Math.abs(x - (x0 + w / 2)) - (w / 2 - rad), qy = Math.abs(y - (y0 + hh / 2)) - (hh / 2 - rad);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
  };
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let c = BG;
      const d = rrect(cx, cy, m, m, box, box, r);
      // Two-pixel-wide antialiasing is plenty at icon sizes: pick by coverage.
      if (d < 0) c = d > -border ? EDGE : TILE;
      for (const [px0, py0] of pips) if (Math.hypot(cx - px0, cy - py0) < pipR) c = PIP;
      const i = (y * s + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

async function png(size: number, rgba: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1); // filter 0 per row
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size); dv.setUint32(4, size); ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const root = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
await Deno.mkdir(`${root}/public/icons`, { recursive: true });
for (const [name, size, pad] of [["icon-192", 192, 0.08], ["icon-512", 512, 0.08], ["maskable-512", 512, 0.2], ["apple-touch-icon", 180, 0.08]] as const) {
  await Deno.writeFile(`${root}/public/icons/${name}.png`, await png(size, draw(size, pad)));
  console.log(`public/icons/${name}.png`);
}
