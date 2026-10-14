// Mixer: one strip per track (3 insert FX with 2 knobs each, reverb send,
// pan, fader, meter, mute/solo) and the master strip (limiter, reverb, volume).

import { INSTRUMENTS, type ParamDef } from "../engine/instruments";
import type { Master, Track } from "../engine/model";
import { FX_TYPES, fxDef, getParam, paramInfo } from "../engine/params";
import type { Action } from "./actions";
import type { App, Screen } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";
import { control, fader, knob, type ControlHost } from "./knob";
import { SpatialNav } from "./nav";

const MASTER_DEFS: Record<string, ParamDef> = {
  "master:volume": { id: "master:volume", label: "Master", min: 0, max: 1, def: 0.9 },
  "master:limitDepth": { id: "master:limitDepth", label: "Depth", min: 0, max: 1, def: 0.5 },
  "master:reverbTime": { id: "master:reverbTime", label: "Time", min: 0, max: 1, def: 0.45 },
};

export class MixerScreen implements Screen {
  el = h("div", { class: "mixer" });
  private nav = new SpatialNav(() => this.el);
  private meters: { el: HTMLElement; track: number | null }[] = [];
  private peaks = new Map<HTMLElement, number>();

  constructor(private app: App) {}

  /** The track whose strip has focus (MIDI / musical keyboard play it). */
  focusedTrack(): Track | undefined {
    const id = Number(this.nav.focused?.closest<HTMLElement>("[data-track]")?.dataset.track);
    return this.app.song.tracks.find((t) => t.id === id);
  }

  render() {
    const app = this.app, song = app.song;
    this.meters = [];
    this.el.replaceChildren(
      ...song.tracks.map((t, i) => this.strip(t, i)),
      this.masterStrip(song.master),
    );
    for (const t of song.tracks) {
      const strip = this.el.querySelector<HTMLElement>(`[data-track="${t.id}"]`);
      if (strip) app.markLearned(strip, t.id);
    }
    this.nav.paint();
  }

  private strip(t: Track, i: number): HTMLElement {
    const meter = h("div", { class: "meter" }, h("div", { class: "meter-fill" }));
    this.meters.push({ el: meter, track: t.id });
    return channelStrip(this.app, t, i, meter);
  }

  private masterStrip(m: Master): HTMLElement {
    const app = this.app;
    const host: ControlHost = {
      get: (id) => m[id.slice(7) as keyof Master] as number,
      set: (id, v) => app.setMaster(id.slice(7) as keyof Master, v),
      begin: (id) => app.setMaster(id.slice(7) as keyof Master, m[id.slice(7) as keyof Master] as number, true),
    };
    const meter = h("div", { class: "meter" }, h("div", { class: "meter-fill" }));
    this.meters.push({ el: meter, track: null });
    const toggle = (key: "limiter" | "reverb", label: string) =>
      h("button", { class: "switch" + (m[key] ? " on" : ""), "data-nav": `m-${key}`, onclick: () => app.edit(label, () => (m[key] = !m[key])) },
        h("div", { class: "switch-label" }, label), h("div", { class: "switch-value" }, m[key] ? "On" : "Off"));
    return h("div", { class: "strip master" },
      h("div", { class: "strip-head" }, h("div", { class: "strip-name" }, "MASTER")),
      h("div", { class: "fx-slot on" }, toggle("limiter", "Limiter"), knob(MASTER_DEFS["master:limitDepth"], host, { label: "Depth", size: "s" })),
      h("div", { class: "fx-slot on" }, toggle("reverb", "Reverb"), knob(MASTER_DEFS["master:reverbTime"], host, { label: "Time", size: "s" })),
      h("div", { class: "strip-fader" }, fader(MASTER_DEFS["master:volume"], host, "Master"), meter),
    );
  }

  frame() {
    for (const m of this.meters) {
      const raw = m.track === null ? this.app.engine.masterMeter() : this.app.engine.meter(m.track);
      // Peak meter with a quick rise and slow fall.
      const prev = this.peaks.get(m.el) ?? 0;
      const v = Math.max(raw, prev * 0.92);
      this.peaks.set(m.el, v);
      const db = v > 0 ? 20 * Math.log10(v) : -60;
      const fill = m.el.firstElementChild as HTMLElement;
      fill.style.height = `${100 - Math.max(0, Math.min(100, ((db + 48) / 48) * 100))}%`;
      m.el.classList.toggle("clip", v > 0.98);
    }
  }

  paramChanged(_trackId: number, id: string) {
    const el = this.el.querySelector<HTMLElement & { redraw?: () => void }>(`[data-track="${_trackId}"] [data-param="${id}"]`);
    el?.redraw?.();
  }

