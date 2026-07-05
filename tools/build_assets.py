#!/usr/bin/env python3
"""Rebuild assets.js from the editable SVG files in art/.

art/<feature>/<feature>-NN.svg is the source of truth: edit those, run
this, and assets.js (the runtime bundle) is regenerated. Hair and beard
also get white "mask" variants derived automatically (they are stencils
used as SVG luminance masks).
"""
import json, os, re

repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Layer order matters to the app; keep it explicit.
FEATURES = ["skin", "natural", "mouth", "eyes", "nose", "haircolour",
            "hair", "beardcolour", "beard", "accessories", "glasses"]
STENCILS = {"hair", "beard"}

def inner_svg(path):
    s = open(path).read()
    m = re.search(r"<svg[^>]*>(.*)</svg>\s*$", s, re.S)
    if not m:
        raise ValueError(f"{path}: no <svg> wrapper found")
    return m.group(1).strip()

def whiten(frag):
    """Stencil -> luminance-mask art: all paint becomes opaque white."""
    w = re.sub(r'fill="[^"]*"', 'fill="#fff"', frag)
    w = re.sub(r'stroke="[^"]*"', 'stroke="#fff"', w)
    w = re.sub(r'fill-opacity="[^"]*"', '', w)
    return w

def main():
    out = {}
    for name in FEATURES:
        d = os.path.join(repo, "art", name)
        files = sorted(f for f in os.listdir(d) if f.endswith(".svg"))
        frames = [inner_svg(os.path.join(d, f)) for f in files]
        entry = {"frames": frames}
        if name in STENCILS:
            entry["mask"] = [whiten(f) for f in frames]
        out[name] = entry
        print(f"{name}: {len(frames)} frames")
    with open(os.path.join(repo, "assets.js"), "w") as f:
        f.write("const QIKPIK_ASSETS = ")
        json.dump(out, f)
        f.write(";\n")
    print("wrote assets.js")

if __name__ == "__main__":
    main()
