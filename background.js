// Keep badge in sync with enabled state
chrome.storage.local.get({ enabled: false }, ({ enabled }) => {
  updateBadge(enabled);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    updateBadge(changes.enabled.newValue);
  }
});

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#ff4500" : "#666666" });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    {
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
    },
    (settings) => {
      chrome.storage.local.set(settings);
      updateBadge(settings.enabled);
    }
  );
});
