// Orchestrator: modes observe | engage | full
// Coordinates automation + auto-comment. Owns main loop.
(() => {
  "use strict";

  const RGL = (window.RGL = window.RGL || {});
  const U = () => RGL.util;
  const log = (...a) => RGL.log?.("orch", ...a);

  let running = false;
  let abort = false;

  function updateOverlay() {
    const s = RGL._settings || {};
    const st = RGL.bus?.stats || RGL.automation?.getStats?.() || {};
    const live = RGL.automation?.liveConfigSnapshot?.() || RGL.bus?.live || {};
    const job = RGL.autoComment?.getJobSnapshot?.();
    const bud = RGL.autoComment?.budgetOk?.() || { ok: true };
    const energy =
      RGL.bus?.energy ?? RGL.automation?.getState?.()?.rhythm?.energy ?? 0.5;

    // merge automation stats into bus
    if (RGL.automation?.getStats && RGL.bus) {
      Object.assign(RGL.bus.stats, RGL.automation.getStats());
    }

    const nextGapSec = bud.waitMs != null ? bud.waitMs / 1000 : live.minGapSec || null;
    const commentsThisHour = RGL.autoComment?.job?.commentsThisHour ?? 0;

    const payload = {
      enabled: !!s.rgl_enabled,
      mode: s.rgl_mode || "observe",
      phase: RGL.bus?.phase || (s.rgl_enabled ? "FEED" : "OFF"),
      energy,
      stats: {
        scrolls: st.scrolls || 0,
        upvotes: st.upvotes || 0,
        comments: st.comments || RGL.bus?.stats?.comments || 0,
        opens: st.opens || 0,
      },
      job: job
        ? {
            phase: job.phase,
            kind: job.kind,
            wordCount: job.wordCount,
            typingMs: job.typingMs,
            thinkMs: job.thinkMs,
            error: job.error,
          }
        : null,
      live: {
        scrollSpeed: live.scrollSpeed,
        commentChance: live.commentChance,
        commentWpm: live.commentWpm,
        minGapSec: live.minGapSec,
      },
      budget: {
        commentsThisHour,
        maxHour: s.rgl_maxCommentsPerHour ?? 4,
        nextGapSec,
      },
      gate: {
        on: bud.ok || bud.reason !== "low eng",
        skip: bud.ok ? null : bud.reason || null,
      },
      health: {
        model: s.rgl_model || "xai/grok-4",
      },
    };

    if (!s.rgl_enabled) {
      RGL.overlay?.render?.({ ...payload, phase: "OFF", enabled: false });
      return;
    }
    RGL.overlay?.render?.(payload);
  }

  async function loadSettings() {
    RGL._settings = await RGL.getSettings();
    return RGL._settings;
  }

  async function runFeedPhase(mode) {
    RGL.bus.phase = "FEED";
    const allowUpvote = mode !== "observe";
    await RGL.automation.tickFeed({ allowUpvote });

    // open post chance
    if (mode !== "observe" && !U().isPostPage()) {
      const opened = await RGL.automation.maybeOpenPost?.();
      if (opened) {
        await U().sleep(U().normal(1500, 400, 900, 3000));
      }
    }
  }

  async function runPostPhase(mode) {
    RGL.bus.phase = "POST";
    const allowUpvote = mode !== "observe";

    // Light read via automation session pieces
    if (RGL.automation?.readPostPageSession && mode !== "full") {
      // engage/observe-on-post: use existing read session (includes back)
      // For full mode we need hooks — custom loop below
    }

    if (mode === "full") {
      // Custom post loop: scroll comments, maybe upvote, maybe auto-comment, then leave
      const auto = RGL.automation;
      auto.resume?.();
      await U().sleep(U().normal(1000, 300, 500, 2000));

      // OP dwell + optional upvote handled inside gestures
      for (let i = 0; i < U().randInt(3, 10); i++) {
        if (abort || !RGL._settings?.rgl_enabled) break;
        if (RGL.bus.paused || RGL.autoComment?.isBusy?.()) {
          await RGL.autoComment.waitIfBusy();
        }
        await auto.humanScrollGesture?.("comments");
        if (allowUpvote) await auto.maybeUpvoteComment?.();
        const vis = (auto.findComments?.() || []).filter((c) => {
          const r = c.getBoundingClientRect();
          return r.height > 40 && r.top < innerHeight && r.bottom > 0;
        });
        if (vis[0]) {
          const cc = auto.countCommentChars?.(vis[Math.floor(vis.length / 2)]) || { words: 20, chars: 100 };
          await U().sleep(auto.estimateReadingMs?.(cc, { minSec: 0.8, maxSec: 25 }) || 1500);
        } else {
          await U().sleep(U().logish(800, 3000, 0.5));
        }

        // After some reading, try auto comment/reply once
        if (i >= 1 && i <= 4) {
          await RGL.autoComment?.considerOnPostPage?.();
          await RGL.autoComment?.waitIfBusy?.();
        }
      }

      // if never tried, one more chance before leave
      if (!RGL.autoComment?.job?.touchedThreads?.has?.(location.pathname.match(/\/comments\/([^/]+)/)?.[1])) {
        await RGL.autoComment?.considerOnPostPage?.();
        await RGL.autoComment?.waitIfBusy?.();
      }

      await U().sleep(U().logish(800, 3000, 0.4));
      if (history.length > 1) history.back();
      else location.href = "/";
      await U().sleep(U().normal(1500, 400, 900, 3000));
    } else {
      // engage: reuse automation post session
      await RGL.automation.readPostPageSession?.();
    }
  }

  async function mainLoop() {
    while (running && !abort) {
      try {
        await loadSettings();
        const s = RGL._settings;
        if (!s.rgl_enabled) {
          running = false;
          break;
        }

        RGL.automation?.applySettings?.(s, { autoStart: false });

        // Manual assist pause
        if (RGL.bus?.paused && !RGL.autoComment?.isBusy?.()) {
          updateOverlay();
          await U().sleep(500);
          // user may leave panel — auto-unpause after idle if not commenting
          continue;
        }

        const mode = s.rgl_mode || "observe";
        if (U().isPostPage()) {
          await runPostPhase(mode);
        } else {
          await runFeedPhase(mode);
        }
        updateOverlay();
        await U().sleep(U().normal(200, 80, 50, 500));
      } catch (e) {
        log("loop error", e);
        await U().sleep(2000);
      }
    }
    RGL.bus.phase = "OFF";
    updateOverlay();
  }

  async function start() {
    if (running) return;
    if (!U().isReddit()) return;
    await loadSettings();
    if (!RGL._settings.rgl_enabled) return;
    if (RGL._settings.rgl_mode === "full" && !RGL._settings.rgl_ackRisk) {
      log("full mode blocked — ack risk first");
      RGL.bus.phase = "ERROR";
      RGL.overlay?.render?.({
        enabled: true,
        mode: "full",
        phase: "ERROR",
        energy: 0.2,
        stats: RGL.bus.stats,
        job: { phase: "FAIL", kind: "comment", error: "Full mode blocked — tick ack risk in popup Safety" },
        live: {},
        budget: {},
        gate: { on: false, skip: "ack risk" },
        status: "Full mode blocked — open popup → Safety → ack risk",
      });
      return;
    }
    running = true;
    abort = false;
    RGL.bus.phase = "FEED";
    RGL.automation?.resume?.();
    // seed automation enabled flag without its own loop
    const st = RGL.automation?.getState?.();
    if (st) {
      st.enabled = true;
      st.running = true;
      st.abort = false;
      st.rhythm.sessionStart = Date.now();
    }
    log("start", RGL._settings.rgl_mode);
    mainLoop();
  }

  function stop() {
    running = false;
    abort = true;
    RGL.automation?.stop?.();
    RGL.bus.phase = "OFF";
    updateOverlay();
    log("stop");
  }

  async function syncFromStorage() {
    await loadSettings();
    const s = RGL._settings;
    if (s.rgl_enabled) start();
    else stop();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
      changes.rgl_enabled ||
      changes.rgl_mode ||
      changes.rgl_ackRisk ||
      changes.enabled
    ) {
      syncFromStorage();
    } else {
      loadSettings().then(() => {
        RGL.automation?.applySettings?.(RGL._settings, { autoStart: false });
      });
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "GET_STATS") {
      sendResponse({
        stats: RGL.bus?.stats || {},
        enabled: !!RGL._settings?.rgl_enabled,
        mode: RGL._settings?.rgl_mode,
        phase: RGL.bus?.phase,
        job: RGL.autoComment?.getJobSnapshot?.(),
        live: RGL.automation?.liveConfigSnapshot?.(),
        energy: RGL.bus?.energy,
        budget: RGL.autoComment?.budgetOk?.(),
        logMeta: RGL.sessionLog?.getMeta?.(),
      });
      return true;
    }
    if (msg?.type === "FORCE_DRIFT") {
      RGL.automation?.rollLiveConfig?.("manual");
      sendResponse({ ok: true, live: RGL.automation?.liveConfigSnapshot?.() });
      return true;
    }
    if (msg?.type === "RGL_STOP") {
      stop();
      chrome.storage.local.set({ rgl_enabled: false });
      RGL.sessionLog?.flush?.();
      RGL.log?.("session stop");
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "RGL_GET_LOG") {
      RGL.sessionLog?.flush?.();
      sendResponse({
        ok: true,
        log: RGL.sessionLog?.exportObject?.() || { meta: {}, events: [] },
      });
      return true;
    }
    if (msg?.type === "RGL_CLEAR_LOG") {
      RGL.sessionLog?.clear?.();
      sendResponse({ ok: true });
      return true;
    }
  });

  // boot
  setTimeout(syncFromStorage, 600);
  setInterval(updateOverlay, 1500);

  // Kill any leftover legacy toast from older builds (same corner as Claude UI)
  try {
    document.getElementById("rss-screentime-overlay")?.remove();
  } catch (_) {}

  RGL.orchestrator = { start, stop, updateOverlay };
  log("orchestrator ready");
})();
