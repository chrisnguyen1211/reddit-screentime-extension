const $ = (id) => document.getElementById(id);

const KEYS = [
  "rgl_enabled",
  "rgl_mode",
  "rgl_ackRisk",
  "rgl_scrollSpeed",
  "rgl_upvoteChance",
  "rgl_openPostChance",
  "rgl_commentUpvoteChance",
  "rgl_pauseMin",
  "rgl_pauseMax",
  "rgl_dynamicConfig",
  "rgl_driftPercent",
  "rgl_endpoint",
  "rgl_apiKey",
  "rgl_model",
  "rgl_productContext",
  "rgl_seedMode",
  "rgl_commentChanceBase",
  "rgl_commentWpmBase",
  "rgl_minSecondsBetweenComments",
  "rgl_maxCommentsPerHour",
  "rgl_maxCommentsPerSession",
  "rgl_minEngagementScore",
  "rgl_preferQuestions",
  "rgl_autoSubmit",
  "rgl_autoCommentEnabled",
  "rgl_distEnabled",
  "rgl_subAllowlist",
  "rgl_subBlocklist",
  "rgl_maxCommentsPerSubDay",
  "rgl_maxCommentsPerDay",
  "rgl_quietHoursStart",
  "rgl_quietHoursEnd",
  "rgl_stayInSub",
  "rgl_queueOnly",
  "rgl_preferPromoInvite",
  "rgl_sessionMaxMinutes",
  "rgl_humanSubmitOnly",
  "rgl_stealthUi",
];

const DEFAULTS = {
  rgl_enabled: false,
  rgl_mode: "observe",
  rgl_ackRisk: false,
  rgl_scrollSpeed: 1.2,
  rgl_upvoteChance: 8,
  rgl_openPostChance: 12,
  rgl_commentUpvoteChance: 18,
  rgl_pauseMin: 1.2,
  rgl_pauseMax: 9,
  rgl_dynamicConfig: true,
  rgl_driftPercent: 35,
  rgl_endpoint: "http://localhost:20128/v1",
  rgl_apiKey: "",
  rgl_model: "xai/grok-4",
  rgl_productContext: "",
  rgl_seedMode: false,
  rgl_commentChanceBase: 12,
  rgl_commentWpmBase: 38,
  rgl_minSecondsBetweenComments: 240,
  rgl_maxCommentsPerHour: 4,
  rgl_maxCommentsPerSession: 8,
  rgl_minEngagementScore: 0.35,
  rgl_preferQuestions: true,
  rgl_autoSubmit: true,
  rgl_autoCommentEnabled: true,
  rgl_distEnabled: true,
  rgl_subAllowlist: "",
  rgl_subBlocklist: "announcements,reddit.com",
  rgl_maxCommentsPerSubDay: 2,
  rgl_maxCommentsPerDay: 8,
  rgl_quietHoursStart: 1,
  rgl_quietHoursEnd: 7,
  rgl_stayInSub: true,
  rgl_queueOnly: false,
  rgl_preferPromoInvite: true,
  rgl_sessionMaxMinutes: 90,
  rgl_humanSubmitOnly: false,
  rgl_stealthUi: false,
};

function refreshLabels() {
  $("scrollSpeedVal").textContent = `${Number($("rgl_scrollSpeed").value).toFixed(1)}×`;
  $("upvoteChanceVal").textContent = `${$("rgl_upvoteChance").value}%`;
  $("openPostChanceVal").textContent = `${$("rgl_openPostChance").value}%`;
  $("commentUpvoteChanceVal").textContent = `${$("rgl_commentUpvoteChance").value}%`;
  $("driftPercentVal").textContent = `${$("rgl_driftPercent").value}%`;
  $("commentChanceVal").textContent = `${$("rgl_commentChanceBase").value}%`;
  $("commentWpmVal").textContent = String($("rgl_commentWpmBase").value);
}

function setStatus(enabled) {
  $("statusText").textContent = enabled ? "Đang bật" : "Đang tắt";
  document.body.classList.toggle("on", !!enabled);
}

