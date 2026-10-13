// Auto-arranger: from a one-scene song, build intro / build / drop / break /
// drop / outro by copying the scene and muting clips per section.

import { TICKS_PER_BAR, newId, sceneTicks, type Scene, type Song, type Track } from "./model";

type Role = "drums" | "bass" | "harmony";
const roleOf = (t: Track): Role => (t.kind === "drums" ? "drums" : t.kind === "acid" ? "bass" : "harmony");

interface Section { name: string; bars: number; play: Role[]; fadeIn?: boolean; fadeOut?: boolean; thin?: boolean }

const PLAN: Section[] = [
  { name: "Intro", bars: 8, play: ["harmony"], fadeIn: true },
  { name: "Build", bars: 8, play: ["harmony", "drums"], thin: true },
  { name: "Drop", bars: 16, play: ["drums", "bass", "harmony"] },
  { name: "Break", bars: 8, play: ["harmony", "bass"] },
  { name: "Drop 2", bars: 16, play: ["drums", "bass", "harmony"] },
  { name: "Outro", bars: 8, play: ["drums", "harmony"], fadeOut: true },
];

export function canArrange(song: Song): boolean {
  return song.scenes.length === 1 && song.tracks.some((t) => t.clips[song.scenes[0].id]?.notes.length);
}

export function autoArrange(song: Song) {
  if (!canArrange(song)) return;
  const src = song.scenes[0];
  const srcBars = sceneTicks(song, src.id) / TICKS_PER_BAR;
  const roles = new Set(song.tracks.map(roleOf));
  const scenes: Scene[] = [];
  for (const sec of PLAN) {
    // If the song lacks a role (say, no harmony), fall back so no section is silent.
    let play = sec.play.filter((r) => roles.has(r));
    if (!play.length) play = [...roles];
    const scene: Scene = {
      id: newId(song), name: sec.name, repeat: Math.max(1, Math.round(sec.bars / srcBars)),
      tempo: src.tempo, fadeIn: !!sec.fadeIn, fadeOut: !!sec.fadeOut,
    };
    scenes.push(scene);
    let harmonySeen = 0;
    for (const t of song.tracks) {
      const c = t.clips[src.id];
      if (!c) continue;
      const role = roleOf(t);
      // "thin" sections keep only the first track of each role.
      const extra = role === "harmony" && harmonySeen++ > 0;
      t.clips[scene.id] = { ...JSON.parse(JSON.stringify(c)), muted: !play.includes(role) || (!!sec.thin && extra) };
    }
  }
  for (const t of song.tracks) delete t.clips[src.id];
  song.scenes = scenes;
}
