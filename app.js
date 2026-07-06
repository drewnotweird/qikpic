/* QikPik web avatar maker — composes SVG layers extracted from the original app. */
(() => {
  const A = QIKPIK_ASSETS;

  // Layer stack order matches the original face_mc timeline (bottom → top).
  const LAYERS = [
    "skin", "natural", "mouth", "eyes", "nose",
    "haircolour", "beardcolour", "accessories", "glasses",
  ];

  // Category tiles: feature key, label, icon file, button colour — icons and
  // colours extracted from the original app's layer-panel buttons
  // (shapes 171/321-342), panel order per the original app.
  // The two colour tiles (skin, haircolour) have no fixed colour: their
  // background is the currently selected swatch, like the original.
  const TILES = [
    ["skin", "Skin colour", "colour", null],
    ["eyes", "Eyes", "eyes", "#da4341"],
    ["nose", "Nose", "nose", "#d945c1"],
    ["mouth", "Mouth", "mouth", "#6243da"],
    ["natural", "Natural", "natural", "#4178db"],
    ["haircolour", "Hair colour", "colour", null],
    ["hair", "Hair", "hair", "#41d4db"],
    ["beard", "Beard", "beard", "#46dc42"],
    ["glasses", "Glasses", "glasses", "#dcd742"],
    ["accessories", "Extras", "extras", "#da7242"],
  ];
  const TILE_ORDER = TILES.map((t) => t[0]);
  const TILE_LABEL = Object.fromEntries(TILES.map((t) => [t[0], t[1]]));

  const state = {};
  for (const key of Object.keys(A)) state[key] = 0;

  // Restore saved avatar, then let a share-link hash override it.
  try {
    const saved = JSON.parse(localStorage.getItem("qikpik-avatar") || "{}");
    for (const k of Object.keys(saved)) {
      if (k in state && saved[k] >= 0 && saved[k] < A[k].frames.length) state[k] = saved[k];
    }
  } catch (e) { /* fresh start */ }

  /* ---------- shareable state in the URL hash ---------- */
  const HASH_KEYS = TILE_ORDER;  // 10 values, beardcolour is derived

  function stateToHash() {
    return HASH_KEYS.map((k) => state[k]).join("-");
  }

  function applyHash() {
    const h = location.hash.slice(1);
    if (!/^\d+(-\d+){9}$/.test(h)) return false;
    const vals = h.split("-").map(Number);
    HASH_KEYS.forEach((k, i) => {
      if (vals[i] < A[k].frames.length) state[k] = vals[i];
    });
    return true;
  }
  applyHash();

  const $ = (id) => document.getElementById(id);

  function persist() {
    localStorage.setItem("qikpik-avatar", JSON.stringify(state));
    history.replaceState(null, "", "#" + stateToHash());
  }

  /* ---------- avatar rendering (only touch what changed) ---------- */
  function renderLayer(key) {
    if (key === "hair") $("hairMaskArt").innerHTML = A.hair.mask[state.hair];
    else if (key === "beard") $("beardMaskArt").innerHTML = A.beard.mask[state.beard];
    else $("L_" + key).innerHTML = A[key].frames[state[key]];
  }

  function renderAvatar(changed) {
    state.beardcolour = state.haircolour;  // beard always matches hair colour
    if (changed) {
      renderLayer(changed);
      if (changed === "haircolour") renderLayer("beardcolour");
    } else {
      for (const key of LAYERS) renderLayer(key);
      renderLayer("hair");
      renderLayer("beard");
    }
    persist();
  }

  /* ---------- options grid ---------- */
  let activeKey = "skin";
  const tileEls = {};

  function swatchMarkup(key) {
    const src = key === "skin" ? A.skin.frames[state.skin]
                               : A.haircolour.frames[state.haircolour];
    return `<span class="qp-grid__swatch"><svg viewBox="0 0 640 640" ` +
      `preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">` +
      src.replace(/id="/g, `id="sw${key}`).replace(/url\(#/g, `url(#sw${key}`) +
      `</svg></span>`;
  }

  function tileAria(key) {
    const n = A[key].frames.length;
    const i = state[key];
    const none = A[key].frames[i].trim() === "";
    return `${TILE_LABEL[key]} — option ${none ? "none" : i + 1} of ${n}`;
  }

  // First 5 tiles form the top row in portrait / left rail in landscape;
  // the last 5 form the bottom row / right rail. Built once at boot.
  function buildRail(container, tiles) {
    container.innerHTML = "";
    for (const [key, label, icon, colour] of tiles) {
      const tile = document.createElement("button");
      tile.className = "qp-grid__tile";
      tile.setAttribute("aria-label", tileAria(key));
      if (colour) {
        tile.style.background = colour;
        tile.innerHTML = `<img class="qp-grid__icon" src="icons/${icon}.svg" alt="">`;
      } else {
        tile.innerHTML = swatchMarkup(key) +
          `<img class="qp-grid__icon" src="icons/${icon}.svg" alt="">`;
      }
      // tap = next variant; long-press or right-click = previous
      let lpTimer = null, lpFired = false;
      tile.addEventListener("pointerdown", () => {
        lpFired = false;
        lpTimer = setTimeout(() => { lpFired = true; select(key); cycle(key, -1); }, 480);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
        tile.addEventListener(ev, () => clearTimeout(lpTimer));
      }
      tile.addEventListener("click", () => {
        if (lpFired) return;
        select(key);
        cycle(key, 1);
      });
      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (lpFired) return;
        select(key);
        cycle(key, -1);
      });
      tileEls[key] = tile;
      container.appendChild(tile);
    }
  }

  function buildGrid() {
    buildRail($("gridLeft"), TILES.slice(0, 5));
    buildRail($("gridRight"), TILES.slice(5, 10));
    updateTiles();
  }

  // Refresh tile state without rebuilding the DOM.
  function updateTiles(changed) {
    for (const key of TILE_ORDER) {
      tileEls[key].classList.toggle("qp-grid__tile--active", key === activeKey);
      if (key === activeKey) tileEls[key].setAttribute("aria-current", "true");
      else tileEls[key].removeAttribute("aria-current");
    }
    const keys = changed ? [changed] : TILE_ORDER;
    for (const key of keys) {
      tileEls[key].setAttribute("aria-label", tileAria(key));
    }
    if (!changed || changed === "skin") {
      tileEls.skin.querySelector(".qp-grid__swatch").outerHTML = swatchMarkup("skin");
    }
    if (!changed || changed === "haircolour") {
      tileEls.haircolour.querySelector(".qp-grid__swatch").outerHTML = swatchMarkup("haircolour");
    }
  }

  function select(key) {
    activeKey = key;
    dismissHint();
  }

  function announce(key) {
    $("announcer").textContent = tileAria(key);
  }

  /* ---------- juice helpers ---------- */
  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.getBoundingClientRect();  // reflow so the animation restarts
    el.classList.add(cls);
  }

  // Layers where popping just the changed art reads well; full-canvas
  // layers (skin, colours) and the stencils get a whole-avatar squash.
  const POP_LAYERS = new Set(["natural", "mouth", "eyes", "nose", "accessories", "glasses"]);

  function reactToChange(key) {
    if (POP_LAYERS.has(key)) {
      $("L_" + key).classList.remove("qp-blink");  // don't fight the blink
      retrigger($("L_" + key), "qp-pop");
    } else {
      retrigger($("avatar"), "qp-bounce");
    }
  }

  /* ---------- idle blinking ---------- */
  function blink() {
    if (randomising || document.hidden) return;
    const eyes = $("L_eyes");
    eyes.classList.remove("qp-pop");
    retrigger(eyes, "qp-blink");
  }

  (function scheduleBlink() {
    setTimeout(() => {
      blink();
      if (Math.random() < 0.15) setTimeout(blink, 250);  // occasional double blink
      scheduleBlink();
    }, 2800 + Math.random() * 4200);
  })();

  const CONFETTI_COLOURS = ["#da4341", "#d945c1", "#6243da", "#4178db",
                            "#41d4db", "#46dc42", "#dcd742", "#da7242"];

  function confettiBurst(el) {
    const r = el.getBoundingClientRect();
    const wrap = document.createElement("div");
    wrap.className = "qp-confetti";
    wrap.style.left = `${r.left + r.width / 2}px`;
    wrap.style.top = `${r.top + r.height / 2}px`;
    for (let i = 0; i < 18; i++) {
      const bit = document.createElement("span");
      bit.className = "qp-confetti__bit";
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 70;
      bit.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      bit.style.setProperty("--dy", `${Math.sin(angle) * dist - 40}px`);
      bit.style.setProperty("--rot", `${(Math.random() - 0.5) * 540}deg`);
      bit.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
      wrap.appendChild(bit);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 900);
  }

  // Flip a category to its next (dir=1) or previous (dir=-1) variant —
  // like the original app's hitzone.
  function cycle(key, dir = 1) {
    const n = A[key].frames.length;
    state[key] = (state[key] + dir + n) % n;
    renderAvatar(key);
    updateTiles(key);
    reactToChange(key);
    announce(key);
  }

  $("avatar").addEventListener("click", () => { dismissHint(); cycle(activeKey, 1); });
  $("avatar").addEventListener("contextmenu", (e) => {
    e.preventDefault();
    dismissHint();
    cycle(activeKey, -1);
  });

  // If the user edits the hash (or pastes a share link over the page).
  window.addEventListener("hashchange", () => {
    if (applyHash()) {
      renderAvatar();
      updateTiles();
    }
  });

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const about = $("aboutOverlay");
    if (e.key === "Escape" && !about.hidden) { about.hidden = true; return; }
    if (!about.hidden) return;
    if (e.key === "ArrowRight") { e.preventDefault(); cycle(activeKey, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); cycle(activeKey, -1); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const i = (TILE_ORDER.indexOf(activeKey) + step + TILE_ORDER.length) % TILE_ORDER.length;
      select(TILE_ORDER[i]);
      updateTiles(activeKey);
      $("announcer").textContent = `${TILE_LABEL[activeKey]} selected`;
    }
  });

  /* ---------- first-visit hint ---------- */
  let hintEl = null;

  function dismissHint() {
    if (hintEl) { hintEl.classList.remove("qp-hint"); hintEl = null; }
    localStorage.setItem("qikpik-visited", "1");
  }

  if (!localStorage.getItem("qikpik-visited")) {
    setTimeout(() => {
      if (localStorage.getItem("qikpik-visited")) return;
      hintEl = tileEls[activeKey];
      hintEl.classList.add("qp-hint");
    }, 1500);
  }

  /* ---------- actions ---------- */
  let randomising = false;
  $("btnRandom").onclick = () => {
    if (randomising) return;
    dismissHint();
    randomising = true;
    $("btnRandom").classList.add("qp-spin");
    const steps = 8;
    const spin = (n) => {
      for (const key of Object.keys(A)) {
        state[key] = Math.floor(Math.random() * A[key].frames.length);
      }
      renderAvatar();
      if (n >= steps) {
        randomising = false;
        $("btnRandom").classList.remove("qp-spin");
        updateTiles();
        retrigger($("avatar"), "qp-bounce");
        $("announcer").textContent = "Random avatar";
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

  // Unique per download: qikpic-avatar-YYYYMMDD-HHMMSS.png
  function avatarFileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `qikpic-avatar-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
      `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
  }

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
    confettiBurst($("btnPng"));
    avatarPng((png) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = avatarFileName();
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  $("btnShare").onclick = () => {
    confettiBurst($("btnShare"));
    avatarPng(async (png) => {
      const file = new File([png], avatarFileName(), { type: "image/png" });
      const shareUrl = location.origin + location.pathname + "#" + stateToHash();
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "QikPic avatar",
            text: "Make your own: " + shareUrl,
          });
          return;
        }
        if (navigator.share) {
          await navigator.share({ title: "QikPic avatar", url: shareUrl });
          return;
        }
        throw new Error("no share support");
      } catch (e) {
        if (e.name === "AbortError") return;   // user cancelled the share sheet
        // last resort: download the image instead
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = avatarFileName();
        a.click();
        URL.revokeObjectURL(a.href);
      }
    });
  };

  /* ---------- boot ---------- */
  renderAvatar();
  buildGrid();

  // Offline support (https only; skipped in local dev).
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* non-fatal */ });
  }

  // debug/testing hook
  window.__qp = {
    state,
    setAll(i) {
      for (const k of Object.keys(A)) state[k] = Math.min(i, A[k].frames.length - 1);
      renderAvatar(); updateTiles();
    },
    set(k, i) { state[k] = i; renderAvatar(); updateTiles(); },
  };
})();
