# Rollbox (working name)

A Windows music-making app built around speed: roll random constraints, beat a timer, finish a song.
Workflow inspired by Korg Gadget for Switch. Names, art and instrument designs are original.

## Run

Double-click `start.cmd`, or:

    deno run -A npm:vite        # then open http://localhost:5178 in Chrome

Needs Deno 2.x (installed at C:\deno). No Node. The first `deno install` may need `DENO_TLS_CA_STORE=system`.

- Tests: `deno test --sloppy-imports --no-check tests/`
- Type-check: `deno run -A npm:typescript/tsc --noEmit -p .`
- Build: `deno run -A npm:vite build` (output in `dist/`)
- Latency test: http://localhost:5178/latency.html
- Rebuild the drum kit: `deno run -A tools/make-kit.ts`

## Layout

- `src/engine/`: song model, timeline, instruments (AudioWorklet DSP), audio graph, dice, arranger, WAV.
  No DOM imports, so it can be ported (or moved behind a native audio engine later).
- `src/ui/`: screens, input (keyboard, gamepad, MIDI), dialogs.
- `public/kit/`: the default drum kit. Synthesised by `tools/make-kit.ts`, CC0.
- `docs/reference/`: Korg manuals, used for workflow reference only. `docs/workflow-notes.md` has the extract.

## Phase status

- Phase 0: latency test. Measured ~50 ms key-to-sound on the M-Audio AIR 192|4 through Chrome (WASAPI shared).
  Accepted for now. Recording compensates for it.
- Phase 1: done, see below.

## Phase 1 contents

Instruments: **Kitbox** (8-part sample drums: per-part sound/tune/decay/level/pan + drive/tone, hat choke),
**Squelch** (mono acid bass: resonant ladder filter, bite drive, accent, glide on overlapping notes, sub, arp),
**Chordette** (poly synth whose chord mode turns one key into a triad or 7th of the song's scale). 10 presets each.

Song: tracks x scenes, clips 1-8 bars, duplicate doubles a clip, scene name/repeat/tempo/fade in/out,
add/insert/duplicate/delete scenes, add (picker with random)/duplicate/delete/change tracks, mute/solo,
scene loop or whole song (+ song loop), tempo/tap/swing/metronome/key/scale, auto-arranger,
undo/redo with history, autosave.

Editing: piano roll with out-of-key rows hatched, scale lock (default on), 1/8, 1/16 and triplet grids, velocity lane,
range select, copy/cut/paste, transpose, quantize, step input, real-time recording with quantize and latency
compensation, note preview.

DICE: key, scale, tempo, swing, lineup and presets, each lockable, with a share code. TIMER: 10/20/30 minutes. At zero,
editing locks and it offers auto-arrange + export.

WAV export: full mix or one track, 16/24-bit, 44.1/48 kHz, tail 0-5 s.
