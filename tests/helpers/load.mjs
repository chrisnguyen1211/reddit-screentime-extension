/**
 * Load pure functions from extension source without a bundler.
 * background-llm.js is classic script (function declarations in global scope).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readSrc(...parts) {
  return fs.readFileSync(path.join(ROOT, ...parts), "utf8");
}

export function rootPath(...parts) {
  return path.join(ROOT, ...parts);
}

/** Extract scrub + buildPrompt + subHint from background-llm.js */
export function loadLlmPure() {
  const src = readSrc("background-llm.js");
  const start = src.indexOf("const ANTI_AI_STYLE");
  const end = src.indexOf("// Parse 9router");
  if (start < 0 || end < 0) throw new Error("Could not slice LLM pure block from background-llm.js");
  const chunk = src.slice(start, end);
  const factory = new Function(
    `"use strict";
    ${chunk}
    return {
      scrub,
      buildPrompt,
      buildDmPrompt,
      subHint,
      SUB_HINTS,
      ANTI_AI_STYLE,
      LENGTHS,
      VIBES,
      LENGTH_KEYS,
      VIBE_KEYS,
    };`
  );
  return factory();
}

/** extractContent is after scrub — load separately for SSE parser tests */
export function loadExtractContent() {
  const src = readSrc("background-llm.js");
  const scrubStart = src.indexOf("function scrub");
  const extractStart = src.indexOf("function extractContent");
  const extractEnd = src.indexOf("\n// Vision:");
  if (scrubStart < 0 || extractStart < 0 || extractEnd < 0) {
    throw new Error("Could not slice extractContent");
  }
  // extractContent calls scrub — include both
  const chunk = src.slice(scrubStart, extractEnd);
  const factory = new Function(
    `"use strict";
    ${chunk}
    return { scrub, extractContent };`
  );
  return factory();
}

/**
 * Permalink helpers live inside an IIFE — reimplement the pure logic
 * by evaluating the exact function bodies from source when possible.
 * Fallback: mirror the tested contract from 20-assist-ui.js.
 */
export function loadPermalinkHelpers() {
  // Pure copy matching content/20-assist-ui.js (kept in sync via tests that assert source strings)
  function looksLikeRedditId(s) {
    return !!s && !/[_-]/.test(s) && /^[a-z0-9]{5,12}$/i.test(s);
  }

  function permalinkCommentId(locationLike) {
    const location = locationLike || { pathname: "", search: "", hash: "" };
    try {
      const path = String(location.pathname || "").replace(/\/+$/, "");
      const after = path.split(/\/comments\//i)[1];
      if (after) {
        const parts = after.split("/").filter(Boolean);
        if (parts.length >= 3 && looksLikeRedditId(parts[2])) return parts[2].toLowerCase();
        if (parts.length === 2 && looksLikeRedditId(parts[0]) && looksLikeRedditId(parts[1])) {
          return parts[1].toLowerCase();
        }
      }
      const m = path.match(/\/comment\/([a-z0-9]+)/i);
      if (m && looksLikeRedditId(m[1])) return m[1].toLowerCase();
      const q =
        new URLSearchParams(location.search || "").get("comment") ||
        new URLSearchParams(location.search || "").get("comment_id") ||
        "";
      if (q) {
        const bare = q.replace(/^t1_/i, "");
        if (looksLikeRedditId(bare)) return bare.toLowerCase();
      }
      const hash = String(location.hash || "").replace(/^#/, "");
      if (/^t1_/i.test(hash)) return hash.replace(/^t1_/i, "").toLowerCase();
    } catch (_) {}
    return "";
  }

  return { looksLikeRedditId, permalinkCommentId };
}

/** Vote-control detection matching content/20-assist-ui.js isVoteControl */
export function loadVoteDetect() {
  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }
  function isVoteControl(el) {
    if (!el) return false;
    const bits = [
      el.getAttribute?.("aria-label") || "",
      el.getAttribute?.("data-post-click-location") || "",
      el.getAttribute?.("data-testid") || "",
      el.getAttribute?.("name") || "",
      clean(el.textContent || "").slice(0, 40),
    ]
      .join(" ")
      .toLowerCase();
    return (
      /\b(up\s?vote|down\s?vote|upvote|downvote)\b/.test(bits) ||
      /vote-(up|down)|upvote|downvote|arrowUp|arrowDown/i.test(bits)
    );
  }
  function mockEl(attrs = {}, text = "") {
    return {
      getAttribute: (k) => (attrs[k] != null ? attrs[k] : null),
      textContent: text,
    };
  }
  return { isVoteControl, mockEl, clean };
}

/** Distribution pure helpers */
export function loadDistPure() {
  function parseList(str) {
    return String(str || "")
      .split(/[\s,]+/)
      .map((s) => s.replace(/^r\//i, "").trim().toLowerCase())
      .filter(Boolean);
  }

  function normalizePostUrl(url) {
    try {
      const u = new URL(url, "https://www.reddit.com");
      if (!u.hostname.includes("reddit.com")) return null;
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

  /** Quiet hours: start inclusive, end exclusive; wraps midnight if start > end */
  function inQuietHours(hour, start, end) {
    const h = ((Number(hour) % 24) + 24) % 24;
    const s = Number(start);
    const e = Number(end);
    if (s === e) return false; // zero-width = off
    if (s < e) return h >= s && h < e;
    // wraps midnight e.g. 22 → 7
    return h >= s || h < e;
  }

  function allowSub(sub, allowlist, blocklist) {
    const slug = String(sub || "")
      .replace(/^r\//i, "")
      .toLowerCase();
    const block = parseList(blocklist);
    const allow = parseList(allowlist);
    if (block.includes(slug)) return false;
    if (allow.length && !allow.includes(slug)) return false;
    return true;
  }

  return { parseList, normalizePostUrl, inQuietHours, allowSub };
}

/** Ban-guard ratio math (mirrors compute value/promo share) */
export function loadBanGuardMath() {
  function promoShare(events) {
    const comments = events.filter((e) => e.type === "comment" || e.type === "seed_comment");
    const seeds = events.filter((e) => e.promo || e.type === "seed_comment");
    const organicComments = comments.filter((e) => !e.promo && e.type !== "seed_comment");
    const upvotes = events.filter((e) => e.type === "upvote" || e.type === "vote");
    const posts = events.filter((e) => e.type === "post");
    const valueActs = organicComments.length + upvotes.length;
    const promoActs = seeds.length + posts.filter((e) => e.promo).length;
    const totalTracked = valueActs + promoActs;
    const share = totalTracked ? promoActs / totalTracked : 0;
    const ratio = promoActs ? valueActs / promoActs : valueActs > 0 ? Infinity : null;
    return { valueActs, promoActs, totalTracked, promoShare: share, ratioValuePerPromo: ratio };
  }

  function riskBand(share) {
    // Soft bands used by product docs: high when promo heavy
    if (share >= 0.5) return "high";
    if (share >= 0.25) return "med";
    if (share > 0) return "low";
    return "none";
  }

  return { promoShare, riskBand };
}
