// TILT Jam's screens: pick a genre pack, pick a template, and you're in the jam: section pads, the
// progression, a card per part (big knobs and a few pads), the FX strip, BACK TO GOOD.

import { chordName, NOTE_NAMES, scaleById, scaleChord } from "../engine/music";
import { h } from "../ui/dom";
import { saveToLibrary } from "../ui/library";
import { STORE_PREFIX } from "../ui/storage";
import { upload } from "../ui/sharesong";
import { progressionOf } from "./build";
import { FX_LIST, type FxId } from "./fx";
import { jamKnob, type JamKnob } from "./knob";
import { ROLE_MACROS } from "./macros";
import { PAD_SECTIONS, SECTION_NAMES, type Pack, type Role, type Section, type Template } from "./pack";
import { PACKS } from "./packs";
import { JamSession } from "./session";

export const ROLE_ICONS: Record<Role, string> = { drums: "🥁", bass: "🎸", guitar: "⚡", keys: "🎹", lead: "🎤" };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const SECTION_KEYS: Record<string, Section> = { q: "verse", w: "chorus", e: "bridge", r: "solo", t: "breakdown" };

/** A chord degree as a Roman numeral, lower case for minor, ° for diminished. */
export function roman(degree: number, key: number, scale: string): string {
  const steps = scaleById(scale).steps, n = steps.length;
  const root = key + steps[(degree - 1) % n] + 48;
  const tri = scaleChord(root, key, scale, 3), third = tri[1] - tri[0], fifth = tri[2] - tri[0];
  const r = ROMAN[(degree - 1) % 7] ?? String(degree);
  return third === 3 ? (fifth === 6 ? r.toLowerCase() + "°" : r.toLowerCase()) : r;
}

export function chordLabel(degree: number, key: number, scale: string): string {
  const steps = scaleById(scale).steps;
  const root = key + steps[(degree - 1) % steps.length] + 48;
  return chordName(scaleChord(root, key, scale, 3));
}

export class JamApp {
  session: JamSession | null = null;
  pack: Pack | null = null;
  private knobs: JamKnob[][] = [];
  private frameEls: { cards: HTMLElement[]; pads: Map<Section | "song", HTMLElement>; chord: HTMLElement; progEl: HTMLElement; bar: HTMLElement; fx: Map<FxId, HTMLElement>; play: HTMLElement; back: HTMLElement; partPend: HTMLElement[] } | null = null;
  /** Multiplayer hooks (cards claimed by players); set by players.ts. */
  cardBadge: (part: number) => HTMLElement | string = () => "";
  onJamStart: (s: JamSession) => void = () => {};

