/* QikPik web avatar maker — composes SVG layers extracted from the original app. */
(() => {
  const A = QIKPIK_ASSETS;

  // Layer stack order matches the original face_mc timeline (bottom → top).
  const LAYERS = [
    "skin", "natural", "mouth", "eyes", "nose",
    "haircolour", "beardcolour", "accessories", "glasses",
  ];

  // Category tiles: feature key, label, tile colour (per layout reference).
  const TILES = [
    ["skin", "Skin", "#d95757"],
    ["natural", "Natural", "#dd8047"],
    ["eyes", "Eyes", "#d9a938"],
    ["nose", "Nose", "#a2c04b"],
    ["mouth", "Mouth", "#5cb87a"],
    ["hair", "Hair", "#4fb3ad"],
    ["haircolour", "Hair Colour", "#5585d7"],
    ["beard", "Beard", "#6a5acd"],
    ["accessories", "Extras", "#a45ad0"],
    ["glasses", "Glasses", "#cf5fa6"],
  ];

  const state = {};
  for (const key of Object.keys(A)) state[key] = 0;

  // Restore saved avatar
  try {
    const saved = JSON.parse(localStorage.getItem("qikpik-avatar") || "{}");
    for (const k of Object.keys(saved)) {
      if (k in state && saved[k] >= 0 && saved[k] < A[k].frames.length) state[k] = saved[k];
    }
  } catch (e) { /* fresh start */ }

  const $ = (id) => document.getElementById(id);

  function renderAvatar() {
    state.beardcolour = state.haircolour;  // beard always matches hair colour
    for (const key of LAYERS) {
      $("L_" + key).innerHTML = A[key].frames[state[key]];
    }
    $("hairMaskArt").innerHTML = A.hair.mask[state.hair];
    $("beardMaskArt").innerHTML = A.beard.mask[state.beard];
    localStorage.setItem("qikpik-avatar", JSON.stringify(state));
  }

  /* ---------- options grid ---------- */
  let activeKey = "skin";

  function buildGrid() {
    const grid = $("grid");
    grid.innerHTML = "";
    for (const [key, label, colour] of TILES) {
      const tile = document.createElement("button");
      tile.className = "qp-grid__tile" +
        (key === activeKey ? " qp-grid__tile--active" : "");
      tile.style.background = colour;
      const n = A[key].frames.length;
      const i = state[key];
      const isEmpty = A[key].frames[i].trim() === "";
      tile.innerHTML = `<span class="qp-grid__label">${label}</span>` +
        `<span class="qp-grid__count">${isEmpty ? "none" : `${i + 1} / ${n}`}</span>`;
      tile.onclick = () => {
        activeKey = key;
        cycle(key);
      };
      grid.appendChild(tile);
    }
  }

  // Tap a tile (or the avatar) to flip to the next variant — like the
  // original app's hitzone.
  function cycle(key) {
    const n = A[key].frames.length;
    state[key] = (state[key] + 1) % n;
    renderAvatar();
    buildGrid();
  }

  $("avatar").addEventListener("click", () => cycle(activeKey));

  /* ---------- actions ---------- */
  let randomising = false;
  $("btnRandom").onclick = () => {
    if (randomising) return;
    randomising = true;
    const steps = 8;
    const spin = (n) => {
      for (const key of Object.keys(A)) {
        state[key] = Math.floor(Math.random() * A[key].frames.length);
      }
      renderAvatar();
      if (n >= steps) {
        randomising = false;
        buildGrid();
        return;
      }
      // slot-machine feel: quick flips that slow to a stop
      setTimeout(() => spin(n + 1), 60 + n * 30);
    };
    spin(0);
  };

  function fullSvgString() {
    const svg = $("avatar");
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML;
  }

  $("btnSvg").onclick = () => {
    const blob = new Blob([fullSvgString()], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "qikpik-avatar.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $("btnPng").onclick = () => {
    const blob = new Blob([fullSvgString()], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 1024;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(img, 0, 0, 1024, 1024);
      URL.revokeObjectURL(url);
      c.toBlob((png) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = "qikpik-avatar.png";
        a.click();
        URL.revokeObjectURL(a.href);
      });
    };
    img.src = url;
  };

  /* ---------- boot ---------- */
  renderAvatar();
  buildGrid();

  // debug/testing hook
  window.__qp = {
    state,
    setAll(i) {
      for (const k of Object.keys(A)) state[k] = Math.min(i, A[k].frames.length - 1);
      renderAvatar(); buildGrid();
    },
    set(k, i) { state[k] = i; renderAvatar(); buildGrid(); },
  };
})();
