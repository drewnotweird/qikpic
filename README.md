# QikPic — Avatar Maker (web)

Web remake of the QikPic AIR app (iOS/Android). Pure static site — vanilla
HTML/CSS/JS, no build step, no dependencies. All artwork is vector,
extracted from the original app's SWF.

**Live:** https://drewnotweird.co.uk/qikpic/

## Repo layout

```
index.html, app.js, style.css   the app
assets.js                       all avatar artwork (per-frame SVG fragments)
icons/                          panel button icons + wordmark (from the app's own buttons)
public/                         favicon, OG image, .htaccess (deployed alongside)
source/QikPic.swf               canonical source asset — every frame of art lives here
tools/                          SWF extraction pipeline (regenerates assets.js)
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
cycle that category; the dice does a slot-machine randomise; PNG/SVG
download the current avatar.

## Regenerating assets.js

```
python3 -m venv venv && venv/bin/pip install pillow
venv/bin/python tools/export_frames.py
```

Reads `source/QikPic.swf`, writes `assets.js`. The output is deterministic —
regenerating from the same SWF produces a byte-identical file.

Other tools: `swf2svg.py` (SWF shape/sprite/bitmap parser — the core
library), `swfscan.py` (tag inventory), `swftree.py` (sprite tree /
instance names / ABC strings).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: assembles the site
files into `dist/` and uploads via FTP to Fasthosts. Requires repo secrets
`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_SERVER_DIR` (same scheme
as [high-kings](https://github.com/drewnotweird/high-kings); trailing slash
on the dir is optional — the workflow normalises it).
