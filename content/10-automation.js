(() => {
  "use strict";

  /**
   * Human-like Reddit screentime:
   * - Uneven scroll rhythm (no fixed interval / fixed distance)
   * - Pause scales with post text length (char count → reading time)
   * - Sometimes open a post, scroll comments, upvote comments, then back
   */

  /** Keys that can drift over time (live values sit on STATE.*) */
  const DRIFT_KEYS = [
    "scrollSpeed",
    "upvoteChance",
    "openPostChance",
    "commentUpvoteChance",
    "pauseMin",
    "pauseMax",
    "scrollMin",
    "scrollMax",
    "wpm",
  ];

  /** Hard clamps so drift never goes insane */
  const CONFIG_BOUNDS = {
    scrollSpeed: [0.35, 3.2],
    upvoteChance: [0, 45],
    openPostChance: [0, 45],
    commentUpvoteChance: [0, 55],
    pauseMin: [0.25, 20],
    pauseMax: [0.8, 45],
    scrollMin: [10, 300],
    scrollMax: [20, 500],
    wpm: [100, 420],
  };

  const STATE = {
    enabled: false,
    // live (effective) config — runtime always reads these
    scrollSpeed: 1.2,
    upvoteChance: 8,
    openPostChance: 12,
    commentUpvoteChance: 18,
    pauseMin: 1.2,
    pauseMax: 9,
    scrollMin: 28,
    scrollMax: 160,
    wpm: 220,
    // user baselines (popup) — drift re-samples around these
    base: null,
    // dynamic config over time
    dynamicConfig: true,
    driftPercent: 35, // ±% around base on each full re-roll
    driftIntervalMin: 2, // minutes
    driftIntervalMax: 9,
    microDrift: true, // small random walk each loop
    nextDriftAt: 0,
    lastDriftAt: 0,
    driftCount: 0,
    running: false,
    mode: "feed", // feed | post
    timer: null,
    abort: false,
    lastUpvoteAt: 0,
    lastOpenAt: 0,
    lastCommentUpvoteAt: 0,
    upvoted: new WeakSet(),
    openedUrls: new Set(),
    // rhythm memory — drifts so pattern never repeats cleanly
    rhythm: {
      energy: 0.55, // 0 tired/slow → 1 snappy
      streak: 0, // consecutive short scrolls
      lastAmount: 60,
      lastPauseMs: 2500,
      sessionStart: Date.now(),
    },
    stats: {
      scrolls: 0,
      upvotes: 0,
      commentUpvotes: 0,
      opens: 0,
      charsRead: 0,
    },
  };

  const log = (...args) => console.log("[Reddit Screentime]", ...args);

  // ─── Dynamic config drift (change randomly over time) ────────────
  function clampConfig(key, val) {
    const [lo, hi] = CONFIG_BOUNDS[key] || [-Infinity, Infinity];
    let v = Number(val);
    if (!Number.isFinite(v)) v = lo;
    return Math.min(hi, Math.max(lo, v));
  }

  function snapshotBaseFromSettings(settings) {
    const base = {};
    for (const k of DRIFT_KEYS) {
      base[k] = clampConfig(k, settings[k]);
    }
    // keep pause/scroll ordered
    if (base.pauseMax < base.pauseMin) base.pauseMax = base.pauseMin;
    if (base.scrollMax < base.scrollMin) base.scrollMax = base.scrollMin;
    STATE.base = base;
    return base;
  }

  function applyLiveFromBase(base) {
    for (const k of DRIFT_KEYS) {
      STATE[k] = clampConfig(k, base[k]);
    }
    normalizeLivePairs();
  }

  function normalizeLivePairs() {
    if (STATE.pauseMax < STATE.pauseMin) {
      const t = STATE.pauseMin;
      STATE.pauseMin = Math.min(STATE.pauseMin, STATE.pauseMax);
      STATE.pauseMax = Math.max(t, STATE.pauseMax);
    }
    if (STATE.scrollMax < STATE.scrollMin) {
      const t = STATE.scrollMin;
      STATE.scrollMin = Math.min(STATE.scrollMin, STATE.scrollMax);
      STATE.scrollMax = Math.max(t, STATE.scrollMax);
    }
  }

  /**
   * Full re-roll: each config lands randomly within ±driftPercent of base
   * (non-uniform: uses normal around base, not flat uniform — less "robot switch").
   */
  function rollLiveConfig(reason = "interval") {
    if (!STATE.base) return;
    const pct = Math.max(0, Math.min(90, Number(STATE.driftPercent) || 35)) / 100;

    for (const k of DRIFT_KEYS) {
      const b = STATE.base[k];
      const span = Math.abs(b) * pct;
      // allow absolute floor span for small numbers (e.g. pause 1.2)
      const absFloor =
        k.includes("pause") ? 0.4 : k.includes("scroll") && k !== "scrollSpeed" ? 12 : k === "wpm" ? 15 : 0.15;
      const half = Math.max(span, absFloor);
      // normal around base, clipped to [base-half, base+half] then global bounds
      const raw = normal(b, half * 0.55, b - half, b + half);
      STATE[k] = clampConfig(k, raw);
    }

    // occasional "mood" bias: whole profile shifts calm or aggressive together
    if (Math.random() < 0.35) {
      const mood = rand(0.82, 1.22); // <1 calmer, >1 snappier
      STATE.scrollSpeed = clampConfig("scrollSpeed", STATE.scrollSpeed * mood);
      STATE.pauseMin = clampConfig("pauseMin", STATE.pauseMin / Math.sqrt(mood));
      STATE.pauseMax = clampConfig("pauseMax", STATE.pauseMax / Math.sqrt(mood));
      STATE.upvoteChance = clampConfig("upvoteChance", STATE.upvoteChance * (0.7 + mood * 0.3));
      STATE.openPostChance = clampConfig(
        "openPostChance",
        STATE.openPostChance * (mood > 1 ? rand(0.7, 1.1) : rand(0.95, 1.35))
      );
      STATE.wpm = clampConfig("wpm", STATE.wpm * (0.9 + mood * 0.1));
    }

    normalizeLivePairs();
    STATE.lastDriftAt = Date.now();
    STATE.driftCount += 1;
    scheduleNextDrift();

    log("config re-roll", reason, liveConfigSnapshot());
    flashStatus(
      `🎲 config #${STATE.driftCount} · spd ${STATE.scrollSpeed.toFixed(1)} · ⬆${STATE.upvoteChance | 0}% · open ${STATE.openPostChance | 0}%`
    );
  }

  /** Small random walk so values crawl between full re-rolls */
  function microDriftStep() {
    if (!STATE.dynamicConfig || !STATE.microDrift || !STATE.base) return;
    const pct = (Math.max(5, Number(STATE.driftPercent) || 35) / 100) * 0.08; // ~8% of range each step

    for (const k of DRIFT_KEYS) {
      if (Math.random() > 0.45) continue; // not every key every tick
      const b = STATE.base[k];
      const cur = STATE[k];
      const maxDelta = Math.max(Math.abs(b) * pct, k.includes("pause") ? 0.05 : k === "wpm" ? 2 : 0.02);
      const step = normal(0, maxDelta * 0.6, -maxDelta, maxDelta);
      // pull slightly back toward base (mean-reverting walk)
      const pull = (b - cur) * 0.04;
      STATE[k] = clampConfig(k, cur + step + pull);
    }
    normalizeLivePairs();
  }

  function scheduleNextDrift() {
    const minM = Math.max(0.5, Number(STATE.driftIntervalMin) || 2);
    const maxM = Math.max(minM, Number(STATE.driftIntervalMax) || 9);
    // log-ish interval: often sooner, sometimes much later
    const minutes = logish(minM, maxM, 0.45);
    STATE.nextDriftAt = Date.now() + minutes * 60 * 1000;
  }

  function tickDynamicConfig() {
    if (!STATE.dynamicConfig) return;
    microDriftStep();
    if (Date.now() >= (STATE.nextDriftAt || 0)) {
      rollLiveConfig("timer");
    }
  }

  function liveConfigSnapshot() {
    const o = {};
    for (const k of DRIFT_KEYS) o[k] = STATE[k];
    return o;
  }

  // ─── RNG (non-uniform) ───────────────────────────────────────────
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  /** Box–Muller → normal, clamped */
  function normal(mean, std, min, max) {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const val = mean + z * std;
    return Math.min(max, Math.max(min, val));
  }

  /** Log-normal-ish: mostly small, occasional long (human pauses) */
  function logish(min, max, skew = 0.55) {
    // skew 0..1 — higher = more weight near min
    const t = Math.pow(Math.random(), 1 + skew * 2);
    return min + t * (max - min);
  }

  /** Rare long-tail spike (doomscroll fatigue / deep read) */
  function longTail(base, chance, multMin, multMax) {
    if (Math.random() > chance) return base;
    return base * rand(multMin, multMax);
  }

  function sleep(ms) {
    return new Promise((r) => {
      STATE.timer = setTimeout(r, ms);
    });
  }

  function chance(pct) {
    return Math.random() * 100 < pct;
  }

  function isReddit() {
    return location.hostname.includes("reddit.com");
  }

  function isPostPage() {
    // /r/sub/comments/id/...
    return /\/comments\//i.test(location.pathname);
  }

  // ─── Text counting → reading time ────────────────────────────────
  /**
   * Count meaningful characters in a post (title + body).
   * Strips UI chrome, counts letters/digits/punctuation that a human would "read".
   */
  function countPostChars(postEl) {
    if (!postEl) return { chars: 0, words: 0, title: 0, body: 0 };

    const textPieces = [];

    const pull = (root, selectors) => {
      if (!root) return;
      for (const sel of selectors) {
        try {
          root.querySelectorAll(sel).forEach((n) => {
            const t = (n.innerText || n.textContent || "").trim();
            if (t) textPieces.push(t);
          });
        } catch {
          /* ignore bad selectors */
        }
      }
    };

    // light DOM
    pull(postEl, [
      "h1",
      "h2",
      "h3",
      "[slot='title']",
      "a[data-click-id='body']",
      "[data-adclicklocation='title']",
      ".title a",
      ".title",
      "[data-testid='post-title']",
      "a[id^='post-title']",
    ]);

    pull(postEl, [
      "[slot='text-body']",
      "[data-click-id='text']",
      ".usertext-body",
      ".md",
      "[data-testid='post-content']",
      "div[data-adclicklocation='media'] ~ div",
      "shreddit-post-text-body",
      "faceplate-text",
    ]);

    // shadow roots (shreddit)
    if (postEl.shadowRoot) {
      pull(postEl.shadowRoot, [
        "h1",
        "[slot='title']",
        "a[slot='title']",
        "[slot='text-body']",
        ".md",
        "faceplate-text",
      ]);
    }

    // nested custom elements with shadow
    postEl.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) {
        pull(el.shadowRoot, ["[slot='title']", "[slot='text-body']", ".md", "h1", "p"]);
      }
    });

    // fallback: whole post text but strip common chrome words
    let raw = textPieces.join("\n");
    if (raw.length < 8) {
      raw = (postEl.innerText || postEl.textContent || "").trim();
    }

    const cleaned = cleanReadableText(raw);
    const chars = cleaned.replace(/\s+/g, " ").trim().length;
    const words = cleaned.trim() ? cleaned.trim().split(/\s+/).length : 0;

    // rough split: first line-ish = title
    const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = (lines[0] || "").length;
    const body = Math.max(0, chars - title);

    return { chars, words, title, body };
  }

  function cleanReadableText(raw) {
    let t = String(raw || "");
    // kill common Reddit UI chrome
    const junk =
      /\b(Share|Award|Give Award|Reply|Report|Save|Hide|Crosspost|Follow|Join|Joined|More options|Comment|Comments|Upvote|Downvote|Posted by|•|ago|Promote|Advertise|NSFW|Spoiler|OC)\b/gi;
    t = t.replace(junk, " ");
    t = t.replace(/\b\d+\s*(points?|votes?|comments?)\b/gi, " ");
    t = t.replace(/u\/\S+/g, " ");
    t = t.replace(/r\/\S+/g, " ");
    t = t.replace(/https?:\/\/\S+/g, " ");
    t = t.replace(/[ \t]+/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }

  /**
   * Map char/word count → human reading dwell (ms).
   * Longer posts = longer pause. Adds jitter so not linear/detectable.
   */
  function estimateReadingMs(count, opts = {}) {
    const words =
      count.words ||
      Math.max(1, Math.round((count.chars || 0) / 5)); // ~5 chars/word average
    const wpm = opts.wpm || STATE.wpm || 220;

    // base reading time
    let sec = (words / wpm) * 60;

    // title glance even if almost empty body
    sec = Math.max(sec, 1.1 + Math.min(4, (count.title || 0) / 40));

    // skim factor: humans don't fully read every post
    // short posts often fully read; long posts get skimmed harder
    let skim = 1;
    if (words < 40) skim = rand(0.85, 1.15);
    else if (words < 120) skim = rand(0.55, 0.95);
    else if (words < 400) skim = rand(0.35, 0.7);
    else skim = rand(0.22, 0.5); // long essays: skim

    // image/video heavy (few chars) still gets a glance
    if (words < 12) sec = rand(1.4, 4.5);

    sec *= skim;

    // energy / fatigue: slower later in session
    const mins = (Date.now() - STATE.rhythm.sessionStart) / 60000;
    const fatigue = 1 + Math.min(0.35, mins * 0.008);
    sec *= fatigue * (1.15 - STATE.rhythm.energy * 0.25);

    // log-normal jitter so never the same pause twice
    sec *= normal(1, 0.18, 0.65, 1.45);

    // long-tail "wait I actually care" reads
    sec = longTail(sec, 0.08, 1.6, 3.2);

    // hard bounds
    const minMs = (opts.minSec ?? 0.8) * 1000;
    const maxMs = (opts.maxSec ?? 90) * 1000;
    return Math.round(Math.min(maxMs, Math.max(minMs, sec * 1000)));
  }

  // ─── Scroll root / human scroll ──────────────────────────────────
  function getScrollRoot() {
    const candidates = [
      document.querySelector("#AppRouter-main-content"),
      document.querySelector("shreddit-app"),
      document.scrollingElement,
      document.documentElement,
      document.body,
    ].filter(Boolean);

    for (const el of candidates) {
      if (el.scrollHeight > el.clientHeight + 80) return el;
    }
    return document.scrollingElement || document.documentElement;
  }

  function doScroll(amount, behavior) {
    const root = getScrollRoot();
    const opts = { top: amount, behavior: behavior || "auto" };
    if (
      root === document.scrollingElement ||
      root === document.documentElement ||
      root === document.body
    ) {
      window.scrollBy(opts);
    } else {
      root.scrollBy(opts);
    }
    STATE.stats.scrolls += 1;
  }

  /**
   * One human scroll gesture: variable distance, occasional reverse,
   * micro-jiggles, smooth vs instant mix — never fixed step.
   */
  async function humanScrollGesture(context = "feed") {
    // drift energy slowly (tired ↔ focused)
    STATE.rhythm.energy = Math.min(
      0.95,
      Math.max(0.15, STATE.rhythm.energy + normal(0, 0.07, -0.12, 0.12))
    );

    const energy = STATE.rhythm.energy;
    const baseMin = STATE.scrollMin;
    const baseMax = STATE.scrollMax;
    const speed = STATE.scrollSpeed * (0.55 + energy * 0.9);

    // prefer amounts near last, with noise (continuity without periodicity)
    const mean = STATE.rhythm.lastAmount * (0.7 + Math.random() * 0.6);
    let amount = normal(mean, mean * 0.35, baseMin * 0.5, baseMax * 1.4) * speed;

    // burst mode: few tiny scrolls in a row
    const burst = Math.random() < 0.18 + energy * 0.1;
    const steps = burst ? randInt(2, 5) : 1;

    // rare big jump (skip boring stretch)
    if (!burst && Math.random() < 0.07) {
      amount = rand(baseMax * 1.2, baseMax * 2.4) * speed;
    }

    // occasional scroll UP (re-read / mis-scroll)
    const reverse = Math.random() < (context === "comments" ? 0.18 : 0.09);
    if (reverse) amount = -Math.abs(amount) * rand(0.25, 0.7);

    for (let i = 0; i < steps; i++) {
      if (!STATE.enabled || STATE.abort) return;

      const stepAmt =
        (amount / steps) * normal(1, 0.12, 0.75, 1.25) + (Math.random() < 0.2 ? rand(-8, 8) : 0);

      // mix smooth / instant — humans don't always smooth-scroll
      const behavior =
        Math.abs(stepAmt) > 90 && Math.random() < 0.55
          ? "smooth"
          : Math.random() < 0.35
            ? "smooth"
            : "auto";

      doScroll(stepAmt, behavior);
      STATE.rhythm.lastAmount = Math.abs(stepAmt);

      // micro pause inside a multi-step gesture
      if (i < steps - 1) {
        await sleep(normal(90, 40, 40, 220));
        maybeNudgeMouse(0.4);
      }
    }

    STATE.rhythm.streak = burst ? STATE.rhythm.streak + 1 : 0;
    maybeNudgeMouse(0.3);
  }

  function maybeNudgeMouse(p = 0.25) {
    if (Math.random() > p) return;
    const x = normal(window.innerWidth * 0.5, window.innerWidth * 0.2, 40, window.innerWidth - 40);
    const y = normal(window.innerHeight * 0.45, window.innerHeight * 0.2, 60, window.innerHeight - 40);
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: x,
        clientY: y,
        view: window,
      })
    );
  }

  /**
   * Pause after a scroll — heavily non-uniform.
   * If a post is centered, dwell scales with char count.
   */
  async function humanPauseAfterScroll() {
    const focused = pickFocusedPost();
    let pauseMs;

    if (focused) {
      const count = countPostChars(focused);
      STATE.stats.charsRead += count.chars;
      const readMs = estimateReadingMs(count, {
        minSec: STATE.pauseMin * 0.6,
        maxSec: Math.max(STATE.pauseMax * 4, 45),
      });

      // short "skip" when energy high and post already seen-ish
      if (STATE.rhythm.energy > 0.7 && count.words < 30 && Math.random() < 0.35) {
        pauseMs = logish(STATE.pauseMin * 0.4, STATE.pauseMin * 1.2, 0.7) * 1000;
      } else {
        pauseMs = readMs;
      }

      log("dwell", {
        words: count.words,
        chars: count.chars,
        ms: Math.round(pauseMs),
      });
    } else {
      // no post focused — base uneven pause
      const base = logish(STATE.pauseMin, STATE.pauseMax, 0.65) * 1000;
      pauseMs = normal(base, base * 0.25, STATE.pauseMin * 400, STATE.pauseMax * 1800);
    }

    // after a long streak of tiny scrolls, force a longer rest
    if (STATE.rhythm.streak >= 4) {
      pauseMs += rand(2000, 7000);
      STATE.rhythm.streak = 0;
    }

    // session micro-breaks
    if (Math.random() < 0.04) {
      pauseMs += rand(8000, 25000);
      flashStatus("☕ nghỉ ngắn…");
    }

    // avoid near-identical consecutive pauses
    if (Math.abs(pauseMs - STATE.rhythm.lastPauseMs) < 180) {
      pauseMs *= rand(1.15, 1.55);
    }
    STATE.rhythm.lastPauseMs = pauseMs;

    await sleep(pauseMs);
  }

  // ─── DOM: posts / comments ───────────────────────────────────────
  function findAllPosts() {
    const selectors = [
      "shreddit-post",
      "article[data-testid='post-container']",
      "div[data-testid='post-container']",
      ".Post",
      "div.thing.link",
    ];
    for (const sel of selectors) {
      const list = Array.from(document.querySelectorAll(sel));
      if (list.length) return list;
    }
    return [];
  }

  function isMostlyVisible(el) {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.height < 36) return false;
    const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    return visible > Math.min(100, rect.height * 0.3);
  }

  function pickFocusedPost() {
    const posts = findAllPosts().filter(isMostlyVisible);
    if (!posts.length) return null;
    // post closest to vertical center
    const mid = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;
    for (const p of posts) {
      const r = p.getBoundingClientRect();
      const c = (r.top + r.bottom) / 2;
      const d = Math.abs(c - mid);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function findUpvoteButton(scope) {
    const selectors = [
      "button[upvote]",
      'button[aria-label*="upvote" i]',
      'button[aria-label*="Upvote" i]',
      'button[data-click-id="upvote"]',
      'button[id^="upvote-button"]',
      "div.arrow.up:not(.upmod)",
      ".voteButton.up",
      "span.icon-upvote",
    ];

    const search = (root) => {
      if (!root) return null;
      for (const sel of selectors) {
        try {
          const btn = root.querySelector(sel);
          if (btn && !isAlreadyUpvoted(btn, scope)) {
            return btn.closest("button") || btn;
          }
        } catch {
          /* */
        }
      }
      if (root.shadowRoot) {
        for (const sel of selectors) {
          try {
            const btn = root.shadowRoot.querySelector(sel);
            if (btn && !isAlreadyUpvoted(btn, scope)) {
              return btn.closest("button") || btn;
            }
          } catch {
            /* */
          }
        }
      }
      return null;
    };

    let btn = search(scope);
    if (btn) return btn;

    // deep shadow walk limited
    const walk = scope.querySelectorAll("*");
    for (const el of walk) {
      if (el.shadowRoot) {
        btn = search(el);
        if (btn) return btn;
      }
    }
    return null;
  }

  function isAlreadyUpvoted(btn, scope) {
    if (scope && STATE.upvoted.has(scope)) return true;
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    const pressed = btn.getAttribute("aria-pressed");
    const className = (btn.className && btn.className.toString()) || "";
    if (pressed === "true") return true;
    if (aria.includes("remove") || aria.includes("undo") || aria.includes("unvote")) return true;
    if (className.includes("upmod") || className.includes("Upvote--approved")) return true;
    if (btn.hasAttribute("upvoted") || btn.getAttribute("aria-checked") === "true") return true;
    return false;
  }

  async function clickHuman(el) {
    if (!el) return false;
    el.scrollIntoView({ block: "center", behavior: Math.random() < 0.6 ? "smooth" : "auto" });
    await sleep(normal(350, 120, 150, 900));
    maybeNudgeMouse(0.6);
    await sleep(rand(80, 280));
    try {
      el.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window })
      );
      await sleep(rand(40, 160));
      el.click();
      return true;
    } catch (e) {
      log("click failed", e);
      return false;
    }
  }

  async function maybeUpvoteInFeed() {
    if (STATE.allowUpvote === false) return;
    const now = Date.now();
    const cooldown = normal(14000, 5000, 7000, 32000);
    if (now - STATE.lastUpvoteAt < cooldown) return;
    if (!chance(STATE.upvoteChance * (0.6 + STATE.rhythm.energy * 0.5))) return;

    const post = pickFocusedPost();
    if (!post || STATE.upvoted.has(post)) return;

    // prefer upvoting after "reading" longer posts less often? actually humans upvote good short takes more
    const count = countPostChars(post);
    // slightly higher chance on medium posts
    if (count.words > 8 && Math.random() < 0.25) return;

    const btn = findUpvoteButton(post);
    if (!btn) return;

    await sleep(logish(300, 1600, 0.5));
    if (await clickHuman(btn)) {
      STATE.upvoted.add(post);
      STATE.lastUpvoteAt = Date.now();
      STATE.stats.upvotes += 1;
      flashStatus(`⬆ post #${STATE.stats.upvotes}`);
      log("upvoted post", STATE.stats.upvotes);
    }
  }

  // ─── Open post + read comments ───────────────────────────────────
  function findPostLink(post) {
    const selectors = [
      'a[slot="full-post-link"]',
      'a[data-click-id="body"]',
      'a[data-click-id="comments"]',
      'a[href*="/comments/"]',
      ".comments",
      "a.comments",
      'a[id^="post-title"]',
    ];
    for (const sel of selectors) {
      const a = post.querySelector(sel) || post.shadowRoot?.querySelector?.(sel);
      if (a && a.href && /\/comments\//.test(a.href)) return a;
    }
    // deep
    const all = post.querySelectorAll('a[href*="/comments/"]');
    for (const a of all) {
      if (a.href && !a.href.includes("#")) return a;
    }
    if (post.shadowRoot) {
      const a = post.shadowRoot.querySelector('a[href*="/comments/"]');
      if (a) return a;
    }
    return null;
  }

  async function maybeOpenPost() {
    if (isPostPage()) return false;
    const now = Date.now();
    // don't open posts too often
    if (now - STATE.lastOpenAt < normal(45000, 15000, 25000, 120000)) return false;
    if (!chance(STATE.openPostChance)) return false;

    const post = pickFocusedPost();
    if (!post) return false;

    const count = countPostChars(post);
    // more likely to open posts with some substance or active comment threads
    if (count.words < 5 && Math.random() < 0.55) return false;

    const link = findPostLink(post);
    if (!link) return false;
    if (STATE.openedUrls.has(link.href.split("?")[0])) {
      if (Math.random() < 0.85) return false; // rarely re-open
    }

    flashStatus("↗ mở post…");
    await sleep(logish(400, 1800, 0.4));
    STATE.lastOpenAt = Date.now();
    STATE.stats.opens += 1;
    STATE.openedUrls.add(link.href.split("?")[0]);
    // keep opened set from growing forever
    if (STATE.openedUrls.size > 80) {
      const first = STATE.openedUrls.values().next().value;
      STATE.openedUrls.delete(first);
    }

    // navigate in same tab (history.back later)
    STATE.mode = "post";
    link.click();
    return true;
  }

  function findComments() {
    const selectors = [
      "shreddit-comment",
      "div[data-testid='comment']",
      ".Comment",
      "div.thing.comment",
      "article[id^='t1_']",
    ];
    for (const sel of selectors) {
      const list = Array.from(document.querySelectorAll(sel));
      if (list.length) return list;
    }
    return [];
  }

  function countCommentChars(el) {
    const pieces = [];
    const sels = [
      ".md",
      "[slot='comment']",
      "[data-testid='comment'] p",
      "p",
      "faceplate-text",
    ];
    for (const sel of sels) {
      el.querySelectorAll?.(sel)?.forEach((n) => {
        const t = (n.innerText || "").trim();
        if (t) pieces.push(t);
      });
      if (el.shadowRoot) {
        el.shadowRoot.querySelectorAll(sel).forEach((n) => {
          const t = (n.innerText || "").trim();
          if (t) pieces.push(t);
        });
      }
    }
    let raw = pieces.join(" ") || el.innerText || "";
    raw = cleanReadableText(raw);
    const chars = raw.replace(/\s+/g, " ").trim().length;
    const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;
    return { chars, words, title: 0, body: chars };
  }

  async function maybeUpvoteComment() {
    if (STATE.allowUpvote === false) return;
    const now = Date.now();
    if (now - STATE.lastCommentUpvoteAt < normal(12000, 4000, 6000, 28000)) return;
    if (!chance(STATE.commentUpvoteChance)) return;

    const comments = findComments().filter(isMostlyVisible);
    if (!comments.length) return;

    const target = comments[randInt(0, comments.length - 1)];
    if (STATE.upvoted.has(target)) return;

    const btn = findUpvoteButton(target);
    if (!btn) return;

    await sleep(logish(250, 1400, 0.5));
    if (await clickHuman(btn)) {
      STATE.upvoted.add(target);
      STATE.lastCommentUpvoteAt = Date.now();
      STATE.stats.commentUpvotes += 1;
      flashStatus(`⬆ comment #${STATE.stats.commentUpvotes}`);
    }
  }

  async function readPostPageSession() {
    STATE.mode = "post";
    flashStatus("📖 đọc post + comments");

    // wait for content
    await sleep(normal(1200, 400, 600, 2800));

    // read OP
    const op =
      document.querySelector("shreddit-post") ||
      document.querySelector("div[data-test-id='post-content']") ||
      document.querySelector(".Post") ||
      document.querySelector("div.thing.link") ||
      document.querySelector("[data-testid='post-container']");

    if (op) {
      const count = countPostChars(op);
      STATE.stats.charsRead += count.chars;
      const readMs = estimateReadingMs(count, { minSec: 2, maxSec: 120 });
      log("OP read", count, readMs);
      // scroll slowly through OP
      const chunks = randInt(2, 5);
      for (let i = 0; i < chunks; i++) {
        if (!STATE.enabled) return;
        await humanScrollGesture("post");
        await sleep(readMs / chunks + rand(-200, 400));
      }
      // maybe upvote OP
      if (chance(STATE.upvoteChance * 1.4)) {
        const btn = findUpvoteButton(op);
        if (btn && !STATE.upvoted.has(op)) {
          await sleep(logish(400, 2000, 0.4));
          if (await clickHuman(btn)) {
            STATE.upvoted.add(op);
            STATE.lastUpvoteAt = Date.now();
            STATE.stats.upvotes += 1;
          }
        }
      }
    }

    // scroll comments with char-based dwells
    const commentRounds = randInt(4, 14);
    for (let i = 0; i < commentRounds; i++) {
      if (!STATE.enabled || STATE.abort) return;
      await humanScrollGesture("comments");

      const visible = findComments().filter(isMostlyVisible);
      if (visible.length) {
        const c = visible[Math.floor(visible.length / 2)] || visible[0];
        const cc = countCommentChars(c);
        const dwell = estimateReadingMs(cc, { minSec: 0.6, maxSec: 35, wpm: STATE.wpm * 1.05 });
        STATE.stats.charsRead += cc.chars;
        await sleep(dwell);
      } else {
        await sleep(logish(800, 3500, 0.5));
      }

      await maybeUpvoteComment();

      // early exit sometimes (got bored)
      if (i > 3 && Math.random() < 0.12) break;
    }

    // leave post — back to feed
    await sleep(logish(600, 2500, 0.4));
    flashStatus("← về feed");
    STATE.mode = "feed";
    if (history.length > 1) {
      history.back();
      await sleep(normal(1500, 400, 900, 3200));
    } else {
      location.href = "/";
    }
  }

  // ─── Near bottom ─────────────────────────────────────────────────
  function nearBottom() {
    const root = getScrollRoot();
    const isWin =
      root === document.scrollingElement ||
      root === document.documentElement ||
      root === document.body;
    const scrollTop = isWin ? window.scrollY : root.scrollTop;
    const height = isWin ? document.documentElement.scrollHeight : root.scrollHeight;
    const client = isWin ? window.innerHeight : root.clientHeight;
    return scrollTop + client >= height - rand(280, 520);
  }

  async function handleNearBottom() {
    if (!nearBottom()) return;
    await sleep(logish(1200, 4500, 0.4));
    if (!nearBottom()) return;

    const next =
      document.querySelector(".next-button a") ||
      document.querySelector('a[rel="nofollow next"]');
    if (next) {
      next.click();
      return;
    }

    // small reverse then maybe navigate
    doScroll(-rand(80, 220), "smooth");
    if (Math.random() < 0.28) {
      const paths = ["/", "/r/popular/", "/r/all/", "/new/"];
      location.href = paths[randInt(0, paths.length - 1)];
    }
  }

  // ─── Status toast → Claude overlay only (no legacy #rss-screentime-overlay)
  // Removes conflict with #rgl-overlay-root bottom-right panel.
  function removeLegacyOverlay() {
    try {
      document.getElementById("rss-screentime-overlay")?.remove();
    } catch (_) {}
  }

  function flashStatus(text) {
    removeLegacyOverlay();
    // Prefer RGL Claude overlay status line; never create second fixed panel
    if (window.RGL?.bus) {
      window.RGL.bus.lastFlash = String(text || "");
      window.RGL.bus.lastFlashAt = Date.now();
    }
    // Ask orchestrator overlay to refresh if present
    try {
      window.RGL?.orchestrator?.updateOverlay?.();
    } catch (_) {}
    log("status", text);
  }

  function updateLiveStatus() {
    removeLegacyOverlay();
    if (window.RGL?.bus) {
      window.RGL.bus.stats = { ...window.RGL.bus.stats, ...STATE.stats };
      window.RGL.bus.energy = STATE.rhythm.energy;
      window.RGL.bus.live = liveConfigSnapshot();
    }
    try {
      window.RGL?.orchestrator?.updateOverlay?.();
    } catch (_) {}
  }

  // ─── Main loops ──────────────────────────────────────────────────
  async function feedLoop() {
    while (STATE.enabled && STATE.running && !STATE.abort) {
      try {
        if (isPostPage()) {
          await readPostPageSession();
          continue;
        }

        tickDynamicConfig();

        await humanScrollGesture("feed");
        await humanPauseAfterScroll();
        await maybeUpvoteInFeed();

        // sometimes open a post (blocks until back)
        const opened = await maybeOpenPost();
        if (opened) {
          // navigation will re-inject content script; if SPA stays, wait & read
          await sleep(normal(1800, 500, 1000, 3500));
          if (isPostPage()) {
            await readPostPageSession();
          }
        }

        await handleNearBottom();
        updateLiveStatus();

        // tiny inter-cycle jitter so outer loop isn't metronomic
        await sleep(normal(180, 90, 40, 520));
      } catch (e) {
        log("feedLoop error", e);
        await sleep(2000);
      }
    }
  }

  function start() {
    if (STATE.running) return;
    if (!isReddit()) {
      log("Not on Reddit");
      return;
    }
    STATE.running = true;
    STATE.abort = false;
    STATE.rhythm.sessionStart = Date.now();
    STATE.rhythm.energy = rand(0.35, 0.75);
    STATE.driftCount = 0;

    if (STATE.dynamicConfig) {
      rollLiveConfig("start");
    } else if (STATE.base) {
      applyLiveFromBase(STATE.base);
    }

    flashStatus(
      STATE.dynamicConfig
        ? `start · dynamic cfg ±${STATE.driftPercent}%`
        : "start · fixed config"
    );
    log("Started", {
      dynamicConfig: STATE.dynamicConfig,
      live: liveConfigSnapshot(),
      base: STATE.base,
    });

    // if already on a post page when enabled
    if (isPostPage()) {
      readPostPageSession().then(() => {
        if (STATE.enabled) feedLoop();
      });
    } else {
      feedLoop();
    }
  }

  function stop() {
    STATE.running = false;
    STATE.abort = true;
    if (STATE.timer) {
      clearTimeout(STATE.timer);
      STATE.timer = null;
    }
    removeLegacyOverlay();
    flashStatus("OFF");
    log("Stopped", STATE.stats);
  }

  function mapRglSettings(s) {
    return {
      enabled: !!(s.rgl_enabled ?? s.enabled),
      scrollSpeed: s.rgl_scrollSpeed ?? s.scrollSpeed ?? 1.2,
      upvoteChance: s.rgl_upvoteChance ?? s.upvoteChance ?? 8,
      openPostChance: s.rgl_openPostChance ?? s.openPostChance ?? 12,
      commentUpvoteChance: s.rgl_commentUpvoteChance ?? s.commentUpvoteChance ?? 18,
      pauseMin: s.rgl_pauseMin ?? s.pauseMin ?? 1.2,
      pauseMax: s.rgl_pauseMax ?? s.pauseMax ?? 9,
      scrollMin: s.rgl_scrollMin ?? s.scrollMin ?? 28,
      scrollMax: s.rgl_scrollMax ?? s.scrollMax ?? 160,
      wpm: s.rgl_wpm ?? s.wpm ?? 220,
      dynamicConfig: s.rgl_dynamicConfig !== false && s.dynamicConfig !== false,
      driftPercent: s.rgl_driftPercent ?? s.driftPercent ?? 35,
      driftIntervalMin: s.rgl_driftIntervalMin ?? s.driftIntervalMin ?? 2,
      driftIntervalMax: s.rgl_driftIntervalMax ?? s.driftIntervalMax ?? 9,
      microDrift: s.rgl_microDrift !== false && s.microDrift !== false,
      // comment rhythm live keys (orchestrator/auto-comment also reads)
      commentChance: s.rgl_commentChanceBase ?? 12,
      commentWpm: s.rgl_commentWpmBase ?? 38,
      minGapSec: s.rgl_minSecondsBetweenComments ?? 240,
    };
  }

  // Extra drift keys for comment rhythm (shared mood with scroll)
  const EXTRA_DRIFT = ["commentChance", "commentWpm", "minGapSec"];
  const EXTRA_BOUNDS = {
    commentChance: [0, 40],
    commentWpm: [18, 70],
    minGapSec: [90, 1200],
  };
  for (const k of EXTRA_DRIFT) {
    if (!DRIFT_KEYS.includes(k)) DRIFT_KEYS.push(k);
    CONFIG_BOUNDS[k] = EXTRA_BOUNDS[k];
    STATE[k] = k === "commentChance" ? 12 : k === "commentWpm" ? 38 : 240;
  }

  function applySettings(settings, { autoStart = false } = {}) {
    const mapped = mapRglSettings(settings);
    STATE.dynamicConfig = mapped.dynamicConfig;
    STATE.driftPercent = Number(mapped.driftPercent) ?? 35;
    STATE.driftIntervalMin = Number(mapped.driftIntervalMin) || 2;
    STATE.driftIntervalMax = Number(mapped.driftIntervalMax) || 9;
    STATE.microDrift = mapped.microDrift !== false;
    STATE.allowUpvote = true; // orchestrator can set false

    const base = snapshotBaseFromSettings(mapped);
    // inject comment rhythm into base
    base.commentChance = mapped.commentChance;
    base.commentWpm = mapped.commentWpm;
    base.minGapSec = mapped.minGapSec;
    STATE.base = base;

    if (!STATE.dynamicConfig || !STATE.running) {
      applyLiveFromBase(base);
    } else {
      for (const k of DRIFT_KEYS) {
        if (base[k] == null) continue;
        STATE[k] = clampConfig(k, STATE[k] * 0.55 + base[k] * 0.45);
      }
      normalizeLivePairs();
    }

    // sync to RGL bus
    if (window.RGL?.bus) {
      window.RGL.bus.live = liveConfigSnapshot();
      window.RGL.bus.energy = STATE.rhythm.energy;
      window.RGL.bus.stats = { ...window.RGL.bus.stats, ...STATE.stats };
    }

    if (autoStart) {
      STATE.enabled = !!mapped.enabled;
      if (STATE.enabled) start();
      else stop();
    }
  }

  function pause() {
    STATE.paused = true;
    STATE.abort = true; // break inner waits
  }
  function resume() {
    STATE.paused = false;
    STATE.abort = false;
  }

  async function tickFeed({ allowUpvote = true } = {}) {
    if (STATE.paused) return;
    STATE.allowUpvote = allowUpvote;
    STATE.enabled = true;
    tickDynamicConfig();
    await humanScrollGesture("feed");
    await humanPauseAfterScroll();
    if (allowUpvote) await maybeUpvoteInFeed();
    await handleNearBottom();
    if (window.RGL?.bus) {
      window.RGL.bus.stats = { ...window.RGL.bus.stats, ...STATE.stats };
      window.RGL.bus.live = liveConfigSnapshot();
      window.RGL.bus.energy = STATE.rhythm.energy;
    }
  }

  // Don't auto-start — orchestrator owns lifecycle
  chrome.storage.local.get(null, (s) => applySettings(s, { autoStart: false }));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    chrome.storage.local.get(null, (s) => applySettings(s, { autoStart: false }));
  });

  window.RGL = window.RGL || {};
  window.RGL.automation = {
    start,
    stop,
    pause,
    resume,
    applySettings,
    tickFeed,
    humanScrollGesture,
    humanPauseAfterScroll,
    maybeUpvoteInFeed,
    maybeUpvoteComment,
    maybeOpenPost,
    readPostPageSession,
    pickFocusedPost,
    findAllPosts,
    findComments,
    countPostChars,
    countCommentChars,
    estimateReadingMs,
    rollLiveConfig,
    liveConfigSnapshot,
    tickDynamicConfig,
    isPaused: () => !!STATE.paused,
    getState: () => STATE,
    getStats: () => STATE.stats,
  };

  window.__redditScreentime = window.RGL.automation;
  log("Automation module ready", location.href);
})();
