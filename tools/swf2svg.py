#!/usr/bin/env python3
"""Extract vector shapes (as SVG), bitmaps (as PNG) and sprites (as composite SVG)
from a SWF file. Pure Python + Pillow."""
import sys, os, zlib, struct
from PIL import Image

TWIP = 20.0

# ---------------------------------------------------------------- bit reader
class BR:
    def __init__(self, data, pos=0):
        self.d = data
        self.pos = pos      # byte position
        self.bit = 0        # bit position within byte

    def align(self):
        if self.bit:
            self.pos += 1
            self.bit = 0

    def ub(self, n):
        v = 0
        for _ in range(n):
            byte = self.d[self.pos]
            v = (v << 1) | ((byte >> (7 - self.bit)) & 1)
            self.bit += 1
            if self.bit == 8:
                self.bit = 0
                self.pos += 1
        return v

    def sb(self, n):
        v = self.ub(n)
        if n and (v & (1 << (n - 1))):
            v -= 1 << n
        return v

    def fb(self, n):  # 16.16 fixed
        return self.sb(n) / 65536.0

    def ui8(self):
        self.align(); v = self.d[self.pos]; self.pos += 1; return v

    def ui16(self):
        self.align(); v = struct.unpack_from("<H", self.d, self.pos)[0]; self.pos += 2; return v

    def ui32(self):
        self.align(); v = struct.unpack_from("<I", self.d, self.pos)[0]; self.pos += 4; return v

    def bytes(self, n):
        self.align(); v = self.d[self.pos:self.pos + n]; self.pos += n; return v

def read_rect(br):
    br.align()
    n = br.ub(5)
    xmin, xmax, ymin, ymax = br.sb(n), br.sb(n), br.sb(n), br.sb(n)
    br.align()
    return xmin, xmax, ymin, ymax

def read_matrix(br):
    br.align()
    a = d = 1.0
    b = c = 0.0
    if br.ub(1):
        n = br.ub(5); a = br.fb(n); d = br.fb(n)
    if br.ub(1):
        n = br.ub(5); b = br.fb(n); c = br.fb(n)
    n = br.ub(5)
    tx = br.sb(n) / TWIP
    ty = br.sb(n) / TWIP
    br.align()
    # SVG matrix(a b c d e f):  x' = a*x + c*y + e
    return (a, b, c, d, tx, ty)

def read_rgb(br, alpha):
    r, g, b = br.ui8(), br.ui8(), br.ui8()
    a = br.ui8() / 255.0 if alpha else 1.0
    return (r, g, b, a)

# ---------------------------------------------------------------- styles
def read_gradient(br, alpha, focal):
    br.align()
    spread = br.ub(2); interp = br.ub(2); n = br.ub(4)
    stops = []
    for _ in range(n):
        ratio = br.ui8()
        stops.append((ratio / 255.0, read_rgb(br, alpha)))
    fp = None
    if focal:
        fp = struct.unpack("<h", br.bytes(2))[0] / 256.0
    return {"spread": spread, "stops": stops, "focal": fp}

def read_fillstyles(br, ver):
    n = br.ui8()
    if n == 0xFF and ver >= 2:
        n = br.ui16()
    styles = []
    alpha = ver >= 3
    for _ in range(n):
        t = br.ui8()
        if t == 0x00:
            styles.append({"type": "solid", "color": read_rgb(br, alpha)})
        elif t in (0x10, 0x12, 0x13):
            m = read_matrix(br)
            g = read_gradient(br, alpha, t == 0x13)
            g["type"] = "linear" if t == 0x10 else "radial"
            g["matrix"] = m
            styles.append(g)
        elif t in (0x40, 0x41, 0x42, 0x43):
            bid = br.ui16()
            m = read_matrix(br)
            styles.append({"type": "bitmap", "id": bid, "matrix": m,
                           "repeat": t in (0x40, 0x42)})
        else:
            raise ValueError(f"unknown fill type 0x{t:02x}")
    return styles

