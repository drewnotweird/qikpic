#!/usr/bin/env python3
"""Export every frame of each avatar feature clip as SVG fragments into assets.js."""
import json, os, re, struct, sys
from swf2svg import (BR, load_swf, iter_tags, parse_shape, shape_body,
                     mat_str, read_matrix)

FEATURES = {   # sprite id -> (name, is_stencil)
    19:  ("skin", False),
    34:  ("natural", False),
    49:  ("mouth", False),
    78:  ("eyes", False),
    93:  ("nose", False),
    108: ("haircolour", False),
    123: ("hair", True),
    124: ("beardcolour", False),
    139: ("beard", True),
    153: ("accessories", False),
    167: ("glasses", False),
}
SHAPE_VER = {2: 1, 22: 2, 32: 3, 83: 4}

def parse_sprite_frames(data):
    br = BR(data)
    sid = br.ui16(); br.ui16()
    frames, current = [], {}
    pos = br.pos
    while pos < len(data) - 1:
        cl = struct.unpack_from("<H", data, pos)[0]
        code, ln = cl >> 6, cl & 0x3F; pos += 2
        if ln == 0x3F:
            ln = struct.unpack_from("<I", data, pos)[0]; pos += 4
        tag = data[pos:pos+ln]; pos += ln
        if code == 0:
            break
        if code == 1:
            frames.append(sorted(current.items()))
        elif code == 26:
            b = BR(tag)
            flags = b.ui8(); depth = b.ui16()
            cid = b.ui16() if flags & 2 else None
            m = read_matrix(b) if flags & 4 else (1, 0, 0, 1, 0, 0)
            if cid is not None:
                current[depth] = (cid, m)
        elif code == 28:
            b = BR(tag); current.pop(b.ui16(), None)
    return sid, frames

def main():
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    body = load_swf(os.path.join(repo, "source", "QikPic.swf"))
    shapes, all_sprites = {}, {}
    for code, data in iter_tags(body):
        if code in SHAPE_VER:
            s = parse_shape(data, SHAPE_VER[code])
            shapes[s["id"]] = s
        elif code == 39:
            sid, frames = parse_sprite_frames(data)
            all_sprites[sid] = frames

    # Some variants (e.g. every eyes frame) are nested sprites, not shapes —
    # resolve recursively via the nested sprite's first frame.
    def render_cid(cid, m, prefix, defs, seen):
        if cid in shapes:
            g = "".join(shape_body(shapes[cid], defs, prefix, {}))
        elif cid in all_sprites and all_sprites[cid] and cid not in seen:
            g = "".join(
                render_cid(c2, m2, f"{prefix}s{d}_", defs, seen | {cid})
                for d, (c2, m2) in all_sprites[cid][0])
        else:
            return ""
        if g and m != (1, 0, 0, 1, 0, 0):
            g = f'<g transform="{mat_str(m)}">{g}</g>'
        return g

    out = {}
    for sid, (name, stencil) in FEATURES.items():
        frames_svg = []
        for fi, placements in enumerate(all_sprites[sid]):
            defs, els = [], []
            for depth, (cid, m) in placements:
                g = render_cid(cid, m, f"{name}{fi}d{depth}_", defs, {sid})
                if g:
                    els.append(g)
            frag = (f"<defs>{''.join(defs)}</defs>" if defs else "") + "".join(els)
            frames_svg.append(frag)
        entry = {"frames": frames_svg}
        if stencil:
            # white version for use inside <mask> (luminance mask)
            white = []
            for frag in frames_svg:
                w = re.sub(r'fill="[^"]*"', 'fill="#fff"', frag)
                w = re.sub(r'stroke="[^"]*"', 'stroke="#fff"', w)
                w = re.sub(r'fill-opacity="[^"]*"', '', w)
                white.append(w)
            entry["mask"] = white
        out[name] = entry

    counts = {k: len(v["frames"]) for k, v in out.items()}
    print(counts)
    with open(os.path.join(repo, "assets.js"), "w") as f:
        f.write("const QIKPIK_ASSETS = ")
        json.dump(out, f)
        f.write(";\n")
    print("wrote assets.js")

if __name__ == "__main__":
    main()
