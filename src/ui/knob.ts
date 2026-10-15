// Knob and switch controls bound to an instrument parameter.

import { formatParam, fromUnit, toUnit, type ParamDef } from "../engine/instruments";
import { h } from "./dom";

export interface ControlHost {
  get(id: string): number;
  set(id: string, v: number): void; // live: updates engine, no full re-render
  begin(id: string): void; // gesture start (one undo step per gesture)
}

const ARC = 270;

function arcPath(u: number, r: number): string {
  const a0 = ((-ARC / 2 - 90) * Math.PI) / 180;
  const a1 = a0 + (u * ARC * Math.PI) / 180;
  const p = (a: number) => `${20 + r * Math.cos(a)} ${20 + r * Math.sin(a)}`;
  const large = u * ARC > 180 ? 1 : 0;
  return u <= 0.001 ? "" : `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`;
}

/** A knob (continuous) or a switch (discrete options), with the param id as its nav id. */
export function control(p: ParamDef, host: ControlHost, opts: { label?: string; size?: "s" | "m" | "l"; fader?: boolean } = {}): HTMLElement {
  if (opts.fader) return knob(p, host, opts);
  return p.options && p.options.length <= 4 && p.max - p.min < 4 ? switchCtl(p, host, opts.label) : knob(p, host, opts);
}

/** Brief "being turned" highlight (for changes that aren't a held drag). */
function flash(el: HTMLElement) {
  el.classList.add("turning");
  const t = (el as HTMLElement & { _flash?: number })._flash;
  if (t) clearTimeout(t);
  (el as HTMLElement & { _flash?: number })._flash = setTimeout(() => el.classList.remove("turning"), 260) as unknown as number;
}

/** A knob, or with `fader` a vertical fader (same gestures: drag up / down, wheel, double-click resets). */
export function knob(p: ParamDef, host: ControlHost, opts: { label?: string; size?: "s" | "m" | "l"; fader?: boolean } = {}): HTMLElement {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  if (opts.fader) return faderEl(p, host, opts.label, svg);
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.classList.add("knob-svg");
  const track = document.createElementNS(svgNS, "path");
  track.setAttribute("d", arcPath(1, 15));
  track.setAttribute("class", "knob-track");
  const val = document.createElementNS(svgNS, "path");
  val.setAttribute("class", "knob-val");
  const cap = document.createElementNS(svgNS, "circle");
  cap.setAttribute("cx", "20"); cap.setAttribute("cy", "20"); cap.setAttribute("r", "10.5");
  cap.setAttribute("class", "knob-cap");
  const dot = document.createElementNS(svgNS, "line");
  dot.setAttribute("class", "knob-dot");
  svg.append(track, val, cap, dot);
  const valueText = h("div", { class: "knob-value" });
  const el = h("div", { class: `knob size-${opts.size ?? "m"}`, "data-nav": p.id, "data-param": p.id, title: p.label },
    svg, h("div", { class: "knob-label" }, opts.label ?? p.label), valueText);

  const draw = () => {
    const v = host.get(p.id);
    const u = Math.max(0, Math.min(1, toUnit(p, v)));
    val.setAttribute("d", arcPath(u, 15));
    const a = ((-ARC / 2 - 90 + u * ARC) * Math.PI) / 180;
    dot.setAttribute("x1", String(20 + 3.5 * Math.cos(a)));
    dot.setAttribute("y1", String(20 + 3.5 * Math.sin(a)));
    dot.setAttribute("x2", String(20 + 9 * Math.cos(a)));
    dot.setAttribute("y2", String(20 + 9 * Math.sin(a)));
    valueText.textContent = formatParam(p, v);
  };
  // Changes from elsewhere (gamepad, MIDI, undo) light the knob briefly too.
  (el as HTMLElement & { redraw?: () => void }).redraw = () => { draw(); flash(el); };
  draw();

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    host.begin(p.id);
    el.classList.add("turning");
    let u = Math.max(0, Math.min(1, toUnit(p, host.get(p.id))));
    let lastY = e.clientY;
    const move = (ev: PointerEvent) => {
      u = Math.max(0, Math.min(1, u + (lastY - ev.clientY) / (ev.shiftKey ? 900 : 180)));
      lastY = ev.clientY;
      host.set(p.id, fromUnit(p, u));
      draw();
    };
    const up = () => { el.classList.remove("turning"); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    host.begin(p.id);
    const u = toUnit(p, host.get(p.id)) - Math.sign(e.deltaY) * (p.options ? 1 / (p.max - p.min) : e.shiftKey ? 0.005 : 0.03);
    host.set(p.id, fromUnit(p, u));
    draw();
    flash(el);
  }, { passive: false });
  el.addEventListener("dblclick", () => { host.begin(p.id); host.set(p.id, p.def); draw(); });
  return el;
}

