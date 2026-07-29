import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadLlmPure, readSrc } from "./helpers/load.mjs";

const { buildPrompt, subHint, SUB_HINTS, ANTI_AI_STYLE, LENGTHS, VIBES } = loadLlmPure();

describe("subHint()", () => {
  it("maps known subs", () => {
    assert.match(subHint("r/ycombinator"), /YC|startup/i);
    assert.match(subHint("SaaS"), /SaaS|pricing/i);
    assert.match(subHint("r/buildinpublic"), /build/i);
  });

  it("returns empty for unknown", () => {
    assert.equal(subHint("r/totallymadeupsubxyz"), "");
    assert.equal(subHint(""), "");
  });

  it("SUB_HINTS has core founder subs", () => {
    for (const k of ["ycombinator", "saas", "startups", "growthhacking"]) {
      assert.ok(SUB_HINTS[k], `missing hint ${k}`);
    }
  });
});

describe("buildPrompt() — structure & locks", () => {
  const baseCtx = {
    title: "Have any of you dropped out of school and regretted it?",
    body: "in the startup/tech world its often flexed when people dropout",
    subreddit: "r/ycombinator",
    questions: ["Have any of you dropped out of school and regretted it?"],
    lang: "English",
    topComments: ["I dropped out junior year and went back later"],
  };

  it("includes title, body, subreddit", () => {
    const p = buildPrompt({ productContext: "", style: "value_only" }, baseCtx, {
      length: "medium",
      vibe: "story",
    });
    assert.match(p, /dropped out of school/i);
    assert.match(p, /r\/ycombinator/);
    assert.match(p, /startup\/tech|flexed/i);
  });

  it("includes ON-TOPIC and quote-back hard rules", () => {
    const p = buildPrompt({ productContext: "", style: "value_only" }, baseCtx, {
      length: "short",
      vibe: "react",
    });
    assert.match(p, /ON-TOPIC HARD RULES/);
    assert.match(p, /NO QUOTE-BACK|Do NOT quote|quote-back|paraphrase/i);
    assert.match(p, /CASING|Capitalize/i);
  });

  it("includes YC culture hint for r/ycombinator", () => {
    const p = buildPrompt({ productContext: "", style: "value_only" }, baseCtx, {
      length: "medium",
      vibe: "agree",
    });
    assert.match(p, /YC|startup founders/i);
  });

  it("anchors on extracted questions", () => {
    const p = buildPrompt({ productContext: "", style: "value_only" }, baseCtx, {
      length: "medium",
      vibe: "question",
    });
    assert.match(p, /WHAT THEY'RE ACTUALLY ASKING|ANCHOR/i);
    assert.match(p, /dropped out of school and regretted/i);
  });

  it("soft_mention seeding rule when style set", () => {
    const p = buildPrompt(
      { productContext: "Brocaly writing tool", style: "value_only" },
      { ...baseCtx, style: "soft_mention" },
      { length: "long", vibe: "tip" }
    );
    assert.match(p, /SEEDING MODE|soft mention|disclose/i);
  });

  it("value_only forbids product mention", () => {
    const p = buildPrompt({ productContext: "My SaaS", style: "value_only" }, baseCtx, {
      length: "medium",
      vibe: "tip",
    });
    assert.match(p, /Do NOT mention or promote any product/i);
  });

  it("reply mode includes parent comment", () => {
    const p = buildPrompt(
      { productContext: "", style: "value_only" },
      {
        ...baseCtx,
        replyingTo: "I dropped out and it was fine",
        replyAuthor: "alice",
        subReplies: ["same here"],
      },
      { length: "medium", vibe: "agree" }
    );
    assert.match(p, /FOLLOW-UP|replying to/i);
    assert.match(p, /dropped out and it was fine/i);
    assert.match(p, /alice/i);
  });

  it("story vibe forbids unrelated domain analogies", () => {
    assert.match(VIBES.story, /SAME domain|LITERALLY about the same/i);
    assert.match(VIBES.humor, /never a random off-topic/i);
  });

  it("LENGTHS.short does not use oof yeah example", () => {
    assert.ok(!LENGTHS.short.includes("oof yeah"));
  });
});

describe("ANTI_AI_STYLE contract in source", () => {
  it("bans honestly restating facts as opener", () => {
    assert.match(ANTI_AI_STYLE, /honestly/i);
    assert.match(ANTI_AI_STYLE, /7 rounds|quote-back|PARAPHRASE/i);
  });

  it("requires capitalization after sentence ends", () => {
    assert.match(ANTI_AI_STYLE, /CAPITAL|Capitalize/i);
  });

  it("source file still contains scrub honestly strip + sentence casing", () => {
    const src = readSrc("background-llm.js");
    assert.match(src, /\^honestly/);
    assert.match(src, /\[\.!\?\]/);
    assert.match(src, /toUpperCase/);
  });
});
