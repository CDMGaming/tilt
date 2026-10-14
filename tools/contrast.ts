// WCAG contrast check of the theme's important text/background pairs.
// Run: deno run -A tools/contrast.ts
const css = await Deno.readTextFile(new URL("../src/ui/style.css", import.meta.url));
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const vars: Record<string, string> = {};
for (const m of root.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
const resolve = (v: string): string => { const m = /^var\(--([\w-]+)\)$/.exec(v); return m ? resolve(vars[m[1]]) : v; };
const rgb = (hex: string) => { const h = resolve(hex).replace("#", "").slice(0, 6); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
const lum = (c: number[]) => { const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs: [string, string, string, number][] = [
  ["body text", "--ink", "--bg", 4.5], ["body text on surface", "--ink", "--panel", 4.5], ["text on buttons", "--ink", "--raise", 4.5],
  ["secondary text", "--dim", "--panel", 4.5], ["secondary on buttons", "--dim", "--raise", 4.5], ["secondary on bg", "--dim", "--bg", 4.5],
  ["on-button text (cyan)", "--accent-ink", "--cyan", 4.5], ["record button / LOCKED text", "--key-ink", "--coral", 4.5], ["mute on", "--bg", "--ink", 4.5],
  ["solo on", "--key-ink", "--yellow", 4.5], ["key labels", "--key-ink", "--key-white", 4.5], ["chord label on key", "--key-chord", "--key-white", 4.5],
  ["playing button (mint)", "--accent-ink", "--mint", 4.5], ["cyan text on surface", "--cyan", "--panel", 4.5], ["focus ring vs bg", "--yellow", "--bg", 3],
  // Piano roll: in key vs out of key (labels, degrees, the warning outline, and the rows against each other)
  ["roll: in-key note name", "--roll-key-in-ink", "--roll-key-in", 4.5], ["roll: root note name", "--roll-key-root-ink", "--roll-key-in", 4.5],
  ["roll: scale degree", "--roll-key-deg", "--roll-key-in", 4.5], ["roll: out-of-key name (dim, still legible)", "--roll-key-out-ink", "--roll-key-out", 3],
  ["roll: out-of-key warning outline", "--roll-warn", "--roll-outkey", 3], ["roll: warning outline on in-key row", "--roll-warn", "--roll-inkey", 3],
  ["roll: out-of-key count (toolbar)", "--roll-warn", "--panel", 4.5], ["roll: in-key row vs out-of-key row", "--roll-inkey", "--roll-outkey", 1.25],
  ...["drums", "analog", "acid", "wobble", "poly", "pad", "lead", "chip", "fm", "wave", "sampler"].flatMap((k): [string, string, string, number][] => [
    [`${k}: name on surface`, `--inst-${k}`, "--panel", 4.5],
    [`${k}: label on lit pad/key`, "--key-ink", `--inst-${k}`, 4.5],
  ]),
];
let fails = 0;
for (const [name, fg, bg, need] of pairs) {
  const r = ratio(`var(${fg})`, `var(${bg})`);
  const ok = r >= need;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (need ${need})  ${name}`);
}
console.log(fails ? `\n${fails} pair(s) below target` : "\nall pairs pass");
