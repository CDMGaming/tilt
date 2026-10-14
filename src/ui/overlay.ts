// Pop-up menus and dialogs, all drivable by gamepad, keyboard and mouse.

import type { Action } from "./actions";
import { h } from "./dom";
import { SpatialNav } from "./nav";

export interface Overlay {
  el: HTMLElement;
  handle(a: Action): boolean;
  onClose?(): void;
  /** Couch mode: the seat that opened it (only their controller drives it). */
  owner?: string | null;
}

export interface MenuItem {
  label: string;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  run?: () => void;
  sub?: () => MenuItem[];
  keepOpen?: boolean; // toggles: leave the menu up
}

/** Steppers inside dialogs: left/right adjust instead of moving focus. */
export type Adjustable = HTMLElement & { navAdjust?: (dir: -1 | 1) => void };

export class OverlayHost {
  private stack: Overlay[] = [];
  constructor(private root: HTMLElement) {}

  /** Couch mode hooks: who is acting, where their quarter is, where their toasts go. */
  owner: () => string | null = () => null;
  area: (owner: string) => DOMRect | null = () => null;
  toastHost: () => HTMLElement | null = () => null;
  onOwnerPointer: (owner: string) => void = () => {};
  /** The backbox display (desktop): shows a message as a scrolling dot-matrix line. False when it isn't on screen. */
  marquee: ((text: string, ms: number) => boolean) | null = null;

  /** The acting seat's top overlay (solo: the top one). Other seats' menus don't block them. */
  get top(): Overlay | undefined {
    const who = this.owner();
    for (let i = this.stack.length - 1; i >= 0; i--) if (who === null || (this.stack[i].owner ?? null) === who) return this.stack[i];
    return undefined;
  }
  get open(): boolean { return !!this.top; }

  /** The acting seat's quarter (couch mode), for placing menus and dialogs inside it. */
  private rect(): DOMRect | null { const who = this.owner(); return who ? this.area(who) : null; }

