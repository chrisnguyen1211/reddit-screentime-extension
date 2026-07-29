import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadDistPure, readSrc } from "./helpers/load.mjs";

const { parseList, normalizePostUrl, inQuietHours, allowSub } = loadDistPure();

describe("parseList()", () => {
  it("splits commas and strips r/", () => {
    assert.deepEqual(parseList("r/SaaS, micro_saas, Startups"), [
      "saas",
      "micro_saas",
      "startups",
    ]);
  });

  it("handles newlines and empty", () => {
    assert.deepEqual(parseList("a\nb\n"), ["a", "b"]);
    assert.deepEqual(parseList(""), []);
    assert.deepEqual(parseList(null), []);
  });
});

describe("normalizePostUrl()", () => {
  it("parses full reddit comment URL", () => {
    const n = normalizePostUrl(
      "https://www.reddit.com/r/SaaS/comments/1v3ibz0/trying_to_figure/"
    );
    assert.ok(n);
    assert.equal(n.id, "1v3ibz0");
    assert.equal(n.sub, "saas");
    assert.match(n.url, /\/r\/SaaS\/comments\/1v3ibz0/i);
  });

  it("rejects non-reddit hosts", () => {
    assert.equal(normalizePostUrl("https://example.com/r/x/comments/abc"), null);
  });

  it("rejects non-post paths", () => {
    assert.equal(normalizePostUrl("https://www.reddit.com/r/SaaS/"), null);
  });
});

describe("inQuietHours()", () => {
  it("normal window 1–7 includes 1,3 excludes 7,12", () => {
    assert.equal(inQuietHours(1, 1, 7), true);
    assert.equal(inQuietHours(3, 1, 7), true);
    assert.equal(inQuietHours(7, 1, 7), false);
    assert.equal(inQuietHours(12, 1, 7), false);
  });

  it("wraps midnight 22→7", () => {
    assert.equal(inQuietHours(23, 22, 7), true);
    assert.equal(inQuietHours(2, 22, 7), true);
    assert.equal(inQuietHours(12, 22, 7), false);
  });

  it("start===end means off", () => {
    assert.equal(inQuietHours(5, 5, 5), false);
  });
});

describe("allowSub()", () => {
  it("blocks blocklist", () => {
    assert.equal(allowSub("announcements", "", "announcements,reddit.com"), false);
  });

  it("empty allowlist allows any non-blocked", () => {
    assert.equal(allowSub("saas", "", "announcements"), true);
  });

  it("allowlist restricts", () => {
    assert.equal(allowSub("saas", "saas,micro_saas", ""), true);
    assert.equal(allowSub("pics", "saas,micro_saas", ""), false);
  });
});

describe("source contains dist keys", () => {
  it("12-distribution.js has normalizePostUrl and quiet defaults live in shared", () => {
    const dist = readSrc("content/12-distribution.js");
    assert.match(dist, /normalizePostUrl/);
    assert.match(dist, /rgl_quietHours|quiet/i);
    const shared = readSrc("content/00-shared.js");
    assert.match(shared, /rgl_maxCommentsPerDay/);
    assert.match(shared, /rgl_quietHoursStart/);
  });
});
