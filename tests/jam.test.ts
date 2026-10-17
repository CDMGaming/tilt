// Run: deno test --sloppy-imports tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { INSTRUMENTS } from "../src/engine/instruments.ts";
import { inScale, SCALES } from "../src/engine/music.ts";
import { songChain } from "../src/engine/model.ts";
import { PACKS } from "../src/jam/packs/index.ts";
import { DRUM_VOICES, SECTIONS } from "../src/jam/pack.ts";
import { buildSong, homeState, updateSong } from "../src/jam/build.ts";
import { ROLE_MACROS } from "../src/jam/macros.ts";

const RIFF_CHARS = /^[1-9<\-.xXmcs]*$/;
const DRUM_CHARS = /^[Xxo.]*$/;

Deno.test("every pack's data is well-formed", () => {
  for (const pack of PACKS) for (const t of pack.templates) {
    const where = `${pack.id}/${t.id}`;
    assert(t.tempo[0] <= t.tempo[1], `${where}: tempo range`);
    for (const sc of t.scales) assert(SCALES.some((x) => x.id === sc), `${where}: scale ${sc}`);
    for (const [s, pool] of Object.entries(t.progressions)) {
      assert(SECTIONS.includes(s as never), `${where}: section ${s}`);
      for (const prog of pool!) {
        assert(prog.length >= 1 && prog.length <= 8, `${where}: ${s} progression length`);
        for (const d of prog) assert(d >= 1 && d <= 7, `${where}: degree ${d}`);
      }
    }
    for (const f of t.form) assert(SECTIONS.includes(f.s), `${where}: form ${f.s}`);
    for (const p of t.parts) {
      const def = INSTRUMENTS[p.kind];
      assert(def, `${where}: kind ${p.kind}`);
      assert(def.presets.some((x) => x.name === p.preset), `${where}: ${p.name} preset "${p.preset}" not found in ${def.name}`);
      for (const id of Object.keys(p.home ?? {})) assert(ROLE_MACROS[p.role].some((m) => m.id === id), `${where}: ${p.name} home for unknown macro ${id}`);
      assert(p.pool.length >= 2, `${where}: ${p.name} needs at least two pool entries for the dice`);
      for (const e of p.pool) for (const [s, v] of Object.entries(e.by)) {
        if (p.role === "drums") {
          for (const [voice, row] of Object.entries(v as Record<string, string>)) {
            assert(DRUM_VOICES.includes(voice as never), `${where}: ${e.name}/${s} voice ${voice}`);
            assert(row.length === 16 || row.length === 32, `${where}: ${e.name}/${s}/${voice} is ${row.length} steps`);
            assert(DRUM_CHARS.test(row), `${where}: ${e.name}/${s}/${voice} has odd characters`);
          }
        } else {
          const r = v as string;
          assert(r.length === 16 || r.length === 32, `${where}: ${p.name} ${e.name}/${s} is ${r.length} steps: "${r}"`);
          assert(RIFF_CHARS.test(r), `${where}: ${p.name} ${e.name}/${s} has odd characters: "${r}"`);
        }
      }
    }
  }
});

Deno.test("every note a template writes is in key, for every pool choice and knob extreme", () => {
  for (const pack of PACKS) for (const t of pack.templates) for (const scale of t.scales) {
    const st = homeState(t, t.keys[0], scale, t.tempo[0]);
    const song = buildSong(t, st);
    assertEquals(songChain(song).length, t.form.length);
    for (let pick = 0; pick < 3; pick++) for (const u of [0, 0.5, 1]) {
      st.pick = t.parts.map((p) => pick % p.pool.length);
      st.knobs = t.parts.map((p) => ROLE_MACROS[p.role].map(() => u));
      updateSong(t, st, song);
      song.tracks.forEach((tr, i) => {
        if (t.parts[i].role === "drums") return;
        for (const c of Object.values(tr.clips)) for (const n of c.notes) {
          assert(inScale(n.pitch, st.key, scale), `${t.id} ${tr.name} ${n.pitch} out of ${scale}`);
          assert(n.pitch >= 20 && n.pitch <= 108, `${t.id} ${tr.name} pitch ${n.pitch}`);
          assert(n.len > 0 && n.vel >= 1 && n.vel <= 127, `${t.id} ${tr.name} note`);
        }
      });
    }
  }
});
