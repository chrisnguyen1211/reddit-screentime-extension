// Reddit Growth Lab — service worker
// Routes badge + stats; LLM logic lives in background-llm.js (importScripts).

importScripts("background-llm.js");
importScripts("background-shadowban.js");

function updateBadge(enabled, mode) {
  if (!enabled) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const text = mode === "full" ? "FULL" : mode === "engage" ? "ENG" : "OBS";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({
    color: mode === "full" ? "#b91c1c" : mode === "engage" ? "#ff4500" : "#666666",
  });
}

chrome.storage.local.get(
  { rgl_enabled: false, rgl_mode: "observe", enabled: false },
  (s) => {
    // legacy fallback
    const en = s.rgl_enabled || s.enabled;
    updateBadge(!!en, s.rgl_mode || "observe");
  }
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.rgl_enabled || changes.rgl_mode || changes.enabled) {
    chrome.storage.local.get(
      { rgl_enabled: false, rgl_mode: "observe", enabled: false },
      (s) => updateBadge(!!(s.rgl_enabled || s.enabled), s.rgl_mode || "observe")
    );
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (cur) => {
    // migrate legacy screentime keys once
    const patch = {};
    if (cur.rgl_enabled === undefined && cur.enabled !== undefined) patch.rgl_enabled = cur.enabled;
    if (cur.rgl_scrollSpeed === undefined && cur.scrollSpeed !== undefined)
      patch.rgl_scrollSpeed = cur.scrollSpeed;
    if (cur.rgl_upvoteChance === undefined && cur.upvoteChance !== undefined)
      patch.rgl_upvoteChance = cur.upvoteChance;
    if (cur.rgl_openPostChance === undefined && cur.openPostChance !== undefined)
      patch.rgl_openPostChance = cur.openPostChance;
    if (cur.rgl_mode === undefined) patch.rgl_mode = "observe";
    if (Object.keys(patch).length) chrome.storage.local.set(patch);
    updateBadge(!!(cur.rgl_enabled || cur.enabled || patch.rgl_enabled), cur.rgl_mode || "observe");
  });
});

// HEALTH + passthrough — generate handled in background-llm.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "HEALTH") {
    (async () => {
      try {
        const cfg = await (typeof getConfig === "function"
          ? getConfig()
          : chrome.storage.local.get(["rgl_endpoint", "endpoint"]));
        const base = (cfg.endpoint || cfg.rgl_endpoint || "http://localhost:20128/v1").replace(
          /\/$/,
          ""
        );
        const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
        const r = await fetch(url, {
          headers: cfg.apiKey || cfg.rgl_apiKey ? { Authorization: `Bearer ${cfg.apiKey || cfg.rgl_apiKey}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        sendResponse({ ok: r.ok, status: r.status });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});
