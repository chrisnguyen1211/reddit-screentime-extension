(() => {
  "use strict";

  /**
   * Human-like Reddit screentime:
   * - Uneven scroll rhythm (no fixed interval / fixed distance)
   * - Pause scales with post text length (char count → reading time)
   * - Sometimes open a post, scroll comments, upvote comments, then back
   */

  const STATE = {
    enabled: false,
    scrollSpeed: 1.2,
    upvoteChance: 8,
    openPostChance: 12, // % chance each "decision" to open a post
    commentUpvoteChance: 18,
    pauseMin: 1.2,
    pauseMax: 9,
    scrollMin: 28,
    scrollMax: 160,
    wpm: 220, // reading speed baseline (words/min)
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

  // ─── Overlay ─────────────────────────────────────────────────────
  let overlayEl = null;
  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement("div");
    overlayEl.id = "rss-screentime-overlay";
    Object.assign(overlayEl.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "2147483647",
      background: "rgba(0,0,0,0.8)",
      color: "#fff",
      font: "11px/1.35 system-ui, -apple-system, sans-serif",
      padding: "8px 11px",
      borderRadius: "10px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.25s",
      maxWidth: "260px",
      whiteSpace: "pre-line",
    });
    document.documentElement.appendChild(overlayEl);
    return overlayEl;
  }

  function flashStatus(text) {
    const el = ensureOverlay();
    el.textContent = `🟠 ${text}`;
    el.style.opacity = "1";
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => {
      if (STATE.enabled) updateLiveStatus();
      else el.style.opacity = "0";
    }, 2000);
  }

  function updateLiveStatus() {
    if (!STATE.enabled) return;
    const el = ensureOverlay();
    const s = STATE.stats;
    el.textContent = `🟠 ${STATE.mode} · 📜${s.scrolls} ⬆${s.upvotes} 💬${s.commentUpvotes} ↗${s.opens}\nenergy ${(STATE.rhythm.energy * 100) | 0}% · ~${s.charsRead} chars`;
    el.style.opacity = "0.88";
  }

  // ─── Main loops ──────────────────────────────────────────────────
  async function feedLoop() {
    while (STATE.enabled && STATE.running && !STATE.abort) {
      try {
        if (isPostPage()) {
          await readPostPageSession();
          continue;
        }

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
    flashStatus("start · human rhythm");
    log("Started", {
      openPostChance: STATE.openPostChance,
      wpm: STATE.wpm,
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
    if (overlayEl) {
      overlayEl.textContent = "🟠 OFF";
      overlayEl.style.opacity = "1";
      setTimeout(() => {
        if (overlayEl) overlayEl.style.opacity = "0";
      }, 1400);
    }
    log("Stopped", STATE.stats);
  }

  function applySettings(settings) {
    const was = STATE.enabled;
    Object.assign(STATE, {
      enabled: !!settings.enabled,
      scrollSpeed: Number(settings.scrollSpeed) || 1.2,
      upvoteChance: Number(settings.upvoteChance) ?? 8,
      openPostChance: Number(settings.openPostChance) ?? 12,
      commentUpvoteChance: Number(settings.commentUpvoteChance) ?? 18,
      pauseMin: Number(settings.pauseMin) || 1.2,
      pauseMax: Number(settings.pauseMax) || 9,
      scrollMin: Number(settings.scrollMin) || 28,
      scrollMax: Number(settings.scrollMax) || 160,
      wpm: Number(settings.wpm) || 220,
    });

    if (STATE.enabled && !was) start();
    else if (!STATE.enabled && was) stop();
    else if (STATE.enabled && !STATE.running) start();
  }

  const DEFAULTS = {
    enabled: false,
    scrollSpeed: 1.2,
    upvoteChance: 8,
    openPostChance: 12,
    commentUpvoteChance: 18,
    pauseMin: 1.2,
    pauseMax: 9,
    scrollMin: 28,
    scrollMax: 160,
    wpm: 220,
  };

  chrome.storage.local.get(DEFAULTS, applySettings);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = { ...STATE };
    for (const key of Object.keys(changes)) {
      next[key] = changes[key].newValue;
    }
    applySettings(next);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "GET_STATS") {
      sendResponse({
        stats: STATE.stats,
        enabled: STATE.enabled,
        running: STATE.running,
        mode: STATE.mode,
        energy: STATE.rhythm.energy,
      });
      return true;
    }
    if (msg?.type === "PING") {
      sendResponse({ ok: true, href: location.href, mode: STATE.mode });
      return true;
    }
  });

  // expose for debug in console
  window.__redditScreentime = {
    countPostChars,
    estimateReadingMs,
    pickFocusedPost,
    STATE,
  };

  log("Content script loaded", location.href, isPostPage() ? "(post)" : "(feed)");
})();