function faderEl(p: ParamDef, host: ControlHost, label: string | undefined, svg: SVGSVGElement): HTMLElement {
  const svgNS = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", "0 0 30 120");
  svg.classList.add("fader-svg");
  const slot = document.createElementNS(svgNS, "rect");
  slot.setAttribute("x", "13"); slot.setAttribute("y", "6"); slot.setAttribute("width", "4"); slot.setAttribute("height", "108"); slot.setAttribute("rx", "2");
  slot.setAttribute("class", "fader-slot");
  const fill = document.createElementNS(svgNS, "rect");
  fill.setAttribute("x", "13"); fill.setAttribute("width", "4"); fill.setAttribute("rx", "2");
  fill.setAttribute("class", "fader-fill");
  const cap = document.createElementNS(svgNS, "rect");
  cap.setAttribute("x", "3"); cap.setAttribute("width", "24"); cap.setAttribute("height", "14"); cap.setAttribute("rx", "3");
  cap.setAttribute("class", "fader-cap");
  svg.append(slot, fill, cap);
  const valueText = h("div", { class: "knob-value" });
  const el = h("div", { class: "knob fader", "data-nav": p.id, "data-param": p.id, title: p.label },
    h("div", { class: "knob-label" }, label ?? p.label), svg, valueText);
  const draw = () => {
    const v = host.get(p.id), u = Math.max(0, Math.min(1, toUnit(p, v))), y = 6 + (1 - u) * 94;
    cap.setAttribute("y", String(y));
    fill.setAttribute("y", String(y + 7)); fill.setAttribute("height", String(Math.max(0, 114 - y - 7)));
    valueText.textContent = formatParam(p, v);
  };
  (el as HTMLElement & { redraw?: () => void }).redraw = () => { draw(); flash(el); };
  draw();
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    host.begin(p.id);
    el.classList.add("turning");
    let u = Math.max(0, Math.min(1, toUnit(p, host.get(p.id))));
    let lastY = e.clientY;
    const scale = svg.getBoundingClientRect().height * 0.8 || 100;
    const move = (ev: PointerEvent) => {
      u = Math.max(0, Math.min(1, u + (lastY - ev.clientY) / (ev.shiftKey ? scale * 5 : scale)));
      lastY = ev.clientY;
      host.set(p.id, fromUnit(p, u));
      draw();
    };
    const up = () => { el.classList.remove("turning"); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    host.begin(p.id);
    const u = toUnit(p, host.get(p.id)) - Math.sign(e.deltaY) * (p.options ? 1 / (p.max - p.min) : e.shiftKey ? 0.005 : 0.03);
    host.set(p.id, fromUnit(p, u));
    draw();
    flash(el);
  }, { passive: false });
  el.addEventListener("dblclick", () => { host.begin(p.id); host.set(p.id, p.def); draw(); });
  return el;
}

function switchCtl(p: ParamDef, host: ControlHost, label?: string): HTMLElement {
  const opts = p.options!;
  const valueEl = h("div", { class: "switch-value" });
  const el = h("button", { class: "switch", "data-nav": p.id, "data-param": p.id, "data-cycle": "1", title: p.label },
    h("div", { class: "switch-label" }, label ?? p.label), valueEl);
  const draw = () => {
    const i = Math.round(host.get(p.id) - p.min);
    valueEl.textContent = opts[i] ?? "";
    el.classList.toggle("on", opts[0] === "Off" && i > 0); // lit only for Off/On-style switches
  };
  (el as HTMLElement & { redraw?: () => void }).redraw = draw;
  draw();
  el.addEventListener("click", () => {
    host.begin(p.id);
    const i = Math.round(host.get(p.id) - p.min);
    host.set(p.id, p.min + ((i + 1) % opts.length));
    draw();
  });
  return el;
}

/** Vertical fader (mixer volume). Drag, wheel, double-click resets; gamepad uses data-param nudges. */
export function fader(p: ParamDef, host: ControlHost, label: string): HTMLElement {
  const fill = h("div", { class: "fader-fill" });
  const cap = h("div", { class: "fader-cap" });
  const track = h("div", { class: "fader-track" }, fill, cap);
  const valueText = h("div", { class: "knob-value" });
  const el = h("div", { class: "fader", "data-nav": p.id, "data-param": p.id, title: p.label }, track, h("div", { class: "knob-label" }, label), valueText);
  const draw = () => {
    const u = Math.max(0, Math.min(1, toUnit(p, host.get(p.id))));
    fill.style.height = `${u * 100}%`;
    cap.style.bottom = `calc(${u * 100}% - 6px)`;
    valueText.textContent = formatParam(p, host.get(p.id));
  };
  (el as HTMLElement & { redraw?: () => void }).redraw = draw;
  draw();
  track.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    host.begin(p.id);
    el.classList.add("turning");
    const set = (y: number) => {
      const r = track.getBoundingClientRect();
      host.set(p.id, fromUnit(p, 1 - (y - r.top) / r.height));
      draw();
    };
    set(e.clientY);
    const move = (ev: PointerEvent) => set(ev.clientY);
    const up = () => { el.classList.remove("turning"); track.removeEventListener("pointermove", move); track.removeEventListener("pointerup", up); };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    host.begin(p.id);
    host.set(p.id, fromUnit(p, toUnit(p, host.get(p.id)) - Math.sign(e.deltaY) * 0.03));
    draw();
  }, { passive: false });
  el.addEventListener("dblclick", () => { host.begin(p.id); host.set(p.id, p.def); draw(); });
  return el;
}
