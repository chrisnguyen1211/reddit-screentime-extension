// Anti-shadowban risk tracker — community proxy metrics (not official Reddit formulas).
// Tracks action log, computes 9:1 promo ratio, velocity, multi-sub bursts; can soft-block auto seed/comment.
(() => {
  "use strict";

  const RGL = (window.RGL = window.RGL || {});
  const STORE_KEY = "rgl_banGuardLog";
  const MAX_EVENTS = 2000;

  /** @type {{t:number,type:string,sub?:string,promo?:boolean,href?:string}[]} */
  let events = [];
  let loaded = false;
  let loadPromise = null;

  function load() {
    if (loaded) return Promise.resolve(events);
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORE_KEY], (s) => {
          events = Array.isArray(s[STORE_KEY]) ? s[STORE_KEY] : [];
          if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
          loaded = true;
          resolve(events);
        });
      } catch (_) {
        loaded = true;
        resolve(events);
      }
    });
    return loadPromise;
  }

  let persistT = null;
  function persist() {
    if (persistT) return;
    persistT = setTimeout(() => {
      persistT = null;
      try {
        chrome.storage.local.set({ [STORE_KEY]: events.slice(-MAX_EVENTS) });
      } catch (_) {}
    }, 400);
  }

  /**
   * @param {"comment"|"post"|"upvote"|"seed_comment"|"vote"} type
   * @param {{sub?:string,promo?:boolean,href?:string}} meta
   */
  function record(type, meta = {}) {
    const sub = (meta.sub || pageSub() || "").replace(/^r\//, "");
    const ev = {
      t: Date.now(),
      type,
      sub,
      promo: !!(meta.promo || type === "seed_comment"),
      href: meta.href || (typeof location !== "undefined" ? location.pathname : ""),
    };
    events.push(ev);
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    persist();
    RGL.log?.("ban-guard record", type, sub, ev.promo ? "promo" : "organic");
    return ev;
  }

  function pageSub() {
    try {
      const m = location.pathname.match(/\/r\/([^/]+)/i);
      return m ? m[1] : "";
    } catch (_) {
      return "";
    }
  }

  function since(ms) {
    const cut = Date.now() - ms;
    return events.filter((e) => e.t >= cut);
  }

  function compute(windowMs = 24 * 3600 * 1000) {
    const win = since(windowMs);
    const hour = since(3600 * 1000);
    const comments = win.filter((e) => e.type === "comment" || e.type === "seed_comment");
    const seeds = win.filter((e) => e.promo || e.type === "seed_comment");
    const organicComments = comments.filter((e) => !e.promo && e.type !== "seed_comment");
    const upvotes = win.filter((e) => e.type === "upvote" || e.type === "vote");
    const posts = win.filter((e) => e.type === "post");

    // "Value" interactions ≈ organic comments + upvotes (proxy for 9:1)
    const valueActs = organicComments.length + upvotes.length;
    const promoActs = seeds.length + posts.filter((e) => e.promo).length;
    // ratio value:promo — ideal ≥ 9:1 → promoShare ≤ 10%
    const totalTracked = valueActs + promoActs;
    const promoShare = totalTracked ? promoActs / totalTracked : 0;
    const ratioValuePerPromo = promoActs ? valueActs / promoActs : valueActs > 0 ? Infinity : null;

    // Velocity
    const actions1h = hour.length;
    const comments1h = hour.filter((e) => e.type === "comment" || e.type === "seed_comment").length;
    const comments24h = comments.length;

    // Cross-sub burst: same-ish window many distinct subs with comments
    const subs1h = new Set(hour.filter((e) => e.type === "comment" || e.type === "seed_comment").map((e) => e.sub).filter(Boolean));
    const subs24h = new Set(comments.map((e) => e.sub).filter(Boolean));

    // Score 0–100 (higher = riskier). Heuristic, not Reddit's formula.
    let risk = 0;
    const flags = [];

    // 9:1 rule — promo share > 10% → risk; > 25% high; > 40% critical
    if (promoActs >= 1 && ratioValuePerPromo != null && ratioValuePerPromo < 9) {
      const deficit = 9 - Math.min(9, ratioValuePerPromo);
      risk += Math.min(35, 10 + deficit * 4);
      flags.push({
        id: "promo_ratio",
        level: ratioValuePerPromo < 3 ? "high" : "med",
        msg: `Self-promo ratio ~${ratioValuePerPromo === Infinity ? "∞" : ratioValuePerPromo.toFixed(1)}:1 (target ≥9:1)`,
      });
    }
    if (promoShare > 0.25) {
      risk += 15;
      flags.push({ id: "promo_share", level: "high", msg: `Promo share ${(promoShare * 100).toFixed(0)}% of tracked acts (24h)` });
    }

    // Comment velocity
    if (comments1h >= 6) {
      risk += 25;
      flags.push({ id: "comment_velocity_1h", level: "high", msg: `${comments1h} comments in last hour` });
    } else if (comments1h >= 4) {
      risk += 12;
      flags.push({ id: "comment_velocity_1h", level: "med", msg: `${comments1h} comments in last hour` });
    }
    if (comments24h >= 25) {
      risk += 15;
      flags.push({ id: "comment_velocity_24h", level: "med", msg: `${comments24h} comments in 24h` });
    }

    // Multi-sub spam
    if (subs1h.size >= 5) {
      risk += 20;
      flags.push({ id: "multi_sub_1h", level: "high", msg: `Commented in ${subs1h.size} subs in 1h` });
    } else if (subs1h.size >= 3) {
      risk += 10;
      flags.push({ id: "multi_sub_1h", level: "med", msg: `Commented in ${subs1h.size} subs in 1h` });
    }

    // Action spam (any)
    if (actions1h >= 40) {
      risk += 15;
      flags.push({ id: "action_velocity", level: "high", msg: `${actions1h} actions/hour` });
    }

    risk = Math.min(100, Math.round(risk));
    let band = "green";
    if (risk >= 60) band = "red";
    else if (risk >= 30) band = "yellow";

    // Soft gates for auto
    const blockSeed = risk >= 45 || (promoActs >= 2 && (ratioValuePerPromo == null || ratioValuePerPromo < 5));
    const blockComment = risk >= 70 || comments1h >= 8;
    const blockUpvoteBurst = actions1h >= 50;

    return {
      risk,
      band,
      flags,
      windowHours: windowMs / 3600000,
      valueActs,
      promoActs,
      promoShare,
      ratioValuePerPromo: ratioValuePerPromo === Infinity ? null : ratioValuePerPromo,
      comments1h,
      comments24h,
      actions1h,
      subs1h: [...subs1h],
      subs24h: [...subs24h],
      blockSeed,
      blockComment,
      blockUpvoteBurst,
      eventCount: events.length,
    };
  }

  /**
   * Call before auto seed/comment. Returns { ok, reason, metrics }.
   */
  function allowAuto(kind /* 'comment' | 'seed' */) {
    const m = compute();
    if (kind === "seed" && m.blockSeed) {
      return {
        ok: false,
        reason: "ban-guard: seed blocked — improve 9:1 organic ratio first",
        metrics: m,
      };
    }
    if ((kind === "comment" || kind === "seed") && m.blockComment) {
      return {
        ok: false,
        reason: "ban-guard: comment velocity too high",
        metrics: m,
      };
    }
    return { ok: true, reason: null, metrics: m };
  }

  function snapshot() {
    return {
      metrics: compute(),
      recent: events.slice(-30),
    };
  }

  function clear() {
    events = [];
    persist();
    RGL.log?.("ban-guard cleared");
  }

  load();

  RGL.banGuard = {
    load,
    record,
    compute,
    allowAuto,
    snapshot,
    clear,
    pageSub,
  };
})();
