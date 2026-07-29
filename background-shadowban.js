// Shadowban check: fetch profile / about.json WITHOUT cookies (credentials: 'omit').
// Logged-in user still sees their own account fine; outsiders (anonymous) see
// "banned" / 404 when the account is shadowbanned.

function normalizeUsername(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  try {
    if (/^https?:\/\//i.test(u) || u.includes("reddit.com")) {
      const m = u.match(/\/user\/([^/?#]+)/i) || u.match(/\/u\/([^/?#]+)/i);
      if (m) u = m[1];
    }
  } catch (_) {}
  u = u.replace(/^u\//i, "").replace(/^\/+|\/+$/g, "");
  // Reddit usernames: 3–20 chars, alnum underscore hyphen
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(u)) return "";
  return u;
}

function classifyBody(text, status) {
  const t = String(text || "");
  const low = t.toLowerCase();

  // Network / bot wall
  if (status === 403 || /whoa there, pardner|network policy|blocked due to/i.test(t)) {
    return { signal: "blocked", detail: "Reddit blocked the request (403 / network policy)" };
  }

  // Clear ban / shadowban copy shown to anonymous viewers
  if (
    /this account has been banned|account has been banned from reddit|has been permanently banned|this user has been banned/i.test(
      t
    )
  ) {
    return { signal: "banned", detail: "Anonymous view shows account banned" };
  }

  // Deleted / never existed (also common shadowban presentation)
  if (
    status === 404 ||
    /sorry, nobody on reddit goes by that name|page not found|user not found/i.test(t)
  ) {
    return { signal: "not_found", detail: "Profile not found for anonymous viewers (404 / nobody by that name)" };
  }

  // Suspended variants
  if (/this account has been suspended|is suspended/i.test(low)) {
    return { signal: "suspended", detail: "Account suspended message" };
  }

  return { signal: "ok_page", detail: `HTTP ${status}, no ban/404 copy in HTML` };
}

function classifyAboutJson(text, status) {
  if (status === 403) {
    return { signal: "blocked", detail: "about.json blocked (403)" };
  }
  if (status === 404) {
    return { signal: "not_found", detail: "about.json 404 (typical for shadowban / deleted to outsiders)" };
  }
  if (status !== 200) {
    return { signal: "error", detail: `about.json HTTP ${status}` };
  }
  try {
    const j = JSON.parse(text);
    if (j?.error || j?.message === "Not Found") {
      return { signal: "not_found", detail: "about.json error/not found body" };
    }
    const d = j?.data;
    if (!d || !d.name) {
      return { signal: "not_found", detail: "about.json missing data.name" };
    }
    if (d.is_suspended || d.is_banned) {
      return { signal: "banned", detail: "about.json marks suspended/banned" };
    }
    return {
      signal: "ok",
      detail: `about.json OK · u/${d.name} · karma ${(d.link_karma || 0) + (d.comment_karma || 0)}`,
      data: {
        name: d.name,
        linkKarma: d.link_karma,
        commentKarma: d.comment_karma,
        created: d.created_utc,
        totalKarma: (d.link_karma || 0) + (d.comment_karma || 0),
      },
    };
  } catch (e) {
    return { signal: "error", detail: `about.json parse: ${e.message}` };
  }
}

async function fetchAnon(url) {
  const res = await fetch(url, {
    method: "GET",
    credentials: "omit", // critical — no login cookies
    cache: "no-store",
    redirect: "follow",
    headers: {
      Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      // Descriptive UA helps avoid some bot walls from extension context
      "User-Agent": "RedditGrowthLab/2.1 shadowban-check (personal; +local extension)",
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  return { status: res.status, text, finalUrl: res.url };
}

/**
 * Verdict aggregation:
 * - banned / not_found on anon views → likely shadowbanned (or fully banned/deleted)
 * - both ok → clean
 * - blocked → cannot determine
 */
function buildVerdict(username, htmlCls, aboutCls, commentsCls) {
  const signals = [htmlCls.signal, aboutCls.signal, commentsCls?.signal].filter(Boolean);
  const hasBanned = signals.includes("banned") || signals.includes("suspended");
  const hasMissing = signals.includes("not_found");
  const hasOk = signals.includes("ok") || signals.includes("ok_page");
  const hasBlocked = signals.includes("blocked");
  const hasError = signals.includes("error");

  let status = "unknown";
  let title = "Không chắc";
  let summary = "";
  let severity = "med"; // clean | med | high

  if (hasBanned) {
    status = "shadowbanned_or_banned";
    title = "Có vẻ BANNED / SHADOWBAN";
    summary =
      "Anonymous (không cookie) thấy account banned/suspended. " +
      "Nếu bạn vẫn login + lướt feed bình thường thì rất có thể là shadowban: " +
      "người khác / tab ẩn danh không thấy profile & comment của bạn.";
    severity = "high";
  } else if (hasMissing && !hasOk) {
    status = "shadowbanned_or_missing";
    title = "Profile ẨN với người ngoài (shadowban / deleted)";
    summary =
      "Anonymous không load được profile (404 / nobody by that name). " +
      "Shadowban thường hiện đúng kiểu này: bạn vẫn dùng app bình thường, " +
      "nhưng link u/username từ tab ẩn danh không mở được.";
    severity = "high";
  } else if (hasMissing && hasOk) {
    status = "mixed";
    title = "Tín hiệu trộn (cần check lại)";
    summary =
      "Một endpoint OK, một endpoint 404/ban. Thử lại sau vài phút hoặc mở tab ẩn danh thủ công.";
    severity = "med";
  } else if (hasOk && !hasBanned && !hasMissing) {
    status = "clean";
    title = "Có vẻ CLEAN";
    summary =
      "Anonymous vẫn thấy profile. Không có dấu hiệu shadowban từ check này " +
      "(vẫn nên tự mở tab ẩn danh xác nhận).";
    severity = "clean";
  } else if (hasBlocked) {
    status = "blocked";
    title = "Reddit chặn request";
    summary =
      "Fetch bị network policy / 403. Mở tab ẩn danh thủ công: " +
      `https://www.reddit.com/user/${username}/`;
    severity = "med";
  } else if (hasError) {
    status = "error";
    title = "Lỗi kiểm tra";
    summary = "Không lấy được dữ liệu. Kiểm tra mạng rồi thử lại.";
    severity = "med";
  }

  return { status, title, summary, severity };
}

async function checkShadowban(rawUser) {
  const username = normalizeUsername(rawUser);
  if (!username) {
    return { ok: false, error: "Username không hợp lệ. VD: Tiny-Compass-8516 hoặc full profile URL." };
  }

  const profileUrl = `https://www.reddit.com/user/${encodeURIComponent(username)}/`;
  const aboutUrl = `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`;
  const commentsUrl = `https://www.reddit.com/user/${encodeURIComponent(username)}/comments.json?limit=5`;

  const t0 = Date.now();
  let htmlRes, aboutRes, commentsRes;
  try {
    [htmlRes, aboutRes, commentsRes] = await Promise.all([
      fetchAnon(profileUrl).catch((e) => ({ status: 0, text: String(e.message || e), finalUrl: profileUrl })),
      fetchAnon(aboutUrl).catch((e) => ({ status: 0, text: String(e.message || e), finalUrl: aboutUrl })),
      fetchAnon(commentsUrl).catch((e) => ({ status: 0, text: String(e.message || e), finalUrl: commentsUrl })),
    ]);
  } catch (e) {
    return { ok: false, error: e.message || String(e), username };
  }

  const htmlCls = classifyBody(htmlRes.text, htmlRes.status);
  const aboutCls = classifyAboutJson(aboutRes.text, aboutRes.status);

  // Comments listing: shadowban often 404 or empty for outsiders
  let commentsCls = { signal: "error", detail: "comments.json skipped" };
  if (commentsRes.status === 404) {
    commentsCls = { signal: "not_found", detail: "comments.json 404" };
  } else if (commentsRes.status === 403) {
    commentsCls = { signal: "blocked", detail: "comments.json 403" };
  } else if (commentsRes.status === 200) {
    try {
      const j = JSON.parse(commentsRes.text);
      const children = j?.data?.children || [];
      commentsCls = {
        signal: "ok",
        detail: `comments.json OK · ${children.length} recent items visible anonymously`,
        count: children.length,
      };
    } catch {
      commentsCls = classifyBody(commentsRes.text, commentsRes.status);
    }
  } else {
    commentsCls = { signal: "error", detail: `comments.json HTTP ${commentsRes.status}` };
  }

  const verdict = buildVerdict(username, htmlCls, aboutCls, commentsCls);

  // Persist last check
  try {
    await chrome.storage.local.set({
      rgl_shadowbanUser: username,
      rgl_shadowbanLast: {
        at: new Date().toISOString(),
        username,
        status: verdict.status,
        title: verdict.title,
        severity: verdict.severity,
      },
    });
  } catch (_) {}

  return {
    ok: true,
    username,
    profileUrl,
    ms: Date.now() - t0,
    verdict,
    checks: {
      html: { status: htmlRes.status, ...htmlCls },
      about: { status: aboutRes.status, ...aboutCls },
      comments: { status: commentsRes.status, ...commentsCls },
    },
    howToManual: `Tab ẩn danh → ${profileUrl} — nếu báo banned / nobody by that name trong khi bạn vẫn login được = shadowban.`,
  };
}

// Merge into existing onMessage in background.js via importScripts side effect:
// background.js registers its own listener; we add another (MV3 allows multiple).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SHADOWBAN_CHECK") {
    checkShadowban(msg.username || msg.user || msg.url || "")
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
});
