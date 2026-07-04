/* QikPik web avatar maker — composes SVG layers extracted from the original app. */
(() => {
  const A = QIKPIK_ASSETS;

  // Layer stack order matches the original face_mc timeline (bottom → top).
  const LAYERS = [
    "skin", "natural", "mouth", "eyes", "nose",
    "haircolour", "beardcolour", "accessories", "glasses",
  ];

  // Editor categories: feature key, label. hair/beard are stencils driving the masks.
  const TABS = [
    ["skin", "Skin"],
    ["natural", "Natural"],
    ["eyes", "Eyes"],
    ["nose", "Nose"],
    ["mouth", "Mouth"],
    ["hair", "Hair"],
    ["haircolour", "Hair Colour"],
    ["beard", "Beard"],
    ["accessories", "Extras"],
    ["glasses", "Glasses"],
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

  /* ---------- editor UI ---------- */
  let activeTab = "skin";

  function buildTabs() {
    const nav = $("tabs");
    nav.innerHTML = "";
    for (const [key, label] of TABS) {
      const b = document.createElement("button");
      b.className = "qp-tabs__tab" + (key === activeTab ? " qp-tabs__tab--active" : "");
      b.textContent = label;
      b.onclick = () => { activeTab = key; buildTabs(); updateStepper(); };
      nav.appendChild(b);
    }
  }

  function updateStepper() {
    const n = A[activeTab].frames.length;
    const i = state[activeTab];
    const isEmpty = A[activeTab].frames[i].trim() === "";
    $("stepCount").textContent = isEmpty ? "none" : `${i + 1} / ${n}`;
  }

  function cycle(dir) {
    const n = A[activeTab].frames.length;
    state[activeTab] = (state[activeTab] + dir + n) % n;
    renderAvatar();
    updateStepper();
  }

  $("btnPrev").onclick = () => cycle(-1);
  $("btnNext").onclick = () => cycle(1);
  // Like the original app's hitzone: tap the avatar to cycle the category.
  $("avatar").addEventListener("click", () => cycle(1));

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
        updateStepper();
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
  buildTabs();
  updateStepper();

  // debug/testing hook
  window.__qp = {
    state,
    setAll(i) {
      for (const k of Object.keys(A)) state[k] = Math.min(i, A[k].frames.length - 1);
      renderAvatar(); updateStepper();
    },
    set(k, i) { state[k] = i; renderAvatar(); updateStepper(); },
  };
})();
