# Workflow notes from the reference manuals

Workflow and structure only. Do not reuse Korg's names, gadget names, art or panel designs.

## Structure (Switch manual: Overview; iOS Studio Guide p.5-6)
- Song = tracks (columns, one instrument each) x scenes (rows). Cell = clip. Clip lengths are per track and may differ inside one scene.
- Scene settings (SG p.29): name, time signature, repeat count, per-scene tempo on/off, "smooth" tempo glide into the scene, fade-in, fade-out.
- Clip settings (SG p.29): bars (max 8), play mode, mute, grid.
- Scene ops (SG p.30): add, delete, insert blank after, duplicate after.
- Track ops (SG p.32): delete, duplicate (inserted to the right), change instrument, freeze (CPU saver; we probably don't need it).
- Auto arranger: only offered when the song has exactly one scene.
- Song settings: title, tempo, swing. Tempo dialog: tempo, swing, tap, metronome.
- 300 song save slots on Switch.

## Piano roll (Switch: Piano Roll; SG p.22, 37-45)
- A places a note at the cursor (replacing an existing one); hold A + stick left/right sets length.
- Right stick left/right lengthens/shortens the note under the cursor; ZL makes it step by the grid.
- Grid 8th/16th, triplet toggle, notes snap. Display range (bars visible) separate from clip length.
- Velocity view: right stick adjusts. Note colour shade = velocity.
- Automation view: per-parameter lanes, drawn with up/down. "Clear automation" and "Clear notes" exist.
- Range select (hold a trigger + move), copy/paste, duplicate (doubles clip length with notes), undo; iOS has undo/redo with a long-press history list.
- Out-of-scale notes drawn with diagonal hatching.
- Note preview when adding/moving notes is an option.
- L opens a shortcut overlay to jump between tracks/scenes; in it, Y toggles scene loop.

## Instrument screen (Switch: Gadget/Mixer; SG p.23-26)
- Right stick turns the selected knob; hold ZL for fine. A preview button plays a test note while tweaking.
- Save/Delete user preset from the menu; user presets are usable in any song.
- Keyboard has scale type, key, "scale step" (how many notes per octave on the keys), octave buttons. Drums get pads.
- MIDI learn: open function menu, tap a parameter (it blinks), move a hardware control.

## Mixer (SG p.17-18, 24-25)
- Per track: fader + meter, pan, reverb send, solo, mute, MIDI-enable button, insert FX.
- Master: limiter on/off + depth, reverb on/off + time, fader. Solo/mute-all-off button.
- MIDI input: Easy (only the track whose MIDI button is lit) vs Advanced (device + channel per track).
- MIDI sync: Int / Ext / Auto (switches to Ext when clock arrives). Transport CCs: play, pause, stop, record, loop, metronome.

## Transport / recording
- Y = play/stop, long-press Y = record (notes, preview hits, knob moves = automation).
- Scene loop vs song loop are separate toggles. Quantize applies to real-time recording at the grid resolution.

## Constraint settings (Switch: Settings), the seed of our DICE + TIMER
- Time limit (soft: you may continue past it), random starting instrument + tone, random tempo, random scale + key, scene/instrument lock, note limit per clip.
- "My First" mode: make a song in 10 minutes.

## Export (SG p.49-51)
- WAV 16-bit 44.1k stereo; all tracks or a single track; selectable format; tail setting (e.g. 5000 ms) for reverb.
- Ableton Live project export with audio per track. SMF export and import.

## Effects (Switch: Effects table): every effect is TYPE + EDIT1 + EDIT2
Bypass; peak EQ (freq, gain); 2-band EQ (low, high); LPF/HPF/BPF (cutoff, reso); comb (freq, feedback);
compressor (sens, attack); tube drive (gain); distortion (gain, level); decimator (freq, balance);
ring mod (freq, balance); talk mod (formant, offset); chorus/flanger (speed, depth); ensemble (depth, spread);
phaser (freq, depth); auto pan (freq, depth); tremolo (freq, depth); pump (freq, attack); slicer (freq, hold);
grain shift (speed, balance); short delay (time, depth); BPM delay (time, depth); room/hall/gate reverb (time, level).
