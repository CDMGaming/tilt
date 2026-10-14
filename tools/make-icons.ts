// The TILT logo and app icons: "TILT" in dot-matrix (pinball display) amber,
// leaning a little like a nudged machine, on the app's navy. Written as an SVG
// (public/logo.svg, also the favicon) and as PNGs drawn pixel by pixel, so no
// image tools are needed.
// Run: deno run -A tools/make-icons.ts   -> public/logo.svg, public/icons/*.png

import { dmdGrid } from "../src/ui/dmdfont.ts";

const BG = [0x0d, 0x12, 0x20], PLATE = [0x15, 0x1c, 0x2e], RIM = [0x2a, 0x33, 0x52], LIT = [0xff, 0xa6, 0x2b];
const UNLIT = LIT.map((v, i) => Math.round(PLATE[i] + (v - PLATE[i]) * 0.07)); // fainter than on screen: icons are small
const SLANT = 7; // degrees
const grid = dmdGrid("TILT"), ROWS = grid.length, COLS = grid[0].length;
const lean = Math.tan((SLANT * Math.PI) / 180);

// ------------------------------------------------------------ SVG logo

function svgLogo(): string {
  const dots: string[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    dots.push(`<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.42" fill="#ffa62b"${grid[r][c] ? "" : ' opacity=".13"'}/>`);
  }
  const w = COLS + lean * ROWS + 2, h = ROWS + 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h}" role="img" aria-label="TILT">
<title>TILT</title>
<rect width="100%" height="100%" rx="1.2" fill="#151c2e"/>
<g transform="translate(${(1 + lean * ROWS).toFixed(3)} 1) skewX(-${SLANT})">
${dots.join("\n")}
</g>
</svg>
`;
}

// ------------------------------------------------------------ PNG icons

/** `pad`: margin around the plate (maskable icons are cropped to a circle by Android). */
function draw(size: number, pad: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const m = size * pad, box = size - 2 * m, rad = box * 0.18, rim = Math.max(2, box * 0.025);
  // Letters across ~84% of the plate, centred, leaning right at the top.
  const dot = (box * 0.84) / (COLS + lean * ROWS);
  const ox = m + (box - dot * (COLS + lean * ROWS)) / 2 + lean * ROWS * dot, oy = m + (box - dot * ROWS) / 2;
  const rrect = (x: number, y: number) => {
    const qx = Math.abs(x - (m + box / 2)) - (box / 2 - rad), qy = Math.abs(y - (m + box / 2)) - (box / 2 - rad);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let c = BG;
      const d = rrect(cx, cy);
      if (d < 0) {
        c = d > -rim ? RIM : PLATE;
        // Which dot cell is this pixel in (undoing the lean)?
        const gy = (cy - oy) / dot, gx = (cx - ox + gy * dot * lean) / dot;
        const r = Math.floor(gy), col = Math.floor(gx);
        if (r >= 0 && r < ROWS && col >= 0 && col < COLS && Math.hypot(gx - col - 0.5, gy - r - 0.5) < 0.42) c = grid[r][col] ? LIT : UNLIT;
      }
      const i = (y * size + x) * 4;
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
await Deno.writeTextFile(`${root}/public/logo.svg`, svgLogo());
console.log("public/logo.svg");
await Deno.mkdir(`${root}/public/icons`, { recursive: true });
for (const [name, size, pad] of [["icon-192", 192, 0.04], ["icon-512", 512, 0.04], ["maskable-512", 512, 0.16], ["apple-touch-icon", 180, 0.04]] as const) {
  await Deno.writeFile(`${root}/public/icons/${name}.png`, await png(size, draw(size, pad)));
  console.log(`public/icons/${name}.png`);
}
