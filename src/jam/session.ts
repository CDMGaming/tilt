// A jam: one template, its song, the engine playing it, and what the players have changed.
// Notes and sections change on the next bar (never mid-bar); knob turns are heard at once.

import { AudioEngine } from "../engine/audio";
import { PPQ, TICKS_PER_BAR, chainIndexOf, songChain, type Song } from "../engine/model";
import { ROLE_MACROS } from "./macros";
import { LAST_CHORUS, buildSong, homeKnobs, homeState, progressionOf, sceneOf, sectionOfScene, updateSong, updateSound, type JamState } from "./build";
import type { Section, Template } from "./pack";
import { PerfFx } from "./fx";

export class JamSession {
  engine = new AudioEngine();
  song!: Song;
  st!: JamState;
  /** Where "BACK TO GOOD" returns to: the state the jam started with. */
  home!: JamState;
  fx!: PerfFx;
  /** The section the player asked for (looping), or null while the song plays through its form. */
  held: Section | null = null;
  /** Something changes on the next bar (shown on the pads). */
  pending = new Set<string>();
  onChange: () => void = () => {};
  private ready: Promise<void> | null = null;

  constructor(public t: Template, opts: { key?: number; scale?: string; tempo?: number } = {}) {
    this.home = homeState(t, opts.key, opts.scale, opts.tempo);
    this.st = clone(this.home);
    this.song = buildSong(t, this.st);
  }

  /** Start the audio (call from a click: browsers only allow sound after one) and play from the top. */
  async start() {
    this.ready ??= this.engine.init(this.song).then(() => { this.fx = new PerfFx(this.engine, this.t, () => this.st.tempo); });
    await this.ready;
    if (this.engine.ctx.state !== "running") await this.engine.ctx.resume();
    this.engine.play({ kind: "song", fromIndex: 0 });
    this.held = null;
    this.onChange();
  }

  get playing() { return this.engine.playing; }

  togglePlay() {
    if (this.engine.playing) { this.engine.stop(); this.onChange(); return; }
    this.engine.play(this.held ? { kind: "scene", sceneId: sceneOf(this.song, this.held)!.id } : { kind: "song", fromIndex: 0 });
    this.onChange();
  }

  /** The section playing now (the key-change chorus counts as the chorus). */
  get section(): Section | null {
    const pos = this.engine.position();
    return pos ? sectionOfScene(this.song, pos.sceneId) : null;
  }

  /** The chord degree under the playhead, for the display. */
  chordNow(): { degree: number; bar: number; bars: number } | null {
    const pos = this.engine.position(), s = this.section;
    if (!pos || !s) return null;
    const prog = progressionOf(this.t, this.st, s), bar = Math.floor(pos.tick / TICKS_PER_BAR) % prog.length;
    return { degree: prog[bar], bar, bars: prog.length };
  }

  // ------------------------------------------------------------ quantized changes

  /** Run `fn` just before the next bar line (or now, when stopped), so its notes start on the bar. */
  private atNextBar(label: string, fn: () => void) {
    const eng = this.engine, pos = eng.playing ? eng.position() : null;
    if (!pos) { fn(); this.commit(); return; }
    const spt = 60 / (this.st.tempo * PPQ);
    let bar = (Math.floor(pos.tick / TICKS_PER_BAR) + 1) * TICKS_PER_BAR;
    const due = () => pos.instStart + bar * spt - 0.17; // ahead of the engine's look-ahead
    if (due() - eng.ctx.currentTime < 0.02) bar += TICKS_PER_BAR;
    this.pending.add(label);
    this.onChange();
    setTimeout(() => { this.pending.delete(label); fn(); this.commit(); }, Math.max(0, (due() - eng.ctx.currentTime) * 1000));
  }

  /** Hand the changed song to the engine. */
  private commit() {
    this.engine.sync(this.song);
    this.onChange();
  }

  // ------------------------------------------------------------ the part cards

  /** A knob turned: sound macros at once; note macros (Riff, Follow...) on the next bar. */
  setKnob(part: number, k: number, v: number) {
    const m = ROLE_MACROS[this.t.parts[part].role][k];
    this.st.knobs[part][k] = Math.max(0, Math.min(1, v));
    updateSound(this.t, this.st, this.song, part);
    this.engine.sync(this.song);
    if (m.render) this.renderSoon(part);
    else this.onChange();
  }

