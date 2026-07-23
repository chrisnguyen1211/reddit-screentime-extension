const $ = (id) => document.getElementById(id);

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

function load() {
  chrome.storage.local.get(DEFAULTS, (s) => {
    $("enabled").checked = !!s.enabled;
    $("scrollSpeed").value = s.scrollSpeed;
    $("upvoteChance").value = s.upvoteChance;
    $("openPostChance").value = s.openPostChance;
    $("commentUpvoteChance").value = s.commentUpvoteChance;
    $("pauseMin").value = s.pauseMin;
    $("pauseMax").value = s.pauseMax;
    $("scrollMin").value = s.scrollMin;
    $("scrollMax").value = s.scrollMax;
    $("wpm").value = s.wpm;
    refreshLabels();
    refreshStatusUI(s.enabled);
  });
  pollStats();
  checkTab();
}

function refreshLabels() {
  $("scrollSpeedVal").textContent = `${Number($("scrollSpeed").value).toFixed(1)}×`;
  $("upvoteChanceVal").textContent = `${$("upvoteChance").value}%`;
  $("openPostChanceVal").textContent = `${$("openPostChance").value}%`;
  $("commentUpvoteChanceVal").textContent = `${$("commentUpvoteChance").value}%`;
  $("wpmVal").textContent = String($("wpm").value);
}

function refreshStatusUI(enabled) {
  $("statusText").textContent = enabled ? "Đang bật" : "Đang tắt";
  document.body.classList.toggle("on", !!enabled);
}

function save(partial = {}) {
  const data = {
    enabled: $("enabled").checked,
    scrollSpeed: Number($("scrollSpeed").value),
    upvoteChance: Number($("upvoteChance").value),
    openPostChance: Number($("openPostChance").value),
    commentUpvoteChance: Number($("commentUpvoteChance").value),
    pauseMin: Number($("pauseMin").value),
    pauseMax: Number($("pauseMax").value),
    scrollMin: Number($("scrollMin").value),
    scrollMax: Number($("scrollMax").value),
    wpm: Number($("wpm").value),
    ...partial,
  };

  if (data.pauseMax < data.pauseMin) data.pauseMax = data.pauseMin;
  if (data.scrollMax < data.scrollMin) data.scrollMax = data.scrollMin;

  chrome.storage.local.set(data, () => {
    refreshStatusUI(data.enabled);
    const btn = $("save");
    const prev = btn.textContent;
    btn.textContent = "Đã lưu ✓";
    setTimeout(() => {
      btn.textContent = prev;
    }, 1200);
  });
}

function pollStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url?.includes("reddit.com")) {
      ["statScrolls", "statUpvotes", "statCmtUpvotes", "statOpens"].forEach((id) => {
        $(id).textContent = "—";
      });
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "GET_STATS" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        ["statScrolls", "statUpvotes", "statCmtUpvotes", "statOpens"].forEach((id) => {
          $(id).textContent = "—";
        });
        return;
      }
      $("statScrolls").textContent = String(res.stats?.scrolls ?? 0);
      $("statUpvotes").textContent = String(res.stats?.upvotes ?? 0);
      $("statCmtUpvotes").textContent = String(res.stats?.commentUpvotes ?? 0);
      $("statOpens").textContent = String(res.stats?.opens ?? 0);
      if (res.mode) {
        $("pageHint").textContent = `mode: ${res.mode} · energy ${Math.round((res.energy || 0) * 100)}%`;
      }
    });
  });
}

function checkTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const ok = !!tab?.url?.includes("reddit.com");
    if (!$("pageHint").textContent.startsWith("mode:")) {
      $("pageHint").textContent = ok
        ? "Tab Reddit đang mở — sẵn sàng"
        : "Mở tab reddit.com rồi bật";
    }
  });
}

$("enabled").addEventListener("change", () => {
  save({ enabled: $("enabled").checked });
});

["scrollSpeed", "upvoteChance", "openPostChance", "commentUpvoteChance", "wpm"].forEach((id) => {
  $(id).addEventListener("input", refreshLabels);
});

$("save").addEventListener("click", () => save());

setInterval(pollStats, 1500);
load();