function readForm() {
  const data = { ...DEFAULTS };
  data.rgl_enabled = $("rgl_enabled").checked;
  data.rgl_mode = $("rgl_mode").value;
  data.rgl_ackRisk = $("rgl_ackRisk").checked;
  data.rgl_scrollSpeed = Number($("rgl_scrollSpeed").value);
  data.rgl_upvoteChance = Number($("rgl_upvoteChance").value);
  data.rgl_openPostChance = Number($("rgl_openPostChance").value);
  data.rgl_commentUpvoteChance = Number($("rgl_commentUpvoteChance").value);
  data.rgl_pauseMin = Number($("rgl_pauseMin").value);
  data.rgl_pauseMax = Number($("rgl_pauseMax").value);
  data.rgl_dynamicConfig = $("rgl_dynamicConfig").checked;
  data.rgl_driftPercent = Number($("rgl_driftPercent").value);
  data.rgl_endpoint = $("rgl_endpoint").value.trim();
  data.rgl_apiKey = $("rgl_apiKey").value;
  data.rgl_model = $("rgl_model").value;
  data.rgl_productContext = $("rgl_productContext").value;
  data.rgl_seedMode = $("rgl_seedMode").checked;
  data.rgl_commentChanceBase = Number($("rgl_commentChanceBase").value);
  data.rgl_commentWpmBase = Number($("rgl_commentWpmBase").value);
  data.rgl_minSecondsBetweenComments = Number($("rgl_minSecondsBetweenComments").value);
  data.rgl_maxCommentsPerHour = Number($("rgl_maxCommentsPerHour").value);
  data.rgl_maxCommentsPerSession = Number($("rgl_maxCommentsPerSession").value);
  data.rgl_minEngagementScore = Number($("rgl_minEngagementScore").value);
  data.rgl_preferQuestions = $("rgl_preferQuestions").checked;
  data.rgl_autoSubmit = $("rgl_autoSubmit").checked;
  data.rgl_autoCommentEnabled = true;
  data.rgl_distEnabled = $("rgl_distEnabled")?.checked !== false;
  data.rgl_subAllowlist = $("rgl_subAllowlist")?.value || "";
  data.rgl_subBlocklist = $("rgl_subBlocklist")?.value || "";
  data.rgl_maxCommentsPerSubDay = Number($("rgl_maxCommentsPerSubDay")?.value ?? 2);
  data.rgl_maxCommentsPerDay = Number($("rgl_maxCommentsPerDay")?.value ?? 8);
  data.rgl_quietHoursStart = Number($("rgl_quietHoursStart")?.value ?? 1);
  data.rgl_quietHoursEnd = Number($("rgl_quietHoursEnd")?.value ?? 7);
  data.rgl_stayInSub = !!$("rgl_stayInSub")?.checked;
  data.rgl_queueOnly = !!$("rgl_queueOnly")?.checked;
  data.rgl_preferPromoInvite = $("rgl_preferPromoInvite")?.checked !== false;
  data.rgl_sessionMaxMinutes = Number($("rgl_sessionMaxMinutes")?.value ?? 90);
  data.rgl_humanSubmitOnly = !!$("rgl_humanSubmitOnly")?.checked;
  data.rgl_stealthUi = !!$("rgl_stealthUi")?.checked;
  return data;
}

