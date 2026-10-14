// Run: deno test --sloppy-imports tests/
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { copyKeys, hasKeys, type KV } from "../src/ui/migrate.ts";

class Mem implements KV {
  m = new Map<string, string>();
  constructor(init: Record<string, string> = {}, private lossy = false) { for (const [k, v] of Object.entries(init)) this.m.set(k, v); }
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, this.lossy ? v.slice(1) : v); }
}

Deno.test("rename migration copies the old keys and keeps them", () => {
  const ls = new Mem({ "rollbox.song.v1": "{song}", "rollbox.settings.v1": "{s}", "rollbox.userPresets.v1": "{p}", "rollbox-sandbox.song.v1": "{sandbox}", "other": "x" });
  assertEquals(copyKeys(ls, "rollbox.", "tilt."), 3);
  assertEquals(ls.getItem("tilt.song.v1"), "{song}");
  assertEquals(ls.getItem("tilt.userPresets.v1"), "{p}");
  assertEquals(ls.getItem("rollbox.song.v1"), "{song}", "the old copy stays");
  assertEquals(ls.getItem("tilt-sandbox.song.v1"), null, "sandboxes migrate on their own (different prefix)");
  assertEquals(hasKeys(ls, "rollbox."), true);
  assertEquals(copyKeys(new Mem(), "rollbox.", "tilt."), 0);
});

Deno.test("rename migration refuses a copy that doesn't read back", () => {
  const ls = new Mem({ "rollbox.song.v1": "{song}" }, true);
  assertThrows(() => copyKeys(ls, "rollbox.", "tilt."));
});
