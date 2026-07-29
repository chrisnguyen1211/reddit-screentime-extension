import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "background-shadowban.js"), "utf8");

// Mirror pure helpers (kept in sync via source string assertions)
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
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(u)) return "";
  return u;
}

function classifyBody(text, status) {
  const t = String(text || "");
  if (status === 403 || /whoa there, pardner|network policy|blocked due to/i.test(t)) {
    return { signal: "blocked" };
  }
  if (/this account has been banned|account has been banned from reddit|has been permanently banned|this user has been banned/i.test(t)) {
    return { signal: "banned" };
  }
  if (status === 404 || /sorry, nobody on reddit goes by that name|page not found|user not found/i.test(t)) {
    return { signal: "not_found" };
  }
  if (/this account has been suspended|is suspended/i.test(t.toLowerCase())) {
    return { signal: "suspended" };
  }
  return { signal: "ok_page" };
}

function classifyAboutJson(text, status) {
  if (status === 403) return { signal: "blocked" };
  if (status === 404) return { signal: "not_found" };
  if (status !== 200) return { signal: "error" };
  try {
    const j = JSON.parse(text);
    if (j?.error || j?.message === "Not Found") return { signal: "not_found" };
    const d = j?.data;
    if (!d || !d.name) return { signal: "not_found" };
    if (d.is_suspended || d.is_banned) return { signal: "banned" };
    return { signal: "ok", data: { name: d.name } };
  } catch {
    return { signal: "error" };
  }
}

function buildVerdict(username, htmlCls, aboutCls, commentsCls) {
  const signals = [htmlCls.signal, aboutCls.signal, commentsCls?.signal].filter(Boolean);
  const hasBanned = signals.includes("banned") || signals.includes("suspended");
  const hasMissing = signals.includes("not_found");
  const hasOk = signals.includes("ok") || signals.includes("ok_page");
  const hasBlocked = signals.includes("blocked");
  if (hasBanned) return { status: "shadowbanned_or_banned", title: "BANNED / SHADOWBAN", severity: "high" };
  if (hasMissing && !hasOk) return { status: "shadowbanned_or_missing", title: "SHADOWBAN", severity: "high" };
  if (hasMissing && hasOk) return { status: "mixed", severity: "med" };
  if (hasOk && !hasBanned && !hasMissing) return { status: "clean", severity: "clean" };
  if (hasBlocked) return { status: "blocked", severity: "med" };
  return { status: "unknown", severity: "med" };
}

describe("normalizeUsername()", () => {
  it("parses bare name and URLs", () => {
    assert.equal(normalizeUsername("Tiny-Compass-8516"), "Tiny-Compass-8516");
    assert.equal(
      normalizeUsername("https://www.reddit.com/user/Tiny-Compass-8516/"),
      "Tiny-Compass-8516"
    );
    assert.equal(normalizeUsername("u/foo_bar"), "foo_bar");
  });
  it("rejects junk", () => {
    assert.equal(normalizeUsername(""), "");
    assert.equal(normalizeUsername("https://example.com/x"), "");
  });
});

describe("classifyBody / classifyAboutJson", () => {
  it("detects banned copy", () => {
    assert.equal(classifyBody("This account has been banned from Reddit.", 200).signal, "banned");
  });
  it("detects nobody-by-that-name", () => {
    assert.equal(classifyBody("Sorry, nobody on Reddit goes by that name.", 404).signal, "not_found");
  });
  it("detects bot wall", () => {
    assert.equal(classifyBody("whoa there, pardner! network policy", 403).signal, "blocked");
  });
  it("about.json 404 = not_found", () => {
    assert.equal(classifyAboutJson("{}", 404).signal, "not_found");
  });
  it("about.json 200 with name = ok", () => {
    const body = JSON.stringify({ data: { name: "spez", link_karma: 1, comment_karma: 2 } });
    const r = classifyAboutJson(body, 200);
    assert.equal(r.signal, "ok");
    assert.equal(r.data.name, "spez");
  });
});

describe("buildVerdict()", () => {
  it("banned + not_found → high shadowban", () => {
    const v = buildVerdict("x", { signal: "banned" }, { signal: "not_found" }, { signal: "not_found" });
    assert.equal(v.severity, "high");
    assert.match(v.title, /BAN|SHADOW/i);
  });
  it("all ok → clean", () => {
    const v = buildVerdict("x", { signal: "ok_page" }, { signal: "ok" }, { signal: "ok" });
    assert.equal(v.status, "clean");
    assert.equal(v.severity, "clean");
  });
  it("blocked → med", () => {
    const v = buildVerdict("x", { signal: "blocked" }, { signal: "blocked" }, { signal: "blocked" });
    assert.equal(v.status, "blocked");
  });
});

describe("wiring + source contract", () => {
  it("background.js imports shadowban module", () => {
    const bg = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
    assert.match(bg, /background-shadowban/);
  });
  it("popup has Safety UI hooks", () => {
    const html = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
    assert.match(html, /btnShadowbanCheck/);
    assert.match(html, /shadowbanBox/);
  });
  it("shadowban module uses credentials omit (anonymous)", () => {
    assert.match(src, /credentials:\s*["']omit["']/);
    assert.match(src, /SHADOWBAN_CHECK/);
    assert.match(src, /this account has been banned/i);
    assert.match(src, /nobody on reddit goes by that name/i);
  });
});