function fillForm(s) {
  $("rgl_enabled").checked = !!s.rgl_enabled;
  $("rgl_mode").value = s.rgl_mode || "observe";
  $("rgl_ackRisk").checked = !!s.rgl_ackRisk;
  $("rgl_scrollSpeed").value = s.rgl_scrollSpeed ?? 1.2;
  $("rgl_upvoteChance").value = s.rgl_upvoteChance ?? 8;
  $("rgl_openPostChance").value = s.rgl_openPostChance ?? 12;
  $("rgl_commentUpvoteChance").value = s.rgl_commentUpvoteChance ?? 18;
  $("rgl_pauseMin").value = s.rgl_pauseMin ?? 1.2;
  $("rgl_pauseMax").value = s.rgl_pauseMax ?? 9;
  $("rgl_dynamicConfig").checked = s.rgl_dynamicConfig !== false;
  $("rgl_driftPercent").value = s.rgl_driftPercent ?? 35;
  $("rgl_endpoint").value = s.rgl_endpoint || DEFAULTS.rgl_endpoint;
  $("rgl_apiKey").value = s.rgl_apiKey || "";
  $("rgl_model").value = s.rgl_model || "xai/grok-4";
  $("rgl_productContext").value = s.rgl_productContext || "";
  $("rgl_seedMode").checked = !!s.rgl_seedMode;
  $("rgl_commentChanceBase").value = s.rgl_commentChanceBase ?? 12;
  $("rgl_commentWpmBase").value = s.rgl_commentWpmBase ?? 38;
  $("rgl_minSecondsBetweenComments").value = s.rgl_minSecondsBetweenComments ?? 240;
  $("rgl_maxCommentsPerHour").value = s.rgl_maxCommentsPerHour ?? 4;
  $("rgl_maxCommentsPerSession").value = s.rgl_maxCommentsPerSession ?? 8;
  $("rgl_minEngagementScore").value = s.rgl_minEngagementScore ?? 0.35;
  $("rgl_preferQuestions").checked = s.rgl_preferQuestions !== false;
  $("rgl_autoSubmit").checked = s.rgl_autoSubmit !== false;
  if ($("rgl_distEnabled")) $("rgl_distEnabled").checked = s.rgl_distEnabled !== false;
  if ($("rgl_subAllowlist")) $("rgl_subAllowlist").value = s.rgl_subAllowlist || "";
  if ($("rgl_subBlocklist")) $("rgl_subBlocklist").value = s.rgl_subBlocklist || "announcements,reddit.com";
  if ($("rgl_maxCommentsPerSubDay")) $("rgl_maxCommentsPerSubDay").value = s.rgl_maxCommentsPerSubDay ?? 2;
  if ($("rgl_maxCommentsPerDay")) $("rgl_maxCommentsPerDay").value = s.rgl_maxCommentsPerDay ?? 8;
  if ($("rgl_quietHoursStart")) $("rgl_quietHoursStart").value = s.rgl_quietHoursStart ?? 1;
  if ($("rgl_quietHoursEnd")) $("rgl_quietHoursEnd").value = s.rgl_quietHoursEnd ?? 7;
  if ($("rgl_sessionMaxMinutes")) $("rgl_sessionMaxMinutes").value = s.rgl_sessionMaxMinutes ?? 90;
  if ($("rgl_stayInSub")) $("rgl_stayInSub").checked = s.rgl_stayInSub !== false;
  if ($("rgl_queueOnly")) $("rgl_queueOnly").checked = !!s.rgl_queueOnly;
  if ($("rgl_preferPromoInvite")) $("rgl_preferPromoInvite").checked = s.rgl_preferPromoInvite !== false;
  if ($("rgl_humanSubmitOnly")) $("rgl_humanSubmitOnly").checked = !!s.rgl_humanSubmitOnly;
  if ($("rgl_stealthUi")) $("rgl_stealthUi").checked = !!s.rgl_stealthUi;
  refreshLabels();
  setStatus(s.rgl_enabled);
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((x) => {
    x.classList.toggle("on", x.dataset.tab === name);
    x.classList.toggle("tab-alert", name === "safe" && x.dataset.tab === "safe");
  });
  document.querySelectorAll(".panel").forEach((x) => x.classList.remove("on"));
  const panel = $(`panel-${name}`);
  if (panel) panel.classList.add("on");
}

/** Full mode without risk ack → force Safety tab + highlight checkbox */
function gateFullRisk({ from } = {}) {
  const mode = $("rgl_mode").value;
  const ack = $("rgl_ackRisk").checked;
  if (mode !== "full" || ack) {
    clearRiskGateUI();
    return false;
  }
  switchTab("safe");
  const banner = $("riskGateBanner");
  if (banner) banner.hidden = false;
  const row = $("ackRiskRow");
  if (row) {
    row.classList.remove("pulse-risk");
    // reflow to restart animation
    void row.offsetWidth;
    row.classList.add("pulse-risk");
  }
  $("pageHint").textContent =
    from === "enable"
      ? "Full: tick Risk trước khi bật ON"
      : "Full: tick Risk ở tab Safety trước";
  try {
    $("rgl_ackRisk").focus();
  } catch (_) {}
  return true;
}

function clearRiskGateUI() {
  const banner = $("riskGateBanner");
  if (banner) banner.hidden = true;
  $("ackRiskRow")?.classList.remove("pulse-risk");
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("tab-alert"));
}

