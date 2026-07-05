#!/usr/bin/env python3
"""Inventory the tags inside a SWF file."""
import sys, zlib, struct
from collections import Counter

TAG_NAMES = {
    0: "End", 1: "ShowFrame", 2: "DefineShape", 4: "PlaceObject",
    6: "DefineBits(JPEG)", 8: "JPEGTables", 9: "SetBackgroundColor",
    10: "DefineFont", 11: "DefineText", 13: "DefineFontInfo",
    14: "DefineSound", 20: "DefineBitsLossless", 21: "DefineBitsJPEG2",
    22: "DefineShape2", 26: "PlaceObject2", 28: "RemoveObject2",
    32: "DefineShape3", 33: "DefineText2", 35: "DefineBitsJPEG3",
    36: "DefineBitsLossless2", 37: "DefineEditText", 39: "DefineSprite",
    43: "FrameLabel", 46: "DefineMorphShape", 48: "DefineFont2",
    56: "ExportAssets", 64: "EnableDebugger2", 65: "ScriptLimits",
    69: "FileAttributes", 70: "PlaceObject3", 71: "ImportAssets2",
    73: "DefineFontAlignZones", 74: "CSMTextSettings", 75: "DefineFont3",
    76: "SymbolClass", 77: "Metadata", 78: "DefineScalingGrid",
    82: "DoABC", 83: "DefineShape4", 84: "DefineMorphShape2",
    86: "DefineSceneAndFrameLabelData", 87: "DefineBinaryData",
    88: "DefineFontName", 90: "DefineBitsJPEG4", 91: "DefineFont4",
}

def load_swf(path):
    raw = open(path, "rb").read()
    sig = raw[:3]
    if sig == b"CWS":
        body = zlib.decompress(raw[8:])
    elif sig == b"ZWS":
        import lzma
        # SWF-LZMA: 4-byte uncompressed len then raw LZMA stream w/ 5-byte props
        props = raw[12:17]
        filt = lzma._decode_filter_properties(lzma.FILTER_LZMA1, props)
        dec = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[filt])
        body = dec.decompress(raw[17:])
    elif sig == b"FWS":
        body = raw[8:]
    else:
        raise ValueError(f"not a SWF: {sig}")
    return body

def rect_bits(body, pos):
    nbits = body[pos] >> 3
    total_bits = 5 + nbits * 4
    return pos + (total_bits + 7) // 8

def iter_tags(body, pos):
    while pos < len(body) - 1:
        code_len = struct.unpack_from("<H", body, pos)[0]
        code, length = code_len >> 6, code_len & 0x3F
        pos += 2
        if length == 0x3F:
            length = struct.unpack_from("<I", body, pos)[0]
            pos += 4
        yield code, pos, length
        pos += length
        if code == 0:
            break

def main(path):
    body = load_swf(path)
    pos = rect_bits(body, 0)
    pos += 4  # framerate + framecount
    counts = Counter()
    sizes = Counter()
    for code, tpos, length in iter_tags(body, pos):
        name = TAG_NAMES.get(code, f"tag{code}")
        counts[name] += 1
        sizes[name] += length
    print(f"{path}  (body {len(body)} bytes)")
    for name, n in counts.most_common():
        print(f"  {name:32s} x{n:<5d} {sizes[name]:>10,d} bytes")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        main(p)
        print()
