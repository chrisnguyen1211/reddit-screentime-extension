#!/usr/bin/env node
/**
 * Audit Reddit user comment/post history for removed/deleted rates.
 *
 * Usage:
 *   node scripts/audit-reddit-removals.mjs Sea-Big3772
 *   node scripts/audit-reddit-removals.mjs Sea-Big3772 --kind=comments
 *   node scripts/audit-reddit-removals.mjs Sea-Big3772 --kind=submitted
 *   node scripts/audit-reddit-removals.mjs Sea-Big3772 --max=1000
 *
 * Notes:
 * - Uses public JSON endpoints (no OAuth). Rate-limit friendly.
 * - "Removed by mods" often becomes [removed] body while author still listed,
 *   or vanishes from listing entirely (then we undercount removals).
 * - Fully deleted by you → [deleted].
 * - Best effort: fetch up to --max items via after= pagination.
 */

import fs from "node:fs";
import path from "node:path";

const user = (process.argv[2] || "").replace(/^u\//, "");
const kindArg = process.argv.find((a) => a.startsWith("--kind="));
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const kind = (kindArg?.split("=")[1] || "both").toLowerCase(); // comments | submitted | both
const MAX = Math.min(2000, Math.max(25, Number(maxArg?.split("=")[1]) || 500));

if (!user) {
  console.error("Usage: node scripts/audit-reddit-removals.mjs <username> [--kind=comments|submitted|both] [--max=500]");
  process.exit(1);
}

const UA =
  process.env.REDDIT_UA ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const COOKIE = process.env.REDDIT_COOKIE || ""; // optional: paste from browser DevTools → Application → Cookies
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const headers = {
    "User-Agent": UA,
    Accept: "application/json",
  };
  if (COOKIE) headers.Cookie = COOKIE;
  const res = await fetch(url, { headers });
  if (res.status === 429) {
    console.warn("Rate limited — waiting 10s…");
    await sleep(10000);
    return fetchJson(url);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new Error(
        `HTTP 403 blocked by Reddit.\n` +
          `Fix: export cookie while logged in:\n` +
          `  export REDDIT_COOKIE='reddit_session=...; token_v2=...'\n` +
          `  node scripts/audit-reddit-removals.mjs ${user}\n` +
          `Or open in browser: https://www.reddit.com/user/${user}/comments.json`
      );
    }
    throw new Error(`HTTP ${res.status} ${url}\n${t.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchListing(which) {
  // which: comments | submitted
  const items = [];
  let after = null;
  let pages = 0;
  while (items.length < MAX && pages < 50) {
    const qs = new URLSearchParams({
      limit: "100",
      raw_json: "1",
    });
    if (after) qs.set("after", after);
    const url = `https://www.reddit.com/user/${encodeURIComponent(user)}/${which}.json?${qs}`;
    process.stderr.write(`\rFetching ${which}: ${items.length}/${MAX}…`);
    const data = await fetchJson(url);
    const children = data?.data?.children || [];
    if (!children.length) break;
    for (const c of children) {
      items.push(c.data);
      if (items.length >= MAX) break;
    }
    after = data?.data?.after;
    pages += 1;
    if (!after) break;
    await sleep(700); // be polite
  }
  process.stderr.write("\n");
  return items;
}

function classifyComment(d) {
  const body = (d.body || "").trim();
  const author = d.author || "";
  const removedByCategory = d.removed_by_category; // "moderator" | "deleted" | "reddit" | null
  const spam = d.spam === true;
  const banned = d.banned_by != null;

  let status = "ok";
  if (author === "[deleted]" && (body === "[removed]" || body === "[deleted]")) status = "deleted_account_or_content";
  else if (body === "[removed]" || removedByCategory === "moderator" || removedByCategory === "reddit")
    status = "removed";
  else if (body === "[deleted]" || removedByCategory === "deleted") status = "self_deleted";
  else if (spam || banned) status = "removed";
  else if (!body && d.body === undefined) status = "unknown_empty";

  return {
    id: d.name || d.id,
    type: "comment",
    subreddit: d.subreddit,
    created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
    score: d.score,
    bodyPreview: body.slice(0, 120),
    removed_by_category: removedByCategory || null,
    status,
  };
}

