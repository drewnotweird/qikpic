# QikPic — Avatar Maker (web)

Web remake of the QikPic AIR app. Pure static site — vanilla HTML/CSS/JS,
no build step. All artwork is vector, extracted from the original app's SWF
into `assets.js` (per-frame SVG fragments) and `icons/` (panel button icons).

## Run locally

```
node server.js
```

Serves on http://localhost:8791.

## How it works

The avatar is an SVG layer stack matching the original `face_mc` timeline:
skin → natural → mouth → eyes → nose → hair colour → beard colour →
extras → glasses. Hair and beard are stencil shapes used as SVG luminance
masks over the colour squares, reproducing the original app's runtime
`mask` assignments. Tap a tile (or the avatar) to cycle that category.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which uploads the
site via FTP to Fasthosts. Requires repo secrets `FTP_SERVER`,
`FTP_USERNAME`, `FTP_PASSWORD`, `FTP_SERVER_DIR` (same scheme as
[high-kings](https://github.com/drewnotweird/high-kings)).

## Regenerating assets

`tools/` holds the SWF extraction pipeline (pure Python + Pillow):
`swf2svg.py` (shape/sprite/bitmap parser) and `export_frames.py`
(writes `assets.js` from `QikPic.swf`).
