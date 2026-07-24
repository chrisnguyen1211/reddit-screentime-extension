// Full auto comment/reply with human typing latency.
// Flow (both top-level comment AND reply):
//   1) Must be ON post page (navigate in if needed)
//   2) Score target (questions + engagement)
//   3) LLM generate
//   4) Think + typing delay (∝ draft words/wpm)
//   5) Detect comment/reply field → fill → click submit
(() => {
  "use strict";

  const RGL = (window.RGL = window.RGL || {});
  const U = () => RGL.util;
  const log = (...a) => RGL.log?.("auto-comment", ...a);

  const job = {
    active: null, // CommentJob | null
    touchedThreads: new Set(),
    lastCommentAt: 0,
    commentsThisSession: 0,
    commentsThisHour: 0,
    hourBucket: "",
    postedHashes: new Set(),
  };

  function settings() {
    return RGL._settings || RGL.DEFAULTS || {};
  }

  function live() {
    const auto = RGL.automation?.getState?.() || {};
    const s = settings();
    return {
      commentChance: auto.commentChance ?? s.rgl_commentChanceBase ?? 12,
      commentWpm: auto.commentWpm ?? s.rgl_commentWpmBase ?? 38,
      minGapSec: auto.minGapSec ?? s.rgl_minSecondsBetweenComments ?? 240,
      thinkSec: s.rgl_thinkSecPer100Chars ?? 4,
      minEng: s.rgl_minEngagementScore ?? 0.35,
      minWords: s.rgl_minTargetWords ?? 12,
      preferQ: s.rgl_preferQuestions !== false,
      maxHour: s.rgl_maxCommentsPerHour ?? 4,
      maxSession: s.rgl_maxCommentsPerSession ?? 8,
      hardMinGap: s.rgl_minSecondsBetweenComments ?? 240,
      autoSubmit: s.rgl_autoSubmit !== false,
      model: s.rgl_model || "xai/grok-4",
      seed: !!s.rgl_seedMode,
    };
  }

  function hourKey() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
  }

  function refreshHourBucket() {
    const k = hourKey();
    if (k !== job.hourBucket) {
      job.hourBucket = k;
      job.commentsThisHour = 0;
    }
  }

  function budgetOk() {
    refreshHourBucket();
    const L = live();
    const now = Date.now();
    if (job.commentsThisSession >= L.maxSession) return { ok: false, reason: "session-cap" };
    if (job.commentsThisHour >= L.maxHour) return { ok: false, reason: "hour-cap" };
    const gapNeed = Math.max(L.hardMinGap, L.minGapSec) * 1000;
    if (job.lastCommentAt && now - job.lastCommentAt < gapNeed) {
      return { ok: false, reason: "gap", waitMs: gapNeed - (now - job.lastCommentAt) };
    }
    return { ok: true };
  }

  function isBusy() {
    return !!(job.active && !["DONE", "FAIL", "SKIP"].includes(job.active.phase));
  }

  function waitIfBusy() {
    return new Promise(async (resolve) => {
      while (isBusy()) await U().sleep(400);
      resolve();
    });
  }

  // ── engagement + scoring ─────────────────────────────────────────
  function parseCount(text) {
    if (!text) return 0;
    const t = String(text).replace(/,/g, "").trim();
    const m = t.match(/([\d.]+)\s*([kKmM])?/);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (/k/i.test(m[2] || "")) n *= 1000;
    if (/m/i.test(m[2] || "")) n *= 1e6;
    return n || 0;
  }

  function engagementFromEl(el) {
    if (!el) return 0.4;
    let comments = 0;
    let score = 0;
    try {
      if (el.tagName === "SHREDDIT-POST") {
        comments = parseCount(el.getAttribute("comment-count") || el.getAttribute("number-of-comments"));
        score = parseCount(el.getAttribute("score"));
      }
      const text = (el.innerText || "").slice(0, 500);
      const cm = text.match(/([\d,.]+[kKmM]?)\s*comments?/i);
      const sm = text.match(/([\d,.]+[kKmM]?)\s*(points?|upvotes?|votes?)/i);
      if (cm) comments = Math.max(comments, parseCount(cm[1]));
      if (sm) score = Math.max(score, parseCount(sm[1]));
      const oldScore = el.querySelector?.(".score")?.textContent;
      const oldC = el.querySelector?.("a.comments")?.textContent;
      if (oldScore) score = Math.max(score, parseCount(oldScore));
      if (oldC) comments = Math.max(comments, parseCount(oldC));
    } catch (_) {}

    // log-scale 0..1
    const eng = U().clamp(
      Math.log1p(comments) / Math.log1p(200) * 0.55 + Math.log1p(score) / Math.log1p(500) * 0.45,
      0,
      1
    );
    // unknown → mid-low so only questions rescue
    if (comments === 0 && score === 0) return 0.32;
    return eng;
  }

  function scoreTarget(el, kind, ctx) {
    const L = live();
    const text =
      kind === "comment"
        ? ctx?.replyingTo || ""
        : `${ctx?.title || ""} ${ctx?.body || ""}`;
    const words = U().wordCount(text);
    const questions = ctx?.questions || RGL.assist?.extractQuestions?.(text) || [];
    const eng = engagementFromEl(el);
    let s = 0;
    s += eng * 0.45;
    s += U().clamp(words / 80, 0, 1) * 0.2;
    if (questions.length) s += Math.min(0.5, questions.length * 0.25);
    if (L.preferQ && questions.length) s += 0.1;
    if (RGL.assist?.isAutoModeratorComment?.(el)) s = -1;
    if (words < L.minWords && !questions.length) s -= 0.4;

    const thr = questions.length ? L.minEng * 0.6 : L.minEng;
    const pass = s >= thr && eng >= thr * 0.85;
    return { score: s, eng, words, questions, pass, thr };
  }

  function threadKey() {
    const m = location.pathname.match(/\/comments\/([^/]+)/);
    return m ? m[1] : location.pathname;
  }

  // ── job pipeline ─────────────────────────────────────────────────
  async function considerOnPostPage() {
    if (isBusy()) return null;
    const s = settings();
    if (s.rgl_mode !== "full") return null;
    if (s.rgl_autoCommentEnabled === false) return null;
    if (!s.rgl_ackRisk) return null;
    if (!U().isPostPage()) return null;

    const bud = budgetOk();
    if (!bud.ok) {
      log("budget skip", bud);
      return null;
    }

    const L = live();
    if (!U().chance(L.commentChance)) return null;

    const tk = threadKey();
    if (job.touchedThreads.has(tk)) {
      log("already commented this thread");
      return null;
    }

    // Pick target: 70% question-reply, 30% OP
    const wantReply = Math.random() < 0.7;
    let targetEl = null;
    let kind = "post";
    let ctx = null;
    let scored = null;

    if (wantReply && RGL.assist) {
      const comments = [
        ...(document.querySelectorAll("shreddit-comment, .comment") || []),
      ].filter((c) => {
        const r = c.getBoundingClientRect();
        return r.height > 40 && r.bottom > 0 && r.top < window.innerHeight;
      });
      const ranked = comments
        .map((c) => {
          const cctx = RGL.assist.commentContext(c);
          const sc = scoreTarget(c, "comment", cctx);
          return { c, cctx, sc };
        })
        .filter((x) => x.sc.pass && x.sc.questions.length > 0)
        .sort((a, b) => b.sc.score - a.sc.score);
      if (ranked[0]) {
        targetEl = ranked[0].c;
        kind = "comment";
        ctx = ranked[0].cctx;
        scored = ranked[0].sc;
      }
    }

    if (!targetEl) {
      const post =
        document.querySelector("shreddit-post") ||
        document.querySelector(".thing.link") ||
        document.querySelector("[data-testid='post-container']");
      if (!post) return null;
      ctx = RGL.assist?.postContext?.(post) || { title: document.title, body: "", questions: [] };
      scored = scoreTarget(post, "post", ctx);
      if (!scored.pass) {
        log("OP eng skip", scored);
        return null;
      }
      targetEl = post;
      kind = "post";
    }

    return runJob({ targetEl, kind, ctx, scored });
  }

  async function runJob({ targetEl, kind, ctx, scored }) {
    const L = live();
    const u = U();
    const j = {
      id: `c_${Date.now()}`,
      kind,
      phase: "SELECTED",
      draftText: "",
      wordCount: 0,
      typingMs: 0,
      thinkMs: 0,
      rereadMs: 0,
      readySubmitAt: 0,
      error: null,
      scored,
    };
    job.active = j;
    RGL.bus.phase = "COMMENTING";
    RGL.bus.jobPhase = j.phase;
    RGL.automation?.pause?.();

    try {
      // 1) Dwell — already on post; re-read target
      j.phase = "DWELL";
      RGL.bus.jobPhase = j.phase;
      const count =
        kind === "comment"
          ? RGL.automation?.countCommentChars?.(targetEl) || { words: scored.words, chars: scored.words * 5 }
          : RGL.automation?.countPostChars?.(targetEl) || { words: scored.words, chars: scored.words * 5 };
      const dwell = RGL.automation?.estimateReadingMs?.(count, { minSec: 8, maxSec: 45 }) || 12000;
      log("dwell", Math.round(dwell), scored);
      await u.sleep(dwell);

      // 2) Generate
      j.phase = "GENERATING";
      RGL.bus.jobPhase = j.phase;
      RGL.assist?.setPose?.("writing");
      RGL.assist?.startScan?.();

      const style = L.seed ? "soft_mention" : "value_only";
      const genCtx = {
        ...ctx,
        style,
        instruction: kind === "comment" ? "reply naturally to this comment" : "",
      };
      const resp = await RGL.assist?.generateAsync?.(genCtx, L.model);
      RGL.assist?.stopScan?.();

      if (!resp || resp.error) throw new Error(resp?.error || "generate failed");
      const draft = resp.drafts?.[0];
      if (!draft || draft.error || !draft.comment) throw new Error(draft?.error || "empty draft");
      j.draftText = String(draft.comment).trim();
      j.wordCount = u.wordCount(j.draftText);
      if (j.wordCount < 3) throw new Error("draft too short");

      const hash = j.draftText.slice(0, 120);
      if (job.postedHashes.has(hash)) throw new Error("duplicate draft");

      // 3) Think
      j.phase = "THINKING";
      RGL.bus.jobPhase = j.phase;
      RGL.assist?.setPose?.("thinking");
      j.thinkMs = u.estimateThinkMs(j.draftText, L.thinkSec);
      await u.sleep(j.thinkMs);

      // 4) Typing latency — fill mid-way, submit only after full typingMs
      j.phase = "TYPING";
      RGL.bus.jobPhase = j.phase;
      RGL.assist?.setPose?.("writing");
      j.typingMs = u.estimateTypingMs(j.draftText, L.commentWpm);
      log("typing", j.wordCount, "words", Math.round(j.typingMs), "ms");

      const half = j.typingMs * u.rand(0.4, 0.6);
      await u.sleep(half);

      // Open composer: click Reply/Comment control, detect field, fill
      // preferGlobal for post top-level; allowControl opens reply for comments
      const fillOpts = {
        preferGlobal: kind === "post",
        allowControl: true,
        targetKind: kind,
      };
      const filled = await RGL.assist.fillComposerForTarget(j.draftText, targetEl, fillOpts);
      if (!filled) throw new Error("could not detect/fill comment field");

      await u.sleep(j.typingMs - half);

      // 5) Reread
      j.phase = "REREAD";
      RGL.bus.jobPhase = j.phase;
      j.rereadMs = u.logish(1200, 8000, 0.5) * (1 + j.draftText.length / 400);
      await u.sleep(j.rereadMs);

      // 6) Submit
      j.phase = "SUBMIT";
      RGL.bus.jobPhase = j.phase;
      if (!L.autoSubmit) {
        log("autoSubmit off — left filled in composer");
        j.phase = "DONE";
        RGL.bus.jobPhase = j.phase;
        return j;
      }

      const sub = await RGL.assist.submitComposerForTarget(targetEl, {
        preferGlobal: kind === "post",
        targetKind: kind,
      });
      if (!sub.ok) {
        try {
          await navigator.clipboard?.writeText(j.draftText);
        } catch (_) {}
        throw new Error(sub.reason || "submit failed");
      }

      job.lastCommentAt = Date.now();
      job.commentsThisSession += 1;
      job.commentsThisHour += 1;
      job.touchedThreads.add(threadKey());
      job.postedHashes.add(hash);
      if (RGL.bus?.stats) RGL.bus.stats.comments = (RGL.bus.stats.comments || 0) + 1;

      j.phase = "DONE";
      RGL.bus.jobPhase = j.phase;
      RGL.assist?.setPose?.("done");
      log("comment posted", kind, sub.method, j.wordCount, "words");

      // aftercare pause
      await u.sleep(u.rand(3000, 12000));
      return j;
    } catch (e) {
      j.phase = "FAIL";
      j.error = e.message || String(e);
      RGL.bus.jobPhase = j.phase;
      if (RGL.bus?.stats) RGL.bus.stats.commentFails = (RGL.bus.stats.commentFails || 0) + 1;
      log("job fail", j.error);
      RGL.assist?.setPose?.("idle");
      return j;
    } finally {
      RGL.automation?.resume?.();
      if (RGL.bus) RGL.bus.paused = false;
      setTimeout(() => {
        if (job.active === j) job.active = null;
        if (RGL.bus?.phase === "COMMENTING") RGL.bus.phase = "POST";
      }, 500);
    }
  }

  function getJobSnapshot() {
    if (!job.active) return null;
    const j = job.active;
    return {
      phase: j.phase,
      kind: j.kind,
      wordCount: j.wordCount,
      typingMs: j.typingMs,
      thinkMs: j.thinkMs,
      error: j.error,
      eng: j.scored?.eng,
    };
  }

  RGL.autoComment = {
    considerOnPostPage,
    waitIfBusy,
    isBusy,
    budgetOk,
    getJobSnapshot,
    job,
    scoreTarget,
    engagementFromEl,
  };
})();
