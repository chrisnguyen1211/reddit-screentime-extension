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
    });
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
