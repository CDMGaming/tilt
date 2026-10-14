# TILT layout + navigation redesign (A–H), before / after

All shots are 1280×800 unless noted, same demo song ("Neon Rally", sandbox), taken in the app's
built-in browser. (The dark band down the right of the 1280-wide shots is how that browser
captures an emulated window; the app itself fills the width.)

| Screen | Before | After |
|---|---|---|
| Top bar at 900 px (problem 1) | `before-0-topbar-900.jpg`: Edit, Mix, Export, scope and settings off the edge | `after-B-backbox-900.jpg`: rail + backbox, nothing overflows |
| Dice (problem 4) | `before-1-dice.jpg` | `after-1-dice.jpg` (1280×800), `after-G-dice-1280x720.jpg` (fits 720 tall) |
| Song (problem 5) | `before-2-song.jpg` | `after-2-song.jpg`, `after-E-song.jpg` (Intro playing: lit insert lamps; Verse queued: blinking) |
| Editor (problems 2, 3) | `before-3-edit.jpg`: three toolbar rows | `after-3-edit.jpg`, `after-D-edit.jpg` (one row, notes in view), `after-D-edit-toolbar-900.png` |
| Mixer (problem 6) | `before-4-mix.jpg`: three empty FX boxes per strip, master far right | `after-4-mix.jpg` / `after-F-mix.jpg` |
| Messages (problem 3) | toasts floated over the knobs | `after-C-message-in-backbox.png`: "20 MINUTES. GO!" on the display |
| Instruments (problem 7) | one shared look | `after-H-nameplates.jpg`, `after-H-knobs-1.jpg`, `after-H-knobs-2.jpg` |
| Rail (A) | top-bar tabs | `after-A-rail.jpg` |

Commits: A `d19df9d`, B `e0df1f0`, C `824ed88`, D `9450958`, E `7445a06`, F `4575524`, G `7432b83`, H `4734488`.
