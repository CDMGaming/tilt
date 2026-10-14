// Rollbox -> TILT: everything saved under the old name (localStorage keys
// "rollbox.*", IndexedDB "rollbox.library" and "rollbox.samples") is copied
// to the new name on first launch. The copy is checked before it's marked
// done, and the old data is never deleted. If anything fails, this launch
// keeps using the old data and the next launch tries again.

/** The two databases and their single object store each. */
export const DATABASES = [{ name: "library", store: "songs" }, { name: "samples", store: "samples" }];
const MARK = "migratedFromRollbox";

export interface KV { readonly length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Copy every `from*` key to `to*`; returns how many. Throws if a copy doesn't read back the same. */
export function copyKeys(ls: KV, from: string, to: string): number {
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k?.startsWith(from)) keys.push(k); }
  for (const k of keys) {
    const v = ls.getItem(k)!, nk = to + k.slice(from.length);
    ls.setItem(nk, v);
    if (ls.getItem(nk) !== v) throw new Error(`copy of ${k} didn't read back`);
  }
  return keys.length;
}

export function hasKeys(ls: KV, prefix: string): boolean {
  for (let i = 0; i < ls.length; i++) if (ls.key(i)?.startsWith(prefix)) return true;
  return false;
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Open an existing database, or null if there's none (without creating one). */
function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    let fresh = false;
    r.onupgradeneeded = () => { fresh = true; r.transaction?.abort(); }; // it didn't exist: don't leave an empty one behind
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => (fresh ? resolve(null) : reject(r.error));
  });
}

function openOrCreate(name: string, store: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store, { keyPath: "id" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Copy every record of one database; returns how many. Verifies every id arrived. */
async function copyDatabase(from: string, to: string, store: string): Promise<number> {
  const src = await openExisting(from);
  if (!src) return 0;
  try {
    if (!src.objectStoreNames.contains(store)) return 0;
    const all = await req(src.transaction(store, "readonly").objectStore(store).getAll()) as { id: string }[];
    if (!all.length) return 0;
    const dst = await openOrCreate(to, store);
    try {
      await new Promise<void>((res, rej) => {
        const tx = dst.transaction(store, "readwrite");
        for (const rec of all) tx.objectStore(store).put(rec);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error ?? new Error("aborted"));
      });
      const keys = new Set((await req(dst.transaction(store, "readonly").objectStore(store).getAllKeys())).map(String));
      const missing = all.filter((r) => !keys.has(String(r.id)));
      if (missing.length) throw new Error(`${missing.length} of ${all.length} records missing in ${to}`);
    } finally { dst.close(); }
    return all.length;
  } finally { src.close(); }
}

/**
 * Called once at startup, before anything reads storage. Returns the prefix
 * this launch should use: the new one, or the old one if migrating failed.
 */
export async function prepareStorage(newPrefix: string, oldPrefix: string): Promise<string> {
  let ls: Storage;
  try { ls = localStorage; ls.getItem(newPrefix + MARK); } catch { return newPrefix; } // storage blocked: nothing to move
  if (ls.getItem(newPrefix + MARK)) return newPrefix;
  try {
    const keys = copyKeys(ls, oldPrefix, newPrefix);
    let records = 0;
    for (const d of DATABASES) records += await copyDatabase(oldPrefix + d.name, newPrefix + d.name, d.store);
    ls.setItem(newPrefix + MARK, JSON.stringify({ at: new Date().toISOString(), keys, records }));
    if (keys || records) console.info(`[tilt] moved your saved data from the old name: ${keys} settings/song keys, ${records} library songs and samples (the old copy is kept)`);
    return newPrefix;
  } catch (e) {
    console.warn("[tilt] couldn't move saved data from the old name; using it where it is for now", e);
    return oldPrefix;
  }
}
