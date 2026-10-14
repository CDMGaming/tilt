// Every input device (gamepad, computer keyboard, mouse shortcuts, MIDI)
// becomes these actions, so each screen handles one vocabulary.

export type Dir = "up" | "down" | "left" | "right";

export type Action =
  | { type: "dir"; dir: Dir; repeat: boolean }
  | { type: "confirm" } // A / Enter (press)
  | { type: "confirmUp" } // A / Enter (release)
  | { type: "back" } // B / Esc
  | { type: "menu" } // X / M: context menu at the cursor
  | { type: "system" } // Start / F1: the app menu
  | { type: "play" } // Y tap / Space
  | { type: "record" } // Y hold / Shift+Space
  | { type: "shortcut"; down: boolean } // L/LB hold / backtick
  | { type: "focusSwap" } // R/RB / Tab: piano roll <-> instrument panel
  | { type: "layout" } // RB held / \\ : piano roll only / split / panel only (desktop editor)
  | { type: "knob"; dx: number; dy: number } // right stick / [ ] - =
  | { type: "selectHold"; down: boolean } // ZR/RT / Shift: range select
  | { type: "undo" } | { type: "redo" }
  | { type: "copy" } | { type: "cut" } | { type: "paste" } | { type: "delete" }
  | { type: "duplicate" } | { type: "selectAll" }
  | { type: "octave"; d: -1 | 1 } // Z / X
  | { type: "screen"; to: "song" | "edit" | "mix" }
  | { type: "playMode" } // C / L3: SCENE <-> SONG
  | { type: "help" }; // ?: the controls

/** Held modifiers, kept by the input layer. */
export const mods = {
  fine: false, // LT / ZL / Alt: fine knob steps, fine note length
  select: false, // RT / ZR / Shift: range select while moving
  confirmHeld: false, // A / Enter held: stick sets note length
};