function save(partial = {}) {
  const data = { ...readForm(), ...partial };

  // Selecting Full / enabling without ack → jump Safety first; don't leave in ERROR silently
  if (data.rgl_mode === "full" && !data.rgl_ackRisk) {
    const gated = gateFullRisk({
      from: partial.rgl_enabled || data.rgl_enabled ? "enable" : "mode",
    });
    // If user tried to enable ON without ack, force OFF until they acknowledge
    if (data.rgl_enabled) {
      data.rgl_enabled = false;
      $("rgl_enabled").checked = false;
    }
    // Still save mode=full so after tick it remembers Full
    chrome.storage.local.set(data, () => {
      setStatus(false);
      $("pageHint").textContent = "Đã chuyển Safety — tick risk rồi Lưu / bật ON";
    });
    return;
  }

  clearRiskGateUI();
  chrome.storage.local.set(data, () => {
    setStatus(data.rgl_enabled);
    const btn = $("save");
    const prev = btn.textContent;
    btn.textContent = "Đã lưu & apply ✓";
    setTimeout(() => (btn.textContent = prev), 1400);
  });
}

function pollStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url?.includes("reddit.com")) {
      $("liveCfg").textContent = "Live: mở tab reddit.com";
      $("pageHint").textContent = "Mở reddit.com";
      return;
    }
    $("pageHint").textContent = "Tab Reddit OK";
    chrome.tabs.sendMessage(tab.id, { type: "GET_STATS" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        $("liveCfg").textContent = "Live: F5 tab Reddit sau reload extension";
        return;
      }
      $("statScrolls").textContent = String(res.stats?.scrolls ?? 0);
      $("statUpvotes").textContent = String(res.stats?.upvotes ?? 0);
      $("statComments").textContent = String(res.stats?.comments ?? 0);
      $("statPhase").textContent = String(res.phase || res.job?.phase || "—");
      const live = res.live || {};
      const job = res.job;
      $("liveCfg").textContent =
        `mode ${res.mode} · phase ${res.phase}\n` +
        `spd ${Number(live.scrollSpeed || 0).toFixed?.(2) || "—"} · cmt% ${Math.round(
          live.commentChance || 0
        )} · typeWpm ${Math.round(live.commentWpm || 0)}\n` +
        (job
          ? `job ${job.phase} ${job.kind || ""} ${job.wordCount || ""}w ${
              job.typingMs ? `~${Math.round(job.typingMs / 1000)}s type` : ""
            }`
          : "job —");
      const lm = res.logMeta;
      if (lm && $("logMeta")) {
        $("logMeta").textContent = `Log: ${lm.entries || 0} events · ${String(lm.sessionId || "").slice(0, 14)}…`;
      }
    });
  });
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function withActiveRedditTab(fn) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url?.includes("reddit.com")) {
      if ($("logMeta")) $("logMeta").textContent = "Log: mở tab reddit.com trước";
      return;
    }
    fn(tab.id);
  });
}

// tabs
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});

$("rgl_enabled").addEventListener("change", () => {
  // Bật ON + Full + chưa ack → nhảy Safety, không bật
  if ($("rgl_enabled").checked && $("rgl_mode").value === "full" && !$("rgl_ackRisk").checked) {
    $("rgl_enabled").checked = false;
    gateFullRisk({ from: "enable" });
    save({ rgl_enabled: false, rgl_mode: "full" });
    return;
  }
  save({ rgl_enabled: $("rgl_enabled").checked });
});

$("rgl_mode").addEventListener("change", () => {
  if ($("rgl_mode").value === "full" && !$("rgl_ackRisk").checked) {
    // Chọn Full → nhảy Safety ngay; giữ mode=full trong storage nhưng force OFF
    gateFullRisk({ from: "mode" });
    $("rgl_enabled").checked = false;
    save({ rgl_mode: "full", rgl_enabled: false });
    return;
  }
  clearRiskGateUI();
  save({ rgl_mode: $("rgl_mode").value });
});

$("rgl_ackRisk").addEventListener("change", () => {
  if ($("rgl_ackRisk").checked) {
    clearRiskGateUI();
    // Sau khi tick: lưu ack; nếu mode đang Full → đưa về tab Run để bật ON
    save({ rgl_ackRisk: true });
    if ($("rgl_mode").value === "full") {
      switchTab("run");
      $("pageHint").textContent = "Risk OK — bật ON để chạy Full";
    }
  } else {
    save({ rgl_ackRisk: false });
    // Bỏ tick khi đang Full → tắt ON + nhắc lại
    if ($("rgl_mode").value === "full") {
      $("rgl_enabled").checked = false;
      save({ rgl_ackRisk: false, rgl_enabled: false });
    }
  }
});

