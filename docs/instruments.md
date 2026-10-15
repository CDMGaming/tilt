# TILT instruments: the plan

The spec for the instruments overhaul (v2). Nothing here is built yet: this is for review.
Concepts and control ideas were checked against the KORG Gadget Switch manual (docs/reference);
every name, panel and sound below is TILT's own. Where your brief borrowed a Korg control name or
a gadget's look, the doc says so and proposes an original one (marked **⚑ name check**).

## 1. Principles

- **One idea per instrument.** Each has its own curated panel of **6-12 front controls**, named by
  what they do to the sound. There is no generic "synth page" anywhere.
- **Character controls** (1-3 per instrument) move several internal parameters at once, each
  along a curve tuned by ear. The table under each instrument says exactly what moves.
- **Hidden voicing.** Presets also set internal parameters that have no knob (oscillator mix,
  filter type, envelope shapes, LFO routing, built-in FX...). A simple panel can then still
  hold very different sounds. Turning a front control never resets the hidden voicing.
- **Shared DSP library, never shared UI.** Filters, LFOs, envelopes, the FX set, sample playback,
  unison, glide, pitch envelope and the Pump / Stutter performer live in one internal library
  (what Phase 2 of the last plan built as the "toolkit"). Instruments use pieces of it through
  their own controls and hidden voicing.
- **Per-instrument hardware mapping.** Each instrument lists its own 8 macros (MiniLab knobs, Push
  encoders), in the order a player reaches for them.
- **Per-instrument look.** A layout archetype (§3) plus a theme: materials, colours, knob style
  and fonts in CSS / SVG only, no bitmaps.
- **Old songs keep working.** Existing parameter ids stay. New character controls default to
  "neutral" (no effect), so a stored sound plays exactly as before. Presets are matched by name,
  and renamed presets keep their old names as aliases.

### What happens to the MORE / XY pages shipped in the last round

They're a generic synth page, which this design rules out. The plan:
- **The engine stays.** It becomes the internal library above. Its `tk:` / `ifx:` params become
  hidden voicing that presets set. Songs already using them keep sounding the same.
- **The pages go**, instrument by instrument, as each is rebuilt in Phase 3.
- **An XY pad survives only where it's the instrument's idea:** Morph's Warp pad and Vox's vowel pad.
- **The built-in FX** becomes one or two named controls where an instrument has an effect as
  part of its idea (Haze's Space, Anthem's Shine...). Otherwise it's hidden voicing.

## 2. Role tags

Every preset (curated or generated) carries one or more tags. Dice and NUDGE choose a role per
slot first, then a sound with that tag from any instrument.

| Tag | Meaning |
|---|---|
| `drums` | a kit or a drum part |
| `bass` | lives under ~200 Hz, carries the root |
| `lead` | a monophonic melody voice that cuts through |
| `pad` | sustained, slow attack, fills space |
| `keys` | struck, polyphonic, chords and comping (piano, EP, organ, clav, bells) |
| `pluck` | short attack and decay, melodic |
| `arp` | made for fast repeated patterns (short, bright, often with a tempo LFO) |
| `fx` | risers, impacts, noise, sweeps, one-shots |

Dice weighting per slot (adjustable in the setting): slot 1 drums 80%, slot 2 bass 80%, then the
rest spread over lead / pad / keys / pluck / arp, with fx rare (5%) unless asked for.

## 3. Layout archetypes

The building blocks of each panel (shared CSS, never the same look: each instrument themes them).

| Code | Archetype | Used by |
|---|---|---|
| A | **Strip rack**: a screen on top, 8 channel strips under it | Kitbox |
| B | **Module row**: coloured modules side by side, one per part | Thump Lab |
| C | **Big-knob row**: one row of large knobs, a few toggles | Squelch, Tine |
| D | **Workstation**: a sound-list screen, category buttons, a few knobs | Chordette, Parlor |
| E | **Fader bank**: vertical faders, a knob or two | Razor, Wheelhouse (drawbars) |
| F | **Hero knob**: one huge centre control, small ones around it | Wobbler, Anthem |
| G | **Glass panel**: frosted surface, level bars instead of knobs | Haze |
| H | **Handheld**: a pixel screen and console buttons | Pixel |
| I | **Ornament**: knobs set in a framed, decorated panel | Glint |
| J | **XY hero**: a big pad with a ring of controls | Morph, Vox |
| K | **Patch panel**: knobs plus drawn patch cables to jacks | Patchwork |
| L | **Pads over a waveform**: a wide waveform with pads or markers | Grab, Chop |
| M | **Speaker**: a cone-and-grille layout, controls around it | Boom |
| N | **Wooden pads**: kit pads as wood, brass knobs | Garage |

