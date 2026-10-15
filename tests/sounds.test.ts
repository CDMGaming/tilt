// Sounds by role: tags, recipes, generated presets, Mutate, role-first dice, freshness,
// and the share code (format 1 unchanged, format 2 for generated sounds and big indexes).

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { INSTRUMENTS, paramDef, presetParams } from "../src/engine/instruments.ts";
import {
  DICE_KINDS, RECIPES, ROLES, GEN_MARK, generatePreset, genBase, mutateParams, pickSound, presetRoles, soundKey, soundRoles, soundsWithRole,
} from "../src/engine/sounds.ts";
import { NO_HOLDS, decodeSetup, defaultSpec, encodeSetup, nudgeSetup, setupFromSong, songFromSetup, type Setup } from "../src/engine/dice.ts";
import { Rng } from "../src/engine/rng.ts";
import { PolyDSP, AcidDSP, type InstrumentDSP } from "../src/engine/dsp/instruments-dsp.ts";
import { LeadDSP, AnalogDrumsDSP, WobbleDSP, PadDSP } from "../src/engine/dsp/instruments2-dsp.ts";
import { ChipDSP, FmDSP } from "../src/engine/dsp/instruments3-dsp.ts";
import type { InstrumentKind } from "../src/engine/model.ts";

Deno.test("every dice preset has role tags, every role has sounds, every recipe names real knobs", () => {
  for (const kind of DICE_KINDS) {
    INSTRUMENTS[kind].presets.forEach((p, i) => {
      const roles = presetRoles(kind, i);
      assert(roles.length && roles.every((r) => ROLES.includes(r)), `${kind} ${p.name}`);
    });
    for (const m of RECIPES[kind] ?? []) assert(paramDef(kind, m.id), `${kind} recipe: ${m.id}`);
    assert(RECIPES[kind], `${kind} has a recipe`);
  }
  for (const r of ROLES) assert(soundsWithRole(r).length >= 2, `${r}: ${soundsWithRole(r).length} sounds`);
});

Deno.test("generated presets: the same seed gives the same sound, in range, with a name and its parent's role", () => {
  for (const kind of DICE_KINDS) {
    for (let seed = 0; seed < 60; seed++) {
      const g = generatePreset(kind, seed);
      assertEquals(generatePreset(kind, seed), g);
      assert(g.name.startsWith(GEN_MARK) && g.name.length > 4, g.name);
      assertEquals(g.base, genBase(kind, seed));
      assertEquals(g.roles, presetRoles(kind, g.base));
      const parent = { ...INSTRUMENTS[kind].presets[g.base].params };
      for (const [id, v] of Object.entries(g.params)) {
        const p = paramDef(kind, id);
        if (!p || v === parent[id]) continue; // as the parent had it (Bell Sevenths sits past its Semi knob on purpose)
        assert(Number.isFinite(v) && v >= p.min - 1e-9 && v <= p.max + 1e-9, `${kind} ${seed} ${id}=${v}`);
        if (p.options) assertEquals(v, Math.round(v), `${kind} ${id} is a switch`);
      }
      if ("level" in parent) assertEquals(g.params.level, parent.level, "level is the parent's");
    }
    assertNotEquals(generatePreset(kind, 1).params, generatePreset(kind, 2).params);
  }
});

Deno.test("Mutate: a few knobs move a little, the same seed moves them the same way", () => {
  for (const kind of DICE_KINDS) {
    const base = { ...generatePreset(kind, 5).params };
    const m = mutateParams(kind, base, 99);
    assertEquals(mutateParams(kind, base, 99), m);
    const moved = Object.keys(m).filter((k) => m[k] !== base[k]);
    assert(moved.length <= 5, `${kind}: ${moved.length} moved`);
    assertEquals(m.level, base.level);
  }
});

// ---- audio: generated sounds stay within reach of their parent's loudness, and never blow up

const SR = 48000, clock = { bpm: 120, zero: 0 };
function dspFor(kind: InstrumentKind, params: Record<string, number>): InstrumentDSP | null {
  switch (kind) {
    case "acid": return new AcidDSP(params, SR, clock);
    case "lead": return new LeadDSP(params, SR);
    case "analog": return new AnalogDrumsDSP(params, SR);
    case "wobble": return new WobbleDSP(params, SR, clock);
    case "pad": return new PadDSP(params, SR);
    case "chip": return new ChipDSP(params, SR);
    case "fm": return new FmDSP(params, SR);
    case "poly": return new PolyDSP(params, SR);
    default: return null; // Kitbox needs its samples, Morph its tables (both covered by the range checks)
  }
}
function loudness(kind: InstrumentKind, params: Record<string, number>) {
  let r = 7;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const d = dspFor(kind, params)!;
  const n = SR, L = new Float32Array(n), R = new Float32Array(n);
  const notes = kind === "analog" ? [36, 37, 38, 39] : [kind === "acid" || kind === "wobble" ? 36 : 60];
  notes.forEach((p, i) => d.noteOn(p, 100, i * 0.2));
  for (let i0 = 0; i0 < n; i0 += 128) {
    if (i0 / SR > 0.6) notes.forEach((p) => d.noteOff(p, i0 / SR));
    d.render(L, R, i0, Math.min(n, i0 + 128), i0 / SR);
  }
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); peak = Math.max(peak, v); sum += L[i] * L[i] + R[i] * R[i]; }
  return { peak, rms: Math.sqrt(sum / (2 * n)) };
}

