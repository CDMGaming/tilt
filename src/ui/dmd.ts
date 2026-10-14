// Dot-matrix text (the pinball-display look) as inline SVG: lit dots in the
// current text colour (amber by default, see --dmd), unlit dots faintly behind.

import { dmdGrid } from "./dmdfont";

const NS = "http://www.w3.org/2000/svg";

/**
 * `height`: CSS pixels for the 7 dot rows. `slant`: degrees of lean (the logo
 * tilts a little, like a nudged machine).
 */
export function dmdText(text: string, opts: { height?: number; slant?: number; unlit?: boolean; label?: string } = {}): SVGSVGElement {
  const grid = dmdGrid(text), rows = grid.length, cols = grid[0]?.length ?? 0;
  const svg = document.createElementNS(NS, "svg");
  const lean = Math.tan(((opts.slant ?? 0) * Math.PI) / 180) * rows;
  svg.setAttribute("viewBox", `${Math.min(0, -lean)} 0 ${cols + Math.abs(lean)} ${rows}`);
  svg.setAttribute("class", "dmd");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", opts.label ?? text);
  const hgt = opts.height ?? 14;
  svg.style.height = `${hgt}px`;
  svg.style.width = `${(hgt * (cols + Math.abs(lean))) / rows}px`;
  const g = document.createElementNS(NS, "g");
  if (opts.slant) g.setAttribute("transform", `skewX(${-opts.slant})`);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = grid[r][c];
      if (!on && opts.unlit === false) continue;
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", String(c + 0.5));
      dot.setAttribute("cy", String(r + 0.5));
      dot.setAttribute("r", "0.42");
      dot.setAttribute("class", on ? "on" : "off");
      g.appendChild(dot);
    }
  }
  svg.appendChild(g);
  return svg;
}
