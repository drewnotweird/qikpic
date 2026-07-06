# QikPic — Avatar Maker (web)

Web remake of the QikPic AIR app (iOS/Android). Pure static site — vanilla
HTML/CSS/JS, no build step, no dependencies. All artwork is vector,
extracted from the original app's SWF.

**Live:** https://drewnotweird.co.uk/qikpic/

## Repo layout

```
index.html, app.js, style.css   the app
assets.js                       runtime art bundle — BUILT from art/, don't hand-edit
art/                            every feature frame as an editable standalone SVG
icons/                          panel button icons + wordmarks (from the app's own buttons)
public/                         favicon, OG image, .htaccess (deployed alongside)
source/QikPic.swf               original source asset (the art was extracted from here)
tools/                          extraction + build pipeline
ruffle-test/                    dev harness: original avatar in Ruffle for comparison
docs/                           reference images (original panel design)
server.js                       tiny static server for local dev
```

## Run locally

```
node server.js        # serves on http://localhost:8791
```

## How the avatar works

The avatar is an SVG layer stack matching the original `face_mc` timeline
(bottom → top): skin, natural, mouth, eyes, nose, hair colour, beard
colour, extras, glasses. Skin and the two colour layers are full-canvas
colour squares. "Hair" is a stencil (a square with the head silhouette cut
out) used as an SVG luminance mask over the hair-colour square — so the
colour becomes the background and the skin shows through the hole. "Beard"
is a direct silhouette stencil masking the beard colour. This reproduces
the original app's runtime `mask` assignments exactly.

Beard colour always follows hair colour. Tap a tile (or the avatar) to
cycle that category; long-press or right-click cycles backwards; arrow
keys work too (left/right = cycle, up/down = switch category). The dice
does a slot-machine randomise. The avatar state lives in the URL hash,
so sharing the link reproduces the avatar. Installable as a PWA and
works offline after the first visit (service worker, https only).

`scripts/smoke.js` runs in CI before every deploy (syntax, asset
integrity, referenced files, server check). The deploy stamps the commit
sha into the `?v=` cache-busting query strings and the service-worker
cache name.

## Editing the artwork

`art/<feature>/<feature>-NN.svg` is the editable source of truth — one
640×640 SVG per variant, all sharing the avatar's coordinate space, so
every layer overlays correctly. Edit in Illustrator/Inkscape/anything,
then rebuild the runtime bundle:

```
python3 tools/build_assets.py     # art/ -> assets.js (no dependencies)
```

Notes:
- File order within a folder = variant order in the app (NN suffix).
- `hair/` and `beard/` are stencils: the app derives their white mask
  variants automatically at build time.
- An empty `<svg>` file is a valid "none" variant.

## Re-extracting from the original SWF

The art was originally extracted from `source/QikPic.swf`:

```
python3 -m venv venv && venv/bin/pip install pillow
venv/bin/python tools/export_frames.py   # SWF -> assets.js
python3 tools/export_art.py              # assets.js -> art/ SVG files
```

Both steps are deterministic (byte-identical output from the same input).
Other tools: `swf2svg.py` (SWF shape/sprite/bitmap parser — the core
library), `swfscan.py` (tag inventory), `swftree.py` (sprite tree /
instance names / ABC strings).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: assembles the site
files into `dist/` and uploads via FTP to Fasthosts. Requires repo secrets
`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_SERVER_DIR` (same scheme
as [high-kings](https://github.com/drewnotweird/high-kings); trailing slash
on the dir is optional — the workflow normalises it).