  constructor(private root: HTMLElement) {
    document.addEventListener("keydown", (e) => this.key(e, true));
    document.addEventListener("keyup", (e) => this.key(e, false));
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ start flow

  showPacks() {
    this.leaveJam();
    this.root.replaceChildren(h("div", { class: "jam-start" },
      this.logo(),
      h("p", { class: "jam-tag" }, "Pick a sound. It starts playing. Turn knobs, hit pads, nothing sounds wrong."),
      h("div", { class: "pack-grid" }, PACKS.map((p) => h("button", { class: "pack-card", style: `--pack:${p.color}`, onclick: () => this.showTemplates(p) },
        h("div", { class: "pack-name" }, p.name), h("div", { class: "pack-blurb" }, p.blurb), h("div", { class: "pack-count" }, `${p.templates.length} templates`)))),
      h("a", { class: "jam-studio-link", href: studioUrl() }, "TILT Studio (the full editor) →")));
    (this.root.querySelector(".pack-card") as HTMLElement | null)?.focus();
  }

  showTemplates(p: Pack) {
    this.leaveJam();
    this.pack = p;
    this.root.replaceChildren(h("div", { class: "jam-start", style: `--pack:${p.color}` },
      h("div", { class: "jam-crumbs" }, h("button", { class: "jam-back", onclick: () => this.showPacks() }, "◀ Packs"), h("span", { class: "jam-crumb" }, p.name)),
      h("div", { class: "tpl-grid" }, p.templates.map((t) => h("button", { class: "tpl-card", onclick: () => void this.start(t) },
        h("div", { class: "tpl-name" }, t.name),
        h("div", { class: "tpl-blurb" }, t.blurb),
        h("div", { class: "tpl-meta" }, `${t.tempo[0]}-${t.tempo[1]} bpm · ${t.parts.map((x) => ROLE_ICONS[x.role]).join(" ")}`))))));
    (this.root.querySelector(".tpl-card") as HTMLElement | null)?.focus();
  }

  /** A template: a key from its list, a tempo in its range, and it plays at once. */
  async start(t: Template, opts: { key?: number; scale?: string; tempo?: number } = {}) {
    this.leaveJam();
    const key = opts.key ?? t.keys[Math.floor(Math.random() * t.keys.length)];
    const scale = opts.scale ?? t.scales[0];
    const tempo = opts.tempo ?? Math.round(t.tempo[0] + Math.random() * (t.tempo[1] - t.tempo[0]));
    const s = new JamSession(t, { key, scale, tempo });
    this.session = s;
    s.onChange = () => this.refresh();
    this.renderJam();
    await s.start();
    this.onJamStart(s);
  }

  private leaveJam() {
    if (this.session) { this.session.fx?.releaseAll(); this.session.stop(); void this.session.engine.ctx?.close(); }
    this.session = null;
    this.frameEls = null;
  }

  private logo() {
    return h("div", { class: "jam-logo" }, h("span", { class: "jam-logo-tilt" }, "TILT"), h("span", { class: "jam-logo-jam" }, "JAM"));
  }

  // ------------------------------------------------------------ the jam

  renderJam() {
    const s = this.session!, t = s.t, st = s.st;
    const pads = new Map<Section | "song", HTMLElement>();
    const pad = (sec: Section) => {
      const b = h("button", { class: "sec-pad", "data-sec": sec, title: `Loop the ${SECTION_NAMES[sec].toLowerCase()} from the next bar (${Object.keys(SECTION_KEYS).find((k) => SECTION_KEYS[k] === sec)?.toUpperCase()})`, onclick: () => s.playSection(sec) }, SECTION_NAMES[sec]);
      pads.set(sec, b);
      return b;
    };
    const songPad = h("button", { class: "sec-pad song", title: "Let the song run through its sections (S)", onclick: () => s.followSong() }, "▶ Song");
    pads.set("song", songPad);
    const chord = h("div", { class: "jam-chord" });
    const progEl = h("button", { class: "jam-prog", title: "Shuffle progression: another chord pattern for this section, from the genre (P)", onclick: () => s.shuffleProgression() });
    const bar = h("div", { class: "jam-bar" });
    const play = h("button", { class: "jam-play", title: "Play / stop (Space)", onclick: () => s.togglePlay() });
    const back = h("button", { class: "back-good", title: "BACK TO GOOD: every part, knob and riff as the template started (on the next bar). (B)", onclick: () => s.backToGood() }, "BACK TO GOOD");
    const fx = new Map<FxId, HTMLElement>();
    const partPend: HTMLElement[] = [];
    this.knobs = [];
    const cards = t.parts.map((p, i) => {
      const ms = ROLE_MACROS[p.role];
      const ks = ms.map((m, k) => jamKnob({ label: m.label, hint: m.hint, value: st.knobs[i][k], home: p.home?.[m.id] ?? m.home, steps: m.steps, onChange: (v) => s.setKnob(i, k, v) }));
      this.knobs.push(ks);
      const pend = h("span", { class: "card-pending" }, "next bar");
      partPend.push(pend);
      const entry = p.pool[st.pick[i] % p.pool.length];
      return h("div", { class: `part-card role-${p.role}` + (st.mute[i] ? " muted" : ""), "data-part": String(i) },
        h("div", { class: "card-head" },
          h("span", { class: "card-ico" }, ROLE_ICONS[p.role]),
          h("div", { class: "card-title" }, h("div", { class: "card-name" }, p.name), h("div", { class: "card-sub" }, `${s.song.tracks[i].preset} · ${entry.name}`)),
          pend, this.cardBadge(i),
          h("span", { class: "card-led" })),
        h("div", { class: "card-knobs" }, ks),
        h("div", { class: "card-pads" },
          h("button", { class: "card-pad dice", title: `Another ${p.role === "drums" ? "groove" : "riff"} from this template (next bar)`, onclick: () => s.dice(i) }, `🎲 ${p.role === "drums" ? "Groove" : "Riff"}`),
          h("button", { class: "card-pad" + (st.mute[i] ? " on" : ""), onclick: () => s.toggleMute(i) }, st.mute[i] ? "Muted" : "Mute"),
          h("button", { class: "card-pad", title: "This part's template sound, riff and knobs", onclick: () => s.resetPart(i) }, "Reset")));
    });
    this.root.replaceChildren(h("div", { class: "jam", style: `--pack:${this.pack?.color ?? "#ff5a3c"}` },
      h("header", { class: "jam-top" },
        h("button", { class: "jam-back", title: "Other templates", onclick: () => this.pack ? this.showTemplates(this.pack) : this.showPacks() }, "◀"),
        this.logo(),
        h("div", { class: "jam-info" }, h("div", { class: "jam-title" }, t.name), h("div", { class: "jam-key" }, `${NOTE_NAMES[st.key]} ${scaleById(st.scale).name} · ${st.tempo} bpm`)),
        play,
        h("div", { class: "spacer" }),
        h("button", { class: "jam-link", title: "Share this jam: a link that opens it", onclick: () => void this.share() }, "Share"),
        h("button", { class: "jam-link", title: "Open this song in TILT Studio, the full editor", onclick: () => void this.openInStudio() }, "Open in TILT Studio"),
        back),
      h("section", { class: "jam-sections" },
        h("div", { class: "sec-pads" }, PAD_SECTIONS.map(pad), songPad),
        h("div", { class: "jam-now" }, chord, progEl, bar)),
      h("section", { class: "part-grid" }, cards),
      h("footer", { class: "fx-strip" }, FX_LIST.map((f) => {
        const b = h("button", { class: "fx-pad", title: `${f.hint} (hold ${f.key})` }, h("span", { class: "fx-name" }, f.label), h("span", { class: "fx-key" }, f.key));
        const on = (e: Event) => { e.preventDefault(); s.fx?.press(f.id); };
        const off = () => s.fx?.release(f.id);
        b.addEventListener("pointerdown", (e) => { b.setPointerCapture((e as PointerEvent).pointerId); on(e); });
        b.addEventListener("pointerup", off);
        b.addEventListener("pointercancel", off);
        b.addEventListener("lostpointercapture", off);
        fx.set(f.id, b);
        return b;
      }), h("span", { class: "fx-note" }, "Hold to apply · let go to spring back · limiter always on"))));
    this.frameEls = { cards, pads, chord, progEl, bar, fx, play, back, partPend };
    this.refresh();
  }

  /** Light the state that changes with the music (cheap; called on changes and every frame). */
  refresh() {
    const s = this.session, f = this.frameEls;
    if (!s || !f) return;
    const st = s.st;
    f.play.textContent = s.playing ? "■" : "▶";
    f.play.classList.toggle("on", s.playing);
    const sec = s.section;
    for (const [k, el] of f.pads) {
      el.classList.toggle("on", k === "song" ? s.held === null && s.playing : sec === k);
      el.classList.toggle("held", k !== "song" && s.held === k);
    }
    const prog = progressionOf(s.t, st, sec ?? "verse");
    f.progEl.replaceChildren(h("span", { class: "prog-label" }, "🎲 Progression"), h("span", { class: "prog-chords" }, prog.map((d) => roman(d, st.key, st.scale)).join(" – ")));
    f.progEl.classList.toggle("pending", s.pending.has("prog"));
    f.back.classList.toggle("pending", s.pending.has("all"));
    f.cards.forEach((c, i) => {
      c.classList.toggle("muted", st.mute[i]);
      f.partPend[i].classList.toggle("on", s.pending.has(`part${i}`) || s.pending.has("all"));
      const sub = c.querySelector(".card-sub");
      if (sub) sub.textContent = `${s.song.tracks[i].preset} · ${s.t.parts[i].pool[st.pick[i] % s.t.parts[i].pool.length].name}`;
      const mute = c.querySelectorAll(".card-pad")[1] as HTMLElement | undefined;
      if (mute) { mute.textContent = st.mute[i] ? "Muted" : "Mute"; mute.classList.toggle("on", st.mute[i]); }
      this.knobs[i]?.forEach((k, j) => { if (!k.classList.contains("turning")) k.setValue(st.knobs[i][j]); });
    });
    for (const [id, el] of f.fx) el.classList.toggle("on", !!s.fx?.held.has(id));
  }

  private lastChord = "";
  private frame() {
    const s = this.session, f = this.frameEls;
    if (!s || !f) return;
    const c = s.chordNow();
    const txt = c ? `${chordLabel(c.degree, s.st.key + (s.isLastChorus ? s.t.moves.lastChorusUp ?? 0 : 0), s.st.scale)}|${roman(c.degree, s.st.key, s.st.scale)}|${c.bar}/${c.bars}|${s.section}` : "";
    if (txt !== this.lastChord) {
      this.lastChord = txt;
      if (c) {
        f.chord.replaceChildren(h("span", { class: "chord-name" }, txt.split("|")[0]), h("span", { class: "chord-roman" }, txt.split("|")[1]), s.isLastChorus ? h("span", { class: "chord-up" }, "key change ↑") : "");
        f.bar.replaceChildren(...Array.from({ length: c.bars }, (_, k) => h("span", { class: "bar-dot" + (k === c.bar ? " on" : "") })));
      } else { f.chord.replaceChildren(h("span", { class: "chord-name dim" }, "—")); f.bar.replaceChildren(); }
      this.refresh();
    }
    // Each card's light: how loud its part is right now.
    f.cards.forEach((card, i) => {
      const lv = s.playing ? s.engine.meter(s.song.tracks[i].id) : 0;
      card.style.setProperty("--lv", String(Math.min(1, lv * 1.6)));
    });
  }

  // ------------------------------------------------------------ handoffs

  /** The song goes to TILT Studio as its open song (and into the library), then Studio opens on it. */
  async openInStudio() {
    const s = this.session;
    if (!s) return;
    const song = JSON.parse(JSON.stringify(s.song));
    song.title = `${s.t.name} ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    try { localStorage.setItem(STORE_PREFIX + "song.v1", JSON.stringify(song)); } catch { /* storage blocked: the library still has it */ }
    try { await saveToLibrary(song); } catch { /* ignore */ }
    s.stop();
    location.href = studioUrl("from-jam");
  }

  private async share() {
    const s = this.session;
    if (!s) return;
    const box = h("div", { class: "jam-modal" }, h("p", null, "Uploading…"));
    const wrap = h("div", { class: "jam-modal-wrap", onclick: (e: Event) => { if (e.target === wrap) wrap.remove(); } }, box);
    document.body.appendChild(wrap);
    try {
      const res = await upload({ ...JSON.parse(JSON.stringify(s.song)), playAs: "song" });
      const url = res.url;
      box.replaceChildren(
        h("h3", null, "Share this jam"),
        h("p", null, res.kind === "server" ? "Anyone with this link hears your jam (and can open it in TILT):" : "A link with the whole jam inside it:"),
        h("input", { class: "jam-input", value: url, readonly: true, onclick: (e: Event) => (e.target as HTMLInputElement).select() }),
        h("div", { class: "jam-modal-btns" },
          h("button", { class: "jam-link", onclick: () => { void navigator.clipboard?.writeText(url); (box.querySelector(".copied") as HTMLElement | null)?.removeAttribute("hidden"); } }, "Copy link"),
          h("button", { class: "jam-link", onclick: () => wrap.remove() }, "Done")),
        h("p", { class: "copied", hidden: true }, "Copied."));
    } catch (e) {
      box.replaceChildren(h("p", null, `Couldn't share: ${e instanceof Error ? e.message : e}`), h("button", { class: "jam-link", onclick: () => wrap.remove() }, "Close"));
    }
  }

  // ------------------------------------------------------------ keyboard

  private key(e: KeyboardEvent, down: boolean) {
    const s = this.session;
    if (!s || (e.target as HTMLElement)?.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    const fxk = FX_LIST.find((f) => f.key === k);
    if (fxk) { if (down && !e.repeat) s.fx?.press(fxk.id); else if (!down) s.fx?.release(fxk.id); e.preventDefault(); return; }
    if (!down || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === " ") { s.togglePlay(); e.preventDefault(); }
    else if (k === "b") s.backToGood();
    else if (k === "p") s.shuffleProgression();
    else if (k === "s") s.followSong();
    else if (SECTION_KEYS[k]) s.playSection(SECTION_KEYS[k]);
  }
}

/** TILT Studio's address (keeping ?sandbox, so tests never touch real songs). */
export function studioUrl(flag?: string): string {
  const q = new URLSearchParams(location.search), keep = new URLSearchParams();
  if (q.has("sandbox")) keep.set("sandbox", q.get("sandbox") ?? "");
  let qs = keep.toString().replace(/=$/, "").replace(/=&/g, "&");
  if (flag) qs = qs ? `${qs}&${flag}` : flag;
  return `/${qs ? `?${qs}` : ""}`;
}
