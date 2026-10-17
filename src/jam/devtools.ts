// Development only (never imported by the app): measure a template's balance in the browser
// console. `(await import("/src/jam/devtools.ts")).levels("arena")` renders one section offline,
// each part alone and the mix, through the real master bus, and reports loudness and peaks.

import { JamSession } from "./session";
import { PACKS } from "./packs";

const rms = (b: AudioBuffer): [number, number] => {
  let sum = 0, pk = 0;
  const d = b.getChannelData(0), e = b.getChannelData(1);
  for (let i = 0; i < d.length; i++) { const v = (d[i] + e[i]) / 2; sum += v * v; pk = Math.max(pk, Math.abs(d[i]), Math.abs(e[i])); }
  return [20 * Math.log10(Math.sqrt(sum / d.length) + 1e-9), pk];
};

export async function levels(id: string, section = "Chorus"): Promise<string> {
  const tpl = PACKS.flatMap((p) => p.templates).find((t) => t.id === id);
  if (!tpl) return `no template ${id}`;
  const s = new JamSession(tpl, { key: tpl.keys[0], tempo: tpl.tempo[0] });
  await s.engine.init(s.song);
  const song = JSON.parse(JSON.stringify(s.song));
  const sc = song.scenes.find((x: { name: string }) => x.name === section);
  song.chain = [{ sceneId: sc.id, repeat: 2 }];
  song.songLoop = false;
  const out: string[] = [];
  for (const t of song.tracks) {
    if (!Object.values(t.clips as Record<string, { notes: unknown[] }>).some((c) => c.notes.length)) continue;
    const [r, p] = rms(await s.engine.render(song, { tail: 0.5, onlyTrack: t.id }));
    out.push(`${t.name}: ${r.toFixed(1)} (pk ${p.toFixed(2)})`);
  }
  const [r, p] = rms(await s.engine.render(song, { tail: 0.5 }));
  out.push(`MIX ${r.toFixed(1)} pk ${p.toFixed(2)}`);
  void s.engine.ctx.close();
  return `${tpl.name} / ${section}: ${out.join(" | ")}`;
}