$("btnStop").addEventListener("click", () => {
  $("rgl_enabled").checked = false;
  save({ rgl_enabled: false });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: "RGL_STOP" });
  });
});
$("save").addEventListener("click", () => {
  if ($("rgl_mode").value === "full" && !$("rgl_ackRisk").checked) {
    gateFullRisk({ from: "mode" });
    return;
  }
  save();
});

function refreshBanGuard() {
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_BAN_GUARD" }, (res) => {
      const box = $("banGuardBox");
      if (!box) return;
      if (chrome.runtime.lastError || !res?.ok) {
        box.textContent = "Ban-guard: F5 tab Reddit / reload extension";
        return;
      }
      const m = res.metrics || {};
      const ratio =
        m.ratioValuePerPromo == null || m.ratioValuePerPromo === Infinity
          ? "∞"
          : Number(m.ratioValuePerPromo).toFixed(1);
      const flags = (m.flags || []).map((f) => f.msg).join(" · ") || "no flags";
      box.textContent =
        `Risk ${m.band || "?"} ${m.risk ?? "—"}/100\n` +
        `value:promo ~${ratio}:1 (target ≥9:1) · promoActs ${m.promoActs ?? 0} · valueActs ${m.valueActs ?? 0}\n` +
        `cmt 1h/24h: ${m.comments1h ?? 0}/${m.comments24h ?? 0} · subs1h: ${(m.subs1h || []).length}\n` +
        `blockSeed=${!!m.blockSeed} blockCmt=${!!m.blockComment}\n` +
        flags;
    });
  });
}

function refreshDist() {
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_DIST", op: "status" }, (res) => {
      const box = $("distBox");
      if (!box) return;
      if (chrome.runtime.lastError || !res?.ok) {
        box.textContent = "Dist: F5 tab Reddit / reload extension";
        return;
      }
      const s = res.snapshot || {};
      const day = s.day || {};
      box.textContent =
        `pending ${s.queuePending ?? 0} · done ${s.queueDone ?? 0}\n` +
        `today ${day.total ?? 0}/${s.maxDay ?? "?"} · quiet=${!!s.quiet} (${(s.quietRange || []).join("–")})\n` +
        `stayInSub=${!!s.stayInSub} queueOnly=${!!s.queueOnly} humanSubmit=${!!s.humanSubmitOnly}\n` +
        `allow: ${(s.allowlist || []).slice(0, 6).join(", ") || "(all)"}\n` +
        `bySub: ${JSON.stringify(day.bySub || {})}`;
    });
  });
}

$("btnQueueAdd")?.addEventListener("click", () => {
  const urls = $("queueUrls")?.value || "";
  if (!urls.trim()) return;
  save(); // persist dist settings first
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_DIST", op: "add", urls }, (res) => {
      if ($("distBox")) {
        $("distBox").textContent = res?.ok
          ? `Added ${res.added} · pending ${res.snapshot?.queuePending}`
          : `Add fail: ${res?.error || chrome.runtime.lastError?.message}`;
      }
      if (res?.ok && $("queueUrls")) $("queueUrls").value = "";
      refreshDist();
    });
  });
});
$("btnQueueRefresh")?.addEventListener("click", refreshDist);
$("btnQueueClearDone")?.addEventListener("click", () => {
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_DIST", op: "clearDone" }, () => refreshDist());
  });
});
$("btnQueueClearAll")?.addEventListener("click", () => {
  if (!confirm("Xóa toàn bộ queue?")) return;
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_DIST", op: "clear" }, () => refreshDist());
  });
});
$("btnQueueExport")?.addEventListener("click", () => {
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_DIST", op: "status" }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        // fallback: storage
        chrome.storage.local.get(["rgl_postQueue", "rgl_distDayStats"], (s) => {
          downloadJson(
            {
              version: 1,
              exportedAt: new Date().toISOString(),
              queue: s.rgl_postQueue || [],
              dayStats: s.rgl_distDayStats || null,
            },
            `rgl-queue-${Date.now()}.json`
          );
          if ($("distBox")) $("distBox").textContent = "Exported from storage";
        });
        return;
      }
      const snap = res.snapshot || {};
      downloadJson(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          queue: snap.queue || [],
          dayStats: snap.day || null,
          settingsHint: {
            allowlist: snap.allowlist,
            maxDay: snap.maxDay,
            maxSubDay: snap.maxSubDay,
            quietRange: snap.quietRange,
          },
        },
        `rgl-queue-${Date.now()}.json`
      );
      if ($("distBox")) $("distBox").textContent = `Exported ${(snap.queue || []).length} items`;
    });
  });
});
$("btnQueueImport")?.addEventListener("click", () => {
  $("queueImportFile")?.click();
});
$("queueImportFile")?.addEventListener("change", (ev) => {
  const file = ev.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      let urls = "";
      const text = String(reader.result || "");
      if (file.name.endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : data.queue || data.urls || [];
        urls = items
          .map((x) => (typeof x === "string" ? x : x.url || x.href || ""))
          .filter(Boolean)
          .join("\n");
      } else {
        urls = text;
      }
      if (!urls.trim()) {
        if ($("distBox")) $("distBox").textContent = "Import: empty file";
        return;
      }
      if ($("queueUrls")) $("queueUrls").value = urls;
      save();
      withActiveRedditTab((tabId) => {
        chrome.tabs.sendMessage(tabId, { type: "RGL_DIST", op: "add", urls }, (res) => {
          if ($("distBox")) {
            $("distBox").textContent = res?.ok
              ? `Imported +${res.added} · pending ${res.snapshot?.queuePending}`
              : `Import fail: ${res?.error || chrome.runtime.lastError?.message}`;
          }
          refreshDist();
        });
      });
    } catch (e) {
      if ($("distBox")) $("distBox").textContent = `Import parse error: ${e.message}`;
    }
    ev.target.value = "";
  };
  reader.readAsText(file);
});

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    if (t.dataset.tab === "dist") setTimeout(refreshDist, 200);
  });
});