function classifySubmission(d) {
  const selftext = (d.selftext || "").trim();
  const title = d.title || "";
  const author = d.author || "";
  const removedByCategory = d.removed_by_category;
  const spam = d.spam === true;

  let status = "ok";
  if (title === "[deleted]" || author === "[deleted]") status = "self_deleted";
  else if (selftext === "[removed]" || removedByCategory === "moderator" || removedByCategory === "reddit")
    status = "removed";
  else if (selftext === "[deleted]" || removedByCategory === "deleted") status = "self_deleted";
  else if (spam) status = "removed";
  // Removed link posts sometimes still show title but removed=true in some API fields
  if (d.removed === true || d.is_robot_indexable === false && removedByCategory) {
    if (status === "ok") status = "removed";
  }

  return {
    id: d.name || d.id,
    type: "post",
    subreddit: d.subreddit,
    created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
    score: d.score,
    title: title.slice(0, 120),
    removed_by_category: removedByCategory || null,
    status,
  };
}

function summarize(rows, label) {
  const total = rows.length;
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const removed = counts.removed || 0;
  const selfDel = counts.self_deleted || 0;
  const ok = counts.ok || 0;
  const other = total - removed - selfDel - ok;
  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : "0.0");

  console.log("\n" + "=".repeat(56));
  console.log(`${label} — u/${user}`);
  console.log("=".repeat(56));
  console.log(`Fetched (visible listing): ${total}`);
  console.log(`  OK (still up):           ${ok}  (${pct(ok)}%)`);
  console.log(`  Removed (mod/reddit):    ${removed}  (${pct(removed)}%)`);
  console.log(`  Self-deleted:            ${selfDel}  (${pct(selfDel)}%)`);
  if (other) console.log(`  Other/unknown:           ${other}  (${pct(other)}%)`);
  console.log(`  Remove rate (mod only):  ${pct(removed)}%`);
  console.log(`  Remove+delete rate:      ${pct(removed + selfDel)}%`);
  console.log("-".repeat(56));
  console.log(
    "Caveat: items fully purged from your profile listing are NOT counted."
  );
  console.log("True removal rate can be higher than shown.");
  return { total, counts, removed, selfDel, ok, removeRate: total ? removed / total : 0 };
}

async function main() {
  console.log(`Auditing u/${user} (max ${MAX} per kind, kind=${kind})…`);
  const report = {
    user,
    fetchedAt: new Date().toISOString(),
    kind,
    max: MAX,
    comments: null,
    posts: null,
    items: [],
  };

  if (kind === "comments" || kind === "both") {
    const raw = await fetchListing("comments");
    const rows = raw.map(classifyComment);
    report.comments = summarize(rows, "COMMENTS");
    report.items.push(...rows.filter((r) => r.status !== "ok"));
  }

  if (kind === "submitted" || kind === "both") {
    const raw = await fetchListing("submitted");
    const rows = raw.map(classifySubmission);
    report.posts = summarize(rows, "POSTS (submitted)");
    report.items.push(...rows.filter((r) => r.status !== "ok"));
  }

  // by subreddit removed
  const removedItems = report.items.filter((i) => i.status === "removed");
  if (removedItems.length) {
    const bySub = {};
    for (const r of removedItems) {
      bySub[r.subreddit] = (bySub[r.subreddit] || 0) + 1;
    }
    console.log("\nRemoved by subreddit:");
    Object.entries(bySub)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([sub, n]) => console.log(`  r/${sub}: ${n}`));
  }

  const outDir = path.join(process.cwd(), "logs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `reddit-audit-${user}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