  handle(a: Action): boolean {
    const app = this.app;
    switch (a.type) {
      case "dir": {
        this.nav.move(a.dir);
        const t = this.focusedTrack(), id = this.nav.focused?.dataset.param;
        if (app.learning && t && id && !id.startsWith("master:")) app.noteLearnTarget(t.id, id);
        return true;
      }
      case "confirm": this.nav.focused?.click(); return true;
      case "knob": {
        const f = this.nav.focused;
        const id = f?.dataset.param;
        if (!id) return true;
        if (id.startsWith("master:")) {
          const k = id.slice(7) as keyof Master;
          app.setMaster(k, Math.max(0, Math.min(1, (app.song.master[k] as number) + (a.dx + a.dy) * 0.01)));
          (f as HTMLElement & { redraw?: () => void }).redraw?.();
        } else {
          const t = this.focusedTrack();
          if (t) app.nudgeParam(t, id, a.dx + a.dy);
        }
        return true;
      }
      case "menu": {
        const t = this.focusedTrack();
        if (t) { const s = this.nav.focused?.dataset.nav?.match(/fx(\d)/); pickFx(this.app, t, s ? Number(s[1]) : 0, this.nav.focused!); }
        return true;
      }
      case "back": app.show("song"); return true;
    }
    return false;
  }
}

/** One track's mixer strip: 3 insert FX, reverb send, pan, fader (+ `meter`), mute / solo. */
export function channelStrip(app: App, t: Track, i: number, meter: HTMLElement): HTMLElement {
  const host: ControlHost = {
    get: (id) => getParam(t, id),
    set: (id, v) => app.setParam(t, id, v),
    begin: (id) => app.setParam(t, id, getParam(t, id), true),
  };
  // Only the effects in use get a box; the free slots fold into one "+ FX" chip (it fills the first free one).
  const free = t.fx.findIndex((x) => x.type === "off");
  const slots: HTMLElement[] = t.fx.flatMap((slot, s) => {
    const d = fxDef(slot.type);
    const on = slot.type !== "off";
    if (!on) return [];
    return [h("div", { class: "fx-slot on" },
      h("button", { class: "fx-type", "data-nav": `t${t.id}fx${s}`, onclick: (e: Event) => pickFx(app, t, s, e.currentTarget as HTMLElement) },
        h("span", { class: "fx-num" }, `FX${s + 1}`), on ? d.name : "+ add"),
      on ? h("div", { class: "fx-knobs" },
        knob(paramInfo(t, `fx${s}:a`)!, host, { label: d.a, size: "s" }),
        knob(paramInfo(t, `fx${s}:b`)!, host, { label: d.b, size: "s" })) : null)];
  });
  if (free >= 0) {
    slots.push(h("button", { class: "fx-add", "data-nav": `t${t.id}fx${free}`, title: `Add an insert effect (FX${free + 1})`, onclick: (e: Event) => pickFx(app, t, free, e.currentTarget as HTMLElement) }, "+ FX"));
  }
  return h("div", { class: "strip", "data-track": t.id, style: `--track:${trackColor(t)}` },
    h("div", { class: "strip-head" }, h("div", { class: "strip-name" }, `${i + 1} ${INSTRUMENTS[t.kind].name}`), h("div", { class: "strip-preset" }, t.preset)),
    ...slots,
    h("div", { class: "strip-row" },
      control(paramInfo(t, "mix:send")!, host, { label: "Reverb", size: "s" }),
      control(paramInfo(t, "mix:pan")!, host, { label: "Pan", size: "s" })),
    h("div", { class: "strip-fader" }, fader(paramInfo(t, "mix:vol")!, host, "Vol"), meter),
    h("div", { class: "strip-row" },
      h("button", { class: "mini mute" + (t.mute ? " on" : ""), "data-nav": `t${t.id}m`, onclick: () => app.edit("Mute", () => (t.mute = !t.mute)) }, "M"),
      h("button", { class: "mini" + (t.solo ? " on solo" : ""), "data-nav": `t${t.id}s`, onclick: () => app.edit("Solo", () => (t.solo = !t.solo)) }, "S")),
  );
}

export function pickFx(app: App, t: Track, slot: number, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  app.overlays.menu(`Track ${app.song.tracks.indexOf(t) + 1} · FX${slot + 1}`, () => FX_TYPES.map((d) => ({
    label: d.id === "off" ? "Off" : d.name,
    hint: d.a ? `${d.a} / ${d.b}` : "",
    checked: t.fx[slot].type === d.id,
    run: () => app.edit("Insert FX", () => { t.fx[slot] = { type: d.id, a: d.defA, b: d.defB }; }),
  })), { x: r.left, y: r.bottom });
}