def read_linestyles(br, ver):
    n = br.ui8()
    if n == 0xFF:
        n = br.ui16()
    styles = []
    for _ in range(n):
        w = br.ui16()
        if ver == 4:
            flags = br.ui16()
            join = (flags >> 12) & 3      # bits: start(2) join(2) hasfill ...
            has_fill = (flags >> 11) & 1
            if join == 2:
                br.ui16()  # miter limit
            if has_fill:
                fs = read_fillstyles.__wrapped__ if False else None
                # read a single FILLSTYLE
                fill = read_one_fill(br, ver)
                color = fill.get("color", (128, 128, 128, 1.0))
            else:
                color = read_rgb(br, True)
        else:
            color = read_rgb(br, ver >= 3)
        styles.append({"width": w / TWIP, "color": color})
    return styles

def read_one_fill(br, ver):
    t = br.ui8()
    alpha = ver >= 3
    if t == 0x00:
        return {"type": "solid", "color": read_rgb(br, alpha)}
    if t in (0x10, 0x12, 0x13):
        m = read_matrix(br)
        g = read_gradient(br, alpha, t == 0x13)
        g["type"] = "linear" if t == 0x10 else "radial"
        g["matrix"] = m
        return g
    if t in (0x40, 0x41, 0x42, 0x43):
        bid = br.ui16(); m = read_matrix(br)
        return {"type": "bitmap", "id": bid, "matrix": m, "repeat": t in (0x40, 0x42)}
    raise ValueError(f"unknown fill type 0x{t:02x}")

# ---------------------------------------------------------------- shape parsing
def parse_shape(data, ver):
    br = BR(data)
    sid = br.ui16()
    bounds = read_rect(br)
    if ver == 4:
        read_rect(br)   # edge bounds
        br.ui8()        # flags
    fills = read_fillstyles(br, ver)
    lines = read_linestyles(br, ver)
    nf = br.ub(4); nl = br.ub(4)

    # style "groups" — NewStyles resets the arrays
    groups = [{"fills": fills, "lines": lines}]
    gi = 0
    x = y = 0                     # twips
    f0 = f1 = ls = 0
    # edges collected per (group, styleindex)
    fill_edges = {}               # key -> list of (from, to, ctrl|None)
    line_edges = {}

    def add(dic, key, seg):
        dic.setdefault(key, []).append(seg)

    while True:
        if br.ub(1) == 0:                      # non-edge record
            flags = br.ub(5)
            if flags == 0:
                break
            if flags & 1:                      # move
                n = br.ub(5)
                x = br.sb(n); y = br.sb(n)
            if flags & 2:
                f0 = br.ub(nf)
            if flags & 4:
                f1 = br.ub(nf)
            if flags & 8:
                ls = br.ub(nl)
            if flags & 16:                     # new styles
                fills = read_fillstyles(br, ver)
                lines = read_linestyles(br, ver)
                nf = br.ub(4); nl = br.ub(4)
                groups.append({"fills": fills, "lines": lines})
                gi += 1
                f0 = f1 = ls = 0
        else:                                  # edge record
            straight = br.ub(1)
            n = br.ub(4) + 2
            x0, y0 = x, y
            if straight:
                if br.ub(1):                   # general line
                    x += br.sb(n); y += br.sb(n)
                elif br.ub(1):                 # vertical
                    y += br.sb(n)
                else:
                    x += br.sb(n)
                seg = ((x0, y0), (x, y), None)
            else:
                cx = x0 + br.sb(n); cy = y0 + br.sb(n)
                x = cx + br.sb(n); y = cy + br.sb(n)
                seg = ((x0, y0), (x, y), (cx, cy))
            if f0:
                add(fill_edges, (gi, f0), (seg[1], seg[0],
                                           seg[2]))          # reversed
            if f1:
                add(fill_edges, (gi, f1), seg)
            if ls:
                add(line_edges, (gi, ls), seg)
    return {"id": sid, "bounds": bounds, "groups": groups,
            "fill_edges": fill_edges, "line_edges": line_edges}

# ---------------------------------------------------------------- path building
def chain(segs):
    """Chain segments into subpaths (list of segment lists)."""
    from collections import defaultdict
    start = defaultdict(list)
    for s in segs:
        start[s[0]].append(s)
    used = set()
    paths = []
    for s in segs:
        if id(s) in used:
            continue
        used.add(id(s))
        path = [s]
        while True:
            nxt = None
            for cand in start.get(path[-1][1], []):
                if id(cand) not in used:
                    nxt = cand
                    break
            if nxt is None:
                break
            used.add(id(nxt))
            path.append(nxt)
            if nxt[1] == path[0][0]:
                break
        paths.append(path)
    return paths