  private renderTimer = 0;
  /** Note macros re-write the part on the next bar, once the knob settles a little. */
  private renderSoon(part: number) {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.atNextBar(`part${part}`, () => this.rewrite(part)), 120) as unknown as number;
  }

  /** Re-write a part's notes (drums: the whole band, since Feel swings everyone and the bass follows the kick). */
  private rewrite(part: number) {
    if (this.t.parts[part].role === "drums") updateSong(this.t, this.st, this.song);
    else updateSong(this.t, this.st, this.song, part);
  }

  /** 🎲: another riff or groove from the part's pool. */
  dice(part: number) {
    const n = this.t.parts[part].pool.length;
    if (n < 2) return;
    let next = this.st.pick[part];
    while (next === this.st.pick[part]) next = Math.floor(Math.random() * n);
    this.st.pick[part] = next;
    this.atNextBar(`part${part}`, () => this.rewrite(part));
  }

  toggleMute(part: number) {
    this.st.mute[part] = !this.st.mute[part];
    this.song.tracks[part].mute = this.st.mute[part];
    this.commit();
  }

  /** Reset one part: its template sound and riff, knobs home. */
  resetPart(part: number) {
    this.st.knobs[part] = homeKnobs(this.t.parts[part]);
    this.st.pick[part] = this.home.pick[part];
    this.st.mute[part] = false;
    updateSound(this.t, this.st, this.song, part);
    this.engine.sync(this.song);
    this.atNextBar(`part${part}`, () => this.rewrite(part));
  }

  /** BACK TO GOOD: everything as the template started it (on the next bar), the FX let go. */
  backToGood() {
    this.fx?.releaseAll();
    this.st = clone(this.home);
    for (let i = 0; i < this.t.parts.length; i++) updateSound(this.t, this.st, this.song, i);
    this.engine.sync(this.song);
    this.atNextBar("all", () => updateSong(this.t, this.st, this.song));
  }

  // ------------------------------------------------------------ sections and progressions

  /** A section pad: loop that section from the next bar. */
  playSection(s: Section) {
    const sc = sceneOf(this.song, s);
    if (!sc) return;
    this.held = s;
    if (!this.engine.playing) { this.engine.play({ kind: "scene", sceneId: sc.id }); this.onChange(); return; }
    this.engine.queue({ kind: "scene", sceneId: sc.id }, true);
    this.onChange();
  }

  /** Let the song run on through its form from the section that's playing. */
  followSong() {
    this.held = null;
    const pos = this.engine.position();
    const s = this.section ?? "verse";
    const sc = sceneOf(this.song, s);
    const from = sc ? chainIndexOf(this.song, sc.id) : 0;
    if (!pos) { this.engine.play({ kind: "song", fromIndex: 0 }); this.onChange(); return; }
    this.engine.queue({ kind: "song", fromIndex: Math.min(from + 1, songChain(this.song).length - 1) }, true);
    this.onChange();
  }

  /** Another progression for the section that's playing (from the genre's alternatives). */
  shuffleProgression() {
    const s = this.section ?? "verse";
    const pool = this.t.progressions[s] ?? this.t.progressions.verse ?? [];
    if (pool.length < 2) return;
    const k: Section = this.t.progressions[s] ? s : "verse";
    this.st.prog[k] = ((this.st.prog[k] ?? 0) + 1) % pool.length;
    this.atNextBar("prog", () => updateSong(this.t, this.st, this.song));
  }

  /** Last chorus's key change, as a scene name (for the display). */
  get isLastChorus() {
    const pos = this.engine.position();
    return !!pos && this.song.scenes.find((x) => x.id === pos.sceneId)?.name === LAST_CHORUS;
  }

  stop() { this.engine.stop(); this.onChange(); }

  // ------------------------------------------------------------ online guests

  /**
   * The host's state arrived: sounds change at once, notes and the section on the next bar
   * (the host already waited for its own bar line, so this is at most a bar behind).
   */
  applyRemote(st: JamState, held: Section | null) {
    const before = this.st;
    const notesChanged = JSON.stringify([before.pick, before.prog, before.mute, before.knobs.map((k, i) => k.filter((_, j) => ROLE_MACROS[this.t.parts[i].role][j]?.render))])
      !== JSON.stringify([st.pick, st.prog, st.mute, st.knobs.map((k, i) => k.filter((_, j) => ROLE_MACROS[this.t.parts[i].role][j]?.render))]);
    this.st = clone(st);
    for (let i = 0; i < this.t.parts.length; i++) updateSound(this.t, this.st, this.song, i);
    this.engine.sync(this.song);
    if (notesChanged) this.atNextBar("remote", () => updateSong(this.t, this.st, this.song));
    if (held !== this.held) { if (held) this.playSection(held); else this.followSong(); }
    this.onChange();
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
