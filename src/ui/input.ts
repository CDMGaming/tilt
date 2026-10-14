// Computer keyboard and gamepad -> actions (and musical notes).

import { mods, type Action, type Dir } from "./actions";

export interface InputSink {
  action(a: Action): void;
  /** Musical keyboard: `key` is a semitone offset (chromatic) or a scale-degree index, see MusicKey. */
  musicKey(k: MusicKey, on: boolean): void;
}

export type MusicKey = { row: "low" | "high"; index: number; chromatic: number };

// Two rows of the keyboard play notes. Chromatic layout: home row = white
// keys, row above = black keys (the usual "musical typing" layout).
// With scale lock, the home row is scale degrees and the row above is the
// next octave of degrees (so every key is in key).
const CHROMATIC: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12,
  KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};
const HOME_ROW = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"];
const TOP_ROW = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft"];

export function bindKeyboard(sink: InputSink, isTyping: () => boolean) {
  const held = new Set<string>();
  window.addEventListener("keydown", (e) => {
    if (isTyping()) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const a = keyAction(e, ctrl);
    if (a) {
      e.preventDefault();
      sink.action(a);
      return;
    }
    if (ctrl || e.altKey) return;
    if (e.repeat) { if (musicCode(e.code)) e.preventDefault(); return; }
    const mk = musicCode(e.code);
    if (mk) {
      e.preventDefault();
      held.add(e.code);
      sink.musicKey(mk, true);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Enter" || e.code === "NumpadEnter") { mods.confirmHeld = false; sink.action({ type: "confirmUp" }); }
    if (e.key === "Shift") { mods.select = false; sink.action({ type: "selectHold", down: false }); }
    if (e.key === "Alt") mods.fine = false;
    if (e.code === "Backquote") sink.action({ type: "shortcut", down: false });
    if (held.delete(e.code)) sink.musicKey(musicCode(e.code)!, false);
  });
  window.addEventListener("blur", () => {
    for (const c of held) sink.musicKey(musicCode(c)!, false);
    held.clear();
    mods.fine = mods.select = mods.confirmHeld = false;
  });
}

function musicCode(code: string): MusicKey | null {
  const hi = HOME_ROW.indexOf(code);
  const ti = TOP_ROW.indexOf(code);
  const chromatic = CHROMATIC[code];
  if (hi >= 0) return { row: "low", index: hi, chromatic: chromatic ?? -1 };
  if (ti >= 0) return { row: "high", index: ti, chromatic: chromatic ?? -1 };
  return null;
}

function keyAction(e: KeyboardEvent, ctrl: boolean): Action | null {
  const dirs: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  if (e.key === "Shift" && !e.repeat) { mods.select = true; return { type: "selectHold", down: true }; }
  if (e.key === "Alt") { mods.fine = true; e.preventDefault(); return null; }
  if (dirs[e.key]) return { type: "dir", dir: dirs[e.key], repeat: e.repeat };
  if (ctrl) {
    switch (e.code) {
      case "KeyZ": return e.shiftKey ? { type: "redo" } : { type: "undo" };
      case "KeyY": return { type: "redo" };
      case "KeyC": return { type: "copy" };
      case "KeyX": return { type: "cut" };
      case "KeyV": return { type: "paste" };
      case "KeyD": return { type: "duplicate" };
      case "KeyA": return { type: "selectAll" };
    }
    return null;
  }
  if (e.key === "?") return { type: "help" };
  switch (e.code) {
    case "Enter": case "NumpadEnter":
      if (e.repeat) { e.preventDefault(); return null; }
      mods.confirmHeld = true;
      return { type: "confirm" };
    case "Escape": case "Backspace": return { type: "back" };
    case "Delete": return { type: "delete" };
    case "Space": return e.shiftKey ? { type: "record" } : { type: "play" };
    case "Tab": return { type: "focusSwap" };
    case "Backslash": return { type: "layout" };
    case "KeyM": case "ContextMenu": return { type: "menu" };
    case "F1": return { type: "system" };
    case "KeyC": return { type: "playMode" };
    case "Backquote": return e.repeat ? null : { type: "shortcut", down: true };
    case "Comma": return { type: "knob", dx: -1, dy: 0 };
    case "Period": return { type: "knob", dx: 1, dy: 0 };
    case "Minus": return { type: "knob", dx: 0, dy: -1 };
    case "Equal": return { type: "knob", dx: 0, dy: 1 };
    case "KeyZ": return { type: "octave", d: -1 };
    case "KeyX": return { type: "octave", d: 1 };
    case "F2": return { type: "screen", to: "song" };
    case "F3": return { type: "screen", to: "edit" };
    case "F4": return { type: "screen", to: "mix" };
  }
  return null;
}

// ------------------------------------------------------------------ gamepad

// Standard-mapping button indices (by position, Xbox names).
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const REPEAT_DELAY = 280;
const REPEAT_RATE = 70;
const Y_HOLD_MS = 450;

export class GamepadInput {
  nintendoLayout: boolean | null = null; // null = auto-detect from the pad's name
  connected = "";
  private prev: boolean[] = [];
  private dirHeld: Record<Dir, number> = { up: 0, down: 0, left: 0, right: 0 };
  private dirNext: Record<Dir, number> = { up: 0, down: 0, left: 0, right: 0 };
  private yDown = 0;
  private rbDown = 0;
  private rbFired = false;
  private yFired = false;
  private knobAcc = 0;
  private knobAccY = 0;

  /** `index`: read that browser gamepad slot only (couch mode: one reader per player). Default: the first connected pad. */
  constructor(private sink: InputSink, readonly index?: number) {
    window.addEventListener("gamepadconnected", (e) => (this.connected = (e as GamepadEvent).gamepad.id));
    window.addEventListener("gamepaddisconnected", () => (this.connected = ""));
  }

  isNintendo(pad: Gamepad): boolean {
    if (this.nintendoLayout !== null) return this.nintendoLayout;
    return /nintendo|pro controller|057e/i.test(pad.id);
  }

  /** Call every animation frame. */
  poll(now: number) {
    const pads = [...(navigator.getGamepads?.() ?? [])];
    const pad = this.index === undefined ? pads.find((p) => p && p.connected) : pads[this.index];
    if (!pad || !pad.connected) return;
    this.connected = pad.id;
    const nin = this.isNintendo(pad);
    // Nintendo pads report by position: the right face button (labelled A) is
    // index 1. Swap so "confirm" is always the button labelled A.
    const map = nin ? { ...BTN, A: 1, B: 0, X: 3, Y: 2 } : BTN;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const down = (i: number) => b(i) && !this.prev[i];
    const up = (i: number) => !b(i) && this.prev[i];
    const s = this.sink;

    mods.fine = b(map.LT);
    if (down(map.RT)) { mods.select = true; s.action({ type: "selectHold", down: true }); }
    if (up(map.RT)) { mods.select = false; s.action({ type: "selectHold", down: false }); }

    if (down(map.A)) { mods.confirmHeld = true; s.action({ type: "confirm" }); }
    if (up(map.A)) { mods.confirmHeld = false; s.action({ type: "confirmUp" }); }
    if (down(map.B)) s.action({ type: "back" });
    if (down(map.X)) s.action({ type: "menu" });
    // RB: tap = swap roll / panel (as before, now on release); hold = editor layout.
    if (down(map.RB)) { this.rbDown = now; this.rbFired = false; }
    if (b(map.RB) && !this.rbFired && now - this.rbDown > Y_HOLD_MS) { this.rbFired = true; s.action({ type: "layout" }); }
    if (up(map.RB) && !this.rbFired) s.action({ type: "focusSwap" });
    if (down(map.LB)) s.action({ type: "shortcut", down: true });
    if (up(map.LB)) s.action({ type: "shortcut", down: false });
    if (down(map.MENU)) s.action({ type: "system" });
    if (down(map.VIEW)) s.action({ type: "undo" });
    if (down(map.L3)) s.action({ type: "playMode" });

    // Y: tap = play/stop, hold = record.
    if (down(map.Y)) { this.yDown = now; this.yFired = false; }
    if (b(map.Y) && !this.yFired && now - this.yDown > Y_HOLD_MS) { this.yFired = true; s.action({ type: "record" }); }
    if (up(map.Y) && !this.yFired) s.action({ type: "play" });

    // D-pad + left stick, with key-repeat.
    const lx = pad.axes[0] ?? 0, ly = pad.axes[1] ?? 0;
    const want: Record<Dir, boolean> = {
      up: b(map.UP) || ly < -0.6, down: b(map.DOWN) || ly > 0.6,
      left: b(map.LEFT) || lx < -0.6, right: b(map.RIGHT) || lx > 0.6,
    };
    for (const d of Object.keys(want) as Dir[]) {
      if (want[d]) {
        if (!this.dirHeld[d]) { this.dirHeld[d] = now; this.dirNext[d] = now + REPEAT_DELAY; s.action({ type: "dir", dir: d, repeat: false }); }
        else if (now >= this.dirNext[d]) { this.dirNext[d] = now + REPEAT_RATE; s.action({ type: "dir", dir: d, repeat: true }); }
      } else this.dirHeld[d] = 0;
    }

    // Right stick: knob / note length (x) and velocity (y). Accumulate so speed follows deflection.
    const rx = dead(pad.axes[2] ?? 0), ry = dead(-(pad.axes[3] ?? 0));
    this.knobAcc += rx * (mods.fine ? 0.08 : 0.35);
    this.knobAccY += ry * (mods.fine ? 0.08 : 0.35);
    const sx = Math.trunc(this.knobAcc), sy = Math.trunc(this.knobAccY);
    if (sx || sy) {
      this.knobAcc -= sx; this.knobAccY -= sy;
      s.action({ type: "knob", dx: sx, dy: sy });
    }
    if (!rx) this.knobAcc = 0;
    if (!ry) this.knobAccY = 0;

    this.prev = pad.buttons.map((x) => x.pressed);
  }
}

function dead(v: number): number {
  const d = 0.18;
  return Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d);
}

/** Browser slots of the gamepads plugged in right now. */
export function connectedPads(): number[] {
  return [...(navigator.getGamepads?.() ?? [])].flatMap((p, i) => (p && p.connected ? [i] : []));
}
