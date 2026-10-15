# Joins an instrument's preset previews into one file: docs/redesign8/<name>-all-presets.wav
# (rendered first by tools/preview.ts into docs/redesign8/<name>-audio). Not in git.
import sys, wave, glob
name = sys.argv[1]
files = sorted(glob.glob(f"docs/redesign8/{name}-audio/*.wav"))
out = wave.open(f"docs/redesign8/{name}-all-presets.wav", "wb"); gap = None
for f in files:
    w = wave.open(f, "rb")
    if gap is None:
        out.setparams(w.getparams()); gap = b"\x00" * (w.getsampwidth() * w.getnchannels() * int(w.getframerate() * 0.5))
    out.writeframes(w.readframes(w.getnframes())); out.writeframes(gap)
out.close()
print(len(files), "presets")