$("btnBanGuardRefresh")?.addEventListener("click", refreshBanGuard);
$("btnBanGuardClear")?.addEventListener("click", () => {
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_BAN_GUARD_CLEAR" }, () => {
      if ($("banGuardBox")) $("banGuardBox").textContent = "Ban-guard log cleared";
    });
  });
});

// refresh when opening safety tab
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    if (t.dataset.tab === "safe") setTimeout(refreshBanGuard, 200);
  });
});

$("btnExportLog")?.addEventListener("click", () => {
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_GET_LOG" }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        // fallback: storage ring (last flushed)
        chrome.storage.local.get(["rgl_sessionLog", "rgl_sessionMeta"], (s) => {
          const obj = {
            meta: s.rgl_sessionMeta || {},
            events: s.rgl_sessionLog || [],
            note: "fallback from chrome.storage (tab may need F5)",
          };
          const name = `rgl-session-${Date.now()}.json`;
          downloadJson(obj, name);
          if ($("logMeta")) $("logMeta").textContent = `Log: exported ${obj.events.length} (storage)`;
        });
        return;
      }
      const name = `rgl-session-${res.log?.meta?.sessionId || Date.now()}.json`;
      downloadJson(res.log, name);
      if ($("logMeta")) {
        $("logMeta").textContent = `Log: exported ${res.log?.events?.length || 0} events`;
      }
    });
  });
});

$("btnClearLog")?.addEventListener("click", () => {
  withActiveRedditTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: "RGL_CLEAR_LOG" }, () => {
      chrome.storage.local.set({ rgl_sessionLog: [], rgl_sessionMeta: { clearedAt: new Date().toISOString() } });
      if ($("logMeta")) $("logMeta").textContent = "Log: cleared";
    });
  });
});

$("btnHealth")?.addEventListener("click", async () => {
  // persist endpoint first so SW uses current form values
  save();
  const box = $("healthResult");
  box.textContent = "Health: checking…";
  try {
    // give storage a tick
    await new Promise((r) => setTimeout(r, 150));
    chrome.runtime.sendMessage({ type: "HEALTH" }, (res) => {
      if (chrome.runtime.lastError) {
        box.textContent = `Health: error — ${chrome.runtime.lastError.message}`;
        return;
      }
      if (res?.ok) box.textContent = `Health: OK (HTTP ${res.status}) · endpoint reachable`;
      else box.textContent = `Health: FAIL — ${res?.error || `HTTP ${res?.status}`}`;
    });
  } catch (e) {
    box.textContent = `Health: FAIL — ${e.message}`;
  }
});

