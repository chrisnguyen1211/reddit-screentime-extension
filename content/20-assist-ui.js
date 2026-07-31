// Content script: a persistent Bram mascot in the corner. Clicking "✨ Comment/
// Reply" runs Bram through a scan motion, then the generated comment pops up in a
// speech bubble. Choose model via dropdown, add an instruction, rescan, and Fill
// the text straight into Reddit's reply box. No auto-post — human posts.

(function () {
  // Soft re-entry: after extension reload, a second inject must still recover the mascot.
  // Hard-return only when fully booted AND mascot is alive on the page.
  if (window.__RGL_ASSIST_BOOTED__) {
    console.log("[RGL] assist already booted — recover mascot/inject only");
    try {
      window.__RGL_ensureMascot?.();
      window.__RGL_injectAll?.();
    } catch (e) {
      console.warn("[RGL] recover failed", e);
    }
    return;
  }
  window.__RGL_ASSIST_BOOTED__ = true;

  function purgeDuplicateUi() {
    const keepOne = (sel) => {
      const nodes = [...document.querySelectorAll(sel)];
      nodes.slice(1).forEach((n) => {
        try {
          n.remove();
        } catch (_) {}
      });
      return nodes[0] || null;
    };
    keepOne(".rch-mascot");
    keepOne(".rch-bubble");
    // multiple overlays also stack
    const ovs = [...document.querySelectorAll("#rgl-overlay-root")];
    ovs.slice(1).forEach((n) => {
      try {
        n.remove();
      } catch (_) {}
    });
  }
  purgeDuplicateUi();

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  function detectLang(text) {
    const t = (text || "").slice(0, 600);
    if (/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(t)) return "Vietnamese";
    const letters = t.replace(/[^A-Za-zÀ-ỹ]/g, "");
    if (letters.length >= 8 && /^[\x00-\x7F]+$/.test(letters)) return "English";
    return "";
  }
  function extractQuestions(text) {
    if (!text) return [];
    const chunks = text.replace(/\s+/g, " ").match(/[^.!?\n]*\?+/g) || [];
    const out = [];
    for (const c of chunks) { const q = c.trim(); if (q.length >= 4 && q.length <= 280 && !out.includes(q)) out.push(q); }
    return out.slice(0, 5);
  }
  const MODELS = [
    { id: "xai/grok-4", label: "Grok 4" },
    { id: "xai/grok-4-fast-reasoning", label: "Grok 4 Fast" },
    { id: "cc/claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "cc/claude-fable-5", label: "Claude Fable 5" },
    { id: "cc/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { id: "cc/claude-opus-4-8", label: "Claude Opus 4.8" },
  ];
  const modelLabel = (id) => (MODELS.find((m) => m.id === id) || { label: id.replace(/^.*\//, "") }).label;
  const TRIGGER_STYLE =
    "position:relative;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;" +
    "gap:6px;cursor:pointer;font:600 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;" +
    "letter-spacing:.01em;color:#f7f7f8;background:linear-gradient(180deg,#303036 0%,#17171b 100%);" +
    "border:1px solid rgba(120,120,130,.5);padding:7px 12px;border-radius:999px;white-space:nowrap;" +
    "box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 5px 14px rgba(0,0,0,.22);" +
    "outline:none;overflow:visible;transition:transform .15s ease,box-shadow .18s ease,filter .18s ease;";
  const TRIGGER_EDGE_STYLE =
    "position:absolute;inset:-1px;z-index:0;border-radius:inherit;padding:1px;pointer-events:none;" +
    "background:conic-gradient(from 135deg,transparent 0deg,transparent 46deg,rgba(255,255,255,.95) 76deg," +
    "#ff6a33 90deg,transparent 122deg,transparent 226deg,rgba(255,255,255,.9) 256deg,#ff6a33 270deg,transparent 302deg);" +
    "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);" +
    "-webkit-mask-composite:xor;mask-composite:exclude;opacity:.72;filter:drop-shadow(0 0 4px rgba(255,106,51,.28));" +
    "transition:opacity .18s ease,filter .18s ease;";
  function mkBtn(label, title) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "rch-trigger"; b.title = title || "";
    b.setAttribute("style", TRIGGER_STYLE);
    const edge = document.createElement("span");
    edge.className = "rch-trigger__edge";
    edge.setAttribute("style", TRIGGER_EDGE_STYLE);
    edge.setAttribute("aria-hidden", "true");
    const icon = document.createElement("span");
    icon.className = "rch-trigger__icon";
    icon.textContent = "✦";
    icon.setAttribute("style", "position:relative;z-index:1;color:#ff8a55;font-size:11px;line-height:1;text-shadow:0 0 8px rgba(255,106,51,.7);");
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "rch-trigger__label";
    text.textContent = label;
    text.setAttribute("style", "position:relative;z-index:1;");
    b.append(edge, icon, text);
    b.addEventListener("pointerenter", () => {
      edge.style.opacity = "1";
      edge.style.filter = "drop-shadow(0 0 7px rgba(255,106,51,.55))";
      b.style.transform = "translateY(-1px)";
      b.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,.12),0 7px 18px rgba(0,0,0,.28)";
    });
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      const angle = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) + Math.PI / 2;
      edge.style.background = `conic-gradient(from ${angle}rad,transparent 0deg,transparent 46deg,rgba(255,255,255,.98) 76deg,#ff6a33 90deg,transparent 122deg,transparent 226deg,rgba(255,255,255,.92) 256deg,#ff6a33 270deg,transparent 302deg)`;
    });
    b.addEventListener("pointerleave", () => {
      edge.style.opacity = ".72";
      edge.style.filter = "drop-shadow(0 0 4px rgba(255,106,51,.28))";
      edge.style.background = "conic-gradient(from 135deg,transparent 0deg,transparent 46deg,rgba(255,255,255,.95) 76deg,#ff6a33 90deg,transparent 122deg,transparent 226deg,rgba(255,255,255,.9) 256deg,#ff6a33 270deg,transparent 302deg)";
      b.style.transform = "";
      b.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,.08),0 5px 14px rgba(0,0,0,.22)";
    });
    b.addEventListener("pointerdown", () => { if (!b.disabled) b.style.transform = "scale(.97)"; });
    b.addEventListener("pointerup", () => { if (!b.disabled) b.style.transform = "translateY(-1px)"; });
    b.addEventListener("focus", () => { b.style.outline = "2px solid rgba(255,138,85,.82)"; b.style.outlineOffset = "3px"; });
    b.addEventListener("blur", () => { b.style.outline = "none"; b.style.outlineOffset = ""; });
    return b;
  }

  // ── Bram mascot rig (ported from butlerMascot.ts) ──────────────────────────
  const BRAM_INK = "#0a0a0a", BRAM_ACCENT = "#ff4f1f", BRAM_LS = 3.0, BRAM_SW = 3.2;
  const BRAM_MOOD = { reading: "curious", thinking: "curious", searching: "neutral", writing: "curious", done: "excited", idle: "happy" };
  function bramFace(mood) {
    const dots = `<circle cx="57" cy="76" r="3.8" fill="${BRAM_INK}"/><circle cx="83" cy="76" r="3.8" fill="${BRAM_INK}"/>`;
    if (mood === "curious") return dots + `<line x1="76" y1="66" x2="89" y2="62" stroke="${BRAM_INK}" stroke-width="2.8" stroke-linecap="round"/><circle cx="70" cy="90" r="3.4" fill="none" stroke="${BRAM_INK}" stroke-width="2.8"/>`;
    if (mood === "excited") return `<circle cx="57" cy="75" r="4.6" fill="none" stroke="${BRAM_INK}" stroke-width="2.8"/><circle cx="83" cy="75" r="4.6" fill="none" stroke="${BRAM_INK}" stroke-width="2.8"/><path d="M60 86 q10 13 20 0 z" fill="${BRAM_INK}"/>`;
    if (mood === "happy") return dots + `<path d="M61 88 q9 8 18 0" fill="none" stroke="${BRAM_INK}" stroke-width="${BRAM_SW}" stroke-linecap="round"/>`;
    return dots + `<path d="M62 89 q8 6 16 0" fill="none" stroke="${BRAM_INK}" stroke-width="${BRAM_SW}" stroke-linecap="round"/>`;
  }
  const bramSeg = (d) => `<path d="${d}" fill="none" stroke="${BRAM_INK}" stroke-width="${BRAM_LS}" stroke-linecap="round" stroke-linejoin="round"/>`;
  let bramUid = 0;
  function bramRig(cid) {
    return (
      `<defs><clipPath id="${cid}"><rect x="33" y="52" width="74" height="54" rx="22"/></clipPath></defs>` +
      `<ellipse cx="70" cy="142" rx="30" ry="4.6" fill="${BRAM_INK}" opacity="0.09"/>` +
      `<g class="m-bob">` +
      `<g class="m-legL">${bramSeg("M59 106 L59 116")}<g class="m-shinL">${bramSeg("M59 116 L59 126 L51 126")}</g></g>` +
      `<g class="m-legR">${bramSeg("M81 106 L81 116")}<g class="m-shinR">${bramSeg("M81 116 L81 126 L89 126")}</g></g>` +
      `<g class="m-body">` +
      `<rect x="33" y="52" width="74" height="54" rx="22" fill="#fff" stroke="${BRAM_INK}" stroke-width="${BRAM_SW}"/>` +
      `<g class="m-face"></g>` +
      `<g class="m-lids" clip-path="url(#${cid})"><rect x="50" y="69" width="14" height="13" rx="3" fill="#fff"/><rect x="76" y="69" width="14" height="13" rx="3" fill="#fff"/></g>` +
      `<g class="m-antenna"><path d="M70 52 Q67 42 70 34" fill="none" stroke="${BRAM_INK}" stroke-width="${BRAM_SW}" stroke-linecap="round"/><circle class="m-tipglow" cx="70" cy="31" r="4.6" fill="${BRAM_ACCENT}"/><circle cx="70" cy="31" r="4.6" fill="${BRAM_ACCENT}"/></g>` +
      `</g>` +
      `<g class="m-armL">${bramSeg("M33 74 L31 88")}<g class="m-foreL">${bramSeg("M31 88 L29 102")}</g></g>` +
      `<g class="m-armR">${bramSeg("M107 74 L109 88")}<g class="m-foreR">${bramSeg("M109 88 L111 102")}</g></g>` +
      `<g class="m-doc"><rect x="48" y="90" width="44" height="30" rx="4" fill="#fff" stroke="${BRAM_INK}" stroke-width="2.4"/><line x1="54" y1="99" x2="86" y2="99" stroke="${BRAM_INK}" stroke-width="1.9" stroke-linecap="round" opacity="0.4"/><line x1="54" y1="105" x2="86" y2="105" stroke="${BRAM_ACCENT}" stroke-width="1.9" stroke-linecap="round"/><line x1="54" y1="111" x2="78" y2="111" stroke="${BRAM_INK}" stroke-width="1.9" stroke-linecap="round" opacity="0.4"/></g>` +
      `<g class="m-pen"><rect x="79" y="88" width="4.2" height="16" rx="2" fill="${BRAM_INK}" transform="rotate(40 81 96)"/><path d="M73.5 105.5 l3.4 -1.4 0.7 3.4 Z" fill="${BRAM_ACCENT}"/></g>` +
      `<g class="m-thought"><circle cx="93" cy="38" r="2" fill="${BRAM_INK}"/><circle cx="99" cy="31" r="2.6" fill="${BRAM_INK}"/><circle cx="106" cy="23" r="3.3" fill="${BRAM_INK}"/></g>` +
      `</g>`
    );
  }
  function bramSvg(pose, size) {
    const cid = "bc" + (++bramUid);
    return `<svg class="bsm2 p-${pose}" data-pose="${pose}" viewBox="0 -10 140 174" width="${size}" height="${(size * 174 / 140).toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${bramRig(cid)}</svg>`;
  }

  // ── mascot (corner) + speech bubble ────────────────────────────────────────
  let mascotEl = null, bubbleEl = null;
  let currentCtx = null, currentTargetEl = null, lastDraft = null;
  let selectedModel = "xai/grok-4";
  let seeding = false;
  let dragStart = null, dragging = false, dragPointerId = null;
  let scanTimer = null, idleTimer = null;
  let scanInFlight = false, scanRequestId = 0;
  let pendingFillRestoreInFlight = false;
  let bubbleOpen = false;
  const PENDING_FILL_KEY = "rch:pending-fill:v1";
  const PENDING_FILL_TTL_MS = 2 * 60 * 1000;
  try { chrome.storage?.local.get(["rchModel", "rchSeed"], (r) => { if (r) { if (r.rchModel) selectedModel = r.rchModel; if (r.rchSeed) seeding = true; syncModelLabel(); syncSeed(); } }); } catch (_) {}

  function isBubbleVisible() {
    return !!(bubbleEl && bubbleEl.style.display !== "none" && bubbleOpen);
  }

  function showBubble() {
    ensureMascot();
    ensureBubble();
    bubbleOpen = true;
    bubbleEl.style.display = "block";
    bubbleEl.dataset.has = "1";
    bubbleEl.setAttribute("aria-hidden", "false");
    mascotEl.classList.add("rch-has-bubble");
    positionBubble();
    // reflow after paint (height may change with draft)
    requestAnimationFrame(() => positionBubble());
  }

  function hideBubble() {
    if (!bubbleEl) return;
    bubbleOpen = false;
    bubbleEl.style.display = "none";
    bubbleEl.setAttribute("aria-hidden", "true");
    if (mascotEl) mascotEl.classList.remove("rch-has-bubble");
  }

  function toggleBubble() {
    ensureBubble();
    // Allow reopen even if user closed with ✕, as long as we have session draft/ctx
    const hasContent =
      bubbleEl.dataset.has === "1" ||
      !!(bubbleEl.querySelector(".rch-draft")?.value) ||
      !!lastDraft ||
      !!currentCtx;
    if (!hasContent) {
      // No generate yet — still open empty shell with hint
      const ta = bubbleEl.querySelector(".rch-draft");
      if (ta && !ta.value) ta.placeholder = "Bấm ✨ Comment/Reply trên post để Bram soạn…";
      bubbleEl.dataset.has = "1";
    }
    if (isBubbleVisible()) hideBubble();
    else showBubble();
  }

  /** Hard inline styles — survive Reddit CSS wars + stealth partial hides. */
  function paintMascotChrome(el, pos) {
    if (!el) return;
    const left = pos?.left != null ? Math.round(pos.left) : 14;
    const top = pos?.top != null ? Math.round(pos.top) : null;
    // Always force visibility (stealth used to set opacity 0.12 + pointer-events none)
    el.style.setProperty("position", "fixed", "important");
    el.style.setProperty("z-index", "2147483646", "important");
    el.style.setProperty("width", "92px", "important");
    el.style.setProperty("height", "116px", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("display", "block", "important");
    el.style.setProperty("pointer-events", "auto", "important");
    el.style.setProperty("cursor", "grab", "important");
    el.style.setProperty("right", "auto", "important");
    if (top != null && Number.isFinite(top)) {
      el.style.setProperty("left", `${left}px`, "important");
      el.style.setProperty("top", `${top}px`, "important");
      el.style.setProperty("bottom", "auto", "important");
    } else {
      el.style.setProperty("left", "14px", "important");
      el.style.setProperty("bottom", "16px", "important");
      el.style.setProperty("top", "auto", "important");
    }
  }

  function isMascotOnScreen(el) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 600;
    // At least 20px of the mascot must sit inside the viewport
    const visibleW = Math.min(r.right, vw) - Math.max(r.left, 0);
    const visibleH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    return visibleW >= 20 && visibleH >= 20;
  }

  function clampMascotOnScreen(el) {
    if (!el) return;
    if (isMascotOnScreen(el)) return;
    // Reset to default bottom-left
    paintMascotChrome(el, null);
    try { chrome.storage?.local.remove("rchPos"); } catch (_) {}
  }

  function mountMascotNode(el) {
    const parent = document.documentElement; // <html> survives SPA body swaps better than body
    if (el.parentElement !== parent) {
      try {
        parent.appendChild(el);
      } catch (_) {
        try { document.body?.appendChild(el); } catch (__) {}
      }
    }
  }

  function bindMascotEvents(el) {
    if (el.dataset.rchBound === "1") return;
    el.dataset.rchBound = "1";

    el.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      dragPointerId = e.pointerId;
      dragStart = { x: e.clientX, y: e.clientY, rect: el.getBoundingClientRect() };
      dragging = false;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragStart || e.pointerId !== dragPointerId) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (!dragging && Math.hypot(dx, dy) < 6) return;
      dragging = true;
      el.classList.add("dragging");
      const left = Math.max(4, Math.min(window.innerWidth - dragStart.rect.width - 4, dragStart.rect.left + dx));
      const top = Math.max(4, Math.min(window.innerHeight - dragStart.rect.height - 4, dragStart.rect.top + dy));
      paintMascotChrome(el, { left, top });
      if (isBubbleVisible()) positionBubble();
    });
    const endDrag = (e) => {
      if (dragPointerId != null && e.pointerId !== dragPointerId) return;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      const wasDrag = dragging;
      if (dragStart && !wasDrag) {
        e.preventDefault?.();
        toggleBubble();
      }
      if (wasDrag) {
        const r = el.getBoundingClientRect();
        try {
          chrome.storage?.local.set({ rchPos: { left: Math.round(r.left), top: Math.round(r.top) } });
        } catch (_) {}
        if (isBubbleVisible()) positionBubble();
      }
      el.classList.remove("dragging");
      dragStart = null;
      dragging = false;
      dragPointerId = null;
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleBubble();
      }
    });
  }

  function ensureMascot() {
    // Drop extras
    const all = [...document.querySelectorAll(".rch-mascot")];
    all.slice(1).forEach((n) => {
      try { n.remove(); } catch (_) {}
    });

    let el = (mascotEl && mascotEl.isConnected && mascotEl) || all[0] || null;
    const created = !el;
    if (!el) {
      el = document.createElement("div");
      el.className = "rch-mascot";
      el.id = "rgl-bram-mascot";
      el.title = "Bram — kéo để di chuyển · bấm để mở/đóng bubble comment";
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      try {
        el.innerHTML = bramSvg("idle", 92);
        const face = el.querySelector(".m-face");
        if (face) face.innerHTML = bramFace("happy");
      } catch (e) {
        // SVG fail — still show a visible fallback chip
        el.textContent = "🟠 Bram";
        el.style.font = "700 14px/116px system-ui,sans-serif";
        el.style.textAlign = "center";
        el.style.background = "#1b1b1f";
        el.style.color = "#ff8a55";
        el.style.borderRadius = "16px";
        console.warn("[RGL] bram svg failed, using chip", e);
      }
    }

    mascotEl = el;
    mountMascotNode(el);
    paintMascotChrome(el, null);
    bindMascotEvents(el);

    // Restore saved position only if on-screen; otherwise keep default bottom-left
    if (created || !isMascotOnScreen(el)) {
      try {
        chrome.storage?.local.get(["rchPos"], (r) => {
          if (!mascotEl) return;
          const pos = r?.rchPos;
          if (
            pos &&
            Number.isFinite(Number(pos.left)) &&
            Number.isFinite(Number(pos.top)) &&
            Number(pos.left) >= 0 &&
            Number(pos.top) >= 0 &&
            Number(pos.left) < window.innerWidth * 0.85 &&
            Number(pos.top) < window.innerHeight * 0.9
          ) {
            paintMascotChrome(mascotEl, { left: Number(pos.left), top: Number(pos.top) });
            if (!isMascotOnScreen(mascotEl)) {
              paintMascotChrome(mascotEl, null);
              try { chrome.storage.local.remove("rchPos"); } catch (_) {}
            }
          } else if (pos) {
            try { chrome.storage.local.remove("rchPos"); } catch (_) {}
          }
          clampMascotOnScreen(mascotEl);
          if (isBubbleVisible()) positionBubble();
        });
      } catch (_) {
        clampMascotOnScreen(el);
      }
    } else {
      clampMascotOnScreen(el);
    }

    // Always force visible — stealth must not hide Bram (needed to open bubble)
    clampMascotOnScreen(el);
    return mascotEl;
  }
  // Expose for soft re-entry after extension reload
  window.__RGL_ensureMascot = ensureMascot;

  /** Anchor bubble above mascot (always attached). */
  function positionBubble() {
    if (!bubbleEl || !mascotEl) return;
    const r = mascotEl.getBoundingClientRect();
    const bw = bubbleEl.offsetWidth || 340;
    const bh = bubbleEl.offsetHeight || 220;
    const gap = 12;
    const margin = 8;

    // Prefer above mascot; if not enough room, place below
    let top = r.top - bh - gap;
    if (top < margin) top = Math.min(window.innerHeight - bh - margin, r.bottom + gap);

    // Align horizontally with mascot (left-edge for left half, right-edge for right half)
    let left;
    if (r.left + r.width / 2 < window.innerWidth / 2) {
      left = r.left;
      bubbleEl.classList.remove("rch-bubble--right");
      bubbleEl.classList.add("rch-bubble--left");
    } else {
      left = r.right - bw;
      bubbleEl.classList.remove("rch-bubble--left");
      bubbleEl.classList.add("rch-bubble--right");
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - bh - margin));

    bubbleEl.style.left = Math.round(left) + "px";
    bubbleEl.style.top = Math.round(top) + "px";
    bubbleEl.style.right = "auto";
    bubbleEl.style.bottom = "auto";
  }
  function syncSeed() {
    const b = bubbleEl && bubbleEl.querySelector(".rch-seed");
    if (b) b.classList.toggle("on", seeding);
    if (bubbleEl && currentCtx) fillTarget(currentCtx.target);
  }
  function setSeeding(on) {
    seeding = !!on;
    syncSeed();
    // do not force-persist auto-on to storage unless user toggles; visual + generate style only
  }
  function setPose(pose) {
    ensureMascot();
    const s = mascotEl.querySelector("svg");
    if (s) { s.setAttribute("class", "bsm2 p-" + pose); s.dataset.pose = pose; const f = s.querySelector(".m-face"); if (f) f.innerHTML = bramFace(BRAM_MOOD[pose] || "happy"); }
    mascotEl.classList.toggle("scanning", pose !== "idle" && pose !== "done");
  }
  const SCAN_SEQ = ["reading", "thinking", "searching", "writing"];
  function startScan() { let i = 0; setPose("reading"); clearInterval(scanTimer); scanTimer = setInterval(() => { i = (i + 1) % SCAN_SEQ.length; setPose(SCAN_SEQ[i]); }, 1400); }
  function stopScan() { clearInterval(scanTimer); scanTimer = null; }

  function syncModelLabel() { const l = bubbleEl && bubbleEl.querySelector(".rch-ddlabel"); if (l) l.textContent = modelLabel(selectedModel); }

  function ensureBubble() {
    if (bubbleEl && bubbleEl.isConnected) return bubbleEl;
    const existing = document.querySelector(".rch-bubble");
    if (existing) {
      [...document.querySelectorAll(".rch-bubble")].slice(1).forEach((n) => n.remove());
      bubbleEl = existing;
      return bubbleEl;
    }
    bubbleEl = document.createElement("div");
    bubbleEl.className = "rch-bubble";
    bubbleEl.style.display = "none";
    bubbleEl.innerHTML = `
      <button class="rch-x" title="Đóng">✕</button>
      <div class="rch-target"></div>
      <div class="rch-quote" hidden><span class="rch-quote-label"></span><blockquote></blockquote></div>
      <textarea class="rch-draft" rows="4" placeholder="Bram đang soạn…"></textarea>
      <input class="rch-instr" type="text" placeholder="Chỉ dẫn cho Bram khi rescan (vd: ngắn hơn, vui hơn, hỏi lại, nhắc là free…)" />
      <div class="rch-bar">
        <div class="rch-dd">
          <button class="rch-ddbtn" title="Chọn model"><span class="rch-ddlabel">Grok 4</span><span class="rch-ddcaret">⌄</span></button>
          <div class="rch-ddmenu" hidden>${MODELS.map((m) => `<button class="rch-dditem" data-id="${m.id}">${m.label}</button>`).join("")}</div>
        </div>
        <button class="rch-seed" title="Seeding: lồng ghép sản phẩm của bạn (có disclose)">🌱</button>
        <span class="rch-spacer"></span>
        <button class="rch-mini rch-rescan" title="Soạn lại theo chỉ dẫn">↻ rescan</button>
        <button class="rch-mini rch-copy" title="Copy">📋</button>
        <button class="rch-fill" title="Điền thẳng vào ô comment của Reddit">📥 Fill</button>
      </div>`;
    document.body.appendChild(bubbleEl);
    syncModelLabel(); syncSeed();
    bubbleEl.querySelector(".rch-seed").onclick = () => {
      seeding = !seeding; syncSeed();
      try { chrome.storage?.local.set({ rchSeed: seeding }); } catch (_) {}
      runScan();
    };
    bubbleEl.querySelector(".rch-x").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideBubble();
    };
    bubbleEl.querySelector(".rch-rescan").onclick = () => runScan();
    bubbleEl.querySelector(".rch-instr").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runScan(); } });
    bubbleEl.querySelector(".rch-copy").onclick = () => {
      const ta = bubbleEl.querySelector(".rch-draft");
      ta.select(); navigator.clipboard?.writeText(ta.value).catch(() => document.execCommand("copy"));
      flash(bubbleEl.querySelector(".rch-copy"), "✓");
    };
    bubbleEl.querySelector(".rch-fill").onclick = async () => {
      const ta = bubbleEl.querySelector(".rch-draft");
      const fill = bubbleEl.querySelector(".rch-fill");
      const draft = (ta.value || "").trim();
      if (!draft) {
        flash(fill, "Draft trống");
        return;
      }
      fill.disabled = true;
      let handedOffToPost = false;
      const kind = currentCtx?.target?.kind || "post";
      const filled = await fillComposerForTarget(draft, currentTargetEl, {
        targetKind: kind,
        preferGlobal: kind === "post" || kind === "dm" || !currentTargetEl,
        allowControl: true,
        beforeOpen: (control) => {
          if (kind !== "post") return;
          handedOffToPost = !!savePendingFill(draft, currentTargetEl, control, currentCtx);
        },
      });
      if (filled) {
        clearPendingFill();
        flash(fill, "✓ Đã điền");
        showFillNotice(kind === "dm" ? "✓ Đã điền vào ô chat — bấm Send khi ok" : "✓ Đã điền vào ô comment Reddit");
      } else if (handedOffToPost) {
        flash(fill, "Đang mở comment…");
      } else {
        try {
          await navigator.clipboard?.writeText(draft);
        } catch (_) {}
        flash(fill, "fail — đã copy");
      }
      fill.disabled = false;
    };
    // model dropdown
    const dd = bubbleEl.querySelector(".rch-dd");
    dd.querySelector(".rch-ddbtn").onclick = (e) => { e.stopPropagation(); const menu = dd.querySelector(".rch-ddmenu"); menu.hidden = !menu.hidden; };
    dd.querySelectorAll(".rch-dditem").forEach((it) => {
      it.onclick = () => {
        selectedModel = it.dataset.id; syncModelLabel();
        try { chrome.storage?.local.set({ rchModel: selectedModel }); } catch (_) {}
        dd.querySelector(".rch-ddmenu").hidden = true;
        runScan();
      };
    });
    document.addEventListener("click", (e) => { if (bubbleEl && !e.target.closest(".rch-dd")) { const m = bubbleEl.querySelector(".rch-ddmenu"); if (m) m.hidden = true; } });
    return bubbleEl;
  }
  function flash(btn, text) { const l = btn.textContent; btn.textContent = text; setTimeout(() => (btn.textContent = l), 1600); }

  function fillTarget(target) {
    const bar = bubbleEl.querySelector(".rch-target");
    if (!target) { bar.style.display = "none"; return; }
    bar.style.display = "block";
    bar.innerHTML = "<b></b>";
    bar.querySelector("b").textContent = (seeding ? "🌱 seeding · " : "") + target.label + (target.author ? ` · u/${target.author}` : "");
  }
  function quoteExcerpt(ctx) {
    if (!ctx) return "";
    const source =
      ctx.target?.kind === "comment" || ctx.target?.kind === "dm" || ctx.channel === "dm"
        ? ctx.replyingTo || ctx.body
        : [ctx.title, ctx.body].filter(Boolean).join(" — ");
    return clean(source).slice(0, 280);
  }
  function renderQuote(ctx) {
    const q = bubbleEl && bubbleEl.querySelector(".rch-quote");
    if (!q) return;
    const excerpt = quoteExcerpt(ctx);
    q.hidden = !excerpt;
    if (!excerpt) return;
    q.querySelector(".rch-quote-label").textContent = ctx.target?.kind === "comment"
      ? `Đang reply${ctx.replyAuthor ? ` u/${ctx.replyAuthor}` : ""}`
      : "Đang comment vào post";
    q.querySelector("blockquote").textContent = `“${excerpt}${excerpt.length >= 280 ? "…" : ""}”`;
  }
  function renderDraft(d) {
    ensureBubble();
    const ta = bubbleEl.querySelector(".rch-draft");
    lastDraft = d;
    bubbleEl.dataset.has = "1";
    if (!d || d.error) {
      ta.value = "";
      ta.placeholder = d && d.error ? "⚠️ " + d.error : "…";
    } else {
      ta.value = d.comment || "";
    }
    ta.style.height = "auto";
    ta.style.height = Math.min(280, ta.scrollHeight + 2) + "px";
    if (isBubbleVisible()) requestAnimationFrame(() => positionBubble());
  }

  /**
   * Open Bram bubble for auto-comment jobs (same UI as manual ✨).
   * Does not start a second LLM scan — caller generates and setDraftFromAuto().
   */
  function openAutoPanel(ctx, targetEl, phaseLabel) {
    ensureMascot();
    ensureBubble();
    currentCtx = ctx || currentCtx;
    currentTargetEl = targetEl || null;
    try {
      window.RGL?.automation?.pause?.();
      if (window.RGL?.bus) window.RGL.bus.paused = true;
    } catch (_) {}
    showBubble();
    if (ctx?.target) fillTarget(ctx.target);
    if (ctx) renderQuote(ctx);
    const ta = bubbleEl.querySelector(".rch-draft");
    if (ta && !ta.value) {
      ta.value = "";
      ta.placeholder = phaseLabel || "🤖 Auto: Bram đang soạn…";
      ta.style.height = "auto";
    }
    // mark auto mode on target bar
    const bar = bubbleEl.querySelector(".rch-target");
    if (bar && ctx?.target) {
      const base = (seeding ? "🌱 " : "") + "🤖 AUTO · " + (ctx.target.label || "");
      bar.style.display = "block";
      bar.innerHTML = "<b></b>";
      bar.querySelector("b").textContent = base + (ctx.target.author ? ` · u/${ctx.target.author}` : "");
    } else if (bar && phaseLabel) {
      bar.style.display = "block";
      bar.innerHTML = "<b></b>";
      bar.querySelector("b").textContent = "🤖 " + phaseLabel;
    }
    positionBubble();
  }

  function setDraftFromAuto(comment, meta = {}) {
    ensureBubble();
    showBubble();
    const d = {
      comment: String(comment || "").trim(),
      model: meta.model || selectedModel,
      error: meta.error || null,
    };
    if (d.error) {
      renderDraft({ error: d.error });
    } else {
      renderDraft(d);
    }
    if (meta.phaseLabel) {
      const bar = bubbleEl.querySelector(".rch-target");
      if (bar) {
        const prev = bar.querySelector("b")?.textContent || "🤖 AUTO";
        bar.querySelector("b").textContent = prev.replace(/\s*·\s*(DWELL|GENERATING|THINKING|TYPING|REREAD|SUBMIT|DONE|FAIL).*$/i, "") + " · " + meta.phaseLabel;
      }
    }
    positionBubble();
  }

  function setAutoPhase(phaseLabel) {
    if (!bubbleEl) return;
    showBubble();
    const ta = bubbleEl.querySelector(".rch-draft");
    if (ta && !ta.value) ta.placeholder = "🤖 Auto: " + (phaseLabel || "…");
    const bar = bubbleEl.querySelector(".rch-target b");
    if (bar) {
      const core = bar.textContent.replace(/\s*·\s*(DWELL|GENERATING|THINKING|TYPING|REREAD|SUBMIT|DONE|FAIL|FILL|WAITING).*$/i, "");
      bar.textContent = core + " · " + (phaseLabel || "");
    }
    positionBubble();
  }

  // ── carry a Fill action across feed → post navigation ──────────────────────
  function absoluteUrl(value) {
    if (!value) return "";
    try { return new URL(value, location.href).href; } catch (_) { return ""; }
  }
  function postIdentity(postEl, control, ctx) {
    const rawId = postEl?.getAttribute?.("thing-id") ||
      postEl?.getAttribute?.("post-id") ||
      postEl?.getAttribute?.("data-fullname") ||
      postEl?.getAttribute?.("data-id") ||
      postEl?.id || "";
    const postId = rawId.replace(/^t3_/i, "").replace(/^thing_t3_/i, "");
    const link = control?.matches?.("a[href]") ? control : control?.querySelector?.("a[href]");
    const postLink = postEl?.querySelector?.('a.comments[href],a[href*="/comments/"]');
    const rawUrl = link?.getAttribute?.("href") ||
      control?.getAttribute?.("href") ||
      control?.getAttribute?.("data-href") ||
      postEl?.getAttribute?.("permalink") ||
      postEl?.getAttribute?.("content-href") ||
      postEl?.getAttribute?.("post-url") ||
      postEl?.getAttribute?.("data-permalink") ||
      postLink?.getAttribute?.("href") || "";
    const url = absoluteUrl(rawUrl);
    let path = "";
    try { path = url ? new URL(url).pathname.replace(/\/+$/, "") : ""; } catch (_) {}
    return { postId, path, title: clean(ctx?.title || "").slice(0, 240) };
  }
  function savePendingFill(text, postEl, control, ctx) {
    if (!text || !postEl) return null;
    const identity = postIdentity(postEl, control, ctx);
    if (!identity.postId && !identity.path && !identity.title) return null;
    const pending = { version: 1, text, createdAt: Date.now(), ...identity };
    try {
      sessionStorage.setItem(PENDING_FILL_KEY, JSON.stringify(pending));
      return pending;
    } catch (_) {
      return null;
    }
  }
  function readPendingFill() {
    try {
      const raw = sessionStorage.getItem(PENDING_FILL_KEY);
      const pending = raw ? JSON.parse(raw) : null;
      if (!pending || pending.version !== 1 || typeof pending.text !== "string") return null;
      if (Date.now() - Number(pending.createdAt || 0) > PENDING_FILL_TTL_MS) {
        sessionStorage.removeItem(PENDING_FILL_KEY);
        return null;
      }
      return pending;
    } catch (_) {
      return null;
    }
  }
  function clearPendingFill() {
    try { sessionStorage.removeItem(PENDING_FILL_KEY); } catch (_) {}
  }
  function pendingMatchesPage(pending) {
    const path = location.pathname.replace(/\/+$/, "");
    if (pending.postId && new RegExp(`/comments/${pending.postId}(?:/|$)`, "i").test(path)) return true;
    if (pending.path && (path === pending.path || path.startsWith(pending.path + "/"))) return true;
    if (!pending.title) return false;
    const pageTitle = clean(
      document.querySelector("shreddit-post")?.getAttribute("post-title") ||
      document.querySelector(".thing.link a.title")?.textContent ||
      document.querySelector("h1")?.textContent || ""
    ).slice(0, 240);
    return !!pageTitle && pageTitle.toLowerCase() === pending.title.toLowerCase();
  }
  function postForPending(pending) {
    const posts = [...document.querySelectorAll("shreddit-post,.thing.link")];
    if (!posts.length) return null;
    if (!pending.postId) return posts[0];
    return posts.find((post) => {
      const identity = postIdentity(post, null, null);
      if (identity.postId === pending.postId) return true;
      return !!post.querySelector?.(`a[href*="/comments/${CSS.escape(pending.postId)}"]`);
    }) || posts[0];
  }
  function showFillNotice(text) {
    const notice = document.createElement("div");
    notice.className = "rch-fill-notice";
    notice.textContent = text;
    notice.setAttribute("style", "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483647;" +
      "padding:10px 14px;border:1px solid rgba(255,138,85,.55);border-radius:999px;background:#1b1b1f;color:#f5f5f5;" +
      "box-shadow:0 10px 28px rgba(0,0,0,.35);font:600 12px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;");
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 2600);
  }

  // ── fill Reddit's reply composer ───────────────────────────────────────────
  const isOurUi = (el) =>
    !!(el && (targetContains(bubbleEl, el) || targetContains(mascotEl, el) || el.closest?.("#rgl-overlay-root,.rch-bubble,.rch-mascot")));
  const isEditable = (el) =>
    el &&
    !isOurUi(el) &&
    (el.tagName === "TEXTAREA" ||
      el.tagName === "INPUT" ||
      el.isContentEditable ||
      el.getAttribute?.("contenteditable") === "true" ||
      el.getAttribute?.("role") === "textbox" ||
      el.tagName === "FACEPLATE-TEXTAREA" ||
      el.getAttribute?.("aria-multiline") === "true");
  const vis = (el) => {
    const r = el && el.getBoundingClientRect?.();
    return !!(r && r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < (window.innerHeight || 800) + 40);
  };
  function deepActiveElement(root = document) {
    let active = root.activeElement || document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }
  /** Deep walk open shadow roots for any editable-looking control. */
  function editableInRoot(root) {
    if (!root) return [];
    const out = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el)) return;
      if (isEditable(el) && vis(el) && !el.disabled && !el.readOnly) {
        seen.add(el);
        out.push(el);
      }
    };
    const walk = (node) => {
      if (!node || seen.has(node)) return;
      if (node.nodeType === Node.ELEMENT_NODE) add(node);
      try {
        node.querySelectorAll?.(
          'textarea,input,[contenteditable="true"],[contenteditable=""],[role="textbox"],faceplate-textarea,[aria-multiline="true"]'
        ).forEach(add);
      } catch (_) {}
      try {
        node.querySelectorAll?.("*").forEach((el) => {
          if (el.shadowRoot) walk(el.shadowRoot);
        });
      } catch (_) {}
    };
    walk(root);
    return out;
  }

  function allPageEditables() {
    return [
      ...editableInRoot(document),
      ...[...document.querySelectorAll("shreddit-composer, shreddit-comment-composer, faceplate-textarea, comment-composer-host")].flatMap(
        (h) => editableInRoot(h)
      ),
    ];
  }
  function targetContains(target, el) {
    if (!target || !el) return false;
    if (target === el || target.contains?.(el)) return true;
    let root = target.shadowRoot;
    return !!(root && (root === el || root.contains?.(el)));
  }
  function ownTargetContains(target, el) {
    if (!target || !el) return false;
    let node = el;
    while (node && node !== target) {
      if (node.matches?.("shreddit-comment,.comment")) return false;
      node = node.parentElement || node.getRootNode?.()?.host || null;
    }
    return node === target;
  }
  function pickNearestComposer(target, candidates) {
    if (!candidates.length) return null;
    const tr = target?.getBoundingClientRect?.();
    if (!tr) return candidates[0];
    const tcx = tr.left + tr.width / 2, tcy = tr.top + tr.height / 2;
    return candidates
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return { el, distance: Math.hypot(cx - tcx, cy - tcy) };
      })
      .sort((a, b) => a.distance - b.distance)[0]?.el || null;
  }
  function nearestComposer(target) {
    const candidates = [...new Set(editableInRoot(document))].filter((el) => !targetContains(bubbleEl, el));
    return pickNearestComposer(target, candidates);
  }
  function postPageComposer() {
    const roots = [
      ...document.querySelectorAll(
        "shreddit-composer,shreddit-comment-composer,[data-testid='comment-submission-form'],[data-testid='comment-composer'],comment-composer-host,faceplate-textarea"
      ),
    ];
    const scoped = roots.flatMap((root) => editableInRoot(root)).filter(vis);
    if (scoped.length) return scoped[0];
    const all = allPageEditables().filter((el) => !isOurUi(el));
    const marked = all.filter((el) =>
      /comment|thought|reply|bình luận|trả lời/i.test(
        el.getAttribute?.("aria-label") || el.getAttribute?.("placeholder") || el.getAttribute?.("name") || ""
      )
    );
    if (marked.length) return marked[0];
    // largest visible textbox near bottom of post (main comment box)
    if (all.length) {
      return all.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    }
    return null;
  }
  function replyControl(target, targetKind = currentCtx?.target?.kind) {
    // Use word-boundary patterns so "3 more replies" is never matched as Reply
    // (clicking it auto-expands the whole subthread — bad UX).
    const re =
      targetKind === "post"
        ? /\b(add\s+)?(a\s+)?comment\b|\breply\b|bình luận/i
        : /\breply\b|trả lời/i;
    const a = actionAnchor(target, re);
    if (!a?.after || a.after.classList?.contains("rch-trigger")) return null;
    if (isMoreRepliesControl(a.after)) return null;
    const ctrl = a.after.matches?.("button,a,faceplate-tracker")
      ? a.after
      : a.after.querySelector?.("button,a,faceplate-tracker");
    if (ctrl && isMoreRepliesControl(ctrl)) return null;
    return ctrl || null;
  }
  async function findComposerForTarget(target, { beforeOpen, preferGlobal = false, allowControl = true, targetKind } = {}) {
    if (target && target.isConnected === false) return null;
    const active = deepActiveElement();
    const containsTarget = targetKind === "comment" ? ownTargetContains : targetContains;
    if (isEditable(active) && vis(active) && !isOurUi(active) && (!target || containsTarget(target, active) || preferGlobal)) {
      return active;
    }
    const scoped = target
      ? editableInRoot(target).find((el) => vis(el) && (targetKind !== "comment" || ownTargetContains(target, el)))
      : null;
    if (scoped) return scoped;

    // parent shreddit hosts
    if (target) {
      const host =
        target.closest?.("shreddit-comment, shreddit-post, .thing, .Comment, article") || target;
      const inHost = editableInRoot(host);
      if (inHost[0]) return inHost[0];
    }

    if (preferGlobal) {
      const global = postPageComposer();
      if (global) return global;
    }
    const control = allowControl && target && replyControl(target, targetKind);
    if (control) {
      const beforeEditors = new Set(allPageEditables());
      try {
        beforeOpen?.(control);
      } catch (_) {}
      try {
        control.click();
      } catch (_) {}
      for (let i = 0; i < 16; i++) {
        await new Promise((resolve) => setTimeout(resolve, 140));
        const activeOpened = deepActiveElement();
        if (isEditable(activeOpened) && vis(activeOpened) && !isOurUi(activeOpened)) return activeOpened;
        const scopedOpened = target
          ? editableInRoot(target).find(
              (el) => vis(el) && (targetKind !== "comment" || ownTargetContains(target, el))
            )
          : null;
        if (scopedOpened) return scopedOpened;
        const freshEditors = allPageEditables().filter((el) => !beforeEditors.has(el));
        const opened = pickNearestComposer(target, freshEditors);
        if (opened) return opened;
        const any = postPageComposer();
        if (any && preferGlobal) return any;
      }
    }
    // last resort: focused editable after clicking any composer host
    for (const host of document.querySelectorAll(
      "shreddit-composer, shreddit-comment-composer, faceplate-textarea, [data-testid='comment-submission-form']"
    )) {
      try {
        host.click();
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 120));
      const a2 = deepActiveElement();
      if (isEditable(a2) && !isOurUi(a2)) return a2;
      const eds = editableInRoot(host);
      if (eds[0]) return eds[0];
    }
    return preferGlobal ? postPageComposer() : postPageComposer() || null;
  }
  function readEditorText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return String(el.value || "");
    return String(el.innerText || el.textContent || "").replace(/\u200b/g, "").trim();
  }

  function normText(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /** True if editor has want exactly once (not doubled/tripled). */
  function editorLooksFilled(el, want) {
    const got = readEditorText(el);
    if (!got || got.length < 2) return false;
    const a = normText(got);
    const b = normText(want);
    if (!b) return got.length >= 2;
    // reject clear duplicates: "foofoo" or "foo foo" from double insert
    if (b.length >= 8) {
      if (a === b + b) return false;
      if (a === b + " " + b) return false;
      // doubled without space (user screenshot: "usefuldamn this is actually useful")
      if (a.length >= b.length * 1.7 && a.startsWith(b) && a.includes(b, 3)) return false;
      const idx2 = a.indexOf(b, Math.max(1, Math.floor(b.length * 0.5)));
      if (a.startsWith(b) && idx2 > 0) return false;
    }
    if (a === b) return true;
    if (a.includes(b) && a.length <= b.length + 8) return true;
    // prefix match only if lengths close (avoid accepting doubled text as "includes")
    if (a.startsWith(b.slice(0, Math.min(24, b.length))) && a.length <= b.length * 1.25) return true;
    return false;
  }

  function selectAllIn(el) {
    try {
      el.focus();
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.select();
        return;
      }
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  }

  /** Wipe editor completely before a single insert pass. */
  async function clearEditor(el) {
    try {
      el.focus();
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const proto =
          el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        try {
          const tracker = el._valueTracker;
          if (tracker) tracker.setValue(el.value || "x");
        } catch (_) {}
        if (setter) setter.call(el, "");
        else el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      selectAllIn(el);
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      // if still has text, force empty
      if (readEditorText(el)) {
        el.textContent = "";
        el.innerHTML = "";
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 30));
  }

  async function fillNativeInput(el, text) {
    await clearEditor(el);
    el.focus();
    const proto =
      el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    try {
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue("");
    } catch (_) {}
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return editorLooksFilled(el, text);
  }

  /**
   * Single-shot fill for contenteditable/Lexical.
   * Clear once, then try strategies until ONE succeeds — never stack inserts.
   */
  async function fillContentEditable(el, text) {
    el.focus();
    await new Promise((r) => setTimeout(r, 50));
    await clearEditor(el);

    const tryInsert = async (fn) => {
      // if already good, stop
      if (editorLooksFilled(el, text)) return true;
      // if garbage/duplicate from partial, clear again
      const cur = readEditorText(el);
      if (cur) await clearEditor(el);
      try {
        el.focus();
        await fn();
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 40));
      return editorLooksFilled(el, text);
    };

    // 1) insertText once
    if (
      await tryInsert(async () => {
        selectAllIn(el);
        document.execCommand("insertText", false, text);
      })
    )
      return true;

    // 2) clipboard paste once (after clear)
    if (
      await tryInsert(async () => {
        selectAllIn(el);
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          if (!document.execCommand("paste")) {
            const dt = new DataTransfer();
            dt.setData("text/plain", text);
            el.dispatchEvent(
              new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })
            );
          }
        } else {
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          el.dispatchEvent(
            new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })
          );
        }
      })
    )
      return true;

    // 3) beforeinput + insertText once
    if (
      await tryInsert(async () => {
        selectAllIn(el);
        el.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: text,
          })
        );
        document.execCommand("insertText", false, text);
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: text,
          })
        );
      })
    )
      return true;

    // 4) DOM once
    if (
      await tryInsert(async () => {
        el.textContent = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      })
    )
      return true;

    // If doubled somehow, collapse to single
    const got = readEditorText(el);
    const b = normText(text);
    const a = normText(got);
    if (b && (a === b + b || (a.startsWith(b) && a.length >= b.length * 1.7))) {
      await clearEditor(el);
      document.execCommand("insertText", false, text);
    }
    return editorLooksFilled(el, text);
  }

  /** Click common “Add a comment” shells so shreddit composer mounts the editor. */
  async function nudgeOpenComposer(targetKind) {
    const hosts = [
      ...document.querySelectorAll(
        "shreddit-composer, shreddit-comment-composer, [data-testid='comment-submission-form'], [data-test-id='comment-submission-form'], faceplate-textarea"
      ),
    ];
    for (const root of hosts) {
      try {
        root.click?.();
      } catch (_) {}
      // click inner placeholders
      const kids = [
        ...editableInRoot(root),
        ...[...(root.querySelectorAll?.("button, [role='textbox'], [contenteditable], div, span") || [])].slice(0, 20),
      ];
      for (const c of kids) {
        const t = clean(
          c.getAttribute?.("placeholder") || c.getAttribute?.("aria-label") || c.textContent || ""
        ).slice(0, 80);
        if (
          /add a comment|what are your thoughts|join the conversation|viết bình luận|comment|reply|thoughts/i.test(
            t
          )
        ) {
          try {
            c.click?.();
          } catch (_) {}
        }
      }
      await new Promise((r) => setTimeout(r, 180));
      const a = deepActiveElement();
      if (isEditable(a) && !isOurUi(a)) return;
    }
    if (targetKind === "post" || !targetKind) {
      const box =
        document.querySelector("shreddit-composer") ||
        document.querySelector("shreddit-comment-composer") ||
        document.querySelector("[data-testid='comment-submission-form']");
      try {
        box?.scrollIntoView?.({ block: "center" });
        box?.click?.();
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  /**
   * Fill Reddit composer. Returns true only if editor text is non-empty after fill
   * (avoids Reddit "The field is required and cannot be empty").
   */
  async function fillComposerForTarget(text, target, options = {}) {
    const want = String(text || "").trim();
    if (!want) {
      console.warn("[RGL] fillComposer: empty draft text");
      return false;
    }

    const kind = options.targetKind || currentCtx?.target?.kind || "post";

    // DM / chat: jump straight to bottom composer (no shreddit comment hosts)
    if (kind === "dm" || isDmPage()) {
      let el = target && isEditable(target) && vis(target) ? target : findDmComposer();
      if (!el) {
        try {
          document.querySelector('[placeholder*="Message" i], [aria-label*="Message" i], [aria-label*="Type a message" i]')?.click?.();
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 200));
        el = findDmComposer();
      }
      if (!el) {
        const a = deepActiveElement();
        if (isEditable(a) && !isOurUi(a)) el = a;
      }
      if (!el) {
        console.warn("[RGL] fillComposer DM: no chat editor");
        showFillNotice("Không tìm thấy ô chat — click vào ô Message rồi Fill lại");
        try {
          await navigator.clipboard?.writeText(want);
        } catch (_) {}
        return false;
      }
      try {
        el.scrollIntoView?.({ block: "center", behavior: "auto" });
      } catch (_) {}
      el.click?.();
      el.focus?.();
      await new Promise((r) => setTimeout(r, 80));
      const focused = deepActiveElement();
      if (isEditable(focused) && !isOurUi(focused)) el = focused;
      let ok =
        el.tagName === "TEXTAREA" || el.tagName === "INPUT"
          ? await fillNativeInput(el, want)
          : await fillContentEditable(el, want);
      if (!ok && !readEditorText(el).trim()) {
        await clearEditor(el);
        ok =
          el.tagName === "TEXTAREA" || el.tagName === "INPUT"
            ? await fillNativeInput(el, want)
            : await fillContentEditable(el, want);
      }
      if (!ok) {
        showFillNotice("Fill chat thất bại — draft đã copy, dán ⌘V");
        try {
          await navigator.clipboard?.writeText(want);
        } catch (_) {}
      } else {
        console.log("[RGL] fillComposer DM OK", readEditorText(el).slice(0, 80));
      }
      return ok;
    }

    await nudgeOpenComposer(kind);

    let el = await findComposerForTarget(target, { ...options, preferGlobal: options.preferGlobal ?? kind === "post" });
    if (!el) {
      await new Promise((r) => setTimeout(r, 350));
      el = await findComposerForTarget(target, { ...options, preferGlobal: true, allowControl: true });
    }
    // Absolute last: any focused/page editable
    if (!el) {
      const a = deepActiveElement();
      if (isEditable(a) && !isOurUi(a)) el = a;
      else el = postPageComposer();
    }
    if (!el) {
      console.warn("[RGL] fillComposer: no editor found", { kind, preferGlobal: options.preferGlobal });
      showFillNotice("Không tìm thấy ô comment — bấm vào ô Reddit rồi Fill lại");
      return false;
    }

    // If we got a host custom element, dig for inner editable
    if (el.tagName && /COMPOSER|TEXTAREA|FACEPLATE/i.test(el.tagName) && !el.isContentEditable && el.tagName !== "TEXTAREA") {
      const inner = editableInRoot(el)[0];
      if (inner) el = inner;
    }

    try {
      el.scrollIntoView?.({ block: "center", behavior: "instant" in document.documentElement ? "instant" : "auto" });
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
    try {
      el.click?.();
    } catch (_) {}
    el.focus?.();
    await new Promise((r) => setTimeout(r, 80));

    // Prefer whatever is actually focused after click (closed shadow cases)
    const focused = deepActiveElement();
    if (isEditable(focused) && !isOurUi(focused)) el = focused;

    let ok = false;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      ok = await fillNativeInput(el, want);
    } else {
      ok = await fillContentEditable(el, want);
    }

    // Retry ONCE only if empty — never stack a second insert on partial text
    if (!ok && !readEditorText(el).trim()) {
      await new Promise((r) => setTimeout(r, 250));
      await nudgeOpenComposer(kind);
      el = (await findComposerForTarget(target, { ...options, preferGlobal: true })) || postPageComposer() || el;
      const f2 = deepActiveElement();
      if (isEditable(f2) && !isOurUi(f2)) el = f2;
      el.focus?.();
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") ok = await fillNativeInput(el, want);
      else ok = await fillContentEditable(el, want);
    }

    await new Promise((r) => setTimeout(r, 100));
    // Re-read active element — Lexical may swap node
    const f3 = deepActiveElement();
    const checkEl = isEditable(f3) && !isOurUi(f3) ? f3 : el;
    // Dedup if we still see doubled content
    const raw = readEditorText(checkEl);
    const nWant = normText(want);
    const nGot = normText(raw);
    if (nWant && nGot.startsWith(nWant) && nGot.length >= nWant.length * 1.7) {
      await clearEditor(checkEl);
      if (checkEl.tagName === "TEXTAREA" || checkEl.tagName === "INPUT") await fillNativeInput(checkEl, want);
      else {
        checkEl.focus();
        document.execCommand("insertText", false, want);
      }
    }
    const finalOk = editorLooksFilled(checkEl, want) || editorLooksFilled(el, want);
    if (!finalOk) {
      console.warn("[RGL] fillComposer: editor still empty after strategies", {
        tag: el?.tagName,
        role: el?.getAttribute?.("role"),
        ce: el?.isContentEditable,
        sample: readEditorText(el).slice(0, 40),
        active: f3?.tagName,
      });
      showFillNotice("Fill thất bại — draft đã copy, dán ⌘V vào ô comment");
      try {
        await navigator.clipboard?.writeText(want);
      } catch (_) {}
    } else {
      console.log("[RGL] fillComposer OK", readEditorText(checkEl).slice(0, 80));
    }
    return finalOk;
  }

  /**
   * After fill: find Comment/Reply submit control near the active composer and click it.
   * Refuses to submit if the editor is still empty (Reddit validation error).
   */
  async function submitComposerForTarget(target, options = {}) {
    let el = await findComposerForTarget(target, { ...options, allowControl: false, preferGlobal: options.preferGlobal !== false });
    if (!el) el = await findComposerForTarget(target, { ...options, allowControl: true, preferGlobal: true });
    if (!el) return { ok: false, reason: "no-composer" };

    // Hard gate: never click Comment on empty field
    if (!readEditorText(el).trim()) {
      return { ok: false, reason: "empty-field-refusing-submit" };
    }

    // 1) Prefer explicit submit button near editor
    const scopeRoots = [];
    let node = el;
    for (let i = 0; i < 10 && node; i++) {
      scopeRoots.push(node);
      if (node.shadowRoot) scopeRoots.push(node.shadowRoot);
      node = node.parentElement || node.getRootNode?.()?.host || null;
    }
    // also search document composers
    document.querySelectorAll("shreddit-composer, [data-testid='comment-submission-form']").forEach((n) => scopeRoots.push(n));

    const btnRe = /^(comment|reply|post|save|bình luận|trả lời)$/i;
    let submitBtn = null;
    for (const root of scopeRoots) {
      const cands = [
        ...(root.querySelectorAll?.("button,[role='button'],faceplate-tracker,input[type='submit']") || []),
      ];
      // walk shadow
      root.querySelectorAll?.("*").forEach((ch) => {
        if (ch.shadowRoot) {
          ch.shadowRoot.querySelectorAll("button,[role='button']").forEach((b) => cands.push(b));
        }
      });
      submitBtn = cands.find((b) => {
        if (b.disabled) return false;
        const t = clean(b.textContent || b.getAttribute("aria-label") || b.value || "").slice(0, 40);
        const ariaDisabled = b.getAttribute("aria-disabled");
        if (ariaDisabled === "true") return false;
        return btnRe.test(t) || /comment|reply|submit/i.test(b.getAttribute("data-testid") || "");
      });
      if (submitBtn) break;
    }

    // re-check empty right before click
    if (!readEditorText(el).trim()) {
      return { ok: false, reason: "empty-field-before-click" };
    }

    if (submitBtn) {
      try {
        submitBtn.click();
        return { ok: true, method: "button", textLen: readEditorText(el).length };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }

    // 2) Keyboard shortcut Reddit often binds
    el.focus();
    const isMac = /Mac|iPhone/.test(navigator.platform || "");
    const evInit = {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      metaKey: isMac,
      ctrlKey: !isMac,
    };
    el.dispatchEvent(new KeyboardEvent("keydown", evInit));
    el.dispatchEvent(new KeyboardEvent("keyup", evInit));
    return { ok: true, method: "mod-enter", textLen: readEditorText(el).length };
  }

  function generateAsync(ctx, only) {
    return new Promise((resolve) => {
      sendGen({ type: "generate", context: ctx, only: only || selectedModel }, resolve);
    });
  }
  async function restorePendingFill() {
    if (pendingFillRestoreInFlight) return;
    const pending = readPendingFill();
    if (!pending || !pendingMatchesPage(pending)) return;
    const target = postForPending(pending);
    if (!target) return;
    pendingFillRestoreInFlight = true;
    try {
      const filled = await fillComposerForTarget(pending.text, target, { preferGlobal: true, allowControl: true, targetKind: "post" });
      if (!filled) return;
      clearPendingFill();
      showFillNotice("✓ Đã điền comment vào đúng post");
    } finally {
      pendingFillRestoreInFlight = false;
    }
  }

  // ── extension-context guard ─────────────────────────────────────────────────
  function contextAlive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } }
  function onContextDead() {
    try { obs.disconnect(); } catch (_) {}
    stopScan(); setBusy(false); setPose("idle");
    if (bubbleEl) { const ta = bubbleEl.querySelector(".rch-draft"); if (ta && !ta.value) ta.placeholder = "Extension vừa cập nhật — F5 lại trang Reddit"; }
  }
  function sendGen(msg, cb) {
    if (!contextAlive()) return onContextDead();
    try { chrome.runtime.sendMessage(msg, (resp) => { if (chrome.runtime.lastError) { cb({ error: chrome.runtime.lastError.message }); return; } cb(resp); }); } catch (_) { onContextDead(); }
  }

  function setBusy(busy) {
    scanInFlight = busy;
    document.querySelectorAll(".rch-trigger").forEach((b) => {
      b.disabled = busy;
      b.setAttribute("aria-disabled", String(busy));
      b.style.opacity = busy ? ".55" : "";
      b.style.cursor = busy ? "wait" : "pointer";
    });
    if (bubbleEl) {
      bubbleEl.querySelectorAll(".rch-rescan,.rch-ddbtn,.rch-seed").forEach((b) => { b.disabled = busy; });
    }
  }
  function runScan() {
    if (!currentCtx || scanInFlight) return;
    ensureMascot();
    ensureBubble();
    showBubble(); // always dock + show while generating
    const ta = bubbleEl.querySelector(".rch-draft");
    ta.value = ""; ta.placeholder = "Bram đang soạn…"; ta.style.height = "auto";
    const instruction = (bubbleEl.querySelector(".rch-instr").value || "").trim();
    setBusy(true);
    const requestId = ++scanRequestId;
    startScan();
    sendGen({ type: "generate", context: { ...currentCtx, instruction, style: seeding ? "soft_mention" : "value_only" }, only: selectedModel }, (resp) => {
      if (requestId !== scanRequestId) return;
      stopScan();
      setBusy(false);
      // Re-open if user minimized mid-scan — draft still lands in bubble
      showBubble();
      if (!resp || resp.error) {
        setPose("idle");
        ta.placeholder = resp?.error || "không có phản hồi";
        positionBubble();
        return;
      }
      renderDraft((resp.drafts && resp.drafts[0]) || null);
      setPose("done");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setPose("idle"), 2600);
      positionBubble();
    });
  }
  function openPanel(ctx, targetEl) {
    if (scanInFlight) return;
    try {
      window.RGL?.automation?.pause?.();
      if (window.RGL?.bus) window.RGL.bus.paused = true;
    } catch (_) {}
    ensureMascot();
    ensureBubble();
    currentCtx = ctx;
    currentTargetEl = targetEl || null;
    // Auto-seed when OP/comment invites promo (Drop your SaaS…)
    try {
      const blob = [ctx?.title, ctx?.body, ctx?.replyingTo].filter(Boolean).join("\n");
      const promo = window.RGL?.util?.detectPromoInvite?.(blob);
      if (promo?.invite) {
        setSeeding(true);
        console.log("[RGL] promo invite → seeding ON", promo.reasons);
      }
    } catch (_) {}
    bubbleEl.querySelector(".rch-instr").value = "";
    fillTarget(ctx.target);
    renderQuote(ctx);
    showBubble();
    runScan();
  }

  // ── DM / chat assist (inbox + chat.reddit.com) ─────────────────────────────
  // Human-in-the-loop: generate support-style draft → Fill into composer → you Send.
  function isDmPage(loc) {
    try {
      const host = String((loc || location).hostname || "");
      const path = String((loc || location).pathname || "");
      if (/(^|\.)chat\.reddit\.com$/i.test(host)) return true;
      if (/\/chat(\/|$)/i.test(path)) return true;
      if (/\/message(s)?(\/|$)/i.test(path)) return true;
      if (/\/mail(\/|$)/i.test(path)) return true;
    } catch (_) {}
    return false;
  }

  function dmPeerUsername() {
    const fromHref = (href) => {
      const m = String(href || "").match(/\/(?:user|u)\/([^/?#]+)/i);
      if (!m) return "";
      const u = decodeURIComponent(m[1]).replace(/^u\//i, "");
      if (!u || /^(me|reddit|AutoModerator|spam|admin)$/i.test(u)) return "";
      return u;
    };
    // Header / room title links first
    const headerSels = [
      '[data-testid="room-header"] a[href*="/user/"]',
      '[data-testid="room-header"] a[href*="/u/"]',
      "header a[href*='/user/']",
      "header a[href*='/u/']",
      '[class*="RoomHeader"] a[href*="/user/"]',
      '[class*="chat-header"] a[href*="/user/"]',
      'a[href*="/user/"][class*="username"]',
    ];
    for (const sel of headerSels) {
      try {
        const a = document.querySelector(sel);
        const u = fromHref(a?.getAttribute?.("href") || a?.href);
        if (u) return u;
      } catch (_) {}
    }
    // Title: "username : Reddit" / "u/foo - Chat"
    try {
      const t = document.title || "";
      let m = t.match(/\bu\/([A-Za-z0-9_-]{2,30})\b/i);
      if (m) return m[1];
      m = t.match(/^([A-Za-z0-9_-]{2,30})\s*[:|·\-–—]/);
      if (m && !/reddit|chat|inbox|messages/i.test(m[1])) return m[1];
    } catch (_) {}
    // Most frequent /user/ link in main pane (excluding self nav)
    const counts = new Map();
    try {
      document.querySelectorAll('a[href*="/user/"], a[href*="/u/"]').forEach((a) => {
        const u = fromHref(a.getAttribute("href") || a.href);
        if (!u) return;
        counts.set(u, (counts.get(u) || 0) + 1);
      });
    } catch (_) {}
    let best = "", bestN = 0;
    for (const [u, n] of counts) {
      if (n > bestN) {
        best = u;
        bestN = n;
      }
    }
    return best;
  }

  function guessMsgRole(text, author, peer, myNames) {
    const a = String(author || "").replace(/^u\//i, "").toLowerCase();
    if (a && myNames.has(a)) return "me";
    if (a && peer && a === peer.toLowerCase()) return "them";
    // Heuristic: no author → them if we only care about last inbound
    return a ? "them" : "them";
  }

  function dmMyUsernames() {
    const set = new Set();
    try {
      // Logged-in user chip / avatar menu
      document.querySelectorAll('a[href*="/user/"], a[href*="/u/"]').forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (/\/user\/me\b|\/u\/me\b/i.test(href)) return;
        // "profile" in user drawer often has data attributes
        const label = clean(a.getAttribute("aria-label") || a.textContent || "");
        if (/profile|your profile|account/i.test(label)) {
          const m = href.match(/\/(?:user|u)\/([^/?#]+)/i);
          if (m) set.add(decodeURIComponent(m[1]).toLowerCase());
        }
      });
    } catch (_) {}
    return set;
  }

  function collectDmMessages(peer, limit = 18) {
    const out = [];
    const seen = new Set();
    const myNames = dmMyUsernames();
    const push = (text, author, roleHint) => {
      const t = clean(text).slice(0, 800);
      if (!t || t.length < 2) return;
      // Skip chrome / nav crumbs
      if (/^(send|message|chat|inbox|settings|search|reddit|home|popular)$/i.test(t)) return;
      if (t.length > 600 && !/[.!?…]/.test(t)) return; // wall of UI junk
      const key = t.slice(0, 120).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const authorClean = String(author || "").replace(/^u\//i, "");
      const role = roleHint || guessMsgRole(t, authorClean, peer, myNames);
      out.push({ role, author: authorClean || (role === "them" ? peer : ""), text: t });
    };

    const fromHref = (href) => {
      const m = String(href || "").match(/\/(?:user|u)\/([^/?#]+)/i);
      return m ? decodeURIComponent(m[1]) : "";
    };

    // Prefer explicit message containers when present
    const msgSels = [
      '[data-testid="message"]',
      '[data-testid="chat-message"]',
      '[data-testid="timeline-message"]',
      '[class*="TimelineMessage"]',
      '[class*="ChatMessage"]',
      '[class*="message-content"]',
      "rs-message",
      "li[class*='message' i]",
    ];
    let nodes = [];
    for (const sel of msgSels) {
      try {
        nodes = [...document.querySelectorAll(sel)];
        if (nodes.length) break;
      } catch (_) {}
    }

    if (nodes.length) {
      for (const n of nodes) {
        if (isOurUi(n)) continue;
        let author = "";
        try {
          const a = n.querySelector?.('a[href*="/user/"], a[href*="/u/"]');
          author = fromHref(a?.getAttribute?.("href") || a?.href);
        } catch (_) {}
        // Drop author name from text if duplicated
        let text = clean(n.textContent || "");
        if (author) text = text.replace(new RegExp("^" + author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), "");
        text = text.replace(/\b(Just now|\d+\s*(m|h|d|min|hour|day)s?\s*ago)\b/gi, "").trim();
        push(text, author);
      }
    } else {
      // Fallback: walk listitems / articles in main
      const root =
        document.querySelector('[role="main"], main, #AppRouter-main-content, [class*="Timeline"], [class*="MessageList"]') ||
        document.body;
      const items = [
        ...root.querySelectorAll('[role="listitem"], article, [class*="Message"], [class*="bubble"]'),
      ].slice(-40);
      for (const n of items) {
        if (isOurUi(n) || !vis(n)) continue;
        const r = n.getBoundingClientRect?.();
        if (r && r.height > 280) continue; // skip huge containers
        let author = "";
        try {
          const a = n.querySelector?.('a[href*="/user/"], a[href*="/u/"]');
          author = fromHref(a?.getAttribute?.("href") || a?.href);
        } catch (_) {}
        const text = clean(n.textContent || "").slice(0, 800);
        if (text.split(/\s+/).length < 2 && text.length < 8) continue;
        push(text, author);
      }
    }

    // Keep last N only (conversation tail)
    return out.slice(-limit);
  }

  function findDmComposer() {
    // Bottom-most visible editable — chat composers sit at the bottom
    const editables = allPageEditables().filter((el) => vis(el) && !isOurUi(el));
    if (!editables.length) {
      // Try placeholder shells
      const shells = [
        ...document.querySelectorAll(
          'textarea, [contenteditable="true"], [role="textbox"], [data-testid*="composer"], [placeholder*="Message" i], [aria-label*="Message" i], [aria-label*="Type" i]'
        ),
      ];
      for (const s of shells) {
        if (isOurUi(s)) continue;
        if (isEditable(s) && vis(s)) return s;
        const inner = editableInRoot(s)[0];
        if (inner && vis(inner)) return inner;
      }
      return null;
    }
    return editables
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, y: r.bottom, area: r.width * r.height };
      })
      .sort((a, b) => b.y - a.y || b.area - a.area)[0]?.el || null;
  }

  function dmContext() {
    const peer = dmPeerUsername();
    const messages = collectDmMessages(peer, 18);
    const lastThem =
      [...messages].reverse().find((m) => m.role !== "me")?.text ||
      [...messages].reverse()[0]?.text ||
      "";
    const blob = messages.map((m) => m.text).join("\n");
    const lang = detectLang(blob || lastThem);
    const questions = extractQuestions(lastThem || blob);
    const label = peer ? `💬 DM · u/${peer}` : "💬 DM / Chat";
    return {
      channel: "dm",
      kind: "dm",
      peer,
      title: peer ? `Chat with u/${peer}` : "Reddit chat",
      body: lastThem.slice(0, 1500),
      messages,
      replyingTo: lastThem.slice(0, 1200),
      replyAuthor: peer,
      subreddit: "",
      topComments: [],
      images: [],
      questions,
      lang,
      target: { kind: "dm", label, author: peer || "" },
    };
  }

  function injectDmAssist(scope = document) {
    if (!isDmPage()) {
      // Remove floating DM trigger when leaving chat
      document.querySelectorAll('.rch-trigger[data-rch-kind="dm"]').forEach((b) => {
        try {
          b.remove();
        } catch (_) {}
      });
      return;
    }
    // One floating dock near the composer (chat UIs rarely have stable action bars)
    let dock = document.querySelector(".rch-dm-dock");
    if (!dock || !dock.isConnected) {
      dock = document.createElement("div");
      dock.className = "rch-dm-dock";
      dock.setAttribute(
        "style",
        "position:fixed;z-index:2147483002;right:18px;bottom:88px;display:flex;flex-direction:column;gap:8px;pointer-events:none;"
      );
      document.documentElement.appendChild(dock);
    }
    let btn = dock.querySelector('.rch-trigger[data-rch-kind="dm"]');
    if (!btn) {
      btn = mkBtn("DM Reply", "Soạn reply DM / chat (support assist) — Fill rồi bạn bấm Send");
      btn.dataset.rchKind = "dm";
      btn.setAttribute("data-rch-kind", "dm");
      btn.setAttribute("data-rch-entity", "dm:global");
      btn.setAttribute("data-rch-for", "dm:global");
      btn.style.pointerEvents = "auto";
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ctx = dmContext();
        const composer = findDmComposer();
        openPanel(ctx, composer || null);
      };
      dock.appendChild(btn);
    }
    // Reposition dock above composer if we can find it
    try {
      const composer = findDmComposer();
      if (composer) {
        const r = composer.getBoundingClientRect();
        const bottom = Math.max(24, window.innerHeight - r.top + 12);
        dock.style.bottom = Math.min(220, bottom) + "px";
        dock.style.right = Math.max(12, window.innerWidth - r.right) + "px";
      } else {
        dock.style.bottom = "88px";
        dock.style.right = "18px";
      }
    } catch (_) {}
  }

  // ── context extraction (read LAZILY on click) ──────────────────────────────
  function pageSubreddit() { const m = location.pathname.match(/\/r\/([^/]+)/); return m ? "r/" + m[1] : ""; }
  function postImages(postEl) {
    const out = [];
    const scope = postEl && postEl.querySelectorAll ? postEl : document;
    scope.querySelectorAll("img").forEach((img) => { const u = img.currentSrc || img.getAttribute("src") || ""; if (/^https?:\/\/(i|preview|external-preview)\.redd\.it\//.test(u)) out.push(u); });
    if (postEl?.classList?.contains("thing")) { const du = postEl.getAttribute("data-url") || ""; if (/^https?:\/\/i\.redd\.it\//.test(du) || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(du)) out.push(du); }
    return [...new Set(out)].slice(0, 3);
  }
  function postContext(postEl) {
    let title = "", body = "", sub = pageSubreddit();
    if (postEl && postEl.tagName === "SHREDDIT-POST") {
      title = postEl.getAttribute("post-title") || "";
      body = clean(postEl.querySelector('[slot="text-body"]')?.textContent);
      sub = postEl.getAttribute("subreddit-prefixed-name") || sub;
    } else if (postEl && postEl.classList?.contains("thing")) {
      title = clean(postEl.querySelector("a.title")?.textContent);
      body = clean(postEl.querySelector(".usertext-body")?.textContent);
      sub = postEl.getAttribute("data-subreddit") ? "r/" + postEl.getAttribute("data-subreddit") : sub;
    } else {
      title = clean(document.querySelector("shreddit-post")?.getAttribute("post-title")) || document.querySelector('meta[property="og:title"]')?.content || clean(document.querySelector("h1")?.textContent) || document.title;
      body = clean(document.querySelector('[slot="text-body"], .expando .usertext-body')?.textContent) || document.querySelector('meta[property="og:description"]')?.content || "";
    }
    const nodes = document.querySelectorAll('shreddit-comment[depth="0"] > [slot="comment"], .commentarea > .sitetable > .comment > .entry .usertext-body');
    const topComments = [...nodes].slice(0, 4).map((n) => clean(n.textContent).slice(0, 240)).filter(Boolean);
    const t = (title || "").slice(0, 300);
    const images = postImages(postEl);
    const questions = extractQuestions(t + ". " + body);
    const label = "📝 POST" + (images.length ? ` · 🖼 ${images.length}` : "") + (questions.length ? ` · 🎯 ${questions.length} câu hỏi` : "");
    return { title: t, body: body.slice(0, 1500), subreddit: sub, topComments, images, questions, lang: detectLang(t + " " + body), target: { kind: "post", label, author: "" } };
  }
  // Comment hosts Reddit currently uses across old/new UI (shared by context + inject).
  const COMMENT_HOST_SEL =
    "shreddit-comment, div[data-testid='comment'], .Comment, div.thing.comment, article[id^='t1_']";
  const COMMENT_OWNER_SEL =
    "shreddit-comment, div[data-testid='comment'], .Comment, div.thing.comment, article[id^='t1_'], .comment";
  const POST_OWNER_SEL = "shreddit-post, .thing.link, [data-testid='post-container']";

  function commentDepth(el) {
    if (el.tagName === "SHREDDIT-COMMENT") {
      const attr = el.getAttribute("depth");
      if (attr != null && attr !== "") return Number(attr) || 0;
    }
    let d = 0;
    let p = el.parentElement;
    while (p) {
      if (p.matches?.(COMMENT_OWNER_SEL) || p.classList?.contains("comment")) d++;
      p = p.parentElement;
    }
    return d;
  }

  function commentBodyNodes(commentEl) {
    // Prefer own slot/body, not nested child comments' text
    const sels = ['[slot="comment"]', ".usertext-body", ".md", "[data-testid='comment']"];
    const own = [];
    const collect = (root) => {
      if (!root?.querySelectorAll) return;
      for (const sel of sels) {
        root.querySelectorAll(sel).forEach((n) => {
          const owner = n.closest?.(COMMENT_OWNER_SEL) || commentEl;
          if (owner !== commentEl) return;
          const t = clean(n.textContent);
          if (t) own.push({ el: n, t });
        });
        if (own.length) return;
      }
    };
    collect(commentEl);
    if (!own.length) collect(commentEl.shadowRoot);
    // Nested replies under this comment (for context when replying to parent)
    const nested = [];
    commentEl.querySelectorAll?.(COMMENT_HOST_SEL).forEach((child) => {
      if (child === commentEl) return;
      // Only direct-ish children in the tree under this host
      const parentHost = child.parentElement?.closest?.(COMMENT_OWNER_SEL);
      if (parentHost && parentHost !== commentEl) return;
      const t =
        clean(child.querySelector?.('[slot="comment"], .usertext-body, .md')?.textContent) ||
        clean(child.shadowRoot?.querySelector?.('[slot="comment"], .md')?.textContent) ||
        "";
      if (t) nested.push(t.slice(0, 240));
    });
    return {
      ownText: own[0]?.t || "",
      nestedTexts: nested.slice(0, 20),
    };
  }

  function commentContext(commentEl) {
    const base = postContext(null);
    const { ownText, nestedTexts } = commentBodyNodes(commentEl);
    const author = commentAuthor(commentEl);
    const depth = commentDepth(commentEl);
    const nReplies = nestedTexts.length;
    const replyingTo = ownText || "";
    const qOwn = extractQuestions(replyingTo);
    const questions = qOwn.length ? qOwn : base.questions;
    const label =
      (depth > 0 ? `↳ SUB-REPLY (cấp ${depth})` : "💬 REPLY") +
      (nReplies ? ` · ${nReplies} reply` : "") +
      (qOwn.length ? ` · 🎯 ${qOwn.length} câu hỏi` : "");
    return {
      ...base,
      replyingTo,
      replyAuthor: author,
      subReplies: nestedTexts,
      questions,
      lang: detectLang(replyingTo) || base.lang,
      target: { kind: "comment", label, author },
    };
  }

  // ── inject buttons ─────────────────────────────────────────────────────────
  function isOwnedBy(host, el) {
    if (!el) return false;
    const owner = el.closest?.(COMMENT_OWNER_SEL + "," + POST_OWNER_SEL);
    return owner === host;
  }

  /** "3 more replies" / "Continue this thread" — NEVER treat as Reply (clicking expands threads). */
  function isMoreRepliesControl(el) {
    if (!el) return false;
    const bits = [
      el.getAttribute?.("aria-label") || "",
      el.getAttribute?.("data-testid") || "",
      el.getAttribute?.("data-post-click-location") || "",
      el.getAttribute?.("name") || "",
      clean(el.textContent || "").slice(0, 120),
    ]
      .join(" ")
      .toLowerCase();
    return /more\s*replies|view\s*more\s*replies|load\s*more|show\s*more|continue this thread|xem thêm|thêm trả lời|thêm phản hồi|more comments/i.test(
      bits
    );
  }

  function matchAction(el, wordRe) {
    if (!el) return false;
    if (isMoreRepliesControl(el)) return false;
    const bits = [
      el.getAttribute?.("aria-label") || "",
      el.getAttribute?.("data-post-click-location") || "",
      el.getAttribute?.("data-testid") || "",
      el.getAttribute?.("name") || "",
      clean(el.textContent || "").slice(0, 80),
    ].join(" ");
    return wordRe.test(bits);
  }

  /**
   * Only inject ✦ Reply on comments the user can already see (expanded).
   * Do not force nested trees open — wait until they click "more replies".
   */
  function isCommentEligibleForReplyInject(el) {
    if (!el?.isConnected) return false;
    if (el.hasAttribute?.("collapsed") || el.getAttribute?.("collapsed") === "true") return false;
    if (el.getAttribute?.("is-collapsed") === "true") return false;
    if (el.getAttribute?.("aria-hidden") === "true" || el.hidden) return false;

    // Ancestor comment collapsed → this node is folded away
    let p = el.parentElement;
    while (p) {
      if (p.matches?.(COMMENT_OWNER_SEL)) {
        if (p.hasAttribute?.("collapsed") || p.getAttribute?.("collapsed") === "true") return false;
        if (p.getAttribute?.("is-collapsed") === "true") return false;
        if (p.getAttribute?.("aria-hidden") === "true") return false;
      }
      p = p.parentElement;
    }

    // Zero / tiny layout = not painted (still behind "more replies" stub)
    const r = el.getBoundingClientRect?.();
    if (!r || r.width < 12 || r.height < 18) return false;
    try {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    } catch (_) {}

    // Must have some comment body text area visible
    const body =
      el.querySelector?.('[slot="comment"], .usertext-body, .md, [data-testid="comment"]') ||
      el.shadowRoot?.querySelector?.('[slot="comment"], .md');
    if (body) {
      const br = body.getBoundingClientRect?.();
      if (br && br.height < 4 && br.width < 4) return false;
    }
    return true;
  }

  // Walk light + open shadow roots (depth-limited) to find Reply/Share controls.
  // Nested child comments are excluded via ownership so parent inject stays clean.
  // Never returns "more replies" expanders (would auto-unroll threads).
  function scanActionControls(root, wordRe, host, depth = 0) {
    if (!root || depth > 5) return null;
    const cands = root.querySelectorAll?.("button, a, faceplate-tracker, [role='button']") || [];
    for (const c of cands) {
      if (host && root === host && !isOwnedBy(host, c) && c.getRootNode?.() === document) continue;
      if (isMoreRepliesControl(c)) continue;
      if (matchAction(c, wordRe)) return c;
    }
    // Nested shadow roots (faceplate-button etc.)
    const all = root.querySelectorAll?.("*") || [];
    for (const el of all) {
      if (!el.shadowRoot) continue;
      // Don't descend into nested comment hosts' shadows from a parent scan of light children
      if (host && el !== host && el.matches?.(COMMENT_OWNER_SEL) && el !== host) continue;
      const hit = scanActionControls(el.shadowRoot, wordRe, host, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  function actionAnchor(host, wordRe) {
    const ownerSelector = host.matches?.(COMMENT_OWNER_SEL) ? COMMENT_OWNER_SEL : POST_OWNER_SEL;
    const list = [...(host.querySelectorAll?.(".flat-list.buttons") || [])]
      .find((candidate) => candidate.closest(ownerSelector) === host);
    if (list) {
      const li = [...list.children].find((c) => wordRe.test(c.className) || wordRe.test(c.textContent || ""));
      return { after: li || list.lastElementChild, container: list, old: true };
    }
    const inShadow = scanActionControls(host.shadowRoot, wordRe, host);
    if (inShadow) return { after: inShadow, container: inShadow.parentElement, shadow: true };
    const inLight = scanActionControls(host, wordRe, host);
    if (inLight) return { after: inLight, container: inLight.parentElement };
    return null;
  }

  function queryOwn(host, selector) {
    const out = [];
    const pushMatches = (root) => {
      if (!root?.querySelectorAll) return;
      root.querySelectorAll(selector).forEach((n) => out.push(n));
    };
    pushMatches(host);
    pushMatches(host.shadowRoot);
    return out;
  }

  function ownContentElement(host, kind) {
    const selector = kind === "comment"
      ? '[slot="comment"],.entry,.usertext-body,[data-testid="comment"],.md'
      : '[slot="text-body"],.entry,.usertext-body';
    const nodes = queryOwn(host, selector).filter((candidate) => {
      // Prefer nodes that belong to this host, not a nested child comment
      const nested = candidate.closest?.(COMMENT_OWNER_SEL);
      if (nested && nested !== host) return false;
      return true;
    });
    return nodes.sort((a, b) => {
      const rank = (el) =>
        el.matches?.('[slot="comment"],[slot="text-body"]') ? 0
          : el.matches?.(".entry,.usertext-body") ? 1
            : el.matches?.(".md") ? 2
              : 3;
      return rank(a) - rank(b);
    })[0] || null;
  }

  // Stable entity keys (post/comment reddit ids) — random uids caused infinite
  // Comment buttons: each SPA re-render minted a new uid while old buttons lived on.
  let uidSeq = 0;
  function bareId(raw) {
    return String(raw || "")
      .replace(/^(t3_|t1_|thing_t3_|thing_t1_)/i, "")
      .toLowerCase()
      .trim();
  }

  function entityKey(host, kind) {
    if (!host) return "";
    const existing = host.getAttribute("data-rch-entity");
    if (existing) return existing;

    let key = "";
    if (kind === "post" || host.tagName === "SHREDDIT-POST" || host.matches?.(".thing.link, [data-testid='post-container'], article[id^='t3_']")) {
      const raw =
        host.getAttribute("id") ||
        host.getAttribute("thingid") ||
        host.getAttribute("post-id") ||
        host.getAttribute("data-fullname") ||
        host.getAttribute("data-post-id") ||
        host.getAttribute("permalink") ||
        "";
      const fromPerm = String(raw).match(/\/comments\/([a-z0-9]+)/i);
      const id = bareId(fromPerm ? fromPerm[1] : raw);
      if (id && /^[a-z0-9]{5,12}$/i.test(id)) key = `p_${id}`;
    }
    if (!key && (kind === "comment" || host.matches?.(COMMENT_OWNER_SEL))) {
      const raw =
        host.getAttribute("thingid") ||
        host.getAttribute("comment-id") ||
        host.getAttribute("id") ||
        host.getAttribute("data-fullname") ||
        host.getAttribute("data-comment-id") ||
        "";
      const id = bareId(raw);
      if (id && /^[a-z0-9]{5,12}$/i.test(id)) key = `c_${id}`;
    }
    if (!key) {
      // Last resort — still better than pure random every call if attr sticks
      let fallback = host.getAttribute("data-rch-uid");
      if (!fallback) {
        fallback = `r${(++uidSeq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        host.setAttribute("data-rch-uid", fallback);
      }
      key = fallback;
    }
    host.setAttribute("data-rch-entity", key);
    host.setAttribute("data-rch-uid", key); // alias for older paths
    return key;
  }

  function hostUid(host, kind) {
    return entityKey(host, kind);
  }

  function makeTriggerRow(host, kind) {
    const row = document.createElement("div");
    row.className = "rch-trigger-row";
    const key = host ? entityKey(host, kind) : "";
    if (key) {
      row.setAttribute("data-rch-for", key);
      row.setAttribute("data-rch-entity", key);
    }
    row.setAttribute(
      "style",
      "display:inline-flex;align-items:center;width:fit-content;margin:4px 8px 6px;position:relative;z-index:5;vertical-align:middle;"
    );
    return row;
  }

  function isVoteControl(el) {
    if (!el) return false;
    const bits = [
      el.getAttribute?.("aria-label") || "",
      el.getAttribute?.("data-post-click-location") || "",
      el.getAttribute?.("data-testid") || "",
      el.getAttribute?.("name") || "",
      clean(el.textContent || "").slice(0, 40),
    ].join(" ").toLowerCase();
    // Never park our button next to these — was squeezing between up/downvote
    return /\b(up\s?vote|down\s?vote|upvote|downvote)\b/.test(bits) ||
      /vote-(up|down)|upvote|downvote|arrowUp|arrowDown/i.test(bits);
  }

  /**
   * Find Share (preferred) or the last non-vote control in the action bar.
   * Never return an upvote/downvote node — that caused ✦ Comment between votes.
   */
  function findSafeActionAnchor(host) {
    // 1) Share first
    const share = actionAnchor(host, /\bshare\b/i);
    if (share?.after && !isVoteControl(share.after) && share.after.parentElement) {
      return { el: share.after, parent: share.after.parentElement, shadow: !!share.shadow, kind: "share" };
    }
    // 2) Reply / Award / comment-count (still not vote)
    for (const re of [/\breply\b/i, /\baward\b/i, /\bcomment/i]) {
      const a = actionAnchor(host, re);
      if (a?.after && !isVoteControl(a.after) && a.after.parentElement) {
        return { el: a.after, parent: a.after.parentElement, shadow: !!a.shadow, kind: "action" };
      }
    }
    // 3) Walk light buttons, pick last non-vote in a row that has share/reply
    const collect = (root) =>
      [...(root?.querySelectorAll?.("button, a, faceplate-tracker, [role='button']") || [])].filter((el) => {
        if (host && root === host && !isOwnedBy(host, el) && el.getRootNode?.() === document) return false;
        return true;
      });
    const light = collect(host);
    const nonVote = light.filter((el) => !isVoteControl(el) && matchAction(el, /share|reply|award|comment/i));
    if (nonVote.length && nonVote[nonVote.length - 1].parentElement) {
      const el = nonVote[nonVote.length - 1];
      return { el, parent: el.parentElement, shadow: false, kind: "row-end" };
    }
    return null;
  }

  /**
   * ALWAYS place the trigger row INSIDE the host node.
   * Never insertAdjacent on external action bars — those re-render and leave
   * orphan buttons stacked on the feed card (the multi-Comment bug).
   */
  function fallbackTriggerRow(host, kind) {
    const row = makeTriggerRow(host, kind);

    if (kind === "comment") {
      const ownContent = ownContentElement(host, "comment");
      if (ownContent && host.contains(ownContent)) {
        try {
          // Prefer after body but still under this comment host
          const parent = ownContent.parentElement;
          if (parent && host.contains(parent)) {
            parent.insertBefore(row, ownContent.nextSibling);
            if (row.isConnected && host.contains(row)) return row;
          }
        } catch (_) {}
        try {
          ownContent.appendChild(row);
          if (host.contains(row)) return row;
        } catch (_) {}
      }
    }

    // Posts + fallback comments: append inside host, before nested comment trees
    const boundary = [...(host.children || [])].find((child) =>
      child.matches?.(
        'shreddit-comment,div[data-testid="comment"],.Comment,.comment,.child,[slot="children"],shreddit-composer,[data-testid="comment-submission-form"]'
      )
    );
    try {
      if (boundary) host.insertBefore(row, boundary);
      else host.appendChild(row);
    } catch (_) {
      try { host.appendChild(row); } catch (__) {}
    }
    return row;
  }

  function triggersFor(host, kind) {
    if (!host) return [];
    const key = entityKey(host, kind);
    const local = [
      ...(host.querySelectorAll?.(".rch-trigger, .rch-trigger-row") || []),
      ...(host.shadowRoot?.querySelectorAll?.(".rch-trigger, .rch-trigger-row") || []),
    ];
    const remote = key
      ? [
          ...document.querySelectorAll(
            `.rch-trigger[data-rch-entity="${key}"], .rch-trigger-row[data-rch-entity="${key}"],` +
              `.rch-trigger[data-rch-for="${key}"], .rch-trigger-row[data-rch-for="${key}"]`
          ),
        ]
      : [];
    return [...new Set([...local, ...remote])].filter((el) => el?.isConnected);
  }

  function hasTrigger(host, kind) {
    return triggersFor(host, kind).some(
      (el) => el.classList?.contains("rch-trigger") || !!el.querySelector?.(".rch-trigger")
    );
  }

  /** Keep exactly one live button per entity; drop the rest (including outside host). */
  function dedupeTriggers(host, kind) {
    const all = triggersFor(host, kind);
    const buttons = all.filter((el) => el.classList?.contains("rch-trigger"));
    // Prefer a button still inside the host
    const keep =
      buttons.find((b) => host.contains(b) || host.shadowRoot?.contains?.(b)) ||
      buttons[0] ||
      null;
    for (const b of buttons) {
      if (b !== keep) {
        try { b.remove(); } catch (_) {}
      }
    }
    for (const r of all.filter((el) => el.classList?.contains("rch-trigger-row"))) {
      if (!r.querySelector?.(".rch-trigger")) {
        try { r.remove(); } catch (_) {}
      }
    }
    return !!keep?.isConnected;
  }

  /**
   * Global sweep: one button per entity key; nuke untagged spam;
   * on feed pages, strip ALL reply triggers (comments shouldn't inject there).
   */
  function purgeOrphanTriggers() {
    try {
      const onPostPage = /\/comments\//i.test(location.pathname);
      const byKey = new Map();

      document.querySelectorAll(".rch-trigger").forEach((b) => {
        const kind = b.getAttribute("data-rch-kind") || "";
        // Floating DM assist lives outside post hosts — keep a single dock button
        if (kind === "dm") {
          const key = "dm:global";
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(b);
          return;
        }
        // Feed must never show Reply buttons (nested comment inject leaking)
        if (!onPostPage && kind === "reply") {
          try { b.remove(); } catch (_) {}
          return;
        }
        const key = b.getAttribute("data-rch-entity") || b.getAttribute("data-rch-for") || "";
        if (!key) {
          try { b.remove(); } catch (_) {}
          return;
        }
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(b);
      });

      for (const [, list] of byKey) {
        // Keep the first connected; remove the rest
        list.slice(1).forEach((b) => {
          try { b.remove(); } catch (_) {}
        });
      }

      document.querySelectorAll(".rch-trigger-row").forEach((r) => {
        if (!r.querySelector(".rch-trigger")) {
          try { r.remove(); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  /** @returns {boolean} whether the button is in the live DOM */
  function place(host, btn, wordRe, kind) {
    const key = entityKey(host, kind);
    btn.setAttribute("data-rch-for", key);
    btn.setAttribute("data-rch-entity", key);
    btn.setAttribute("data-rch-kind", kind === "comment" ? "reply" : "comment");

    // Wipe any prior copies for this entity, then place exactly one inside host
    dedupeTriggers(host, kind);
    if (hasTrigger(host, kind)) {
      try { btn.remove(); } catch (_) {}
      return true;
    }

    // Old reddit flat-list only (must stay inside host)
    const a = actionAnchor(host, wordRe);
    try {
      if (a && a.old && a.after && !isVoteControl(a.after) && host.contains(a.after)) {
        const li = document.createElement("li");
        li.setAttribute("data-rch-for", key);
        li.setAttribute("data-rch-entity", key);
        li.appendChild(btn);
        a.after.insertAdjacentElement("afterend", li);
        if (btn.isConnected && host.contains(btn)) return true;
      }
    } catch (_) { /* fall through */ }

    btn.classList.add("rch-fallback");
    btn.style.position = "static";
    btn.style.display = "inline-flex";
    btn.style.margin = "4px 6px";
    if (scanInFlight) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.style.opacity = ".55";
      btn.style.cursor = "wait";
    }
    const row = fallbackTriggerRow(host, kind);
    if (row && host.contains(row)) {
      row.setAttribute("data-rch-for", key);
      row.setAttribute("data-rch-entity", key);
      row.appendChild(btn);
      // Final safety: if somehow outside, pull back into host
      if (!host.contains(btn)) {
        try { host.appendChild(btn); } catch (_) {}
      }
      return !!btn.isConnected && host.contains(btn);
    }
    try {
      host.appendChild(btn);
      return !!btn.isConnected && host.contains(btn);
    } catch (_) {
      btn.remove();
      return false;
    }
  }

  function commentAuthor(commentEl) {
    if (commentEl.tagName === "SHREDDIT-COMMENT") {
      return commentEl.getAttribute("author") || commentEl.getAttribute("author-name") || "";
    }
    return clean(
      commentEl.getAttribute("author") ||
        commentEl.getAttribute("data-author") ||
        commentEl.querySelector?.("a[href*='/user/'], a.author, [data-testid='comment_author_link']")?.textContent ||
        ""
    );
  }

  function isAutoModeratorComment(commentEl) {
    return commentAuthor(commentEl).replace(/^u\//i, "").trim().toLowerCase() === "automoderator";
  }

  /**
   * Removed / deleted comments — never inject Reply or auto-reply.
   * Matches Reddit copy: "Comment removed by moderator", "[removed]", deleted by user, etc.
   */
  function isRemovedComment(commentEl) {
    if (!commentEl) return false;
    // Explicit attrs Reddit sometimes sets
    const attrBlob = [
      commentEl.getAttribute?.("is-removed"),
      commentEl.getAttribute?.("removed"),
      commentEl.getAttribute?.("deleted"),
      commentEl.getAttribute?.("data-removed"),
      commentEl.getAttribute?.("data-deleted"),
      commentEl.getAttribute?.("moderator-removed"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/^(true|1|yes|removed|deleted)$/i.test(attrBlob) || /removed|deleted/.test(attrBlob)) {
      // data-removed="" alone is weak; still check text below
      if (commentEl.hasAttribute?.("is-removed") || commentEl.getAttribute?.("is-removed") === "true") return true;
      if (commentEl.hasAttribute?.("deleted") && commentEl.getAttribute("deleted") !== "false") return true;
    }

    const author = commentAuthor(commentEl).replace(/^u\//i, "").trim().toLowerCase();
    if (author === "[deleted]" || author === "deleted" || author === "[removed]") return true;

    // Body / status text Reddit injects for removals
    const bodyBits = [
      commentEl.querySelector?.('[slot="comment"]')?.textContent,
      commentEl.querySelector?.(".usertext-body, .md, [data-testid='comment']")?.textContent,
      commentEl.shadowRoot?.querySelector?.('[slot="comment"], .md, faceplate-tracker')?.textContent,
      // Status lines sometimes sit outside the main slot
      commentEl.querySelector?.("[id*='removed'], [class*='removed'], [class*='deleted']")?.textContent,
    ]
      .map((t) => clean(t || ""))
      .filter(Boolean)
      .join("\n");

    const slice = (bodyBits || clean(commentEl.textContent || "")).slice(0, 280);
    if (
      /comment removed by moderator|removed by moderator|comment deleted by user|deleted by user|\[removed\]|\[deleted\]|this comment was removed|comment has been removed|bình luận đã bị gỡ|đã bị mod xóa|đã bị xóa bởi/i.test(
        slice
      )
    ) {
      return true;
    }
    // Bare placeholder body
    if (/^\[(removed|deleted)\]$/i.test(slice.trim())) return true;
    return false;
  }

  function isPromotedComment(commentEl) {
    if (commentEl.getAttribute?.("is-ad") === "true") return true;
    if (commentEl.hasAttribute?.("promoted")) return true;
    if (commentEl.getAttribute?.("data-promoted") === "true") return true;
    // Promoted units sometimes sit as generic articles with a "Promoted" badge
    const badge = clean(
      commentEl.querySelector?.("[id*='promoted'], .promoted-label, span")?.textContent || ""
    ).slice(0, 40);
    if (/^promoted$/i.test(badge)) return true;
    const slice = clean(commentEl.textContent || "").slice(0, 120);
    return /\bpromoted\b/i.test(slice) && /learn more|shop now|install/i.test(slice);
  }

  function collectCommentHosts(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    // Nested comments only when already expanded/visible (user clicked more replies).
    // Never force-open collapsed trees just to inject buttons.
    const list = [...(root.querySelectorAll?.(COMMENT_HOST_SEL) || [])];
    const seen = new Set();
    const out = [];
    for (const el of list) {
      if (seen.has(el)) continue;
      if (el.tagName !== "SHREDDIT-COMMENT" && el.closest?.("shreddit-comment")) continue;
      if (!isCommentEligibleForReplyInject(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function collectPostHosts(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    // ONLY real post hosts — faceplate-tracker was matching many nodes per card
    // and spawning a Comment button for each (feed multi-button bug).
    const list = [
      ...(root.querySelectorAll?.("shreddit-post, .thing.link") || []),
    ];
    // Fallback containers only when no shreddit-post exists for that card
    const containers = [
      ...(root.querySelectorAll?.("[data-testid='post-container'], article[id^='t3_']") || []),
    ];
    const seenEl = new Set();
    const seenKey = new Set();
    const out = [];

    const push = (el) => {
      if (!el || seenEl.has(el)) return;
      if (el.closest?.("shreddit-post") && el.tagName !== "SHREDDIT-POST") return;
      if (el.tagName !== "SHREDDIT-POST" && el.querySelector?.("shreddit-post")) return;
      const r = el.getBoundingClientRect?.();
      if (r && r.height > 0 && r.height < 48) return;
      const key = entityKey(el, "post");
      if (key && seenKey.has(key)) return;
      if (key) seenKey.add(key);
      seenEl.add(el);
      out.push(el);
    };

    list.forEach(push);
    // Only add container fallbacks when we found zero shreddit-posts overall
    // or this container isn't covered by a post key already
    containers.forEach(push);
    return out;
  }

  function injectPosts(scope) {
    collectPostHosts(scope).forEach((postEl) => {
      entityKey(postEl, "post");
      dedupeTriggers(postEl, "post");
      if (hasTrigger(postEl, "post")) {
        postEl.setAttribute("data-rchp", "1");
        return;
      }
      postEl.removeAttribute("data-rchp");
      const btn = mkBtn("Comment", "Soạn comment cho post này");
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPanel(postContext(postEl), postEl);
      };
      if (place(postEl, btn, /share/i, "post")) {
        dedupeTriggers(postEl, "post");
        postEl.setAttribute("data-rchp", "1");
      }
    });
  }

  function injectOneComment(cEl) {
    if (!cEl || !cEl.isConnected) return false;
    if (isAutoModeratorComment(cEl) || isPromotedComment(cEl) || isRemovedComment(cEl)) {
      // Drop any Reply button already attached to removed comments
      try {
        dedupeTriggers(cEl, "comment");
        triggersFor(cEl, "comment").forEach((n) => {
          try { n.remove(); } catch (_) {}
        });
      } catch (_) {}
      cEl.setAttribute("data-rchc", "skip");
      return false;
    }
    // On feed cards, shreddit-comment previews must NOT get Reply buttons
    if (!/\/comments\//i.test(location.pathname)) return false;
    // Respect Reddit collapse / "more replies" — only inject when already expanded
    if (!isCommentEligibleForReplyInject(cEl)) {
      // If we had a button and user collapsed, leave it; if not eligible yet, skip
      return false;
    }

    entityKey(cEl, "comment");
    dedupeTriggers(cEl, "comment");
    if (hasTrigger(cEl, "comment")) {
      cEl.setAttribute("data-rchc", "1");
      return true;
    }
    cEl.removeAttribute("data-rchc");
    const btn = mkBtn("Reply", "Reply comment này — đọc comment + reply bên dưới");
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel(commentContext(cEl), cEl);
    };
    // Strict \breply\b so "more replies" never anchors placement
    if (place(cEl, btn, /\breply\b/i, "comment")) {
      dedupeTriggers(cEl, "comment");
      cEl.setAttribute("data-rchc", "1");
      return true;
    }
    return false;
  }

  function injectComments(scope) {
    // Reply inject only on full post pages — never home/popular/sub feed
    if (!/\/comments\//i.test(location.pathname)) return;
    // Single pass on currently-visible comments only. When user clicks
    // "more replies", MutationObserver re-runs injectAll and picks up new nodes.
    collectCommentHosts(scope).forEach((cEl) => injectOneComment(cEl));
  }

  // Notification / "go to comment" deep-links:
  //   /r/sub/comments/POST/slug/COMMENTID/
  //   /comments/POST/COMMENTID/   (no slug)
  //   ?comment=t1_xxx  or  #t1_xxx
  function looksLikeRedditId(s) {
    return !!s && !/[_-]/.test(s) && /^[a-z0-9]{5,12}$/i.test(s);
  }
  function permalinkCommentId() {
    try {
      const path = location.pathname.replace(/\/+$/, "");
      const after = path.split(/\/comments\//i)[1];
      if (after) {
        // [postId, slug?, commentId?]
        const parts = after.split("/").filter(Boolean);
        if (parts.length >= 3 && looksLikeRedditId(parts[2])) return parts[2].toLowerCase();
        // /comments/POST/COMMENT (no title slug)
        if (parts.length === 2 && looksLikeRedditId(parts[0]) && looksLikeRedditId(parts[1])) {
          return parts[1].toLowerCase();
        }
      }
      const m = path.match(/\/comment\/([a-z0-9]+)/i);
      if (m && looksLikeRedditId(m[1])) return m[1].toLowerCase();
      const q =
        new URLSearchParams(location.search).get("comment") ||
        new URLSearchParams(location.search).get("comment_id") ||
        "";
      if (q) {
        const bare = q.replace(/^t1_/i, "");
        if (looksLikeRedditId(bare)) return bare.toLowerCase();
      }
      const hash = (location.hash || "").replace(/^#/, "");
      if (/^t1_/i.test(hash)) return hash.replace(/^t1_/i, "").toLowerCase();
    } catch (_) {}
    return "";
  }

  function findCommentById(rawId) {
    if (!rawId) return null;
    const bare = String(rawId).replace(/^t1_/i, "").toLowerCase();
    if (!bare) return null;
    const sels = [
      `shreddit-comment[thingid="t1_${bare}"]`,
      `shreddit-comment[thingid="${bare}"]`,
      `shreddit-comment[comment-id="${bare}"]`,
      `shreddit-comment[comment-id="t1_${bare}"]`,
      `shreddit-comment#t1_${bare}`,
      `#t1_${bare}`,
      `article[id="t1_${bare}"]`,
      `div[id="t1_${bare}"]`,
      `[data-fullname="t1_${bare}"]`,
      `[data-comment-id="${bare}"]`,
      `[data-comment-id="t1_${bare}"]`,
    ];
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        if (el.matches?.(COMMENT_OWNER_SEL)) return el;
        const host = el.closest?.(COMMENT_OWNER_SEL);
        if (host) return host;
        return el;
      } catch (_) {}
    }
    // Attribute scan — notification views sometimes delay full attributes
    for (const el of document.querySelectorAll(COMMENT_HOST_SEL)) {
      const blob = [
        el.getAttribute("thingid"),
        el.getAttribute("id"),
        el.getAttribute("comment-id"),
        el.getAttribute("data-fullname"),
        el.getAttribute("data-comment-id"),
        el.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (blob.includes(bare) || blob.includes(`t1_${bare}`)) return el;
    }
    // Highlighted/focused comment from notification (bg highlight, aria-current)
    const focused =
      document.querySelector("shreddit-comment[highlighted], shreddit-comment[is-highlighted], shreddit-comment.highlighted") ||
      document.querySelector('[data-testid="comment"][aria-current="true"]') ||
      document.querySelector("shreddit-comment:target, .Comment:target, article:target");
    if (focused) return focused.closest?.(COMMENT_OWNER_SEL) || focused;
    return null;
  }

  /** Force Reply on the deep-linked notification comment even if tree is sparse. */
  function ensurePermalinkTrigger() {
    const id = permalinkCommentId();
    const el = findCommentById(id);
    if (el) {
      injectOneComment(el);
      return !!hasTrigger(el);
    }
    // No id in URL but still a comments page — inject everything visible
    if (/\/comments\//i.test(location.pathname)) injectComments(document);
    return false;
  }

  let injectBusy = false;
  function injectAll(scope = document) {
    if (injectBusy) return;
    injectBusy = true;
    try {
      try { ensureMascot(); } catch (_) {}
      // Always purge first so spam piles never survive a re-inject pass
      purgeOrphanTriggers();
      // Chat / inbox: DM assist only (no post/comment inject)
      if (isDmPage()) {
        injectDmAssist(scope);
        purgeOrphanTriggers();
        return;
      }
      injectPosts(scope);
      // Comments/replies only on /comments/ threads
      if (/\/comments\//i.test(location.pathname)) {
        injectComments(scope);
        ensurePermalinkTrigger();
      } else {
        // Belt-and-suspenders: strip any reply triggers left on feed
        document.querySelectorAll('.rch-trigger[data-rch-kind="reply"]').forEach((b) => {
          try { b.remove(); } catch (_) {}
        });
      }
      // Leave chat docks if we navigated away
      document.querySelectorAll(".rch-dm-dock").forEach((d) => {
        try {
          d.remove();
        } catch (_) {}
      });
      // Second purge after inject (dedupe across overlapping hosts)
      purgeOrphanTriggers();
    } catch (_) {
      /* ignore */
    } finally {
      injectBusy = false;
    }
  }

  // Burst re-inject: notification deep-links hydrate comments after SPA paint.
  // Keep this short — hasTrigger/dedupe prevent spam, but less churn is better.
  let burstTimer = 0;
  let burstGen = 0;
  function scheduleInjectBurst(reason) {
    if (!contextAlive()) return;
    const gen = ++burstGen;
    const delays =
      reason === "nav"
        ? [0, 200, 600, 1500, 3000, 6000]
        : [0, 400, 1200, 3000, 7000];
    delays.forEach((delay) => {
      setTimeout(() => {
        if (!contextAlive() || gen !== burstGen) return;
        injectAll(document);
        if (delay === 0 || delay === 1200 || delay === 1500) restorePendingFill();
      }, delay);
    });
    // Poll only when URL points at a specific comment (inbox → comment)
    const targetId = permalinkCommentId();
    if (!targetId) return;
    const started = Date.now();
    clearInterval(burstTimer);
    burstTimer = setInterval(() => {
      if (!contextAlive() || gen !== burstGen || Date.now() - started > 12000) {
        clearInterval(burstTimer);
        burstTimer = 0;
        return;
      }
      injectAll(document);
      const el = findCommentById(permalinkCommentId());
      if (el && hasTrigger(el)) {
        clearInterval(burstTimer);
        burstTimer = 0;
      }
    }, 900);
  }

  // Reddit is a SPA: notification clicks use history.pushState without reloading.
  // One-shot boot timeouts alone miss those navigations.
  let lastHref = location.href;
  function onSpaNavigate() {
    if (!contextAlive()) return;
    const now = location.href;
    if (now === lastHref) return;
    lastHref = now;
    console.log("[RGL] SPA nav → re-inject triggers", now);
    scheduleInjectBurst("nav");
  }

  try {
    const _push = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState = function patchedPush() {
      const r = _push(...arguments);
      queueMicrotask(onSpaNavigate);
      return r;
    };
    history.replaceState = function patchedReplace() {
      const r = _replace(...arguments);
      queueMicrotask(onSpaNavigate);
      return r;
    };
  } catch (_) {}
  window.addEventListener("popstate", () => queueMicrotask(onSpaNavigate));
  window.addEventListener("hashchange", () => queueMicrotask(onSpaNavigate));
  // Fallback poll — Reddit sometimes mutates URL without going through our patch
  setInterval(() => {
    if (location.href !== lastHref) onSpaNavigate();
  }, 800);

  ensureMascot();
  window.__RGL_injectAll = injectAll;
  scheduleInjectBurst("boot");
  // Keep mascot alive across Reddit SPA body swaps / extension reloads
  setInterval(() => {
    if (!contextAlive()) return;
    try {
      const el = document.querySelector(".rch-mascot");
      if (!el || !el.isConnected || !isMascotOnScreen(el)) {
        mascotEl = null;
        ensureMascot();
      } else {
        // re-assert visibility in case stealth/Reddit CSS fights us
        paintMascotChrome(el, {
          left: el.getBoundingClientRect().left,
          top: el.getBoundingClientRect().top,
        });
        mountMascotNode(el);
        mascotEl = el;
      }
    } catch (_) {
      try { ensureMascot(); } catch (__) {}
    }
  }, 1500);

  let queued = false;
  const obs = new MutationObserver(() => {
    if (!contextAlive()) {
      try { obs.disconnect(); } catch (_) {}
      return;
    }
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      injectAll(document);
    }, 280);
  });
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // Feed virtualization: cards recycle as you scroll — re-check visible posts
  let scrollQueued = false;
  const onScrollInject = () => {
    if (scrollQueued || !contextAlive()) return;
    scrollQueued = true;
    setTimeout(() => {
      scrollQueued = false;
      if (isDmPage()) injectDmAssist(document);
      else {
        injectPosts(document);
        injectComments(document);
      }
    }, 400);
  };
  window.addEventListener("scroll", onScrollInject, { passive: true, capture: true });
  document.addEventListener("scroll", onScrollInject, { passive: true, capture: true });

  window.RGL = window.RGL || {};
  window.RGL.assist = {
    injectAll,
    injectOneComment,
    ensurePermalinkTrigger,
    permalinkCommentId,
    findCommentById,
    openPanel,
    postContext,
    commentContext,
    dmContext,
    isDmPage,
    dmPeerUsername,
    findDmComposer,
    injectDmAssist,
    extractQuestions,
    detectLang,
    fillComposerForTarget,
    submitComposerForTarget,
    findComposerForTarget,
    generateAsync,
    setPose,
    startScan,
    stopScan,
    isAutoModeratorComment,
    isRemovedComment,
    isPromotedComment,
    showBubble,
    hideBubble,
    toggleBubble,
    positionBubble,
    openAutoPanel,
    setDraftFromAuto,
    setAutoPhase,
    setSeeding,
    renderDraft,
  };
})();