def fmt(v):
    s = f"{v / TWIP:.2f}".rstrip("0").rstrip(".")
    return s if s else "0"

def path_d(subpaths, close):
    out = []
    for p in subpaths:
        out.append(f"M{fmt(p[0][0][0])} {fmt(p[0][0][1])}")
        for (_, to, ctrl) in p:
            if ctrl is None:
                out.append(f"L{fmt(to[0])} {fmt(to[1])}")
            else:
                out.append(f"Q{fmt(ctrl[0])} {fmt(ctrl[1])} {fmt(to[0])} {fmt(to[1])}")
        if close and p[-1][1] == p[0][0]:
            out.append("Z")
    return " ".join(out)

def css(color):
    r, g, b, a = color
    if a >= 1.0:
        return f"#{r:02x}{g:02x}{b:02x}", None
    return f"#{r:02x}{g:02x}{b:02x}", f"{a:.3f}"

def mat_str(m):
    return "matrix(%.5f %.5f %.5f %.5f %.2f %.2f)" % m

# ---------------------------------------------------------------- SVG output
def shape_body(shape, defs, prefix, images):
    """Return svg elements (string) for a parsed shape; appends gradient/pattern defs."""
    el = []
    # fills first (painter order: by style index within group order)
    for key in sorted(shape["fill_edges"].keys()):
        gi, idx = key
        style = shape["groups"][gi]["fills"][idx - 1]
        subs = chain(shape["fill_edges"][key])
        d = path_d(subs, close=True)
        if style["type"] == "solid":
            col, op = css(style["color"])
            o = f' fill-opacity="{op}"' if op else ""
            el.append(f'<path d="{d}" fill="{col}"{o}/>')
        elif style["type"] in ("linear", "radial"):
            gid = f"{prefix}g{gi}_{idx}"
            stops = "".join(
                f'<stop offset="{r:.3f}" stop-color="{css(c)[0]}"'
                + (f' stop-opacity="{c[3]:.3f}"' if c[3] < 1 else "") + "/>"
                for r, c in style["stops"])
            gt = mat_str(style["matrix"])
            if style["type"] == "linear":
                defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" '
                            f'x1="-819.2" x2="819.2" gradientTransform="{gt}">{stops}</linearGradient>')
            else:
                fx = ""
                if style.get("focal"):
                    fx = f' fx="{819.2 * style["focal"]:.1f}" fy="0"'
                defs.append(f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" '
                            f'cx="0" cy="0" r="819.2"{fx} gradientTransform="{gt}">{stops}</radialGradient>')
            el.append(f'<path d="{d}" fill="url(#{gid})"/>')
        elif style["type"] == "bitmap":
            img = images.get(style["id"])
            if img:
                pid = f"{prefix}p{gi}_{idx}"
                w, h, fname = img
                defs.append(
                    f'<pattern id="{pid}" patternUnits="userSpaceOnUse" width="{w}" height="{h}" '
                    f'patternTransform="{mat_str(style["matrix"])}">'
                    f'<image href="{fname}" width="{w}" height="{h}"/></pattern>')
                el.append(f'<path d="{d}" fill="url(#{pid})"/>')
            else:
                el.append(f'<path d="{d}" fill="#888"/>')
    # strokes on top
    for key in sorted(shape["line_edges"].keys()):
        gi, idx = key
        style = shape["groups"][gi]["lines"][idx - 1]
        subs = chain(shape["line_edges"][key])
        d = path_d(subs, close=False)
        col, op = css(style["color"])
        o = f' stroke-opacity="{op}"' if op else ""
        w = max(style["width"], 0.05)
        el.append(f'<path d="{d}" fill="none" stroke="{col}"{o} stroke-width="{w:.2f}" '
                  f'stroke-linecap="round" stroke-linejoin="round"/>')
    return el

