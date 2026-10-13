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
export function control(p: ParamDef, host: ControlHost, opts: { label?: string; size?: "s" | "m" | "l" } = {}): HTMLElement {
  return p.options && p.options.length <= 4 && p.max - p.min < 4 ? switchCtl(p, host, opts.label) : knob(p, host, opts);
}

export function knob(p: ParamDef, host: ControlHost, opts: { label?: string; size?: "s" | "m" | "l" } = {}): HTMLElement {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.classList.add("knob-svg");
  const track = document.createElementNS(svgNS, "path");
  track.setAttribute("d", arcPath(1, 15));
  track.setAttribute("class", "knob-track");
  const val = document.createElementNS(svgNS, "path");
  val.setAttribute("class", "knob-val");
  const dot = document.createElementNS(svgNS, "line");
  dot.setAttribute("class", "knob-dot");
  svg.append(track, val, dot);
  const valueText = h("div", { class: "knob-value" });
  const el = h("div", { class: `knob size-${opts.size ?? "m"}`, "data-nav": p.id, "data-param": p.id, title: p.label },
    svg, h("div", { class: "knob-label" }, opts.label ?? p.label), valueText);

  const draw = () => {
    const v = host.get(p.id);
    const u = Math.max(0, Math.min(1, toUnit(p, v)));
    val.setAttribute("d", arcPath(u, 15));
    const a = ((-ARC / 2 - 90 + u * ARC) * Math.PI) / 180;
    dot.setAttribute("x1", String(20 + 6 * Math.cos(a)));
    dot.setAttribute("y1", String(20 + 6 * Math.sin(a)));
    dot.setAttribute("x2", String(20 + 13 * Math.cos(a)));
    dot.setAttribute("y2", String(20 + 13 * Math.sin(a)));
    valueText.textContent = formatParam(p, v);
  };
  (el as HTMLElement & { redraw?: () => void }).redraw = draw;
  draw();

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    host.begin(p.id);
    let u = Math.max(0, Math.min(1, toUnit(p, host.get(p.id))));
    let lastY = e.clientY;
    const move = (ev: PointerEvent) => {
      u = Math.max(0, Math.min(1, u + (lastY - ev.clientY) / (ev.shiftKey ? 900 : 180)));
      lastY = ev.clientY;
      host.set(p.id, fromUnit(p, u));
      draw();
    };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    host.begin(p.id);
    const u = toUnit(p, host.get(p.id)) - Math.sign(e.deltaY) * (p.options ? 1 / (p.max - p.min) : e.shiftKey ? 0.005 : 0.03);
    host.set(p.id, fromUnit(p, u));
    draw();
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
    const set = (y: number) => {
      const r = track.getBoundingClientRect();
      host.set(p.id, fromUnit(p, 1 - (y - r.top) / r.height));
      draw();
    };
    set(e.clientY);
    const move = (ev: PointerEvent) => set(ev.clientY);
    const up = () => { track.removeEventListener("pointermove", move); track.removeEventListener("pointerup", up); };
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