// ── Shadowban check (anonymous fetch, no cookies) ─────────────────
function paintShadowbanBox(res) {
  const box = $("shadowbanBox");
  if (!box) return;
  box.classList.remove("sb-clean", "sb-high", "sb-med");
  if (!res?.ok) {
    box.classList.add("sb-med");
    box.textContent = `Shadowban: FAIL — ${res?.error || "unknown error"}`;
    return;
  }
  const v = res.verdict || {};
  const c = res.checks || {};
  if (v.severity === "clean") box.classList.add("sb-clean");
  else if (v.severity === "high") box.classList.add("sb-high");
  else box.classList.add("sb-med");

  box.textContent =
    `${v.title || "—"}\n` +
    `u/${res.username} · ${res.ms || "?"}ms\n` +
    `${v.summary || ""}\n` +
    `—\n` +
    `HTML ${c.html?.status ?? "?"} · ${c.html?.detail || ""}\n` +
    `about.json ${c.about?.status ?? "?"} · ${c.about?.detail || ""}\n` +
    `comments.json ${c.comments?.status ?? "?"} · ${c.comments?.detail || ""}\n` +
    `—\n` +
    (res.howToManual || "");
}

function normalizeUserInput(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  try {
    if (/reddit\.com/i.test(u) || /^https?:\/\//i.test(u)) {
      const m = u.match(/\/user\/([^/?#]+)/i) || u.match(/\/u\/([^/?#]+)/i);
      if (m) u = decodeURIComponent(m[1]);
    }
  } catch (_) {}
  return u.replace(/^u\//i, "").replace(/^\/+|\/+$/g, "");
}

$("btnShadowbanCheck")?.addEventListener("click", () => {
  const box = $("shadowbanBox");
  let user = normalizeUserInput($("rgl_shadowbanUser")?.value || "");
  if (!user) {
    // try last saved / default test account hint
    user = "Tiny-Compass-8516";
    if ($("rgl_shadowbanUser")) $("rgl_shadowbanUser").value = user;
  }
  if (box) {
    box.classList.remove("sb-clean", "sb-high", "sb-med");
    box.textContent = `Shadowban: checking u/${user} (anonymous, no cookies)…`;
  }
  chrome.storage.local.set({ rgl_shadowbanUser: user });
  chrome.runtime.sendMessage({ type: "SHADOWBAN_CHECK", username: user }, (res) => {
    if (chrome.runtime.lastError) {
      paintShadowbanBox({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    paintShadowbanBox(res);
  });
});

$("btnShadowbanOpenIncog")?.addEventListener("click", async () => {
  const user = normalizeUserInput($("rgl_shadowbanUser")?.value || "Tiny-Compass-8516");
  const url = `https://www.reddit.com/user/${encodeURIComponent(user)}/`;
  try {
    await navigator.clipboard.writeText(url);
    const box = $("shadowbanBox");
    if (box) {
      const prev = box.textContent;
      box.textContent = `Copied: ${url}\nMở Chrome tab ẩn danh → dán URL để xác nhận thủ công.\n\n${prev}`;
    }
  } catch (e) {
    if ($("shadowbanBox")) $("shadowbanBox").textContent = `URL: ${url}\n(copy failed: ${e.message})`;
  }
});

// Prefill shadowban username from storage or active Reddit tab profile
chrome.storage.local.get(["rgl_shadowbanUser", "rgl_shadowbanLast"], (s) => {
  if ($("rgl_shadowbanUser")) {
    $("rgl_shadowbanUser").value =
      s.rgl_shadowbanUser || s.rgl_shadowbanLast?.username || "Tiny-Compass-8516";
  }
  if (s.rgl_shadowbanLast && $("shadowbanBox")) {
    const L = s.rgl_shadowbanLast;
    $("shadowbanBox").textContent =
      `Last: ${L.title || L.status} · u/${L.username || "?"} · ${L.at || ""}`;
    if (L.severity === "clean") $("shadowbanBox").classList.add("sb-clean");
    else if (L.severity === "high") $("shadowbanBox").classList.add("sb-high");
    else $("shadowbanBox").classList.add("sb-med");
  }
});

[
  "rgl_scrollSpeed",
  "rgl_upvoteChance",
  "rgl_openPostChance",
  "rgl_commentUpvoteChance",
  "rgl_driftPercent",
  "rgl_commentChanceBase",
  "rgl_commentWpmBase",
].forEach((id) => $(id).addEventListener("input", refreshLabels));

chrome.storage.local.get(DEFAULTS, fillForm);
setInterval(pollStats, 1500);
pollStats();