Every archetype also has a phone form (a stacked, scrollable version of the same controls).

---

## 4. Existing instruments (Phase 3: redesign, one at a time)

Each section lists: **idea · roles · front controls (★ = character control) · what each ★ does ·
hidden voicing · 8 macros · layout · theme · presets**. Front-control counts include switches.

### Kitbox: dance drum machine
- **Idea:** a punchy, ready-to-play dance kit, chosen from a kit list and shaped per channel.
- **Roles:** drums.
- **Front (master, 4):** Kit (list on the LCD) · ★ Punch · ★ Smack · Time.
- **Per channel strip (8 channels × 6):** Sound (browser across all kits) · Tune · Time (decay) · Level ·
  Pan · FX send. A strip's **More** pop-over holds One-shot / Gate, Reverse, Choke group, Velocity
  sensitivity, Filter, Start (these are per-part settings, not a synth page).

| ★ Control | Moves (internally) |
|---|---|
| Punch | Transient shaper attack + low shelf on kick and toms + a little master compression |
| Smack | Snare / clap: transient + body EQ (+200 Hz bump) + short room send |

- **Hidden voicing:** per-part drive, tone, hat choke, the kit's EQ curve, master compressor settings.
- **Macros:** Punch · Smack · Time · Kick tune · Snare tune · Hat time · Kit FX send · Level.
- **Layout:** A, the kit LCD across the top and 8 strips under it.
- **Theme:** matte black rubber, a green phosphor LCD, coloured channel caps (one colour per part).
- **Kits (10-15):** Classic (today's kit), plus Acoustic, Lo-fi, Trap, House, Breaks, Electro, Garage
  shuffle, Minimal, Industrial, and 2-3 synthesised kits (rendered by tools/make-kit.ts like today's).
  Only CC0 samples (§7).
- **Presets:** each kit plus 1-2 variants = 24 or more.

### Thump Lab: analog drum machine
- **Idea:** synthesised drums in colourful modules, every part tweakable, nothing sampled.
- **Roles:** drums.
- **Parts (8):** kick, snare, clap, closed hat, open hat, low tom, high tom, rim / cowbell.
- **Front (master, 4):** Model switch · ★ Boom · ★ Snap · ★ Sizzle.
- **Per module (8 × 4):** Tune · Decay · Tone · Level. Module **More**: Drive, Pan, Accent, Pitch env
  (kick / toms), Punch (snare), Mod speed (rim / cowbell).
- **Model switch ⚑ name check:** the brief's 808 / 909 / 606 / CR-78 / Simmons labels are Roland and
  Simmons trademarks. Proposed labels and what they mean:
  - **Deep:** long sine kick, metallic hats.
  - **Club:** punchy click kick, noisy snare.
  - **Tiny:** small, tight and bright.
  - **Parlour:** soft, vintage rhythm box.
  - **Hex:** electronic tom and snare sweeps.

| ★ Control | Moves |
|---|---|
| Boom | Kick decay + kick pitch-env depth + low tom decay + sub level |
| Snap | Snare snappy (noise level) + noise tone + clap spread + transient |
| Sizzle | Both hats: decay + band-pass centre + the 6-oscillator metallic mix |

- **Hidden voicing:** each Model's oscillator shapes, noise colours, accent curve and hat choke.
  Hats use 6 detuned square oscillators into a band-pass (the classic metallic hat).
- **Macros:** Boom · Snap · Sizzle · Kick tune · Snare tune · Hat decay · Tom tune · Level.
- **Layout:** B, 8 modules in two rows of four, the Model switch and ★ knobs on a strip above.
- **Theme:** powder-coated modules in 8 bright colours, white knob caps, rubber feet.
- **Presets:** 24 (Model × style: club, hip-hop, electro, minimal, lo-fi...).

### Squelch: acid bass
- **Idea:** the squelchy, resonant mono bass line that slides and screams.
- **Roles:** bass, lead (acid leads), arp.
- **Front (9):** Wave · Cutoff · Reso · Env (depth) · Decay · ★ Snarl · ★ Chew · Accent · Slide.
- **⚑ name check:** the brief's "Bite" and "Gnaw" are the Chicago gadget's control names. The proposal
  is **Snarl** and **Chew**. Today's `bite` param keeps its id; only the label changes.

| ★ Control | Moves |
|---|---|
| Snarl | Filter input drive + post-filter saturation + resonance compensation (gets louder and dirtier, not thinner) |
| Chew | Audio-rate filter FM from the oscillator + a resonance tilt + a touch of high-pass |

- **Hidden voicing:** sub level, arp (on, mode, rate, range), accent curve, glide shape, built-in FX.
- **Macros:** Cutoff · Reso · Env · Decay · Snarl · Chew · Accent · Slide.
- **Layout:** C, one row of big knobs, the arp tucked under a flip-down lid.
- **Theme:** brushed silver, black engraved labels, red pointer knobs, an LED for accent.
- **Presets:** 28 (classic 303-style lines, dirty, rubbery, acid leads, arps).

### Chordette: one-finger chords
- **Idea:** play one key, hear a chord in the song's scale, with a workstation's choice of sounds.
- **Roles:** keys, pad, pluck.
- **Front (8):** Sound list (by category) · Chord (off / triad / 7th) · ★ Strum · ★ Warmth · ★ Voicing ·
  Attack · Release · Level.

| ★ Control | Moves |
|---|---|
| Strum | Note onset spread across the chord (0-80 ms) + up / down direction + velocity tail-off |
| Warmth | Low-pass cutoff down + oscillator detune up + soft saturation + a little chorus |
| Voicing | Close → open → spread: octave displacement of the 2nd and 3rd notes + stereo width |

- **Hidden voicing:** oscillators, filter envelope, LFO, unison, built-in FX: each preset is its own sound.
- **Category buttons:** Keys, Pads, Strings, Brass, Synth, Bells.
- **Macros:** Warmth · Strum · Voicing · Chord · Attack · Release · Cutoff (hidden) · Level.
- **Layout:** D, a sound-list LCD on the left, category buttons, then the knob row.
- **Theme:** an 80s workstation: warm grey, a teal LCD, membrane category buttons.
- **Presets:** 32 across the categories.

### Razor: sync lead
- **Idea:** the screaming hard-sync lead, played on faders like a performance synth.
- **Roles:** lead.
- **Front (8 faders):** ★ Scream · ★ Sweep · Tone (cutoff) · Voices (unison) · Spread · Attack ·
  Release · ★ Glide.

| ★ Control | Moves |
|---|---|
| Scream | Sync ratio + sync envelope depth + a little drive |
| Sweep | Filter env amount + env decay + sync env decay (the "zap" at each note) |
| Glide | Portamento time + legato on above 0 + vibrato fade-in |

- **Hidden voicing:** wave, vibrato rate and depth, pulse width, built-in delay.
- **Macros:** Scream · Sweep · Tone · Glide · Voices · Spread · Attack · Level.
- **Layout:** E, 8 vertical faders with lit caps.
- **Theme:** an anodised blue faceplate, LED-lit fader caps, condensed sans labels.
- **Presets:** 24 (leads, sync bass, sync arps, screaming solos).

### Wobbler: wobble bass
- **Idea:** the growling, tempo-locked wobble bass.
- **Roles:** bass, fx.
- **Front (8):** ★ Wobble (huge, centre) · Rate tiles (1/1 · 1/2 · 1/4 · 1/8 · 1/16 · triplet) · ★ Growl ·
  ★ Grit · Cutoff · Sub · Glide · Level.
- **⚑ name check:** "Crush" is the Miami gadget's filter name, so Grit is proposed instead. (Wobble is a
  generic genre word, kept.)

| ★ Control | Moves |
|---|---|
| Wobble | LFO depth to cutoff + resonance + a little LFO to amp |
| Growl | X-mod depth + X-mod tune + formant-ish band-pass mix |
| Grit | Sample-rate reduction + bit depth + post drive |

- **Hidden voicing:** carrier wave, X-mod wave, LFO shape, stereo width.
- **Macros:** Wobble · Rate · Growl · Grit · Cutoff · Sub · Glide · Level.
- **Layout:** F, a giant Wobble knob ringed by LEDs, rate tiles under it.
- **Theme:** carbon-fibre weave, neon green edge light.
- **Presets:** 24 (wobbles, growls, reese, talking bass, risers).

### Haze: lo-fi pads
- **Idea:** dreamy, worn-tape pads that drift and breathe.
- **Roles:** pad, keys.
- **Front (7 level bars):** Low · Hi · Higher (the layer mix) · ★ Drift · ★ Dust · ★ Space · Level.

| ★ Control | Moves |
|---|---|
| Drift | Tape wow depth + slow detune between layers + filter LFO |
| Dust | Noise level + bit / sample-rate wear + high-cut |
| Space | Reverb time + reverb level + pre-delay + stereo width |

- **Hidden voicing:** wave, ADSR, filter type and cutoff.
- **Macros:** Drift · Dust · Space · Low · Hi · Higher · Attack (hidden) · Level.
- **Layout:** G, frosted glass with level bars that glow.
- **Theme:** frosted glass over a dusk gradient, soft white type.
- **Presets:** 24 (pads, keys, textures).

### Pixel: chiptune
- **Idea:** 8-bit game sounds: pulses, arpeggio jumps, sweeps and glitches.
- **Roles:** lead, arp, bass, fx.
- **Front (8):** Wave (pulse 12/25/50 · triangle · noise) · ★ Hop! · Hop speed · ★ Dash! · ★ Glitch ·
  Attack · Decay · Level.
- **⚑ name check:** "Jump" and "Run" are the Kingston gadget's. The proposal is **Hop!** (the arpeggio jump)
  and **Dash!** (the pitch-run sweep).

| ★ Control | Moves |
|---|---|
| Hop! | Arpeggio pattern (octave / fifth / chord) + note count |
| Dash! | Pitch sweep amount + sweep time + vibrato |
| Glitch | Bit-crush + random pitch steps + duty cycling |

- **Hidden voicing:** sustain, release, vibrato rate.
- **Macros:** Hop! · Hop speed · Dash! · Glitch · Wave · Decay · Attack · Level.
- **Layout:** H, a handheld console with a pixel screen showing the wave and buttons.
- **Theme:** off-white plastic, a green-grey pixel screen, purple and pink buttons.
- **Presets:** 28 (leads, arps, bass, jingles, coin / jump / laser FX).

### Glint: FM bells
- **Idea:** glassy, metallic FM tones (bells, mallets, tines).
- **Roles:** keys, pluck, pad.
- **Front (8):** Ratio · ★ Shimmer · ★ Strike · ★ Harmonics · Attack · Decay · Release · Level.

| ★ Control | Moves |
|---|---|
| Shimmer | Stereo detune + slow FM-index LFO + chorus |
| Strike | Modulator envelope attack amount + velocity → FM + a click transient |
| Harmonics | FM index + feedback + modulator ratio fine (inharmonic above half) |

- **Hidden voicing:** FM decay and sustain, carrier ratio.
- **Macros:** Harmonics · Strike · Shimmer · Ratio · Decay · Release · Attack · Level.
- **Layout:** I, a framed ornamental panel.
- **Theme:** deep teal lacquer, gold filigree borders, brass knobs.
- **Presets:** 24 (bells, mallets, glass pads, plucks).

### Morph: wavetable
- **Idea:** sweep through waveforms; Warp bends them on a big pad.
- **Roles:** pad, lead, bass, arp.
- **Front (8):** Warp XY pad (X = position, Y = ★ Warp) · Table · Motion (position LFO) · Motion speed ·
  Cutoff · Attack · Release · Level.
- **⚑ look check:** "industrial yellow + a Warp touchpad" is the Kiev gadget's identity. The proposal is
  **oxidised copper with verdigris**, keeping the XY pad (the pad is the idea, the colour is ours).

| ★ Control | Moves |
|---|---|
| Warp | Phase distortion of the table + position offset + filter resonance tilt |

- **Hidden voicing:** unison voices and detune, filter env, position envelope.
- **Macros:** Warp · Position · Motion · Motion speed · Table · Cutoff · Release · Level.
- **Layout:** J, the pad in the centre with controls around it.
- **Theme:** oxidised copper, a verdigris pad.
- **Presets:** 24.

### Grab: sampler
- **Idea:** your own sounds and found sounds, in a boombox.
- **Roles:** fx, drums, keys (chord stabs).
- **Front (per pad 5, master 3):** Sound · Tune · Start · Decay · Reverse (per pad) · ★ Crunch · ★ Vinyl ·
  ★ Pitch (master).

| ★ Control | Moves |
|---|---|
| Crunch | Bit depth + sample rate + saturation |
| Vinyl | Crackle + wow + low-cut and high-cut |
| Pitch | All pads ± 12 semitones with formant-free resampling (tape style) |

- **Hidden voicing:** per-pad mode (one-shot / gate / loop), pan, level.
- **Macros:** Crunch · Vinyl · Pitch · Pad 1 tune · Pad 1 start · Pad 2 tune · Pad 1 decay · Level.
- **Layout:** L, the pad grid under a big waveform of the selected pad.
- **Theme:** a chrome boombox: speaker-grille pattern, a cassette-window waveform.
- **Presets:** 24 kits of sounds (SFX, vocal chops, stabs).

---

## 5. New instruments (Phase 4, one at a time)

### Parlor: piano
- **Idea:** a real piano, simple to play and to shape.
- **Roles:** keys.
- **Front (7):** ★ Character · Release · Low · Mid · High (3-band EQ) · Room · Level.

| ★ Control | Moves |
|---|---|
| Character | Velocity → brightness curve + hammer noise + a dark → bright sample layer crossfade |

- **Hidden voicing:** sympathetic resonance, stereo width, tuning stretch.
- **Samples:** a CC0 / CC-BY multisampled piano (§7), lazy-loaded on first use.
- **Macros:** Character · Release · Low · Mid · High · Room · Level · (Velocity curve, hidden).
- **Layout:** D, a minimal sound list with Grand, Upright and Felt (variants of one set).
- **Theme:** black lacquer, ivory type, no decoration.
- **Presets:** 24 (grand, upright, felt, honky, lo-fi, bright pop...).

### Tine: electric piano (FM, no samples)
- **Idea:** the bell-and-bark electric piano.
- **Roles:** keys.
- **Front (7):** Tremolo (off / mono / stereo) · Tremolo rate · Tremolo depth · ★ Bark · Key-off noise · Tone · Level.

| ★ Control | Moves |
|---|---|
| Bark | Amp drive + velocity → FM index + a mid boost |

- **Macros:** Bark · Tone · Tremolo depth · Tremolo rate · Key-off · Decay (hidden) · Release (hidden) · Level.
- **Layout:** C, with the tremolo switch as a three-way lever.
- **Theme:** brushed silver over black tolex.
- **Presets:** 24.

### Wheelhouse: tonewheel organ (additive)
- **Idea:** drawbars, percussion and a rotating speaker.
- **Roles:** keys, pad.
- **Front (12):** 9 drawbar faders · Rotary (stop / slow / fast, a big rotary switch) · Vib / Chorus selector
  (off, V1-V3, C1-C3) · ★ Drive.

| ★ Control | Moves |
|---|---|
| Drive | Preamp overdrive + rotary horn level + key click |

- **Hidden voicing:** percussion (2nd / 3rd, fast / slow), click level, leakage.
- **Macros:** Drive · Rotary · Vib/Chorus · Drawbars 16' · 8' · 4' · 2' · Level.
- **Layout:** E, a drawbar fader bank.
- **Theme:** walnut wood, cream drawbar caps, a chrome rotary switch.
- **Presets:** 24 registrations.

### Pluck: physical modelling
- **Idea:** plucked and struck things: guitar, harp, kalimba, marimba, steel drum, bass guitar.
- **Roles:** pluck, keys, bass.
- **Front (7):** Body (list) · ★ Pick · ★ Wood ↔ Metal · ★ Damp · Decay · Room · Level.

| ★ Control | Moves |
|---|---|
| Pick | Excitation position + brightness + noise in the excitation |
| Wood ↔ Metal | Modal ratios (harmonic → inharmonic) + decay balance between partials |
| Damp | Loop-filter cutoff + string damping + palm-mute release |

- **Engine:** Karplus-Strong for strings, a modal bank for bars and drums.
- **Macros:** Pick · Wood↔Metal · Damp · Decay · Body · Room · (Brightness, hidden) · Level.
- **Layout:** C.
- **Theme:** carved light wood, inlaid labels.
- **Presets:** 28.

### Anthem: supersaw lead
- **Idea:** the huge festival lead.
- **Roles:** lead, pad.
- **Front (7):** ★ Size (big centre knob) · Edge · Wide · Duck · Stutter · Sub · Shine.
- **⚑ name check:** the brief's Twist / Diffuse / Pump / Repeat / Bottom are the Brussels gadget's whole front
  panel. The proposal is **Size, Edge, Wide, Duck, Stutter, Sub, Shine**. The concepts stay (supersaw thickness,
  spread, sidechain pump, repeat, sub, reverb), the names are ours.

| ★ Control | Moves |
|---|---|
| Size | Supersaw voices + detune + stereo spread + level compensation |

- **Engine:** reuses the Pump and Stutter performer from the shared library.
- **Macros:** Size · Edge · Wide · Duck · Stutter · Sub · Shine · Level.
- **Layout:** F, knobs ringed around the Size knob.
- **Theme:** gloss white with a magenta glow ring.
- **Presets:** 24.

### Patchwork: semi-modular bass
- **Idea:** a little patchable mono synth for deep basses.
- **Roles:** bass, lead, fx.
- **Front (10):** VCO 1 / VCO 2 / Noise levels · Cutoff · Peak · ★ Drive · Attack · Release ·
  MG 1 rate · MG 2 rate.
- **Patch cables (drawn):** MG 1, MG 2 and the EG each go to one jack: pitch, PW, VCO 2 pitch,
  levels, cutoff, VCA, MG rates. Drag a cable to re-patch.

| ★ Control | Moves |
|---|---|
| Drive | Pre-filter overdrive + post-filter saturation + a low shelf |

- **Macros:** Cutoff · Peak · Drive · VCO 2 level · MG 1 rate · MG 2 rate · Release · Level.
- **Layout:** K.
- **Theme:** wood cheeks, black panel, vintage chicken-head knobs, coloured cables.
- **Presets:** 24.

### Vox: formant synth
- **Idea:** voices without singers: choir pads and talking basses.
- **Roles:** pad, bass, lead.
- **Front (7):** Vowel XY pad (a-e-i-o-u) · ★ Throat · Breath · Choir (voices) · Attack · Release · Level.

| ★ Control | Moves |
|---|---|
| Throat | Formant shift (child ↔ giant) + glottal pulse shape + low resonance |

- **Macros:** Vowel X · Vowel Y · Throat · Breath · Choir · Attack · Release · Level.
- **Layout:** J, the vowel pad drawn as a retro microphone grille.
- **Theme:** chrome mic and a robot face.
- **Presets:** 24.

### Chop: loop slicer
- **Idea:** cut a breakbeat into 16 slices on pads.
- **Roles:** drums, fx.
- **Front (6):** Loop (list) · 16 slice pads over the waveform · Marker (move slice points) · ★ Repeat-roll ·
  ★ Warp · Level.

| ★ Control | Moves |
|---|---|
| Repeat-roll | Held pad retriggers at 1/8 → 1/32 + a pitch ramp |
| Warp | Time-stretch mode (tape ↔ granular) + grain size |

- **Loops:** CC0 breakbeats, plus your own (dropped in like the sampler).
- **Macros:** Warp · Repeat-roll · Loop · Slice tune · Slice decay · Filter (hidden) · Swing · Level.
- **Layout:** L.
- **Theme:** an orange MPC-ish panel with a dark waveform.
- **Presets:** 24 loops / kits.

### Boom: one-shot FX and stabs
- **Idea:** risers, impacts, sweeps and chord stabs that follow the song's key.
- **Roles:** fx, keys (stabs).
- **Front (6):** 4 part pads · ★ Rise · ★ Impact · Tune · Length · Level.

| ★ Control | Moves |
|---|---|
| Rise | Riser length (bars, tempo-synced) + filter sweep + noise level |
| Impact | Sub drop + reverb tail + distortion on hits |

- **Chord stabs** are pitched to the song's key and scale.
- **Macros:** Rise · Impact · Tune · Length · Part 1-3 level · Level.
- **Layout:** M, a speaker cone in the middle.
- **Theme:** a black sound-system cabinet with a yellow grille ring.
- **Presets:** 24.

### Garage: acoustic drums
- **Idea:** a real kit in a room.
- **Roles:** drums.
- **Front (6):** Kit · ★ Room · ★ Smash · Tune · Damp · Level.

| ★ Control | Moves |
|---|---|
| Room | Room-mic level + early reflections + tail |
| Smash | Parallel compression amount + release + saturation |

- **Samples:** CC0 acoustic kits (§7).
- **Macros:** Room · Smash · Kit · Tune · Damp · Kick level · Snare level · Level.
- **Layout:** N, wooden pads and brass knobs.
- **Theme:** oiled oak, brass.
- **Presets:** 24.

---

## 6. External track (Phase 5)

Not an instrument but a track type: notes, CCs and clock go out over Web MIDI (port + channel per
track) to a plugin (e.g. your Gadget VSTs in Ableton via a virtual cable). It records, edits and
arranges like any track. Its panel: port / channel pickers and **8 assignable CC knobs** (number +
label each), which record as automation like any knob.

## 7. Samples and licences

Only CC0 or permissive (CC-BY with credit) sources, listed in `public/kit/LICENSE.txt` and
`public/samples/LICENSE.txt` with source URLs. **I'll ask before downloading anything.**

Candidates to check (each licence verified on its own page before use):
- **Versilian Community Sample Library (VCSL):** CC0. Piano, keys, mallets, orchestral, some percussion.
- **VSCO 2 Community Edition:** CC0. Orchestral, piano (upright), percussion.
- **Salamander Grand Piano:** CC-BY 3.0 (needs credit). A full grand.
- **Freesound:** only CC0-licensed packs (each file checked). Breakbeats, drum kits, FX.
- Synthesised kits from `tools/make-kit.ts` (ours, CC0).

**Code:** no GPL. Karplus-Strong, modal synthesis, supersaw, formant filters and tonewheel additive
synthesis are textbook techniques, written from scratch.

## 8. Phases (from the brief) and status

1. **Note length + grid:** done and live (picker, split / join / legato / set length, grid lines,
   keys and pad equivalents, help).
2. **Randomness:** role tags, role-first Dice / NUDGE, freshness, share code v2, generated presets
   from recipes, Mutate.
3. **Redesign existing instruments, one at a time.** Suggested order: Squelch → Thump Lab → Kitbox →
   Chordette → Razor → Wobbler → Haze → Pixel → Glint → Morph → Grab.
4. **New instruments, one at a time.** Suggested order: Tine → Pluck → Wheelhouse → Anthem → Patchwork →
   Vox → Boom → Parlor → Garage → Chop (sample-based ones last, since they need downloads you approve).
5. **External track.**

Each step ends with a report and audio previews of every preset, plus a list of near-duplicates removed.

## 9. Open questions for you

1. **The ⚑ renames:** Snarl / Chew (Squelch), Size / Edge / Wide / Duck / Stutter / Sub / Shine (Anthem),
   Hop! / Dash! (Pixel), Grit (Wobbler), copper Morph, the Model names (Deep, Club, Tiny, Parlour, Hex).
   Keep, change, or suggest your own?
2. **Front-control counts:** Kitbox and Thump Lab have more than 12 controls if you count every channel or
   module. I've treated "front" as the master row plus per-part strips. OK?
3. **The MORE / XY pages:** remove them as each instrument is rebuilt (proposed), or straight away?
4. **Order of Phase 3 and 4:** as suggested in §8?