  push(o: Overlay) {
    o.owner = this.owner();
    const r = this.rect();
    if (r) {
      Object.assign(o.el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, right: "auto", bottom: "auto" });
      const who = o.owner!;
      o.el.addEventListener("pointerdown", () => this.onOwnerPointer(who), true);
    }
    this.stack.push(o);
    this.root.appendChild(o.el);
  }

  pop() {
    const o = this.top;
    if (o) this.remove(o);
  }

  remove(o: Overlay) {
    const i = this.stack.indexOf(o);
    if (i < 0) return;
    this.stack.splice(i, 1);
    o.el.remove();
    o.onClose?.();
  }

  closeAll() { while (this.top) this.pop(); }

  handle(a: Action): boolean {
    const t = this.top;
    if (!t) return false;
    if (t.handle(a)) return true;
    if (a.type === "back") { this.pop(); return true; }
    // Overlays are modal: swallow navigation, let transport through.
    return a.type !== "play" && a.type !== "record";
  }

  // ---------------------------------------------------------------- menus

  /** `items` is a function so toggles can rebuild with fresh check marks. */
  menu(title: string, items: () => MenuItem[], anchor?: { x: number; y: number }) {
    const host = this;
    const build = (get: () => MenuItem[], depth: number, at?: { x: number; y: number }, focus = 0): Overlay => {
      const list = get();
      const box = h("div", { class: "menu", role: "menu" },
        title && depth === 0 ? h("div", { class: "menu-title" }, title) : null,
        list.map((it, i) => h("button", {
          class: "menu-item" + (it.checked ? " checked" : ""),
          "data-nav": `m${i}`,
          disabled: it.disabled,
          onclick: () => activate(it),
        },
        h("span", { class: "menu-check" }, it.checked === undefined ? "" : it.checked ? "●" : "○"),
        h("span", { class: "menu-label" }, it.label),
        h("span", { class: "menu-hint" }, it.sub ? "▸" : it.hint ?? ""))),
      );
      const wrap = h("div", { class: "overlay-layer menu-layer", onmousedown: (e: MouseEvent) => { if (e.target === wrap) host.closeAll(); } }, box);
      const nav = new SpatialNav(() => box);
      const ov: Overlay = {
        el: wrap,
        handle(a) {
          if (a.type === "dir") {
            if (a.dir === "left" && depth > 0) { host.pop(); return true; }
            if (a.dir === "right") { const it = cur(); if (it?.sub) { activate(it); return true; } }
            nav.move(a.dir);
            return true;
          }
          if (a.type === "confirm") { const it = cur(); if (it) activate(it); return true; }
          if (a.type === "menu") { host.closeAll(); return true; }
          return false;
        },
      };
      const cur = () => {
        const f = nav.focused;
        return f ? list[Number(f.dataset.nav!.slice(1))] : undefined;
      };
      const activate = (it: MenuItem) => {
        if (it.disabled) return;
        if (it.sub) {
          const r = nav.focused?.getBoundingClientRect();
          host.push(build(it.sub, depth + 1, r ? { x: r.right - 4, y: r.top } : undefined));
          return;
        }
        if (!it.keepOpen) host.closeAll();
        it.run?.();
        if (it.keepOpen) {
          // Rebuild in place so check marks update; keep the focused row.
          const idx = list.indexOf(it);
          host.pop();
          host.push(build(get, depth, at, idx));
        }
      };
      const area = host.rect();
      requestAnimationFrame(() => {
        place(box, at, area);
        nav.focusId(`m${focus}`);
        nav.paint();
      });
      return ov;
    };
    this.push(build(items, 0, anchor));
  }

  // ---------------------------------------------------------------- dialogs

  /**
   * A modal dialog. `body` builds content; elements with [data-nav] are
   * focusable, Enter/A clicks them, left/right call `navAdjust` if present.
   */
  dialog(title: string, body: (close: () => void, rerender: () => void) => HTMLElement, opts: { wide?: boolean; onClose?: () => void } = {}): Overlay {
    const host = this;
    const box = h("div", { class: "dialog" + (opts.wide ? " wide" : "") });
    const wrap = h("div", { class: "overlay-layer", onmousedown: (e: MouseEvent) => { if (e.target === wrap) host.remove(ov); } }, box);
    const nav = new SpatialNav(() => box);
    const close = () => host.remove(ov);
    const render = () => {
      box.replaceChildren(h("div", { class: "dialog-title" }, title), body(close, render));
      requestAnimationFrame(() => nav.paint());
    };
    const ov: Overlay = {
      el: wrap,
      onClose: opts.onClose,
      handle(a) {
        if (a.type === "dir") {
          const f = nav.focused as Adjustable | null;
          if (f?.navAdjust && (a.dir === "left" || a.dir === "right")) { f.navAdjust(a.dir === "left" ? -1 : 1); return true; }
          nav.move(a.dir);
          return true;
        }
        if (a.type === "confirm") { (nav.focused as HTMLElement | null)?.click(); return true; }
        return false;
      },
    };
    render();
    this.push(ov);
    return ov;
  }

  /** A message: across the backbox display when there is one; floating otherwise, and always for errors. */
  toast(text: string, ms = 2200, opts: { error?: boolean } = {}) {
    const inQuad = this.toastHost();
    if (!opts.error && !inQuad && this.marquee?.(text, ms)) return;
    const t = h("div", { class: "toast" + (inQuad ? " in-quad" : "") }, text);
    (inQuad ?? document.body).appendChild(t);
    setTimeout(() => t.classList.add("out"), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
}

/** Position a menu at `at`, kept inside `area` (a couch quarter) or the window. */
function place(box: HTMLElement, at?: { x: number; y: number }, area?: DOMRect | null) {
  if (area) box.style.maxHeight = `${area.height - 16}px`; // a couch menu stays in its quarter
  const r = box.getBoundingClientRect();
  const a = area ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const x = at ? Math.min(at.x, a.right - r.width - 8) : a.left + (a.width - r.width) / 2;
  const y = at ? Math.min(at.y, a.bottom - r.height - 8) : a.top + (a.height - r.height) / 2;
  box.style.left = `${Math.max(a.left + 8, x)}px`;
  box.style.top = `${Math.max(a.top + 8, y)}px`;
}

/** A focusable stepper row for dialogs: label, value, - / + with left/right. */
export function stepper(id: string, label: string, value: string, adjust: (d: -1 | 1) => void): HTMLElement {
  const el = h("div", { class: "stepper", "data-nav": id },
    h("span", { class: "stepper-label" }, label),
    h("button", { class: "stepper-btn", tabindex: -1, onclick: (e: Event) => { e.stopPropagation(); adjust(-1); } }, "−"),
    h("span", { class: "stepper-value" }, value),
    h("button", { class: "stepper-btn", tabindex: -1, onclick: (e: Event) => { e.stopPropagation(); adjust(1); } }, "+"),
  ) as Adjustable;
  el.navAdjust = adjust;
  return el;
}
