// Spatial navigation over elements marked [data-nav], so the gamepad's
// D-pad (and arrow keys) can drive any DOM panel or dialog.

import type { Dir } from "./actions";

export class SpatialNav {
  private current: HTMLElement | null = null;
  constructor(private root: () => HTMLElement | null, private key = "") {}

  items(): HTMLElement[] {
    const r = this.root();
    return r ? [...r.querySelectorAll<HTMLElement>("[data-nav]")].filter((e) => e.offsetParent !== null && !e.hasAttribute("disabled")) : [];
  }

  get focused(): HTMLElement | null {
    const items = this.items();
    if (this.current && items.includes(this.current)) return this.current;
    // Re-find by id after a re-render.
    const id = this.current?.dataset.nav;
    const again = id ? items.find((e) => e.dataset.nav === id) : undefined;
    this.current = again ?? items[0] ?? null;
    return this.current;
  }

  set(el: HTMLElement | null) { this.current = el; this.paint(); }

  focusId(id: string) {
    const el = this.items().find((e) => e.dataset.nav === id);
    if (el) this.set(el);
  }

  paint() {
    const f = this.focused;
    for (const e of this.items()) e.classList.toggle("navfocus", e === f);
    f?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  clearPaint() {
    for (const e of this.items()) e.classList.remove("navfocus");
  }

  move(dir: Dir): boolean {
    const cur = this.focused;
    if (!cur) return false;
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    // Candidates in the pressed direction, with the edge gap to them and
    // their sideways offset. Then: nearest row/column first, closest within it.
    const cands: { el: HTMLElement; gap: number; across: number }[] = [];
    for (const el of this.items()) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      let gap: number, across: number;
      if (dir === "left") { if (bx >= ax - 4) continue; gap = a.left - b.right; across = Math.abs(by - ay); }
      else if (dir === "right") { if (bx <= ax + 4) continue; gap = b.left - a.right; across = Math.abs(by - ay); }
      else if (dir === "up") { if (by >= ay - 4) continue; gap = a.top - b.bottom; across = Math.abs(bx - ax); }
      else { if (by <= ay + 4) continue; gap = b.top - a.bottom; across = Math.abs(bx - ax); }
      cands.push({ el, gap: Math.max(-8, gap), across });
    }
    if (!cands.length) return false;
    // Left/right prefer the same row: drop candidates that don't overlap vertically if any do.
    let pool = cands;
    if (dir === "left" || dir === "right") {
      const same = cands.filter((c) => { const b = c.el.getBoundingClientRect(); return b.bottom > a.top + 4 && b.top < a.bottom - 4; });
      if (same.length) pool = same;
    }
    const minGap = Math.min(...pool.map((c) => c.gap));
    const band = pool.filter((c) => c.gap <= minGap + 24);
    band.sort((x, y) => x.across - y.across || x.gap - y.gap);
    const best = band[0].el;
    this.set(best);
    return true;
  }
}
