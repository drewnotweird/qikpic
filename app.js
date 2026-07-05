/* QikPik web avatar maker — composes SVG layers extracted from the original app. */
(() => {
  const A = QIKPIK_ASSETS;

  // Layer stack order matches the original face_mc timeline (bottom → top).
  const LAYERS = [
    "skin", "natural", "mouth", "eyes", "nose",
    "haircolour", "beardcolour", "accessories", "glasses",
  ];

  // Category tiles: feature key, icon file, button colour — icons and
  // colours extracted from the original app's layer-panel buttons
  // (shapes 171/321-342), panel order per the original app.
  // The two colour tiles (skin, haircolour) have no fixed colour: their
  // background is the currently selected swatch, like the original.
  const TILES = [
    ["skin", "colour", null],
    ["eyes", "eyes", "#da4341"],
    ["nose", "nose", "#d945c1"],
    ["mouth", "mouth", "#6243da"],
    ["natural", "natural", "#4178db"],
    ["haircolour", "colour", null],
    ["hair", "hair", "#41d4db"],
    ["beard", "beard", "#46dc42"],
    ["glasses", "glasses", "#dcd742"],
    ["accessories", "extras", "#da7242"],
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
    for (const [key, icon, colour] of TILES) {
      const tile = document.createElement("button");
      tile.className = "qp-grid__tile" +
        (key === activeKey ? " qp-grid__tile--active" : "");
      let swatch = "";
      if (colour) {
        tile.style.background = colour;
      } else {
        // live swatch background: the currently selected skin / hair colour
        const src = key === "skin" ? A.skin.frames[state.skin]
                                   : A.haircolour.frames[state.haircolour];
        swatch = `<span class="qp-grid__swatch"><svg viewBox="0 0 640 640" ` +
          `preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">` +
          src.replace(/id="/g, `id="sw${key}`).replace(/url\(#/g, `url(#sw${key}`) +
          `</svg></span>`;
      }
      tile.innerHTML = swatch +
        `<img class="qp-grid__icon" src="icons/${icon}.svg" alt="${key}">`;
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

  const about = $("aboutOverlay");
  $("btnAbout").onclick = () => { about.hidden = false; };
  $("btnAboutClose").onclick = () => { about.hidden = true; };
  about.addEventListener("click", (e) => { if (e.target === about) about.hidden = true; });

  function fullSvgString() {
    const svg = $("avatar");
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML;
  }

  // Rasterise the current avatar to a 1024px PNG blob.
  function avatarPng(cb) {
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
      c.toBlob(cb, "image/png");
    };
    img.src = url;
  }

  $("btnPng").onclick = () => {
    avatarPng((png) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = "qikpic-avatar.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  $("btnShare").onclick = () => {
    avatarPng(async (png) => {
      const file = new File([png], "qikpic-avatar.png", { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "QikPic avatar" });
          return;
        }
        if (navigator.share) {
          await navigator.share({ title: "QikPic avatar", url: location.href });
          return;
        }
        throw new Error("no share support");
      } catch (e) {
        if (e.name === "AbortError") return;   // user cancelled the share sheet
        // last resort: download the image instead
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = "qikpic-avatar.png";
        a.click();
        URL.revokeObjectURL(a.href);
      }
    });
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
