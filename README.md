# TILT

A Windows music-making app built around speed: roll random constraints, beat a timer, finish a song.
Workflow inspired by Korg Gadget for Switch. Names, art and instrument designs are original.

## Run

Double-click `start.cmd`, or:

    deno run -A tools/dev.ts    # then open http://localhost:5178 in Chrome

Needs Deno 2.x (installed at C:\deno). No Node. The first `deno install` may need `DENO_TLS_CA_STORE=system`.

- Tests: `deno test --sloppy-imports --no-check tests/`
- Type-check: `deno run -A npm:typescript/tsc --noEmit -p .`
- Build: `deno run -A npm:vite build` (output in `dist/`)
- Latency test: http://localhost:5178/latency.html
- Rebuild the drum kit: `deno run -A tools/make-kit.ts`

## TILT Jam (branch `jam`)

A jam-first front door on the same engine, at `/jam/` (preview: https://jam.tilt-jam.pages.dev/jam/).
Pick a genre pack and a template and a whole song plays at once. Every part is a card of big macro
knobs (always musical, double-click: home), with dice / mute / reset; section pads and progression
shuffle land on the next bar; a hold-to-apply FX strip; BACK TO GOOD; Open in TILT Studio; Share.
Friends join: gamepads and MIDI controllers take a card each (couch), or online with a 4-letter code.
Code: `src/jam/` (packs are data: `src/jam/packs/`, tropes in `docs/packs/`). The electric guitar it
uses (Axe) is a normal TILT instrument.

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
- Phase 2: done, see below.

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

DICE: key, scale, tempo, swing, lineup and presets, each lockable, with a share code. TIMER: off or 5/10/15/20 minutes,
pausable (not in game mode). Amber at 1:00, a flashing countdown for the last 10 s. At zero the bar finishes and
fades out, the song is kept as a timed take (its Versions in Songs), and a card offers Play it back, Save as-is,
EXTRA BALL (+5 min) and Keep working. Game mode locks editing until you choose and allows one extra ball.

WAV export: full mix or one track, 16/24-bit, 44.1/48 kHz, tail 0-5 s.

## Phase 2 contents

Instruments: **Razor** (mono lead, hard-sync oscillator with sync sweep, 1/3/5/7-voice unison),
**Thump Lab** (synthesised kick/snare/tom/perc modules, no samples), **Wobbler** (cross-mod bass,
crush filter, tempo-locked wobble LFO), **Haze** (3-layer lo-fi pad with tape wow, crush and built-in reverb).

Mixer (F4): per track 3 insert FX with 2 knobs each (EQ, LP/HP/BP, compressor, drive, decimator, chorus,
phaser, tremolo, pump, slicer, BPM delay, room/hall reverb), reverb send, pan, fader, meter, mute/solo;
master limiter, reverb and volume. Automation lanes for any knob (draw, or record knob moves).

Phrase grid: 5x5 starter phrases (drums, bass, chords, lead, arp) on one shared progression, fitted to the
rolled key/scale/tempo, seeded by the share code. Offered after START; also in the app menu.

User presets (★ Save on any instrument). Song library (IndexedDB, every song saves itself), song file
export/import. Export: WAV mix, single track, all stems as a zip (with mix + MIDI), MIDI file. MIDI import.
MIDI learn for any knob/fader (saved with the song) and transport CCs (Settings).

Testing tip: add `?sandbox` to the URL to use separate storage (songs, settings, presets).
