import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPermalinkHelpers, readSrc } from "./helpers/load.mjs";

const { looksLikeRedditId, permalinkCommentId } = loadPermalinkHelpers();

describe("looksLikeRedditId()", () => {
  it("accepts short base36-ish ids", () => {
    assert.equal(looksLikeRedditId("oz39uwt"), true);
    assert.equal(looksLikeRedditId("1v3ibz0"), true);
    assert.equal(looksLikeRedditId("abc1234"), true);
  });

  it("rejects slugs with underscores or hyphens", () => {
    assert.equal(looksLikeRedditId("trying_to_figure_out"), false);
    assert.equal(looksLikeRedditId("my-title"), false);
  });

  it("rejects too short / too long", () => {
    assert.equal(looksLikeRedditId("ab"), false);
    assert.equal(looksLikeRedditId("a".repeat(20)), false);
    assert.equal(looksLikeRedditId(""), false);
  });
});

describe("permalinkCommentId() — notification deep links", () => {
  it("parses /r/sub/comments/POST/slug/COMMENT/", () => {
    assert.equal(
      permalinkCommentId({
        pathname: "/r/SaaS/comments/1v3ibz0/trying_to_figure/oz39uwt/",
      }),
      "oz39uwt"
    );
  });

  it("parses /comments/POST/COMMENT without slug", () => {
    assert.equal(
      permalinkCommentId({ pathname: "/r/SaaS/comments/1v3ibz0/oz39uwt" }),
      "oz39uwt"
    );
  });

  it("does not treat title slug as comment id", () => {
    assert.equal(
      permalinkCommentId({
        pathname: "/r/SaaS/comments/1v3ibz0/trying_to_figure_out_pricing",
      }),
      ""
    );
  });

  it("returns empty for post-only path", () => {
    assert.equal(permalinkCommentId({ pathname: "/r/SaaS/comments/1v3ibz0/" }), "");
    assert.equal(permalinkCommentId({ pathname: "/r/SaaS/" }), "");
  });

  it("parses ?comment=t1_xxx", () => {
    assert.equal(
      permalinkCommentId({
        pathname: "/r/x/comments/1v3ibz0/slug",
        search: "?comment=t1_oz39uwt",
      }),
      "oz39uwt"
    );
  });

  it("parses #t1_ hash", () => {
    assert.equal(
      permalinkCommentId({
        pathname: "/r/x/comments/1v3ibz0/slug",
        hash: "#t1_oz39uwt",
      }),
      "oz39uwt"
    );
  });
});

describe("source sync — assist-ui still defines helpers", () => {
  it("20-assist-ui.js contains looksLikeRedditId and permalinkCommentId", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /function looksLikeRedditId/);
    assert.match(src, /function permalinkCommentId/);
    assert.match(src, /function isVoteControl/);
    assert.match(src, /never between up\/downvote|between up\/down|isVoteControl/i);
  });
});
