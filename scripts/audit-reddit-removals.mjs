#!/usr/bin/env node
/**
 * Audit Reddit user comment/post history for removed/deleted rates.
 *
 * ── Recommended (avoids 403): dump JSON from logged-in browser ──
 *
 *   1. Login reddit.com in Chrome
 *   2. Open (replace USER):
 *        https://www.reddit.com/user/USER/comments.json?limit=100
 *      Save page as:  logs/comments-1.json  (or Cmd+S → Page Source)
 *   3. For more pages, add &after=t1_XXXX from previous JSON "after" field
 *   4. Same for posts:
 *        https://www.reddit.com/user/USER/submitted.json?limit=100
 *
 *   node scripts/audit-reddit-removals.mjs USER \
 *     --comments-file=logs/comments-1.json \
 *     --posts-file=logs/posts-1.json
 *
 *   # or a folder of dumps:
 *   node scripts/audit-reddit-removals.mjs USER --dir=logs/reddit-dumps
 *
 * ── Live fetch (often 403 without cookie) ──
 *
 *   export REDDIT_COOKIE='reddit_session=...; token_v2=...'
 *   node scripts/audit-reddit-removals.mjs USER --kind=both --max=500
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const user = (args.find((a) => !a.startsWith("--")) || "").replace(/^u\//, "");
const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const kind = (get("kind") || "both").toLowerCase();
const MAX = Math.min(2000, Math.max(25, Number(get("max")) || 500));
const commentsFile = get("comments-file");
const postsFile = get("posts-file");
const dir = get("dir");
const cookieFile = get("cookie-file");

if (!user && !commentsFile && !postsFile && !dir) {
  console.error(`Usage:
  # Browser dump (recommended — no 403):
  node scripts/audit-reddit-removals.mjs USER --comments-file=c.json --posts-file=p.json
  node scripts/audit-reddit-removals.mjs USER --dir=logs/dumps

  # Live API:
  export REDDIT_COOKIE='...'
  node scripts/audit-reddit-removals.mjs USER --kind=both --max=500
`);
  process.exit(1);
}

const UA =
  process.env.REDDIT_UA ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function loadCookie() {
  if (process.env.REDDIT_COOKIE) return process.env.REDDIT_COOKIE;
  if (cookieFile && fs.existsSync(cookieFile)) {
    const raw = fs.readFileSync(cookieFile, "utf8").trim();
    // Netscape cookie file → Cookie header
    if (raw.includes("\t") && raw.includes("reddit.com")) {
      const parts = [];
      for (const line of raw.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const cols = line.split("\t");
        if (cols.length >= 7) parts.push(`${cols[5]}=${cols[6]}`);
      }
      return parts.join("; ");
    }
    return raw.replace(/\n/g, "; ");
  }
  return "";
}

const COOKIE = loadCookie();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const headers = {
    "User-Agent": UA,
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (COOKIE) headers.Cookie = COOKIE;
  const res = await fetch(url, { headers });
  if (res.status === 429) {
    console.warn("Rate limited — waiting 10s…");
    await sleep(10000);
    return fetchJson(url);
  }
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        `HTTP 403 blocked by Reddit (live fetch).\n\n` +
          `Dùng cách browser dump (khuyến nghị):\n` +
          `  1) Login Chrome → mở:\n` +
          `     https://www.reddit.com/user/${user}/comments.json?limit=100\n` +
          `  2) Cmd+S lưu file JSON (vd logs/c1.json)\n` +
          `  3) node scripts/audit-reddit-removals.mjs ${user} --comments-file=logs/c1.json\n\n` +
          `Hoặc cookie:\n` +
          `  export REDDIT_COOKIE='reddit_session=...; token_v2=...'\n` +
          `  node scripts/audit-reddit-removals.mjs ${user}\n`
      );
    }
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url}\n${t.slice(0, 200)}`);
  }
  return res.json();
}

/** Parse Reddit listing JSON or array of listings / children */
function extractDataItems(json) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    // classic listing
    if (Array.isArray(node?.data?.children)) {
      for (const c of node.data.children) {
        if (c?.data) out.push(c.data);
      }
      return;
    }
    // already a thing data object
    if (node.body !== undefined || node.title !== undefined || node.name?.startsWith?.("t1_") || node.name?.startsWith?.("t3_")) {
      out.push(node);
      return;
    }
    if (node.data && (node.data.body !== undefined || node.data.title !== undefined)) {
      out.push(node.data);
    }
  };
  visit(json);
  return out;
}

function loadItemsFromFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  // strip HTML wrapper if user saved full page by mistake
  let text = raw.trim();
  if (text.startsWith("<")) {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`${file}: looks like HTML, not JSON. Save as JSON (open .json URL, Cmd+S).`);
    text = m[0];
  }
  const json = JSON.parse(text);
  return extractDataItems(json);
}

function loadFromDir(d) {
  const files = fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(d, f));
  const comments = [];
  const posts = [];
  for (const f of files) {
    const items = loadItemsFromFile(f);
    for (const it of items) {
      if (it.body !== undefined || (it.name && String(it.name).startsWith("t1_"))) comments.push(it);
      else if (it.title !== undefined || (it.name && String(it.name).startsWith("t3_"))) posts.push(it);
    }
  }
  return { comments, posts };
}

