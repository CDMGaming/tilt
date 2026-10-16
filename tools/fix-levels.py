# Trims preset levels so a loud chord (tools/stress.ts) never peaks past a cap at the track output.
# Run: deno run -A --sloppy-imports tools/stress.ts --json > stress.json && python tools/fix-levels.py stress.json
import json, re, sys

peaks = json.load(open(sys.argv[1], encoding="utf-8-sig"))
CAP = {"drums": 0.9, "analog": 0.9, "boom": 0.9, "garage": 0.9, "chop": 0.9}  # every drum part at once is extreme; synths: 0.7 on a 4-note chord
DEFS = {
    "drums": ("src/engine/instruments.ts", "DRUMS"), "acid": ("src/engine/instruments.ts", "ACID"), "poly": ("src/engine/instruments.ts", "POLY"),
    "lead": ("src/engine/instruments2.ts", "LEAD"), "analog": ("src/engine/instruments2.ts", "ANALOG"), "wobble": ("src/engine/instruments2.ts", "WOBBLE"),
    "pad": ("src/engine/instruments2.ts", "PAD"), "chip": ("src/engine/instruments3.ts", "CHIP"), "fm": ("src/engine/instruments3.ts", "FM"),
    "wave": ("src/engine/instruments3.ts", "WAVE"), "sampler": ("src/engine/instruments3.ts", "SAMPLER"), "epiano": ("src/engine/instruments4.ts", "TINE"),
    "pluck": ("src/engine/instruments4.ts", "PLUCK"), "organ": ("src/engine/instruments4.ts", "ORGAN"), "anthem": ("src/engine/instruments4.ts", "ANTHEM"), "patch": ("src/engine/instruments4.ts", "PATCHWORK"), "vox": ("src/engine/instruments4.ts", "VOX"), "boom": ("src/engine/instruments4.ts", "BOOM"), "piano": ("src/engine/instruments4.ts", "PARLOR"), "garage": ("src/engine/instruments4.ts", "GARAGE"), "chop": ("src/engine/instruments4.ts", "CHOP"),
}
files = {}
changed = 0
for kind, rows in peaks.items():
    path, const = DEFS[kind]
    s = files.get(path) or open(path, encoding="utf-8").read()
    a = s.index(f"export const {const}: InstrumentDef")
    b = s.index("\n};\n", a)
    block = s[a:b]
    cap = CAP.get(kind, 0.7)
    for r in rows:
        if r["peak"] <= cap:
            continue
        new = round(r["level"] * cap / r["peak"], 2)
        # The preset's line: its quoted name, then (on the same line) a level to replace or insert.
        m = re.search(r'[^\n]*"' + re.escape(r["name"]) + r'"[^\n]*', block)
        assert m, (kind, r["name"])
        line = m.group(0)
        if re.search(r"\blevel: [0-9.]+", line):
            line2 = re.sub(r"\blevel: [0-9.]+", f"level: {new:.2f}", line, count=1)
        else:
            i = line.index("{", line.index('"' + r["name"] + '"'))
            line2 = line[: i + 1] + f" level: {new:.2f}," + line[i + 1:]
            line2 = line2.replace(f"level: {new:.2f}, }}", f"level: {new:.2f} }}")
        block = block.replace(line, line2, 1)
        changed += 1
        print(f"{kind:8} {r['name']:20} peak {r['peak']:.2f} -> level {r['level']:.2f} -> {new:.2f}")
    s = s[:a] + block + s[b:]
    files[path] = s
for path, s in files.items():
    open(path, "w", encoding="utf-8").write(s)
print(changed, "presets trimmed")