Deno.test("generated sounds: within 12 dB of their parent, no blow-ups", () => {
  for (const kind of ["acid", "lead", "analog", "wobble", "pad", "chip", "fm", "poly"] as InstrumentKind[]) {
    for (let seed = 0; seed < 12; seed++) {
      const g = generatePreset(kind, seed * 977);
      const a = loudness(kind, g.params), b = loudness(kind, presetParams(kind, g.base));
      assert(Number.isFinite(a.rms) && a.peak < 3, `${kind} ${g.name}: peak ${a.peak}`);
      const db = 20 * Math.log10((a.rms + 1e-6) / (b.rms + 1e-6));
      assert(Math.abs(db) < 12, `${kind} ${g.name}: ${db.toFixed(1)} dB from its parent`);
    }
  }
});

// ---- the dice

Deno.test("role-first dice: slot 1 is usually drums, slot 2 usually bass, fx rare, no instrument twice", () => {
  let drums = 0, bass = 0, fx = 0, gen = 0, slots = 0;
  const N = 600;
  for (let seed = 1; seed <= N; seed++) {
    const s = nudgeSetup(null, NO_HOLDS, defaultSpec(), seed);
    if (soundRoles(s.lineup[0]).includes("drums")) drums++;
    if (soundRoles(s.lineup[1]).includes("bass")) bass++;
    for (const l of s.lineup) { slots++; if (soundRoles(l)[0] === "fx") fx++; if (l.gen !== undefined) gen++; }
    const kinds = s.lineup.map((l) => l.kind);
    assertEquals(new Set(kinds).size, kinds.length, `seed ${seed}: ${kinds}`);
  }
  assert(drums / N > 0.7 && drums / N < 0.9, `slot 1 drums ${drums / N}`);
  assert(bass / N > 0.65 && bass / N < 0.9, `slot 2 bass ${bass / N}`);
  assert(fx / slots < 0.1, `fx ${fx / slots}`);
  assert(gen / slots > 0.3 && gen / slots < 0.5, `generated ${gen / slots}`);
  // The setting: no generated sounds, or all of them.
  assert(nudgeSetup(null, NO_HOLDS, defaultSpec(), 3, 0, { genShare: 0 }).lineup.every((l) => l.gen === undefined));
  assert(nudgeSetup(null, NO_HOLDS, defaultSpec(), 3, 0, { genShare: 1 }).lineup.every((l) => l.gen !== undefined));
});

Deno.test("a slot can ask for a role: any instrument with that role", () => {
  const spec = defaultSpec();
  spec.count = 3; spec.roles![2] = "pad";
  for (let seed = 1; seed < 100; seed++) assert(soundRoles(nudgeSetup(null, NO_HOLDS, spec, seed).lineup[2]).includes("pad"));
});

Deno.test("freshness: sounds from recent rolls are avoided while others are left", () => {
  const bass = soundsWithRole("bass");
  const recent = new Set(bass.slice(1).map(soundKey));
  for (let seed = 0; seed < 100; seed++) {
    const s = pickSound("bass", new Rng(seed), { recent, genShare: 0 }, [bass[0].kind])!;
    const inKind = bass.filter((b) => b.kind === bass[0].kind);
    if (inKind.some((b) => !recent.has(soundKey(b)))) assert(!recent.has(soundKey(s)), soundKey(s));
  }
});

Deno.test("share code: format 1 unchanged for old setups, format 2 for generated sounds and big indexes", () => {
  const old: Setup = { key: 2, scale: "minor", tempo: 124, swing: 15, lineup: [{ kind: "drums", preset: 3 }, { kind: "acid", preset: 1 }, { kind: "poly", preset: 9 }] };
  const code = encodeSetup(old);
  assertEquals(code, "0495-83R3-0C8J-J", "format 1 codes are what they always were");
  assertEquals(decodeSetup(code), old);
  const gen: Setup = { ...old, lineup: [{ kind: "drums", preset: 3 }, { kind: "fm", preset: genBase("fm", 40000), gen: 40000 }, { kind: "acid", preset: 7 }] };
  assertEquals(decodeSetup(encodeSetup(gen)), gen);
  assert(encodeSetup(gen).length > code.length, "format 2: two or three bytes a slot");
  for (let seed = 1; seed < 60; seed++) {
    const s = nudgeSetup(null, NO_HOLDS, defaultSpec(), seed, seed % 3);
    assertEquals(decodeSetup(encodeSetup(s)), s, `seed ${seed}`);
  }
});

Deno.test("a generated sound goes into the song with its name and comes back from the song's code", () => {
  const s: Setup = { key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "wobble", preset: genBase("wobble", 321), gen: 321 }, { kind: "pad", preset: 2 }] };
  const song = songFromSetup(s);
  assertEquals(song.tracks[0].preset, generatePreset("wobble", 321).name);
  assertEquals(song.tracks[0].params, generatePreset("wobble", 321).params);
  assertEquals(song.tracks[0].gen, 321);
  assertEquals(setupFromSong(song), s);
  assertEquals(song.setupCode, encodeSetup(s));
});

Deno.test("freshness over many rolls: remembering the last 10 rolls cuts repeats", () => {
  const repeats = (remember: boolean) => {
    const rolls: string[][] = [];
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const recent = new Set(rolls.slice(0, 10).flat());
      const s = nudgeSetup(null, NO_HOLDS, defaultSpec(), seed, 0, { genShare: 0, recent: remember ? recent : new Set() });
      const keys = s.lineup.map(soundKey);
      n += keys.filter((k) => recent.has(k)).length;
      rolls.unshift(keys);
    }
    return n;
  };
  const without = repeats(false), with_ = repeats(true);
  assert(with_ < without * 0.6, `repeats within 10 rolls: ${with_} remembering, ${without} not`);
});
