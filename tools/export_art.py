#!/usr/bin/env python3
"""One-time export: write every feature frame as a standalone SVG in art/.

Each file is a full 640x640 canvas so all layers overlay in the same
coordinate space. After editing, run build_assets.py to rebuild assets.js.
"""
import json, os

repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    raw = open(os.path.join(repo, "assets.js")).read()
    data = json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
    for name, entry in data.items():
        outdir = os.path.join(repo, "art", name)
        os.makedirs(outdir, exist_ok=True)
        for i, frag in enumerate(entry["frames"]):
            path = os.path.join(outdir, f"{name}-{i + 1:02d}.svg")
            svg = ('<svg xmlns="http://www.w3.org/2000/svg" '
                   f'viewBox="0 0 640 640">{frag}</svg>')
            open(path, "w").write(svg)
        print(f"{name}: {len(entry['frames'])} files")

if __name__ == "__main__":
    main()
