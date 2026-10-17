# TILT menus: where everything lives

Every action has one home: at most one menu, plus its shortcut or a control on a toolbar. Menus are
contextual (what's under the cursor), grouped under headings.

How menus open:

| | Mouse | Keyboard | Gamepad | Touch |
|---|---|---|---|---|
| TILT menu | the TILT logo | F1 | Start / + | Menu (rail) |
| The menu for what's under the cursor | right-click, or its ⋯ | M | X | long-press, or its ⋯ |
| Selection bar (notes selected) | appears by itself | M goes into it | X goes into it | appears by itself |
| Jump to… | the quarter's Jump to… (couch) | hold or tap \` | hold or tap LB | — |

Inside a menu or bar: arrows / D-pad move, Enter / A picks, Esc / B goes back.

---

## TILT menu (app level only)

| Group | Item | Notes |
|---|---|---|
| **Song** | New jam… | the setup screen |
| | Songs… | the library (each song's ⋯: open, duplicate, rename, **Versions…**, export file, share, delete) |
| | Open a code or link… | |
| | Save version… | a named copy in the song's Versions |
| | Song settings… | key, scale, tempo, swing (also: click the display) |
| **Share** | Share… | tabs: Song (code, link, QR) / Setup code |
| | Export… | WAV, stems, MIDI |
| **Play** | Together… / Back to the couch, End couch mode | |
| | Game mode & timer… | opens Settings → Timer & game mode |
| **Setup** | Settings… | |
| | MIDI learn… | |
| **Help** | Controls & tutorial… | also ? |

## Top bar (desktop) / rails (phones)

| Control | Action | Keys | Gamepad |
|---|---|---|---|
| SONG / EDIT / MIX tabs | screens | F2 / F3 / F4 | Jump to… (LB): up from the first scene |
| ↶ / ↷ | undo / redo (hold or right-click ↶: the history) | Ctrl+Z / Ctrl+Y | Back / − (undo) |
| ▶ ● | play / record | Space / Shift+Space | Y / hold Y |
| SCENE · SONG | what Play plays | C | L3 |
| ⟳ | loop | | |
| ♩ | metronome (phones: ♩ Click on the left rail) | | |
| ⇪ Share | Share (Song tab) | | |
| 💡 (on the display) | Stuck? the phrase grid for this scene | | |
| ❚❚ (by the display) | pause the timer (not in game mode; phones: tap the timer) | | |

## Editor

**Toolbar:** instrument ‹ › · scene ‹ › · **Bars − / +** (clip length) · grid 1/8 1/16 1/32 · 3 (triplets) ·
**♪ length ▾** (new notes, and the selected notes when there are some: one picker, B / N) · Step · Velocity ·
Automation ▾ (pick a lane; Clear this lane) · Scale lock · ⚠ out of key · Roll / Split / Sound · **⋯**

**Selection bar** (over the bar ruler while notes are selected): ♪ Length · Transpose − / + (Shift or LT: an
octave) · Quantize · Legato (Ctrl+G) · Join (Ctrl+J) · Split (Ctrl+E, Alt+click) · Velocity − / + (Shift or LT:
fine) · Copy (Ctrl+C; Ctrl+X cuts) · Delete (Delete) · ✕ deselect (Esc / B). Right-click a note: select it
(cursor where you clicked, so Split splits there).

**⋯ menu** (X / M with nothing selected):

| Group | Items |
|---|---|
| Clip | Duplicate (x2) (Ctrl+D) · Paste (Ctrl+V) · Select all (Ctrl+A) · Clear notes · Clear automation |
| View | Zoom ▸ (Ctrl+wheel) · Hide out-of-key rows |
| This session | Count-in · Record quantize · Note preview |

(Couch quarters add the player's own items: Jump to…, ask to swap, change instrument, leave.)

## Song screen

A ⋯ shows on the hovered or selected track header, scene header and clip (desktop); right-click,
long-press and X / M open the same menus.

**Track menu:** *Sound* (Edit sound, Change instrument ▸, 🎲 Random sound) · *Mix* (Volume ▸, Mute, Solo) ·
*Track* (Duplicate, Delete, Add track…). Also on the header: M, S.

**Scene menu:** *Play* (Loop this scene / Play the song from here) · *Name & repeat* (Name ▸, Repeat ▸) ·
*Scene settings* (Scene settings…: tempo, key change, fade in / out, in one dialog) · *Arrange* (Add to the
song chain, Move up / down (Alt+↑ / ↓), Duplicate, Insert blank after, Add scene at end, Delete). Also
on the header: ▶, the name (click: Name), the ⋮⋮ grip (drag).

**Clip menu:** *Clip* (Edit clip, Length ▸, Duplicate (x2)) · *Move & copy* (Move / copy to…, Copy, Paste) ·
*Clear* (Mute clip, Clear clip, Clear automation). Also: drag a clip (move / copy / swap), double-click
or Enter / A to edit.

**Song chain strip:** chips (click: repeat, swap scene, play from here, duplicate, move, remove), + (add a
scene), the SONG label (play the song, add, back to the rows in order), **✦ Auto-arrange** (one-scene
songs).

**Corner:** ⇪ Share song · 🎲 code (Share → Setup code).

## Setup screen

Reels and HOLDs · NUDGE (Y / Space) · Setups ▾ · Save setup… · **Share code: Copy / Copy link** · Enter
code… · Songs… · Blank song · Timer (Off / 5-20 min) and its **Game mode…** link (Settings → Timer & game
mode) · NEW SONG.

## Settings

| Group | Contents |
|---|---|
| Audio | output device, device names, latency |
| Controllers & MIDI | gamepad and its button layout · MIDI inputs (MiniLab, Push) · MIDI learn bindings (with Remove) · MIDI learn… · transport CCs (play / stop, record) · clock follow / send · MIDI monitor |
| Editing defaults | count-in · record quantize · note preview · default note length · phrase grid after START |
| Sounds | generated sounds share |
| Timer & game mode | game mode (what it changes) · challenge cards · soft tick · after Save as-is |
| Display | oscilloscope · piano roll labels (names / degrees / both) |

## Moved in this restructure

| Was | Now |
|---|---|
| TILT menu: Song / Edit / Mixer screen | top bar tabs, F2-F4; gamepad: Jump to… (LB), up |
| TILT menu: play mode, loop, metronome | top bar (phones: rails) |
| TILT menu: Stuck? | 💡 on the display (phones: rail) |
| TILT menu: auto-arrange | ✦ Auto-arrange on the chain strip |
| TILT menu: oscilloscope | Settings → Display |
| TILT menu: share setup code | Share → Setup code tab; the setup screen's Copy / Copy link |
| TILT menu: Game mode… | Game mode & timer… (Settings → Timer & game mode) |
| TILT menu: First song tutorial | Controls & tutorial… |
| Editor ⋯: quantize, split, join, legato, set length, copy, cut, delete, transpose | the selection bar (and their shortcuts) |
| Editor ⋯: new note length | the toolbar ♪ picker (also sets the selection) |
| Editor ⋯: grid, velocity view, automation lane, step input, scale lock | the toolbar |
| Editor ⋯: clip length | toolbar Bars − / +, and the clip menu's Length |
| Editor ⋯: clear lane | Automation ▾ → Clear this lane |
| Editor ⋯: undo / redo / history, MIDI learn | top bar ↶ ↷; TILT menu |
| Note right-click menu | select + the selection bar (velocity, length too) |
| Scene menu: tempo, key change, fade in, fade out | Scene settings… |
| Scene menu: auto-arrange | ✦ Auto-arrange on the chain strip |
| Game mode dialog, Settings → Timer | Settings → Timer & game mode |
