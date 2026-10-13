// Oscilloscope: a floating window showing the waveform or the Lissajous
// (left on X, right on Y) of the master or any track. Toggle with the ∿ button.

import { INSTRUMENTS } from "../engine/instruments";
import type { App } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";

export class Scope {
  private el: HTMLElement | null = null;
  private canvas!: HTMLCanvasElement;
  private source: number | null = null; // track id, null = master
  private mode: "wave" | "xy" = "wave";
  private trig = true;
  private gain = 1;
  private bufL = new Float32Array(2048);
  private bufR = new Float32Array(2048);

  constructor(private app: App) {
    app.frameHooks.push(() => this.draw());
  }

  get open() { return !!this.el; }

  toggle() {
    if (this.el) { this.el.remove(); this.el = null; this.app.engine.scopeOff(); return; }
    this.canvas = h("canvas", { class: "scope-canvas", width: 360, height: 220 });
    this.el = h("div", { class: "scope" });
    document.body.appendChild(this.el);
    this.renderControls();
    this.makeDraggable();
  }

  private renderControls() {
    if (!this.el) return;
    const song = this.app.song;
    const sources: (number | null)[] = [null, ...song.tracks.map((t) => t.id)];
    if (!sources.includes(this.source)) this.source = null;
    const label = (id: number | null) => {
      if (id === null) return "Master";
      const t = song.tracks.find((x) => x.id === id)!;
      return `${song.tracks.indexOf(t) + 1} ${INSTRUMENTS[t.kind].name}`;
    };
    const btn = (text: string, on: boolean, fn: () => void) => h("button", { class: "mini" + (on ? " on" : ""), onclick: () => { fn(); this.renderControls(); } }, text);
    this.el.replaceChildren(
      h("div", { class: "scope-bar" },
        h("b", { class: "scope-title" }, "∿ Scope"),
        h("select", { class: "scope-src", onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; this.source = v === "m" ? null : Number(v); } },
          sources.map((id) => h("option", { value: id === null ? "m" : String(id), selected: id === this.source }, label(id)))),
        btn("Wave", this.mode === "wave", () => (this.mode = "wave")),
        btn("X/Y", this.mode === "xy", () => (this.mode = "xy")),
        btn("Trig", this.trig, () => (this.trig = !this.trig)),
        btn("×2", this.gain > 1, () => (this.gain = this.gain > 1 ? 1 : 2.5)),
        h("button", { class: "mini", onclick: () => this.toggle(), title: "Close" }, "✕")),
      this.canvas,
    );
  }

  private makeDraggable() {
    const el = this.el!;
    el.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button, select")) return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const move = (ev: PointerEvent) => { el.style.left = `${ev.clientX - dx}px`; el.style.top = `${ev.clientY - dy}px`; el.style.right = "auto"; el.style.bottom = "auto"; };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  private draw() {
    if (!this.el) return;
    const tap = this.app.engine.scopeTap(this.source);
    const g = this.canvas.getContext("2d")!;
    const w = this.canvas.width, ht = this.canvas.height;
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = css.getPropertyValue("--well").trim();
    g.fillRect(0, 0, w, ht);
    g.strokeStyle = css.getPropertyValue("--line").trim();
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, ht / 2); g.lineTo(w, ht / 2);
    g.moveTo(w / 2, 0); g.lineTo(w / 2, ht);
    g.stroke();
    if (!tap) return;
    tap.l.getFloatTimeDomainData(this.bufL);
    tap.r.getFloatTimeDomainData(this.bufR);
    const t = this.source !== null ? this.app.song.tracks.find((x) => x.id === this.source) : undefined;
    const color = t ? trackColor(t) : css.getPropertyValue("--mint").trim();
    g.strokeStyle = color;
    g.lineWidth = 1.6;
    g.shadowColor = color;
    g.shadowBlur = 6;
    g.beginPath();
    const k = this.gain;
    if (this.mode === "wave") {
      // Trigger on a rising zero crossing so a steady tone stands still.
      let start = 0;
      if (this.trig) for (let i = 1; i < 1024; i++) if (this.bufL[i - 1] < 0 && this.bufL[i] >= 0) { start = i; break; }
      const n = 1024;
      for (let i = 0; i < n; i++) {
        const v = (this.bufL[start + i] + this.bufR[start + i]) * 0.5 * k;
        const x = (i / (n - 1)) * w, y = ht / 2 - v * (ht / 2) * 0.9;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
    } else {
      // Lissajous: left on X, right on Y (a mono signal is a diagonal line).
      const s = Math.min(w, ht) / 2 * 0.9;
      for (let i = 0; i < this.bufL.length; i++) {
        const x = w / 2 + this.bufL[i] * k * s, y = ht / 2 - this.bufR[i] * k * s;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
    }
    g.stroke();
    g.shadowBlur = 0;
  }
}