async function fetchListing(which) {
  const items = [];
  let after = null;
  let pages = 0;
  while (items.length < MAX && pages < 50) {
    const qs = new URLSearchParams({ limit: "100", raw_json: "1" });
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
    await sleep(700);
  }
  process.stderr.write("\n");
  return items;
}

function classifyComment(d) {
  const body = (d.body || "").trim();
  const author = d.author || "";
  const removedByCategory = d.removed_by_category;
  const spam = d.spam === true;
  const banned = d.banned_by != null;

  let status = "ok";
  if (author === "[deleted]" && (body === "[removed]" || body === "[deleted]"))
    status = "deleted_account_or_content";
  else if (body === "[removed]" || removedByCategory === "moderator" || removedByCategory === "reddit")
    status = "removed";
  else if (body === "[deleted]" || removedByCategory === "deleted") status = "self_deleted";
  else if (spam || banned) status = "removed";

  return {
    id: d.name || d.id,
    type: "comment",
    subreddit: d.subreddit,
    created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
    score: d.score,
    bodyPreview: body.slice(0, 160),
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
  if (d.removed === true && status === "ok") status = "removed";

  return {
    id: d.name || d.id,
    type: "post",
    subreddit: d.subreddit,
    created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
    score: d.score,
    title: title.slice(0, 160),
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
  console.log(`${label} — u/${user || "?"}`);
  console.log("=".repeat(56));
  console.log(`Fetched (visible listing): ${total}`);
  console.log(`  OK (still up):           ${ok}  (${pct(ok)}%)`);
  console.log(`  Removed (mod/reddit):    ${removed}  (${pct(removed)}%)`);
  console.log(`  Self-deleted:            ${selfDel}  (${pct(selfDel)}%)`);
  if (other) console.log(`  Other/unknown:           ${other}  (${pct(other)}%)`);
  console.log(`  ★ Remove rate (mod):     ${pct(removed)}%`);
  console.log(`  ★ Remove+delete rate:    ${pct(removed + selfDel)}%`);
  console.log("-".repeat(56));
  console.log("Caveat: items purged from listing are NOT counted (true rate ≥ shown).");
  return { total, counts, removed, selfDel, ok, removeRate: total ? removed / total : 0 };
}

function dedupe(items) {
  const m = new Map();
  for (const it of items) {
    const id = it.name || it.id;
    if (id) m.set(id, it);
    else m.set(JSON.stringify(it).slice(0, 80), it);
  }
  return [...m.values()];
}

async function main() {
  console.log(`Auditing u/${user || "from-files"} …`);

  let commentRaw = [];
  let postRaw = [];

  if (dir) {
    const loaded = loadFromDir(dir);
    commentRaw = loaded.comments;
    postRaw = loaded.posts;
    console.log(`Loaded from dir ${dir}: ${commentRaw.length} comments, ${postRaw.length} posts`);
  }
  if (commentsFile) {
    commentRaw = commentRaw.concat(loadItemsFromFile(commentsFile));
    console.log(`+ comments file: ${commentsFile}`);
  }
  if (postsFile) {
    postRaw = postRaw.concat(loadItemsFromFile(postsFile));
    console.log(`+ posts file: ${postsFile}`);
  }

  const useLive = !dir && !commentsFile && !postsFile;
  if (useLive) {
    if (!user) throw new Error("username required for live fetch");
    if (kind === "comments" || kind === "both") commentRaw = await fetchListing("comments");
    if (kind === "submitted" || kind === "both") postRaw = await fetchListing("submitted");
  }

  commentRaw = dedupe(commentRaw);
  postRaw = dedupe(postRaw);

  const report = {
    user,
    fetchedAt: new Date().toISOString(),
    source: useLive ? "live" : "files",
    comments: null,
    posts: null,
    removedItems: [],
  };

  if (commentRaw.length || kind === "comments" || (useLive && (kind === "both" || kind === "comments"))) {
    const rows = commentRaw.map(classifyComment);
    if (rows.length) {
      report.comments = summarize(rows, "COMMENTS");
      report.removedItems.push(...rows.filter((r) => r.status === "removed" || r.status === "self_deleted"));
    } else if (useLive) {
      console.log("No comments fetched.");
    }
  }

  if (postRaw.length || kind === "submitted" || (useLive && (kind === "both" || kind === "submitted"))) {
    const rows = postRaw.map(classifySubmission);
    if (rows.length) {
      report.posts = summarize(rows, "POSTS (submitted)");
      report.removedItems.push(...rows.filter((r) => r.status === "removed" || r.status === "self_deleted"));
    } else if (useLive) {
      console.log("No posts fetched.");
    }
  }

  if (!report.comments && !report.posts) {
    console.error("\nNo data. Use browser dump (see error 403 help) or cookie.");
    process.exit(2);
  }

  const removedOnly = report.removedItems.filter((i) => i.status === "removed");
  if (removedOnly.length) {
    const bySub = {};
    for (const r of removedOnly) bySub[r.subreddit] = (bySub[r.subreddit] || 0) + 1;
    console.log("\nRemoved by subreddit:");
    Object.entries(bySub)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .forEach(([sub, n]) => console.log(`  r/${sub}: ${n}`));
  }

  const outDir = path.join(process.cwd(), "logs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `reddit-audit-${user || "dump"}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${outFile}`);
}

main().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
