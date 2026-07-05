#!/usr/bin/env python3
"""Dump full sprite tree of a SWF: frames, placements, instance names, and ABC strings."""
import sys, struct
from swf2svg import BR, load_swf, iter_tags, read_matrix, read_rect, parse_symbol_class

def parse_sprite_full(data):
    br = BR(data)
    sid = br.ui16(); nframes = br.ui16()
    frames = []          # list of dicts depth -> (cid, name, matrix, has_ctf)
    current = {}
    pos = br.pos
    while pos < len(data) - 1:
        code_len = struct.unpack_from("<H", data, pos)[0]
        code, length = code_len >> 6, code_len & 0x3F
        pos += 2
        if length == 0x3F:
            length = struct.unpack_from("<I", data, pos)[0]; pos += 4
        tag = data[pos:pos + length]; pos += length
        if code == 0:
            break
        if code == 1:  # ShowFrame
            frames.append(dict(current))
        elif code == 26:  # PlaceObject2
            b = BR(tag)
            flags = b.ui8()
            depth = b.ui16()
            cid = b.ui16() if flags & 2 else None
            m = read_matrix(b) if flags & 4 else None
            has_ctf = False
            if flags & 8:  # CXFORMWITHALPHA
                b.align()
                has_add = b.ub(1); has_mult = b.ub(1); nb = b.ub(4)
                vals = []
                if has_mult: vals += [b.sb(nb) for _ in range(4)]
                if has_add: vals += [b.sb(nb) for _ in range(4)]
                has_ctf = True
            ratio = b.ui16() if flags & 16 else None
            name = None
            if flags & 32:
                b.align()
                end = tag.index(b"\0", b.pos)
                name = tag[b.pos:end].decode("utf-8", "replace")
            if flags & 1 and cid is None:  # move: modify existing
                old = current.get(depth)
                if old:
                    current[depth] = (old[0], name or old[1], m if m else old[2], has_ctf or old[3])
            else:
                current[depth] = (cid, name, m, has_ctf)
        elif code == 28:  # RemoveObject2
            b = BR(tag); depth = b.ui16()
            current.pop(depth, None)
    return sid, nframes, frames

def abc_strings(data):
    """Extract string constant pool from DoABC tag."""
    br = BR(data)
    br.ui32()  # flags
    end = data.index(b"\0", br.pos); br.pos = end + 1  # name
    br.ui16(); br.ui16()  # minor, major
    def u30():
        v = s = 0
        while True:
            b_ = data[br.pos]; br.pos += 1
            v |= (b_ & 0x7F) << s
            if not (b_ & 0x80): return v
            s += 7
    n = u30()
    for _ in range(max(0, n - 1)): u30()          # ints
    n = u30()
    for _ in range(max(0, n - 1)): u30()          # uints
    n = u30()
    br.pos += max(0, n - 1) * 8                    # doubles
    n = u30()
    out = []
    for _ in range(max(0, n - 1)):
        ln = u30()
        out.append(data[br.pos:br.pos + ln].decode("utf-8", "replace"))
        br.pos += ln
    return out

def main(path, mode):
    body = load_swf(path)
    names = {}
    sprites = {}
    root_places = []
    for code, data in iter_tags(body):
        if code == 39:
            sid, nf, frames = parse_sprite_full(data)
            sprites[sid] = (nf, frames)
        elif code == 76:
            names.update(parse_symbol_class(data))
        elif code == 26:
            b = BR(data)
            flags = b.ui8(); depth = b.ui16()
            cid = b.ui16() if flags & 2 else None
            root_places.append((depth, cid))
        elif code == 82 and mode == "abc":
            for s in abc_strings(data):
                print(s)
    if mode == "abc":
        return
    print("SymbolClass:", names)
    print("Root placements:", root_places)
    for sid in sorted(sprites):
        nf, frames = sprites[sid]
        nm = names.get(sid, "")
        interesting = nf > 1 or any(any(p[1] for p in f.values()) for f in frames)
        if mode == "all" or interesting:
            print(f"\nsprite {sid} {nm} frames={nf}")
            for i, f in enumerate(frames):
                items = ", ".join(
                    f"d{d}:{cid}{'~' + (name or '')}{'*' if ctf else ''}"
                    for d, (cid, name, m, ctf) in sorted(f.items()))
                print(f"  f{i+1}: {items}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "interesting")
