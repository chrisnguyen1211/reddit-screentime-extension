// Content script: a persistent Bram mascot in the corner. Clicking "✨ Comment/
// Reply" runs Bram through a scan motion, then the generated comment pops up in a
// speech bubble. Choose model via dropdown, add an instruction, rescan, and Fill
// the text straight into Reddit's reply box. No auto-post — human posts.

(function () {
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
  let dragStart = null, dragging = false;
  let scanTimer = null, idleTimer = null;
  let scanInFlight = false, scanRequestId = 0;
  let pendingFillRestoreInFlight = false;
  const PENDING_FILL_KEY = "rch:pending-fill:v1";
  const PENDING_FILL_TTL_MS = 2 * 60 * 1000;
  try { chrome.storage?.local.get(["rchModel", "rchSeed"], (r) => { if (r) { if (r.rchModel) selectedModel = r.rchModel; if (r.rchSeed) seeding = true; syncModelLabel(); syncSeed(); } }); } catch (_) {}

  function ensureMascot() {
    if (mascotEl) return mascotEl;
    mascotEl = document.createElement("div");
    mascotEl.className = "rch-mascot";
    mascotEl.title = "Bravestep · Bram — kéo để di chuyển, bấm để mở/ẩn";
    mascotEl.innerHTML = bramSvg("idle", 92);
    mascotEl.querySelector(".m-face").innerHTML = bramFace("happy");
    document.body.appendChild(mascotEl);
    try {
      chrome.storage?.local.get(["rchPos"], (r) => {
        // Prefer bottom-left default so mascot doesn't sit on Claude overlay (bottom-right).
        // Only restore saved pos if it was on the left half of the screen.
        if (r && r.rchPos && Number(r.rchPos.left) < window.innerWidth * 0.45) {
          mascotEl.style.left = r.rchPos.left + "px";
          mascotEl.style.top = r.rchPos.top + "px";
          mascotEl.style.right = "auto";
          mascotEl.style.bottom = "auto";
        } else if (r && r.rchPos) {
          // Clear old bottom-right saves that conflicted with overlay
          try { chrome.storage.local.remove("rchPos"); } catch (_) {}
        }
        if (bubbleEl && bubbleEl.style.display !== "none") positionBubble();
      });
    } catch (_) {}
    // drag to move (the bubble follows); a plain click toggles the bubble
    mascotEl.addEventListener("pointerdown", (e) => { dragStart = { x: e.clientX, y: e.clientY, rect: mascotEl.getBoundingClientRect() }; dragging = false; try { mascotEl.setPointerCapture(e.pointerId); } catch (_) {} });
    mascotEl.addEventListener("pointermove", (e) => {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      dragging = true; mascotEl.classList.add("dragging");
      const left = Math.max(4, Math.min(window.innerWidth - dragStart.rect.width - 4, dragStart.rect.left + dx));
      const top = Math.max(4, Math.min(window.innerHeight - dragStart.rect.height - 4, dragStart.rect.top + dy));
      mascotEl.style.left = left + "px"; mascotEl.style.top = top + "px"; mascotEl.style.right = "auto"; mascotEl.style.bottom = "auto";
      if (bubbleEl && bubbleEl.style.display !== "none") positionBubble();
    });
    mascotEl.addEventListener("pointerup", (e) => {
      try { mascotEl.releasePointerCapture(e.pointerId); } catch (_) {}
      if (dragStart && !dragging) { if (bubbleEl && bubbleEl.dataset.has === "1") { bubbleEl.style.display = bubbleEl.style.display === "none" ? "block" : "none"; if (bubbleEl.style.display !== "none") positionBubble(); } }
      if (dragging) { const r = mascotEl.getBoundingClientRect(); try { chrome.storage?.local.set({ rchPos: { left: Math.round(r.left), top: Math.round(r.top) } }); } catch (_) {} }
      mascotEl.classList.remove("dragging"); dragStart = null; dragging = false;
    });
    return mascotEl;
  }
  function positionBubble() {
    if (!bubbleEl || !mascotEl) return;
    const r = mascotEl.getBoundingClientRect();
    // Keep bubble above mascot; prefer left side (mascot default is bottom-left)
    // so it never covers #rgl-overlay-root (bottom-right Claude panel).
    bubbleEl.style.top = "auto";
    const spaceRight = window.innerWidth - r.right;
    if (r.left < window.innerWidth / 2) {
      bubbleEl.style.left = Math.max(8, r.left) + "px";
      bubbleEl.style.right = "auto";
    } else {
      bubbleEl.style.left = "auto";
      bubbleEl.style.right = Math.max(8, spaceRight) + "px";
    }
    bubbleEl.style.bottom = Math.max(8, window.innerHeight - r.top + 10) + "px";
  }
  function syncSeed() {
    const b = bubbleEl && bubbleEl.querySelector(".rch-seed");
    if (b) b.classList.toggle("on", seeding);
    if (bubbleEl && currentCtx) fillTarget(currentCtx.target);
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
    if (bubbleEl) return bubbleEl;
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
    bubbleEl.querySelector(".rch-x").onclick = () => (bubbleEl.style.display = "none");
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
      fill.disabled = true;
      let handedOffToPost = false;
      const filled = await fillComposerForTarget(ta.value, currentTargetEl, {
        targetKind: currentCtx?.target?.kind,
        beforeOpen: (control) => {
          if (currentCtx?.target?.kind !== "post") return;
          handedOffToPost = !!savePendingFill(ta.value, currentTargetEl, control, currentCtx);
        },
      });
      if (filled) {
        clearPendingFill();
        flash(fill, "✓ Đã điền");
      } else if (handedOffToPost) {
        flash(fill, "Đang mở comment…");
      } else {
        navigator.clipboard?.writeText(ta.value).catch(() => {});
        flash(fill, "không thấy đúng ô (đã copy)");
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
    const source = ctx.target?.kind === "comment"
      ? ctx.replyingTo
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
    const ta = bubbleEl.querySelector(".rch-draft");
    lastDraft = d;
    if (!d || d.error) { ta.value = ""; ta.placeholder = d && d.error ? "⚠️ " + d.error : "…"; }
    else ta.value = d.comment || "";
    ta.style.height = "auto"; ta.style.height = Math.min(280, ta.scrollHeight + 2) + "px";
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
  const isEditable = (el) => el && el !== bubbleEl?.querySelector(".rch-draft") && el !== bubbleEl?.querySelector(".rch-instr") &&
    (el.tagName === "TEXTAREA" || el.isContentEditable || el.getAttribute?.("role") === "textbox");
  const vis = (el) => { const r = el && el.getBoundingClientRect?.(); return !!(r && r.width > 4 && r.height > 4); };
  function deepActiveElement(root = document) {
    let active = root.activeElement || document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }
  function editableInRoot(root) {
    if (!root) return [];
    const out = [];
    const add = (el) => { if (isEditable(el) && vis(el) && !el.disabled && !el.readOnly) out.push(el); };
    if (root.nodeType === Node.ELEMENT_NODE) add(root);
    root.querySelectorAll?.('textarea,[contenteditable="true"],[role="textbox"]').forEach(add);
    root.querySelectorAll?.("*").forEach((el) => { if (el.shadowRoot) out.push(...editableInRoot(el.shadowRoot)); });
    return out;
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
    const roots = [...document.querySelectorAll(
      "shreddit-composer,[data-testid='comment-submission-form'],[data-testid='comment-composer'],comment-composer-host"
    )];
    const scoped = roots.flatMap((root) => editableInRoot(root)).filter(vis);
    if (scoped.length) return scoped[0];
    const all = [...new Set(editableInRoot(document))].filter((el) => !targetContains(bubbleEl, el));
    const marked = all.filter((el) => /comment|thought|reply/i.test(
      el.getAttribute?.("aria-label") || el.getAttribute?.("placeholder") || ""
    ));
    if (marked.length === 1) return marked[0];
    return all.length === 1 ? all[0] : null;
  }
  function replyControl(target, targetKind = currentCtx?.target?.kind) {
    const a = actionAnchor(target, targetKind === "post" ? /comment|reply/i : /reply/i);
    if (!a?.after || a.after.classList?.contains("rch-trigger")) return null;
    return a.after.matches?.("button,a,faceplate-tracker") ? a.after : a.after.querySelector?.("button,a,faceplate-tracker");
  }
  async function findComposerForTarget(target, { beforeOpen, preferGlobal = false, allowControl = true, targetKind } = {}) {
    if (target && target.isConnected === false) return null;
    const active = deepActiveElement();
    const containsTarget = targetKind === "comment" ? ownTargetContains : targetContains;
    if (isEditable(active) && vis(active) && (!target || containsTarget(target, active))) return active;
    const scoped = target
      ? editableInRoot(target).find((el) => vis(el) && (targetKind !== "comment" || ownTargetContains(target, el)))
      : null;
    if (scoped) return scoped;
    if (preferGlobal) {
      const global = postPageComposer();
      if (global) return global;
    }
    const control = allowControl && target && replyControl(target, targetKind);
    if (control) {
      const beforeEditors = new Set(editableInRoot(document));
      try { beforeOpen?.(control); } catch (_) {}
      try { control.click(); } catch (_) {}
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        const scopedOpened = editableInRoot(target).find((el) =>
          vis(el) && (targetKind !== "comment" || ownTargetContains(target, el))
        );
        const activeOpened = deepActiveElement();
        const freshEditors = editableInRoot(document).filter((el) => !beforeEditors.has(el));
        const opened = scopedOpened ||
          (isEditable(activeOpened) && vis(activeOpened) && freshEditors.includes(activeOpened) ? activeOpened : null) ||
          pickNearestComposer(target, freshEditors);
        if (opened) return opened;
      }
    }
    return preferGlobal ? postPageComposer() : null;
  }
  async function fillComposerForTarget(text, target, options = {}) {
    const el = await findComposerForTarget(target, options);
    if (!el) return false;
    el.focus();
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else { // contenteditable / Lexical (new reddit): replace via execCommand so the editor tracks it
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(range);
      document.execCommand("insertText", false, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    return true;
  }

  /**
   * After fill: find Comment/Reply submit control near the active composer and click it.
   * Works for top-level post comment AND nested reply (same path: open field → fill → click).
   */
  async function submitComposerForTarget(target, options = {}) {
    const el = await findComposerForTarget(target, { ...options, allowControl: false });
    if (!el) return { ok: false, reason: "no-composer" };

    // 1) Prefer explicit submit button near editor
    const scopeRoots = [];
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      scopeRoots.push(node);
      node = node.parentElement || node.getRootNode?.()?.host || null;
    }
    const btnRe = /^(comment|reply|post|save)$/i;
    let submitBtn = null;
    for (const root of scopeRoots) {
      const cands = [
        ...(root.querySelectorAll?.("button,[role='button'],faceplate-tracker,input[type='submit']") || []),
      ];
      submitBtn = cands.find((b) => {
        if (b.disabled) return false;
        const t = clean(b.textContent || b.getAttribute("aria-label") || b.value || "").slice(0, 40);
        return btnRe.test(t) || /comment|reply|submit/i.test(b.getAttribute("data-testid") || "");
      });
      if (submitBtn) break;
    }

    if (submitBtn) {
      try {
        submitBtn.click();
        return { ok: true, method: "button" };
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
    return { ok: true, method: "mod-enter" };
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
    ensureBubble();
    bubbleEl.dataset.has = "1"; bubbleEl.style.display = "block"; positionBubble();
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
      if (!resp || resp.error) { setPose("idle"); ta.placeholder = resp?.error || "không có phản hồi"; return; }
      renderDraft((resp.drafts && resp.drafts[0]) || null);
      setPose("done"); clearTimeout(idleTimer); idleTimer = setTimeout(() => setPose("idle"), 2600);
    });
  }
  function openPanel(ctx, targetEl) {
    if (scanInFlight) return;
    try {
      window.RGL?.automation?.pause?.();
      if (window.RGL?.bus) window.RGL.bus.paused = true;
    } catch (_) {}
    ensureMascot(); ensureBubble();
    currentCtx = ctx;
    currentTargetEl = targetEl || null;
    bubbleEl.querySelector(".rch-instr").value = "";
    fillTarget(ctx.target);
    renderQuote(ctx);
    runScan();
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
  function commentDepth(el) {
    if (el.tagName === "SHREDDIT-COMMENT") return Number(el.getAttribute("depth") || 0);
    let d = 0, p = el.parentElement; while (p) { if (p.classList?.contains("comment")) d++; p = p.parentElement; } return d;
  }
  function commentContext(commentEl) {
    const base = postContext(null);
    const isShreddit = commentEl.tagName === "SHREDDIT-COMMENT";
    const sel = isShreddit ? '[slot="comment"]' : ".usertext-body";
    const bodies = [...commentEl.querySelectorAll(sel)].map((n) => clean(n.textContent)).filter(Boolean);
    const author = isShreddit ? commentEl.getAttribute("author") || "" : clean(commentEl.querySelector(".author")?.textContent);
    const depth = commentDepth(commentEl);
    const nReplies = Math.max(0, bodies.length - 1);
    const replyingTo = bodies[0] || "";
    const qOwn = extractQuestions(replyingTo);
    const questions = qOwn.length ? qOwn : base.questions;
    const label = (depth > 0 ? `↳ SUB-REPLY (cấp ${depth})` : "💬 REPLY") + (nReplies ? ` · ${nReplies} reply` : "") + (qOwn.length ? ` · 🎯 ${qOwn.length} câu hỏi` : "");
    return { ...base, replyingTo, replyAuthor: author, subReplies: bodies.slice(1, 21), questions, lang: detectLang(replyingTo) || base.lang, target: { kind: "comment", label, author } };
  }

  // ── inject buttons ─────────────────────────────────────────────────────────
  function actionAnchor(host, wordRe) {
    const ownerSelector = host.matches?.("shreddit-comment,.comment") ? "shreddit-comment,.comment" : "shreddit-post,.thing.link";
    const list = [...(host.querySelectorAll?.(".flat-list.buttons") || [])]
      .find((candidate) => candidate.closest(ownerSelector) === host);
    if (list) { const li = [...list.children].find((c) => wordRe.test(c.className) || wordRe.test(c.textContent || "")); return { after: li || list.lastElementChild, container: list, old: true }; }
    const scan = (rootEl) => {
      if (!rootEl) return null;
      const cands = [...rootEl.querySelectorAll("button, a, faceplate-tracker")];
      return cands.find((c) => wordRe.test(c.getAttribute("aria-label") || "") ||
        wordRe.test(c.getAttribute("data-post-click-location") || "") ||
        wordRe.test(c.getAttribute("data-testid") || "") ||
        wordRe.test(clean(c.textContent || "").slice(0, 80)));
    };
    const inShadow = scan(host.shadowRoot); if (inShadow) return { after: inShadow, container: inShadow.parentElement, shadow: true };
    const inLight = [...host.querySelectorAll?.("button, a, faceplate-tracker") || []].find((candidate) => {
      if (candidate.closest(ownerSelector) !== host) return false;
      return wordRe.test(candidate.getAttribute("aria-label") || "") ||
        wordRe.test(candidate.getAttribute("data-post-click-location") || "") ||
        wordRe.test(candidate.getAttribute("data-testid") || "") ||
        wordRe.test(clean(candidate.textContent || "").slice(0, 80));
    });
    if (inLight) return { after: inLight, container: inLight.parentElement };
    return null;
  }
  function ownContentElement(host, kind) {
    const selector = kind === "comment"
      ? '[slot="comment"],.entry,.usertext-body'
      : '[slot="text-body"],.entry,.usertext-body';
    return [...(host.querySelectorAll?.(selector) || [])]
      .filter((candidate) => candidate.closest?.("shreddit-comment,.comment") === host)
      .sort((a, b) => {
        const rank = (el) => el.matches?.('[slot="comment"],[slot="text-body"]') ? 0 : el.matches?.(".entry") ? 1 : 2;
        return rank(a) - rank(b);
      })[0] || null;
  }
  function fallbackTriggerRow(host, kind) {
    const row = document.createElement("div");
    row.className = "rch-trigger-row";
    row.setAttribute("style", "display:flex;align-items:center;width:fit-content;margin:8px 0 4px;position:relative;z-index:2;");
    const ownContent = ownContentElement(host, kind);
    if (ownContent) {
      // Keep the fallback inside the owner's visible content slot. A collapsed
      // or hidden comment then hides its trigger too, instead of leaking a row
      // into the parent thread and creating an ambiguous vertical stack.
      ownContent.appendChild(row);
      return row;
    }
    if (kind === "comment") return null;
    const boundary = [...(host.children || [])].find((child) =>
      child.matches?.('shreddit-comment,.comment,.child,[slot="children"],shreddit-composer,[data-testid="comment-submission-form"]')
    );
    if (boundary) host.insertBefore(row, boundary);
    else host.appendChild(row);
    return row;
  }
  function place(host, btn, wordRe, kind) {
    const a = actionAnchor(host, wordRe);
    if (a && a.old) { const li = document.createElement("li"); li.appendChild(btn); a.after ? a.after.insertAdjacentElement("afterend", li) : a.container.appendChild(li); return; }
    if (a && a.after) { a.after.insertAdjacentElement("afterend", btn); return; }
    // Closed/unavailable action rows still get a target-local normal-flow row.
    // For comments this row sits after that comment's own body, never above it
    // and never inside a nested child comment.
    btn.classList.add("rch-fallback");
    btn.style.position = "static";
    btn.style.display = "inline-flex";
    btn.style.margin = "4px 0";
    if (scanInFlight) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.style.opacity = ".55";
      btn.style.cursor = "wait";
    }
    const row = fallbackTriggerRow(host, kind);
    if (row) row.appendChild(btn);
    else btn.remove();
  }
  function isAutoModeratorComment(commentEl) {
    const isShreddit = commentEl.tagName === "SHREDDIT-COMMENT";
    const author = isShreddit
      ? commentEl.getAttribute("author") || commentEl.getAttribute("author-name") || ""
      : clean(commentEl.querySelector(".author")?.textContent || commentEl.getAttribute("data-author") || "");
    return author.replace(/^u\//i, "").trim().toLowerCase() === "automoderator";
  }
  function injectPosts(scope) {
    (scope.querySelectorAll?.("shreddit-post:not([data-rchp]), .thing.link:not([data-rchp])") || []).forEach((postEl) => {
      postEl.setAttribute("data-rchp", "1");
      const btn = mkBtn("Comment", "Soạn comment cho post này");
      btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openPanel(postContext(postEl), postEl); };
      place(postEl, btn, /share/i, "post");
    });
  }
  function injectComments(scope) {
    (scope.querySelectorAll?.("shreddit-comment:not([data-rchc]), .comment:not([data-rchc])") || []).forEach((cEl) => {
      cEl.setAttribute("data-rchc", "1");
      if (isAutoModeratorComment(cEl)) return;
      const btn = mkBtn("Reply", "Reply comment này — đọc comment + reply bên dưới");
      btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openPanel(commentContext(cEl), cEl); };
      place(cEl, btn, /reply|share/i, "comment");
    });
  }
  function injectAll(scope = document) { try { injectPosts(scope); injectComments(scope); } catch (_) {} }

  ensureMascot();
  injectAll();
  [350, 1200, 2500, 5000].forEach((delay) => setTimeout(restorePendingFill, delay));
  let queued = false;
  const obs = new MutationObserver(() => {
    if (!contextAlive()) { try { obs.disconnect(); } catch (_) {} return; }
    if (queued) return; queued = true;
    setTimeout(() => { queued = false; injectAll(document); }, 400);
  });
  obs.observe(document.body, { childList: true, subtree: true });

  window.RGL = window.RGL || {};
  window.RGL.assist = {
    injectAll,
    openPanel,
    postContext,
    commentContext,
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
  };
})();
