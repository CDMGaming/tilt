// Pop-up menus and dialogs, all drivable by gamepad, keyboard and mouse.

import type { Action } from "./actions";
import { h } from "./dom";
import { SpatialNav } from "./nav";

export interface Overlay {
  el: HTMLElement;
  handle(a: Action): boolean;
  onClose?(): void;
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

  get top(): Overlay | undefined { return this.stack[this.stack.length - 1]; }
  get open(): boolean { return this.stack.length > 0; }

  push(o: Overlay) {
    this.stack.push(o);
    this.root.appendChild(o.el);
  }

  pop() {
    const o = this.stack.pop();
    o?.el.remove();
    o?.onClose?.();
  }

  remove(o: Overlay) {
    const i = this.stack.indexOf(o);
    if (i < 0) return;
    this.stack.splice(i, 1);
    o.el.remove();
    o.onClose?.();
  }

  closeAll() { while (this.stack.length) this.pop(); }

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
      requestAnimationFrame(() => {
        place(box, at);
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

  toast(text: string, ms = 2200) {
    const t = h("div", { class: "toast" }, text);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("out"), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
}

function place(box: HTMLElement, at?: { x: number; y: number }) {
  const r = box.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const x = at ? Math.min(at.x, vw - r.width - 8) : (vw - r.width) / 2;
  const y = at ? Math.min(at.y, vh - r.height - 8) : (vh - r.height) / 2;
  box.style.left = `${Math.max(8, x)}px`;
  box.style.top = `${Math.max(8, y)}px`;
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
