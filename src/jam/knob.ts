// A big jam knob: drag up / down (or sideways), mouse wheel, arrow keys when focused. Double-click
// (or Enter / A on a controller) sends it home; a tick on the ring marks home.

import { h } from "../ui/dom";

export interface KnobOpts {
  label: string;
  hint: string;
  value: number;
  home: number;
  steps?: string[];
  onChange: (v: number) => void;
}

export type JamKnob = HTMLElement & { setValue(v: number): void; nudge(d: number): void; goHome(): void };

const ARC = 270, START = 135; // degrees: from bottom-left round to bottom-right
const polar = (a: number, r: number) => { const t = ((a - 90) * Math.PI) / 180; return [32 + r * Math.cos(t), 32 + r * Math.sin(t)]; };
const arcPath = (from: number, to: number, r: number) => {
  const [x0, y0] = polar(START + from * ARC, r), [x1, y1] = polar(START + to * ARC, r);
  const big = (to - from) * ARC > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${x1} ${y1}`;
};

export function jamKnob(o: KnobOpts): JamKnob {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.classList.add("jk-svg");
  const mk = (tag: string, attrs: Record<string, string>) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.appendChild(e); return e; };
  mk("path", { d: arcPath(0, 1, 26), class: "jk-track" });
  const val = mk("path", { class: "jk-val" });
  const [hx0, hy0] = polar(START + o.home * ARC, 21), [hx1, hy1] = polar(START + o.home * ARC, 30);
  mk("line", { x1: String(hx0), y1: String(hy0), x2: String(hx1), y2: String(hy1), class: "jk-home" });
  mk("circle", { cx: "32", cy: "32", r: "18", class: "jk-cap" });
  const dot = mk("line", { class: "jk-dot" });
  const valueEl = h("div", { class: "jk-value" });
  const el = h("div", { class: "jk", tabindex: "0", role: "slider", "aria-label": o.label, title: `${o.hint}. Double-click: home` },
    svg, h("div", { class: "jk-label" }, o.label), valueEl) as unknown as JamKnob;
  let v = o.value;
  const snap = (x: number) => { x = Math.max(0, Math.min(1, x)); if (o.steps) { const n = o.steps.length - 1; return Math.round(x * n) / n; } return x; };
  const draw = () => {
    val.setAttribute("d", v > 0.003 ? arcPath(0, v, 26) : "");
    const [x0, y0] = polar(START + v * ARC, 7), [x1, y1] = polar(START + v * ARC, 16);
    dot.setAttribute("x1", String(x0)); dot.setAttribute("y1", String(y0)); dot.setAttribute("x2", String(x1)); dot.setAttribute("y2", String(y1));
    valueEl.textContent = o.steps ? o.steps[Math.round(v * (o.steps.length - 1))] : Math.abs(v - o.home) < 0.01 ? "home" : String(Math.round(v * 100));
    el.classList.toggle("at-home", Math.abs(v - o.home) < 0.01);
    el.setAttribute("aria-valuenow", String(Math.round(v * 100)));
  };
  const set = (x: number) => { const n = snap(x); if (n === v) return; v = n; draw(); o.onChange(v); };
  el.setValue = (x) => { v = snap(x); draw(); };
  el.nudge = (d) => set(v + d);
  el.goHome = () => { set(o.home); el.classList.add("homing"); setTimeout(() => el.classList.remove("homing"), 250); };
  let drag: { x: number; y: number; v: number } | null = null;
  el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, v }; el.setPointerCapture(e.pointerId); el.classList.add("turning"); e.preventDefault(); el.focus(); });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const d = (drag.y - e.clientY + (e.clientX - drag.x)) / (e.shiftKey ? 600 : 180);
    set(drag.v + d);
  });
  const end = () => { drag = null; el.classList.remove("turning"); };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("dblclick", () => el.goHome());
  el.addEventListener("wheel", (e) => { e.preventDefault(); set(v + (e.deltaY < 0 ? 1 : -1) * (o.steps ? 1 / (o.steps.length - 1) : 0.04)); }, { passive: false });
  el.addEventListener("keydown", (e) => {
    const step = o.steps ? 1 / (o.steps.length - 1) : e.shiftKey ? 0.01 : 0.05;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { set(v + step); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { set(v - step); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "Enter" || e.key === "Home") { el.goHome(); e.preventDefault(); e.stopPropagation(); }
  });
  draw();
  return el;
}