def write_svg(path, shape, images, extra_pad=2):
    xmin, xmax, ymin, ymax = [v / TWIP for v in shape["bounds"]]
    w, h = xmax - xmin, ymax - ymin
    if w <= 0 or h <= 0:
        w = max(w, 1); h = max(h, 1)
    defs = []
    el = shape_body(shape, defs, "s", images)
    d = f"<defs>{''.join(defs)}</defs>" if defs else ""
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" '
           f'viewBox="{xmin:.2f} {ymin:.2f} {w:.2f} {h:.2f}" '
           f'width="{w:.1f}" height="{h:.1f}">{d}{"".join(el)}</svg>')
    open(path, "w").write(svg)

# ---------------------------------------------------------------- bitmaps
def export_lossless(data, code, outdir):
    br = BR(data)
    cid = br.ui16()
    fmt_ = br.ui8()
    w = br.ui16(); h = br.ui16()
    alpha = code == 36
    if fmt_ == 3:
        ctsize = br.ui8() + 1
        raw = zlib.decompress(data[br.pos:])
        csize = 4 if alpha else 3
        table = raw[:ctsize * csize]
        pix = raw[ctsize * csize:]
        stride = (w + 3) & ~3
        img = Image.new("RGBA", (w, h))
        px = img.load()
        for yy in range(h):
            for xx in range(w):
                i = pix[yy * stride + xx] * csize
                if alpha:
                    px[xx, yy] = (table[i], table[i+1], table[i+2], table[i+3])
                else:
                    px[xx, yy] = (table[i], table[i+1], table[i+2], 255)
    elif fmt_ == 5:
        raw = zlib.decompress(data[br.pos:])
        img = Image.new("RGBA", (w, h))
        px = img.load()
        for yy in range(h):
            for xx in range(w):
                i = (yy * w + xx) * 4
                a, r, g, b = raw[i], raw[i+1], raw[i+2], raw[i+3]
                if alpha:
                    if a:  # un-premultiply
                        r = min(255, r * 255 // a)
                        g = min(255, g * 255 // a)
                        b = min(255, b * 255 // a)
                    px[xx, yy] = (r, g, b, a)
                else:
                    px[xx, yy] = (r, g, b, 255)
    else:
        return cid, None
    fname = f"bitmap_{cid}.png"
    img.save(os.path.join(outdir, fname))
    return cid, (w, h, fname)

# ---------------------------------------------------------------- swf container
def load_swf(path):
    raw = open(path, "rb").read()
    sig = raw[:3]
    if sig == b"CWS":
        return zlib.decompress(raw[8:])
    if sig == b"FWS":
        return raw[8:]
    if sig == b"ZWS":
        import lzma
        filt = lzma._decode_filter_properties(lzma.FILTER_LZMA1, raw[12:17])
        dec = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[filt])
        return dec.decompress(raw[17:])
    raise ValueError("not a SWF")

def iter_tags(body):
    br = BR(body)
    read_rect(br)
    br.ui16(); br.ui16()   # framerate, framecount
    pos = br.pos
    while pos < len(body) - 1:
        code_len = struct.unpack_from("<H", body, pos)[0]
        code, length = code_len >> 6, code_len & 0x3F
        pos += 2
        if length == 0x3F:
            length = struct.unpack_from("<I", body, pos)[0]
            pos += 4
        yield code, body[pos:pos + length]
        pos += length
        if code == 0:
            break

def parse_symbol_class(data):
    br = BR(data)
    n = br.ui16()
    names = {}
    for _ in range(n):
        tid = br.ui16()
        end = data.index(b"\0", br.pos)
        names[tid] = data[br.pos:end].decode("utf-8", "replace")
        br.pos = end + 1
    return names

def parse_sprite(data):
    br = BR(data)
    sid = br.ui16(); br.ui16()   # frame count
    places = []
    pos = br.pos
    while pos < len(data) - 1:
        code_len = struct.unpack_from("<H", data, pos)[0]
        code, length = code_len >> 6, code_len & 0x3F
        pos += 2
        if length == 0x3F:
            length = struct.unpack_from("<I", data, pos)[0]
            pos += 4
        tag = data[pos:pos + length]
        pos += length
        if code == 1:   # ShowFrame — only frame 1
            break
        if code == 26:  # PlaceObject2
            b2 = BR(tag)
            flags = b2.ui8()
            depth = b2.ui16()
            cid = b2.ui16() if flags & 2 else None
            m = read_matrix(b2) if flags & 4 else (1, 0, 0, 1, 0, 0)
            if cid is not None:
                places.append((depth, cid, m))
        if code == 0:
            break
    places.sort(key=lambda p: p[0])
    return sid, places

# ---------------------------------------------------------------- main
def main(swf_path, outdir):
    os.makedirs(outdir, exist_ok=True)
    sh_dir = os.path.join(outdir, "shapes"); os.makedirs(sh_dir, exist_ok=True)
    im_dir = os.path.join(outdir, "images"); os.makedirs(im_dir, exist_ok=True)
    sp_dir = os.path.join(outdir, "sprites"); os.makedirs(sp_dir, exist_ok=True)

    body = load_swf(swf_path)
    shapes, images, sprites, names = {}, {}, {}, {}
    SHAPE_VER = {2: 1, 22: 2, 32: 3, 83: 4}
    for code, data in iter_tags(body):
        try:
            if code in SHAPE_VER:
                s = parse_shape(data, SHAPE_VER[code])
                shapes[s["id"]] = s
            elif code in (20, 36):
                cid, info = export_lossless(data, code, im_dir)
                if info:
                    images[cid] = info
            elif code == 39:
                sid, places = parse_sprite(data)
                sprites[sid] = places
            elif code == 76:
                names.update(parse_symbol_class(data))
        except Exception as e:
            print(f"  ! tag {code}: {e}")

    # images dict for shape fills needs relative path from shapes/ dir
    img_rel = {k: (w, h, f"../images/{f}") for k, (w, h, f) in images.items()}
    for sid, s in shapes.items():
        try:
            write_svg(os.path.join(sh_dir, f"shape_{sid}.svg"), s, img_rel)
        except Exception as e:
            print(f"  ! shape {sid}: {e}")

    # sprites: compose from shapes (and nested sprites, one level deep at a time)
    def sprite_elements(places, defs, depth_prefix, seen):
        el = []
        for depth, cid, m in places:
            if cid in shapes:
                inner = shape_body(shapes[cid], defs, f"{depth_prefix}d{depth}_", img_rel)
                el.append(f'<g transform="{mat_str(m)}">{"".join(inner)}</g>')
            elif cid in sprites and cid not in seen:
                inner = sprite_elements(sprites[cid], defs, f"{depth_prefix}d{depth}_", seen | {cid})
                el.append(f'<g transform="{mat_str(m)}">{"".join(inner)}</g>')
        return el

    n_sprites = 0
    for sid, places in sprites.items():
        if not places:
            continue
        defs = []
        el = sprite_elements(places, defs, "", {sid})
        if not el:
            continue
        # bounds: union of placed shape bounds (transformed, corners only)
        pts = []
        def collect(places, m0):
            for depth, cid, m in places:
                mm = mul(m0, m)
                if cid in shapes:
                    x0, x1, y0, y1 = [v / TWIP for v in shapes[cid]["bounds"]]
                    for px, py in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
                        pts.append(apply_m(mm, px, py))
                elif cid in sprites:
                    collect(sprites[cid], mm)
        collect(places, (1, 0, 0, 1, 0, 0))
        if not pts:
            continue
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
        w, h = max(xmax - xmin, 1), max(ymax - ymin, 1)
        name = names.get(sid, "").split(".")[-1]
        fname = f"sprite_{sid}{'_' + name if name else ''}.svg"
        d = f"<defs>{''.join(defs)}</defs>" if defs else ""
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" '
               f'viewBox="{xmin:.2f} {ymin:.2f} {w:.2f} {h:.2f}" '
               f'width="{w:.1f}" height="{h:.1f}">{d}{"".join(el)}</svg>')
        open(os.path.join(sp_dir, fname), "w").write(svg)
        n_sprites += 1

    print(f"{swf_path}: {len(shapes)} shapes, {len(images)} images, {n_sprites} sprites"
          f" -> {outdir}")

def mul(m1, m2):
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (a1*a2 + c1*b2, b1*a2 + d1*b2,
            a1*c2 + c1*d2, b1*c2 + d1*d2,
            a1*e2 + c1*f2 + e1, b1*e2 + d1*f2 + f1)

def apply_m(m, x, y):
    a, b, c, d, e, f = m
    return (a*x + c*y + e, b*x + d*y + f)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
