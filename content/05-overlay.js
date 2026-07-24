// Production overlay — UI from Claude design (RGL Overlay standalone.html)
(() => {
  "use strict";

  const RGL = (window.RGL = window.RGL || {});

  const MODE_META = {
    observe: {
      short: "OBS",
      color: "#a0a0a8",
      bg: "rgba(160,160,168,.12)",
      border: "rgba(160,160,168,.3)",
    },
    eng: {
      short: "ENG",
      color: "#FF7A33",
      bg: "rgba(255,69,0,.12)",
      border: "rgba(255,69,0,.35)",
    },
    engage: {
      short: "ENG",
      color: "#FF7A33",
      bg: "rgba(255,69,0,.12)",
      border: "rgba(255,69,0,.35)",
    },
    full: {
      short: "FULL",
      color: "#ff453a",
      bg: "rgba(255,59,48,.14)",
      border: "rgba(255,59,48,.4)",
    },
  };

  const PHASE_COLOR = {
    FEED: "#5aa9ff",
    POST: "#c58bff",
    COMMENTING: "#FF4500",
    COOLDOWN: "#a0a0a8",
    OFF: "#5a5a62",
    ERROR: "#ff453a",
  };

  const JOB_ORDER = ["DWELL", "GENERATING", "THINKING", "TYPING", "REREAD", "SUBMIT", "DONE"];

  let root = null;
  let collapsed = false;
  let typingStartedAt = 0;
  let lastJobPhase = null;
  let health = { routerOk: null, model: "—" };
  let healthCheckedAt = 0;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function ensure() {
    if (root && root.isConnected) return root;
    const existing = document.querySelector("#rgl-overlay-root");
    if (existing) {
      [...document.querySelectorAll("#rgl-overlay-root")].slice(1).forEach((n) => n.remove());
      root = existing;
      return root;
    }
    root = el("div");
    root.id = "rgl-overlay-root";
    root.className = "hidden";
    root.innerHTML = `
      <button type="button" class="rgl-pill" title="Expand RGL status" aria-label="Expand status">
        <span class="rgl-pill-mode">OBS</span>
        <span class="rgl-pill-dot"></span>
      </button>
      <div class="rgl-panel on">
        <div class="rgl-header" title="Collapse">
          <span class="rgl-mode-badge">OBS</span>
          <span class="rgl-phase">OFF</span>
          <span class="rgl-energy-pct">0%</span>
          <span class="rgl-chevron">▾</span>
        </div>
        <div class="rgl-energy-track"><div class="rgl-energy-fill" style="width:0%"></div></div>
        <div class="rgl-body">
          <div class="rgl-metrics">
            <div class="rgl-metric"><b data-m="scrolls">0</b><span>scrolls</span></div>
            <div class="rgl-metric"><b data-m="upvotes">0</b><span>upvotes</span></div>
            <div class="rgl-metric"><b data-m="comments">0</b><span>comments</span></div>
            <div class="rgl-metric"><b data-m="opens">0</b><span>opens</span></div>
          </div>
          <div class="rgl-job">
            <div class="rgl-job-head">
              <span class="title">COMMENT JOB</span>
              <span class="step">—</span>
            </div>
            <div class="rgl-steps"></div>
            <div class="rgl-job-error"><span class="x">✕</span><span class="msg"></span></div>
          </div>
          <div class="rgl-rhythm"></div>
        </div>
        <div class="rgl-footer">
          <div class="rgl-footer-row">
            <span class="rgl-router-dot"></span>
            <span class="rgl-router-text">9router —</span>
            <span class="rgl-model">—</span>
          </div>
          <span class="rgl-status">Idle</span>
        </div>
      </div>`;
    document.documentElement.appendChild(root);

    root.querySelector(".rgl-pill").addEventListener("click", () => {
      collapsed = false;
      applyCollapse();
    });
    root.querySelector(".rgl-header").addEventListener("click", () => {
      collapsed = true;
      applyCollapse();
    });

    return root;
  }

  function applyCollapse() {
    if (!root) return;
    root.querySelector(".rgl-pill").classList.toggle("on", collapsed);
    root.querySelector(".rgl-panel").classList.toggle("on", !collapsed);
  }

  function fmtGap(sec) {
    if (sec == null || !Number.isFinite(sec)) return "—";
    if (sec < 60) return `${Math.max(0, Math.round(sec))}s`;
    return `~${Math.round(sec / 60)}m`;
  }

  function scrollSpeedLabel(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "—");
    if (n < 0.85) return "slow";
    if (n < 1.5) return "med";
    if (n < 2.2) return "fast";
    return "blitz";
  }

  function statusSentence(data) {
    if (data.status) return data.status;
    const phase = data.phase || "OFF";
    const job = data.job;
    if (phase === "OFF") return "Extension off";
    if (job?.phase === "FAIL") return "Submit failed — backing off before retry…";
    if (job?.phase === "TYPING") return "Typing a reply like a mobile user…";
    if (job?.phase === "GENERATING") return "Drafting with LLM…";
    if (job?.phase === "THINKING") return "Reading the draft before typing…";
    if (job?.phase === "SUBMIT") return "Clicking Comment / Reply…";
    if (job?.phase === "DWELL") return "Reading the target first…";
    if (phase === "COOLDOWN") return "Cooling down — waiting on comment budget…";
    if (phase === "POST") return "Reading a thread…";
    if (phase === "FEED") return "Scrolling the feed at a lazy pace…";
    return phase.toLowerCase();
  }

  function buildSteps(job, wpm) {
    if (!job) return { html: "", typingPct: 0 };
    const failed = job.phase === "FAIL";
    const activeName = failed ? "SUBMIT" : job.phase === "SELECTED" ? "DWELL" : job.phase;
    const activeIdx = Math.max(0, JOB_ORDER.indexOf(activeName));
    const elapsedMs =
      job.typingElapsedMs != null
        ? job.typingElapsedMs
        : job.phase === "TYPING" && typingStartedAt
          ? Date.now() - typingStartedAt
          : job.phase === "TYPING"
            ? 0
            : job.typingMs || 0;
    const totalMs = job.typingMs || 1;
    const typingPct = Math.min(100, Math.round((elapsedMs / totalMs) * 100));
    const elapsedS = Math.round(elapsedMs / 1000);
    const totalS = Math.round(totalMs / 1000);

    let html = "";
    JOB_ORDER.forEach((name, i) => {
      let kind = "pending";
      if (failed && name === "SUBMIT") kind = "fail";
      else if (failed && i < activeIdx) kind = "done";
      else if (!failed && i < activeIdx) kind = "done";
      else if (!failed && i === activeIdx) kind = "active";
      else if (failed && i < JOB_ORDER.indexOf("SUBMIT")) kind = "done";

      const label = name === "DONE" && failed ? "FAIL" : name;
      let detail = "";
      const isTyping = name === "TYPING";
      if (isTyping && (kind === "active" || kind === "done" || job.wordCount)) {
        detail = `${elapsedS}/${totalS}s · ${job.wordCount || 0} words @ ${Math.round(wpm || 0)} wpm`;
      }

      html += `<div class="rgl-step">
        <span class="rgl-step-dot ${kind}"></span>
        <div class="rgl-step-main">
          <div class="rgl-step-row">
            <span class="rgl-step-label ${kind}">${label}</span>
            <span class="rgl-step-detail ${kind}">${detail}</span>
          </div>
          <div class="rgl-typebar ${isTyping && kind === "active" ? "on" : ""}">
            <div class="rgl-typebar-fill" style="width:${isTyping && kind === "active" ? typingPct : 0}%"></div>
          </div>
        </div>
      </div>`;
    });
    return { html, typingPct };
  }

  async function maybeHealth() {
    if (Date.now() - healthCheckedAt < 20000) return;
    healthCheckedAt = Date.now();
    try {
      const resp = await chrome.runtime.sendMessage({ type: "HEALTH" });
      health.routerOk = !!resp?.ok;
    } catch {
      health.routerOk = false;
    }
    const s = RGL._settings || {};
    health.model = (s.rgl_model || "xai/grok-4").split("/").pop();
  }

  /**
   * data shape (compatible with Claude design):
   * { mode, phase, energy, stats, job, live, budget, gate, health, status }
   */
  function render(data) {
    ensure();
    const enabled = data.enabled !== false;
    root.classList.toggle("hidden", !enabled && data.phase === "OFF");
    if (!enabled && data.phase === "OFF") return;

    root.classList.remove("hidden");

    const modeKey = String(data.mode || "observe").toLowerCase();
    const mm = MODE_META[modeKey] || MODE_META.observe;
    const phase = String(data.phase || "OFF").toUpperCase();
    const energyPct = Math.round((data.energy ?? 0) * 100);
    const phaseColor = PHASE_COLOR[phase] || PHASE_COLOR.OFF;

    // pill
    const pill = root.querySelector(".rgl-pill");
    pill.querySelector(".rgl-pill-mode").textContent = mm.short;
    pill.querySelector(".rgl-pill-mode").style.color = mm.color;
    pill.querySelector(".rgl-pill-dot").style.background = phaseColor;

    // header
    const badge = root.querySelector(".rgl-mode-badge");
    badge.textContent = mm.short;
    badge.style.color = mm.color;
    badge.style.background = mm.bg;
    badge.style.border = `1px solid ${mm.border}`;
    root.querySelector(".rgl-phase").textContent = phase;
    root.querySelector(".rgl-energy-pct").textContent = `${energyPct}%`;
    root.querySelector(".rgl-energy-fill").style.width = `${energyPct}%`;

    // metrics
    const st = data.stats || {};
    root.querySelector('[data-m="scrolls"]').textContent = st.scrolls ?? 0;
    root.querySelector('[data-m="upvotes"]').textContent = st.upvotes ?? 0;
    root.querySelector('[data-m="comments"]').textContent = st.comments ?? 0;
    root.querySelector('[data-m="opens"]').textContent = st.opens ?? 0;

    // job
    const job = data.job;
    if (job?.phase === "TYPING" && lastJobPhase !== "TYPING") typingStartedAt = Date.now();
    if (!job || job.phase === "DONE" || job.phase === "FAIL") {
      if (job?.phase !== "TYPING") typingStartedAt = 0;
    }
    lastJobPhase = job?.phase || null;

    const jobBox = root.querySelector(".rgl-job");
    if (job) {
      jobBox.classList.add("on");
      jobBox.querySelector(".title").textContent =
        job.kind === "post" ? "POST JOB" : "COMMENT JOB";
      jobBox.querySelector(".step").textContent =
        job.phase === "FAIL" ? "failed" : String(job.phase || "").toLowerCase();
      const wpm = data.live?.commentWpm || 0;
      const built = buildSteps(
        {
          ...job,
          typingElapsedMs:
            job.typingElapsedMs != null
              ? job.typingElapsedMs
              : job.phase === "TYPING" && typingStartedAt
                ? Date.now() - typingStartedAt
                : undefined,
        },
        wpm
      );
      jobBox.querySelector(".rgl-steps").innerHTML = built.html;
      const err = jobBox.querySelector(".rgl-job-error");
      if (job.error) {
        err.classList.add("on");
        err.querySelector(".msg").textContent = job.error;
      } else {
        err.classList.remove("on");
      }
    } else {
      jobBox.classList.remove("on");
    }

    // rhythm
    const live = data.live || {};
    const budget = data.budget || {};
    const gate = data.gate || {};
    const budgetWarn =
      budget.maxHour != null && budget.commentsThisHour >= budget.maxHour;
    const rows = [
      { lbl: "scroll speed", val: scrollSpeedLabel(live.scrollSpeed), cls: "" },
      {
        lbl: "comment chance",
        val: `${Math.round(live.commentChance ?? 0)}%`,
        cls: "",
      },
      { lbl: "typing wpm", val: Math.round(live.commentWpm ?? 0), cls: "" },
      {
        lbl: "budget",
        val: `${budget.commentsThisHour ?? 0}/${budget.maxHour ?? "—"}hr · next ${fmtGap(budget.nextGapSec)}`,
        cls: budgetWarn ? "warn" : "",
      },
      {
        lbl: "engagement gate",
        val: gate.on === false ? `skip · ${gate.skip || "—"}` : gate.on ? "on" : "—",
        cls: gate.on === false ? "muted" : "ok",
      },
    ];
    root.querySelector(".rgl-rhythm").innerHTML = rows
      .map(
        (r) => `<div class="rgl-rhythm-row">
        <span class="lbl">${r.lbl}</span>
        <div class="dots"></div>
        <span class="val ${r.cls}">${r.val}</span>
      </div>`
      )
      .join("");

    // footer
    const h = data.health || health;
    const ok = h.routerOk !== false && h.routerOk !== null ? h.routerOk : health.routerOk;
    const dot = root.querySelector(".rgl-router-dot");
    dot.classList.toggle("down", ok === false);
    root.querySelector(".rgl-router-text").textContent =
      ok === null ? "9router —" : ok ? "9router ok" : "9router down";
    root.querySelector(".rgl-model").textContent =
      (h.model || health.model || "—").toString().split("/").pop();

    // Prefer short-lived flash from automation over generic sentence
    const flash = window.RGL?.bus?.lastFlash;
    const flashAge = Date.now() - (window.RGL?.bus?.lastFlashAt || 0);
    const bg = data.banGuard;
    let status = statusSentence({ ...data, phase });
    if (flash && flashAge < 3500) status = flash;
    else if (bg && bg.band && bg.band !== "green") {
      const ratio =
        bg.ratioValuePerPromo == null ? "∞" : Number(bg.ratioValuePerPromo).toFixed(1);
      status = `Ban-risk ${bg.band} ${bg.risk}/100 · value:promo ~${ratio}:1 · cmt/1h ${bg.comments1h}`;
    } else if (data.dist) {
      const d = data.dist;
      if (d.quiet) status = `Quiet hours ${ (d.quietRange || []).join("–") } · queue ${d.queuePending ?? 0}`;
      else if (d.queuePending)
        status = `Queue ${d.queuePending} pending · today ${d.day?.total ?? 0}/${d.maxDay ?? "?"}`;
    }
    root.querySelector(".rgl-status").textContent = status;

    applyCollapse();
    maybeHealth();
  }

  function hide() {
    if (root) root.classList.add("hidden");
  }

  RGL.overlay = { render, hide, ensure };
})();
