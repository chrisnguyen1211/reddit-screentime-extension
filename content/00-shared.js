// Shared RNG + namespace for Reddit Growth Lab (RGL)
(() => {
  "use strict";

  const RGL = (window.RGL = window.RGL || {});

  RGL.DEFAULTS = {
    // master
    rgl_enabled: false,
    rgl_mode: "observe", // observe | engage | full
    rgl_ackRisk: false,

    // automation base
    rgl_scrollSpeed: 1.2,
    rgl_upvoteChance: 8,
    rgl_openPostChance: 12,
    rgl_commentUpvoteChance: 18,
    rgl_pauseMin: 1.2,
    rgl_pauseMax: 9,
    rgl_scrollMin: 28,
    rgl_scrollMax: 160,
    rgl_wpm: 220,
    rgl_dynamicConfig: true,
    rgl_driftPercent: 35,
    rgl_driftIntervalMin: 2,
    rgl_driftIntervalMax: 9,
    rgl_microDrift: true,

    // LLM
    rgl_endpoint: "http://localhost:20128/v1",
    rgl_apiKey: "",
    rgl_model: "xai/grok-4",
    rgl_productContext: "",
    rgl_seedMode: false,

    // auto comment rhythm
    rgl_autoCommentEnabled: true,
    rgl_autoSubmit: true,
    rgl_commentChanceBase: 12,
    rgl_commentWpmBase: 38,
    rgl_thinkSecPer100Chars: 4,
    rgl_minSecondsBetweenComments: 240,
    rgl_maxCommentsPerHour: 4,
    rgl_maxCommentsPerSession: 8,
    rgl_minTargetWords: 12,
    rgl_minEngagementScore: 0.35,
    rgl_preferQuestions: true,
    rgl_commentDriftPercent: 40,

    // Comment distribution / campaign
    rgl_distEnabled: true,
    rgl_subAllowlist: "", // comma/newline: micro_saas,SaaS (empty = all allowed)
    rgl_subBlocklist: "announcements,reddit.com", // never comment
    rgl_maxCommentsPerSubDay: 2,
    rgl_maxCommentsPerDay: 8,
    rgl_quietHoursStart: 1, // local hour 0-23 inclusive start
    rgl_quietHoursEnd: 7, // exclusive end; if start>end wraps midnight
    rgl_stayInSub: true, // don't jump to /r/all /popular
    rgl_queueOnly: false, // if true, only comment URLs in queue (no random feed posts)
    rgl_preferPromoInvite: true,
    rgl_sessionMaxMinutes: 90, // soft stop after N minutes ON
    rgl_humanSubmitOnly: false, // draft+fill only, no auto click Comment
    rgl_stealthUi: false, // hide mascot/overlay chrome when true
  };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }
  function chance(pct) {
    return Math.random() * 100 < pct;
  }
  function normal(mean, std, min, max) {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const val = mean + z * std;
    return Math.min(max, Math.max(min, val));
  }
  function logish(min, max, skew = 0.55) {
    const t = Math.pow(Math.random(), 1 + skew * 2);
    return min + t * (max - min);
  }
  function longTail(base, p, multMin, multMax) {
    if (Math.random() > p) return base;
    return base * rand(multMin, multMax);
  }
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function isPostPage() {
    return /\/comments\//i.test(location.pathname);
  }
  function isReddit() {
    return location.hostname.includes("reddit.com");
  }

  function estimateTypingMs(draft, wpmLive) {
    const words = Math.max(1, String(draft || "").trim().split(/\s+/).filter(Boolean).length);
    let ms = (words / Math.max(8, wpmLive || 38)) * 60_000;
    ms *= normal(1, 0.18, 0.7, 1.45);
    ms = longTail(ms, 0.08, 1.5, 2.2);
    return clamp(ms, 12_000, 180_000);
  }

  function estimateThinkMs(draft, thinkSecPer100) {
    const chars = String(draft || "").length;
    const ms = (chars / 100) * (thinkSecPer100 || 4) * 1000;
    return clamp(ms * normal(1, 0.2, 0.7, 1.4), 2_000, 25_000);
  }

  function wordCount(text) {
    return String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  /**
   * Detect "promo welcome" posts/comments — OP invites people to drop SaaS/product/link.
   * When true, auto-comment should force soft_mention / seeding.
   */
  function detectPromoInvite(text) {
    const t = String(text || "").toLowerCase().replace(/\s+/g, " ");
    if (t.length < 12) return { invite: false, reasons: [] };

    const patterns = [
      /drop your (saas|product|startup|tool|app|link|url|project|website|site)/i,
      /drop .{0,24}(saas|product|startup|tool|app) .{0,40}comment/i,
      /share your (saas|product|startup|tool|app|link)/i,
      /pitch your (saas|product|startup|idea|tool)/i,
      /plug your (saas|product|startup|tool|app)/i,
      /promote your (saas|product|startup|tool|app)/i,
      /self[-\s]?promo(tion)? (allowed|welcome|ok|encouraged|saturday|sunday|thread)/i,
      /shameless plug/i,
      /feel free to (promote|plug|share|drop)/i,
      /what('?s| is) your (saas|product|startup|tool)/i,
      /show me your (saas|product|startup|tool|app)/i,
      /list (it|them|you) on .{0,40}(board|directory|launch)/i,
      /launch board/i,
      /honest feedback/i,
      /i will (give|provide) you .{0,30}feedback/i,
      /i('?ll| will) (review|check out|try|test) your/i,
      /in the comments? .{0,40}(feedback|review|list|feature)/i,
      /comment .{0,30}(your|with) (saas|product|link|url|startup)/i,
      /post your (saas|product|link|startup|tool)/i,
      /tell (me|us) about your (saas|product|startup|tool)/i,
      // VN-ish
      /drop (link|sản phẩm|product|saas)/i,
      /giới thiệu (sản phẩm|tool|app|saas)/i,
      /promote (thoải mái|được|ok)/i,
    ];

    const reasons = [];
    for (const re of patterns) {
      if (re.test(t)) reasons.push(re.source.slice(0, 48));
    }

    // Combo heuristic: "comments" + (feedback|review) + (free|honest|saas|product)
    if (
      /comment/i.test(t) &&
      /(feedback|review|critique)/i.test(t) &&
      /(saas|product|startup|tool|free|honest)/i.test(t)
    ) {
      reasons.push("combo:comment+feedback+product");
    }

    return {
      invite: reasons.length > 0,
      reasons,
      confidence: Math.min(1, reasons.length * 0.34),
    };
  }

  RGL.util = {
    rand,
    randInt,
    chance,
    normal,
    logish,
    longTail,
    clamp,
    sleep,
    isPostPage,
    isReddit,
    estimateTypingMs,
    estimateThinkMs,
    wordCount,
    detectPromoInvite,
  };

  // Master runtime bus
  RGL.bus = {
    phase: "OFF", // OFF | FEED | POST | COMMENTING | COOLDOWN
    jobPhase: null,
    paused: false,
    energy: 0.55,
    stats: {
      scrolls: 0,
      upvotes: 0,
      commentUpvotes: 0,
      opens: 0,
      comments: 0,
      commentFails: 0,
      charsRead: 0,
    },
    live: {},
    lastOverlay: "",
  };

  // ── Session logger (persist for testing) ─────────────────────────
  // In-memory ring + chrome.storage.local key rgl_sessionLog
  const LOG_MAX = 800;
  const LOG_KEY = "rgl_sessionLog";
  const LOG_META_KEY = "rgl_sessionMeta";
  let sessionId =
    "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  let logBuffer = [];
  let persistTimer = null;
  let meta = {
    sessionId,
    startedAt: new Date().toISOString(),
    href: typeof location !== "undefined" ? location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };

  function serializeArg(a) {
    if (a == null) return String(a);
    if (typeof a === "string" || typeof a === "number" || typeof a === "boolean") return a;
    if (a instanceof Error) return { error: a.message, stack: (a.stack || "").slice(0, 400) };
    try {
      return JSON.parse(JSON.stringify(a));
    } catch (_) {
      return String(a);
    }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        chrome.storage.local.set({
          [LOG_KEY]: logBuffer.slice(-LOG_MAX),
          [LOG_META_KEY]: {
            ...meta,
            updatedAt: new Date().toISOString(),
            entries: logBuffer.length,
            phase: RGL.bus?.phase,
            stats: RGL.bus?.stats,
          },
        });
      } catch (_) {}
    }, 600);
  }

  function pushLog(level, args) {
    const entry = {
      t: new Date().toISOString(),
      ts: Date.now(),
      level,
      sessionId,
      href: typeof location !== "undefined" ? location.pathname + location.search : "",
      phase: RGL.bus?.phase || null,
      jobPhase: RGL.bus?.jobPhase || null,
      msg: args.map(serializeArg),
    };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_MAX) logBuffer = logBuffer.slice(-LOG_MAX);
    schedulePersist();
    return entry;
  }

  RGL.log = (...args) => {
    console.log("[RGL]", ...args);
    pushLog("info", args);
  };
  RGL.warn = (...args) => {
    console.warn("[RGL]", ...args);
    pushLog("warn", args);
  };
  RGL.error = (...args) => {
    console.error("[RGL]", ...args);
    pushLog("error", args);
  };

  RGL.sessionLog = {
    getSessionId: () => sessionId,
    getBuffer: () => logBuffer.slice(),
    getMeta: () => ({ ...meta, entries: logBuffer.length }),
    clear: () => {
      logBuffer = [];
      sessionId =
        "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
      meta = {
        sessionId,
        startedAt: new Date().toISOString(),
        href: typeof location !== "undefined" ? location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      };
      try {
        chrome.storage.local.set({
          [LOG_KEY]: [],
          [LOG_META_KEY]: { ...meta, entries: 0, clearedAt: new Date().toISOString() },
        });
      } catch (_) {}
      RGL.log("session log cleared", sessionId);
    },
    /** Full export object for download / popup */
    exportObject: () => ({
      meta: {
        ...meta,
        exportedAt: new Date().toISOString(),
        entries: logBuffer.length,
        phase: RGL.bus?.phase,
        stats: RGL.bus?.stats,
        live: RGL.bus?.live,
      },
      events: logBuffer.slice(),
    }),
    flush: () => {
      try {
        chrome.storage.local.set({
          [LOG_KEY]: logBuffer.slice(-LOG_MAX),
          [LOG_META_KEY]: {
            ...meta,
            updatedAt: new Date().toISOString(),
            entries: logBuffer.length,
            stats: RGL.bus?.stats,
          },
        });
      } catch (_) {}
    },
  };

  // seed start line
  pushLog("info", ["session start", sessionId, meta.href]);

  // Periodic UI dedupe + mascot recovery (SPA / extension reload)
  if (typeof document !== "undefined" && !window.__RGL_DEDUPE_TIMER__) {
    window.__RGL_DEDUPE_TIMER__ = setInterval(() => {
      try {
        const mascots = document.querySelectorAll(".rch-mascot");
        for (let i = 1; i < mascots.length; i++) mascots[i].remove();
        const bubbles = document.querySelectorAll(".rch-bubble");
        for (let i = 1; i < bubbles.length; i++) bubbles[i].remove();
        const ovs = document.querySelectorAll("#rgl-overlay-root");
        for (let i = 1; i < ovs.length; i++) ovs[i].remove();
        // If Bram vanished entirely, ask assist to recreate
        if (!document.querySelector(".rch-mascot")) {
          window.__RGL_ensureMascot?.();
        }
      } catch (_) {}
    }, 2500);
  }

  RGL.getSettings = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(RGL.DEFAULTS, (s) => resolve({ ...RGL.DEFAULTS, ...s }));
    });
})();
