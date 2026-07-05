# Ruffle ground-truth harness

Dev-only. Renders the original Flash avatar in [Ruffle](https://ruffle.rs)
so the web remake can be compared against the real thing.

- `face_stage.swf` — the original symbol library patched to place `face_mc`
  (the avatar composite) on a 640×640 stage. With no stop() code the
  timeline cycles every feature's variants; freeze it from the console with
  `document.querySelector("ruffle-player").suspended = true`.
- The full app (`source/QikPic.swf`) does not boot in Ruffle — its main
  class needs `flash.system.Worker.isPrimordial`, which Ruffle has not
  implemented.

The Ruffle web build is not checked in (28 MB). To use the harness, fetch a
self-hosted build into `ruffle-web/`:

```
curl -sL -o ruffle.zip "https://github.com/ruffle-rs/ruffle/releases/download/nightly-2026-06-24/ruffle-nightly-2026_06_24-web-selfhosted.zip"
unzip ruffle.zip -d ruffle-web && rm ruffle.zip
```

Then open http://localhost:8791/ruffle-test/ (with `node server.js` running).
