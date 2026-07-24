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
  };

  RGL.log = (...args) => console.log("[RGL]", ...args);

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

  RGL.getSettings = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(RGL.DEFAULTS, (s) => resolve({ ...RGL.DEFAULTS, ...s }));
    });
})();
