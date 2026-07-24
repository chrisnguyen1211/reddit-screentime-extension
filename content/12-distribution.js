// Comment distribution: allowlist, daily quotas, quiet hours, URL queue, sub lock.
(() => {
  "use strict";

  const RGL = (window.RGL = window.RGL || {});
  const QUEUE_KEY = "rgl_postQueue";
  const DAY_KEY = "rgl_distDayStats"; // { day: 'YYYY-MM-DD', bySub: {sub:n}, total:n, hashes:[] }
  const HASH_KEY = "rgl_draftHashes"; // global draft hashes to avoid repeat text

  let queue = []; // { id, url, sub?, note?, status: pending|done|skip|fail, addedAt, doneAt? }
  let dayStats = { day: "", bySub: {}, total: 0 };
  let draftHashes = [];
  let ready = false;

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function settings() {
    return RGL._settings || RGL.DEFAULTS || {};
  }

  function parseList(str) {
    return String(str || "")
      .split(/[\s,]+/)
      .map((s) => s.replace(/^r\//i, "").trim().toLowerCase())
      .filter(Boolean);
  }

  function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get([QUEUE_KEY, DAY_KEY, HASH_KEY], (s) => {
        queue = Array.isArray(s[QUEUE_KEY]) ? s[QUEUE_KEY] : [];
        dayStats = s[DAY_KEY] && typeof s[DAY_KEY] === "object" ? s[DAY_KEY] : { day: todayKey(), bySub: {}, total: 0 };
        if (dayStats.day !== todayKey()) {
          dayStats = { day: todayKey(), bySub: {}, total: 0 };
        }
        draftHashes = Array.isArray(s[HASH_KEY]) ? s[HASH_KEY] : [];
        ready = true;
        resolve();
      });
    });
  }

  function persistQueue() {
    chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-200) });
  }
  function persistDay() {
    chrome.storage.local.set({ [DAY_KEY]: dayStats });
  }
  function persistHashes() {
    chrome.storage.local.set({ [HASH_KEY]: draftHashes.slice(-500) });
  }

  function currentSub() {
    try {
      const m = location.pathname.match(/\/r\/([^/]+)/i);
      return m ? m[1].toLowerCase() : "";
    } catch (_) {
      return "";
    }
  }

  function normalizePostUrl(url) {
    try {
      const u = new URL(url, "https://www.reddit.com");
      if (!u.hostname.includes("reddit.com")) return null;
      // keep /r/x/comments/id/slug
      const m = u.pathname.match(/\/r\/[^/]+\/comments\/([a-z0-9]+)/i);
      if (!m) return null;
      return {
        url: `https://www.reddit.com${u.pathname.replace(/\/$/, "")}/`,
        id: m[1].toLowerCase(),
        sub: (u.pathname.match(/\/r\/([^/]+)/i) || [])[1]?.toLowerCase() || "",
      };
    } catch (_) {
      return null;
    }
  }

  function addToQueue(urls, note = "") {
    const lines = Array.isArray(urls) ? urls : String(urls).split(/\n+/);
    let added = 0;
    for (const line of lines) {
      const raw = line.trim();
      if (!raw || raw.startsWith("#")) continue;
      const n = normalizePostUrl(raw);
      if (!n) continue;
      if (queue.some((q) => q.id === n.id && q.status === "pending")) continue;
      queue.push({
        id: n.id,
        url: n.url,
        sub: n.sub,
        note: note || "",
        status: "pending",
        addedAt: Date.now(),
      });
      added += 1;
    }
    persistQueue();
    RGL.log?.("dist queue +", added, "pending", queue.filter((q) => q.status === "pending").length);
    return added;
  }

  function listQueue() {
    return queue.slice();
  }

  function clearQueue(statusFilter) {
    if (statusFilter) queue = queue.filter((q) => q.status !== statusFilter);
    else queue = [];
    persistQueue();
  }

  /** Export full queue (all statuses) for backup / other device */
  function exportQueue() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      queue: queue.slice(),
      dayStats: { ...dayStats, bySub: { ...dayStats.bySub } },
    };
  }

  /** Merge import: restore pending from dump; skip duplicate ids */
  function importQueue(payload) {
    let items = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload && Array.isArray(payload.queue)) items = payload.queue;
    else if (payload && Array.isArray(payload.urls)) {
      return addToQueue(payload.urls, payload.note || "import");
    }
    let added = 0;
    for (const raw of items) {
      if (!raw) continue;
      if (typeof raw === "string") {
        added += addToQueue(raw, "import");
        continue;
      }
      const n = normalizePostUrl(raw.url || raw.href || "");
      if (!n) continue;
      if (queue.some((q) => q.id === n.id)) continue;
      queue.push({
        id: n.id,
        url: n.url,
        sub: raw.sub || n.sub,
        note: raw.note || "import",
        status: raw.status === "pending" ? "pending" : "pending",
        addedAt: raw.addedAt || Date.now(),
      });
      added += 1;
    }
    persistQueue();
    return added;
  }

  function markQueue(id, status) {
    const q = queue.find((x) => x.id === id);
    if (q) {
      q.status = status;
      q.doneAt = Date.now();
      persistQueue();
    }
  }

  function nextQueueItem() {
    return queue.find((q) => q.status === "pending") || null;
  }

  function isQuietHours() {
    const s = settings();
    if (s.rgl_distEnabled === false) return false;
    let start = Number(s.rgl_quietHoursStart);
    let end = Number(s.rgl_quietHoursEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    start = ((start % 24) + 24) % 24;
    end = ((end % 24) + 24) % 24;
    if (start === end) return false; // disabled
    const h = new Date().getHours();
    if (start < end) return h >= start && h < end;
    // wraps midnight e.g. 22–7
    return h >= start || h < end;
  }

  function subAllowed(sub) {
    const s = settings();
    if (s.rgl_distEnabled === false) return { ok: true };
    const name = String(sub || currentSub() || "").toLowerCase().replace(/^r\//, "");
    if (!name) return { ok: true, reason: "no-sub" };

    const block = parseList(s.rgl_subBlocklist);
    if (block.includes(name)) return { ok: false, reason: `blocked sub r/${name}` };

    const allow = parseList(s.rgl_subAllowlist);
    if (allow.length && !allow.includes(name)) {
      return { ok: false, reason: `not in allowlist (r/${name})` };
    }
    return { ok: true };
  }

  function dayQuotaOk(sub) {
    const s = settings();
    if (s.rgl_distEnabled === false) return { ok: true };
    if (dayStats.day !== todayKey()) {
      dayStats = { day: todayKey(), bySub: {}, total: 0 };
    }
    const maxDay = Number(s.rgl_maxCommentsPerDay) || 8;
    const maxSub = Number(s.rgl_maxCommentsPerSubDay) || 2;
    const name = String(sub || currentSub() || "").toLowerCase().replace(/^r\//, "");

    if (dayStats.total >= maxDay) {
      return { ok: false, reason: `daily cap ${dayStats.total}/${maxDay}` };
    }
    if (name) {
      const n = dayStats.bySub[name] || 0;
      if (n >= maxSub) {
        return { ok: false, reason: `sub cap r/${name} ${n}/${maxSub}` };
      }
    }
    return { ok: true, remainingDay: maxDay - dayStats.total, remainingSub: name ? maxSub - (dayStats.bySub[name] || 0) : null };
  }

  function recordComment(sub, draftHash) {
    if (dayStats.day !== todayKey()) {
      dayStats = { day: todayKey(), bySub: {}, total: 0 };
    }
    const name = String(sub || currentSub() || "").toLowerCase().replace(/^r\//, "");
    dayStats.total += 1;
    if (name) dayStats.bySub[name] = (dayStats.bySub[name] || 0) + 1;
    persistDay();
    if (draftHash) {
      draftHashes.push(draftHash);
      if (draftHashes.length > 500) draftHashes = draftHashes.slice(-500);
      persistHashes();
    }
  }

  function draftSeen(hash) {
    return !!(hash && draftHashes.includes(hash));
  }

  function sessionTimeOk() {
    const s = settings();
    const maxMin = Number(s.rgl_sessionMaxMinutes) || 0;
    if (!maxMin || maxMin <= 0) return { ok: true };
    const start = RGL.bus?.sessionStartedAt || Date.now();
    const elapsed = (Date.now() - start) / 60000;
    if (elapsed >= maxMin) {
      return { ok: false, reason: `session max ${Math.round(elapsed)}/${maxMin} min` };
    }
    return { ok: true, elapsedMin: elapsed, maxMin };
  }

  /**
   * Gate before auto-comment on current page.
   */
  function allowCommentOnPage(opts = {}) {
    const s = settings();
    if (s.rgl_distEnabled === false) return { ok: true, reason: "dist off" };

    if (isQuietHours()) {
      return { ok: false, reason: "quiet hours" };
    }

    const sess = sessionTimeOk();
    if (!sess.ok) return sess;

    const sub = opts.sub || currentSub();
    const sa = subAllowed(sub);
    if (!sa.ok) return sa;

    const dq = dayQuotaOk(sub);
    if (!dq.ok) return dq;

    if (s.rgl_queueOnly) {
      const pathId = (location.pathname.match(/\/comments\/([a-z0-9]+)/i) || [])[1]?.toLowerCase();
      const hit = pathId && queue.some((q) => q.id === pathId && (q.status === "pending" || q.status === "done"));
      // allow if this page is in queue (pending or already opened from queue)
      const pending = nextQueueItem();
      if (!hit && pending && pathId !== pending.id) {
        return { ok: false, reason: "queue-only: not this post" };
      }
      if (!hit && !pending) {
        return { ok: false, reason: "queue-only: queue empty" };
      }
    }

    if (opts.draftHash && draftSeen(opts.draftHash)) {
      return { ok: false, reason: "duplicate draft hash" };
    }

    return { ok: true, sub, dayStats: { ...dayStats, bySub: { ...dayStats.bySub } } };
  }

  /**
   * Feed navigation: prefer queue URL, else stay in sub / allow open post.
   * Returns { action: 'none'|'navigate'|'open-local', url? }
   */
  function nextFeedAction() {
    const s = settings();
    if (s.rgl_distEnabled === false) return { action: "organic" };

    if (isQuietHours()) return { action: "wait", reason: "quiet hours" };

    const sess = sessionTimeOk();
    if (!sess.ok) return { action: "stop", reason: sess.reason };

    // Prefer pending queue
    const item = nextQueueItem();
    if (item) {
      const sa = subAllowed(item.sub);
      if (!sa.ok) {
        markQueue(item.id, "skip");
        return nextFeedAction();
      }
      const dq = dayQuotaOk(item.sub);
      if (!dq.ok) {
        return { action: "wait", reason: dq.reason };
      }
      // already on this post?
      if (location.href.includes(`/comments/${item.id}`)) {
        return { action: "on-queue-post", item };
      }
      return { action: "navigate", url: item.url, item };
    }

    if (s.rgl_queueOnly) {
      return { action: "wait", reason: "queue empty" };
    }

    // Organic: only within allowlist if set
    const sub = currentSub();
    const sa = subAllowed(sub);
    if (!sa.ok && sub) {
      // navigate to first allowlist sub feed
      const allow = parseList(s.rgl_subAllowlist);
      if (allow[0]) {
        return { action: "navigate", url: `https://www.reddit.com/r/${allow[0]}/new/` };
      }
      return { action: "wait", reason: sa.reason };
    }

    return { action: "organic", stayInSub: !!s.rgl_stayInSub };
  }

  function snapshot() {
    if (dayStats.day !== todayKey()) {
      dayStats = { day: todayKey(), bySub: {}, total: 0 };
    }
    const s = settings();
    return {
      enabled: s.rgl_distEnabled !== false,
      quiet: isQuietHours(),
      quietRange: [s.rgl_quietHoursStart, s.rgl_quietHoursEnd],
      stayInSub: !!s.rgl_stayInSub,
      queueOnly: !!s.rgl_queueOnly,
      allowlist: parseList(s.rgl_subAllowlist),
      blocklist: parseList(s.rgl_subBlocklist),
      day: { ...dayStats, bySub: { ...dayStats.bySub } },
      maxDay: Number(s.rgl_maxCommentsPerDay) || 8,
      maxSubDay: Number(s.rgl_maxCommentsPerSubDay) || 2,
      queuePending: queue.filter((q) => q.status === "pending").length,
      queueDone: queue.filter((q) => q.status === "done").length,
      queue: queue.slice(-50),
      session: sessionTimeOk(),
      humanSubmitOnly: !!s.rgl_humanSubmitOnly,
      stealthUi: !!s.rgl_stealthUi,
    };
  }

  function applyStealth() {
    const s = settings();
    const stealth = !!s.rgl_stealthUi;
    try {
      document.documentElement.classList.toggle("rgl-stealth", stealth);
      if (stealth) {
        document.querySelectorAll(".rch-mascot, .rch-bubble, #rgl-overlay-root").forEach((el) => {
          el.style.setProperty("opacity", "0.15");
        });
      } else {
        document.querySelectorAll(".rch-mascot, .rch-bubble, #rgl-overlay-root").forEach((el) => {
          el.style.removeProperty("opacity");
        });
      }
    } catch (_) {}
  }

  load().then(() => {
    RGL.log?.("distribution ready", snapshot());
  });

  RGL.dist = {
    load,
    addToQueue,
    listQueue,
    clearQueue,
    exportQueue,
    importQueue,
    markQueue,
    nextQueueItem,
    isQuietHours,
    subAllowed,
    dayQuotaOk,
    recordComment,
    draftSeen,
    sessionTimeOk,
    allowCommentOnPage,
    nextFeedAction,
    snapshot,
    normalizePostUrl,
    applyStealth,
    currentSub,
  };
})();
