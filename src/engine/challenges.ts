// Challenge cards: optional extra constraints dealt at START. Each one checks
// itself against the song, so the app can show progress live.

import { INSTRUMENTS } from "./instruments";
import { sceneTicks, songChain, type Song, type Track } from "./model";
import { Rng } from "./rng";
import { secPerTick } from "./timeline";

export interface Challenge { id: string; text: string; check(song: Song): boolean }

const hasNotes = (t: Track, sceneId: number) => {
  const c = t.clips[sceneId];
  return !!c && !c.muted && c.notes.length > 0;
};
const group = (t: Track) => INSTRUMENTS[t.kind].group;
const songSeconds = (song: Song) =>
  songChain(song).reduce((a, x) => { const s = song.scenes.find((y) => y.id === x.sceneId)!; return a + sceneTicks(song, s.id) * x.repeat * secPerTick(s.tempo ?? song.tempo); }, 0);
const isNamed = (name: string, ...words: string[]) => words.some((w) => name.toLowerCase().includes(w));

export const CHALLENGES: Challenge[] = [
  { id: "max3", text: "Only 3 tracks", check: (s) => s.tracks.length > 0 && s.tracks.length <= 3 },
  { id: "nodrums1", text: "No drums in the first scene", check: (s) => s.scenes.length > 1 && !s.tracks.some((t) => group(t) === "drums" && hasNotes(t, s.scenes[0].id)) },
  { id: "keychorus", text: "Change key in the chorus (name a scene Chorus, give it a key change)", check: (s) => s.scenes.some((x) => isNamed(x.name, "chorus") && (x.transpose ?? 0) !== 0) },
  { id: "4scenes", text: "At least 4 scenes", check: (s) => s.scenes.length >= 4 },
  { id: "allplay", text: "Every track plays somewhere", check: (s) => s.tracks.length > 0 && s.tracks.every((t) => s.scenes.some((x) => hasNotes(t, x.id))) },
  { id: "notelimit", text: "No clip with more than 12 notes", check: (s) => s.tracks.some((t) => Object.values(t.clips).some((c) => c.notes.length)) && s.tracks.every((t) => Object.values(t.clips).every((c) => c.notes.length <= 12)) },
  { id: "onenote", text: "One-note bass: the bass only ever plays one pitch", check: (s) => {
    const bass = s.tracks.filter((t) => group(t) === "bass");
    const pitches = new Set(bass.flatMap((t) => Object.values(t.clips).flatMap((c) => c.notes.map((n) => n.pitch % 12))));
    return bass.length > 0 && pitches.size === 1;
  } },
  { id: "tempo", text: "A tempo change in one scene", check: (s) => s.scenes.some((x) => x.tempo !== null && x.tempo !== s.tempo) },
  { id: "fadeout", text: "End on a fade out", check: (s) => s.scenes.length > 1 && s.scenes[s.scenes.length - 1].fadeOut },
  { id: "short", text: "The whole song is under 2 minutes", check: (s) => s.scenes.length > 1 && songSeconds(s) < 120 },
  { id: "long", text: "The whole song is over 2 minutes", check: (s) => songSeconds(s) > 120 },
  { id: "automate", text: "Automate something (a fade, a filter sweep…)", check: (s) => s.tracks.some((t) => Object.values(t.clips).some((c) => Object.values(c.auto ?? {}).some((l) => l.length > 1))) },
  { id: "soloIntro", text: "The intro is a single instrument", check: (s) => s.scenes.length > 1 && s.tracks.filter((t) => hasNotes(t, s.scenes[0].id)).length === 1 },
  { id: "breakdown", text: "A breakdown scene with no drums (not the first one)", check: (s) => s.scenes.slice(1).some((x) => s.tracks.some((t) => hasNotes(t, x.id)) && !s.tracks.some((t) => group(t) === "drums" && hasNotes(t, x.id))) },
  { id: "longclip", text: "Write one 8-bar clip", check: (s) => s.tracks.some((t) => Object.values(t.clips).some((c) => c.bars === 8 && c.notes.length > 0)) },
  { id: "oneBarOnly", text: "Every clip is 1 bar", check: (s) => s.tracks.some((t) => Object.values(t.clips).some((c) => c.notes.length)) && s.tracks.every((t) => Object.values(t.clips).every((c) => c.bars === 1)) },
  { id: "repeat4", text: "Repeat a scene 4 times or more", check: (s) => songChain(s).some((x) => x.repeat >= 4) },
  { id: "fx", text: "Use 3 different insert effects", check: (s) => new Set(s.tracks.flatMap((t) => t.fx.map((f) => f.type)).filter((f) => f !== "off")).size >= 3 },
];

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id);

// Pairs that contradict each other never get dealt together.
const CLASH: [string, string][] = [["short", "long"], ["longclip", "oneBarOnly"], ["notelimit", "longclip"]];

export function dealChallenges(count: number, seed: number): string[] {
  const r = new Rng(seed ^ 0x5eed);
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const c = r.pick(CHALLENGES).id;
    if (out.includes(c) || CLASH.some(([a, b]) => (a === c && out.includes(b)) || (b === c && out.includes(a)))) continue;
    out.push(c);
  }
  return out;
}

export function challengeStatus(song: Song): { id: string; text: string; met: boolean }[] {
  return (song.challenges ?? []).map((id) => {
    const c = challengeById(id);
    return { id, text: c?.text ?? id, met: c ? c.check(song) : false };
  });
}

