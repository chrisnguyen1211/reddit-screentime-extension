import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadVoteDetect, readSrc } from "./helpers/load.mjs";

const { isVoteControl, mockEl } = loadVoteDetect();

describe("isVoteControl() — never park button next to votes", () => {
  it("detects upvote / downvote aria labels", () => {
    assert.equal(isVoteControl(mockEl({ "aria-label": "Upvote" })), true);
    assert.equal(isVoteControl(mockEl({ "aria-label": "Downvote" })), true);
    assert.equal(isVoteControl(mockEl({ "aria-label": "upvote" })), true);
  });

  it("detects data-testid / click location", () => {
    assert.equal(isVoteControl(mockEl({ "data-testid": "upvote-button" })), true);
    assert.equal(
      isVoteControl(mockEl({ "data-post-click-location": "upvote" })),
      true
    );
  });

  it("does NOT flag Share / Reply / Award / Comment", () => {
    assert.equal(isVoteControl(mockEl({ "aria-label": "Share" })), false);
    assert.equal(isVoteControl(mockEl({ "aria-label": "Reply" })), false);
    assert.equal(isVoteControl(mockEl({ "aria-label": "Give Award" })), false);
    assert.equal(isVoteControl(mockEl({}, "Share")), false);
    assert.equal(isVoteControl(mockEl({}, "Reply")), false);
  });

  it("null-safe", () => {
    assert.equal(isVoteControl(null), false);
    assert.equal(isVoteControl(undefined), false);
  });
});

describe("placement contract in source", () => {
  it("place() stays inside host and uses stable entity keys", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /isVoteControl/);
    assert.match(src, /function entityKey/);
    assert.match(src, /ALWAYS place the trigger row INSIDE the host|INSIDE the host node/i);
    assert.match(src, /data-rch-entity/);
    assert.ok(
      !/faceplate-tracker\[source\*=['\"]post['\"]\]/.test(src),
      "faceplate-tracker post selector must stay removed (multi-button spam)"
    );
  });

  it("never treats more-replies as Reply; only inject visible comments", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /function isMoreRepliesControl/);
    assert.match(src, /more\s\*replies|more\\s\*replies/);
    assert.match(src, /function isCommentEligibleForReplyInject/);
    assert.match(src, /already expanded|more replies/i);
  });

  it("injectComments only on /comments/ pages", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /\/comments\//);
    assert.match(src, /never home\/popular\/sub feed|full post pages/i);
  });

  it("purge strips reply triggers on feed", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /data-rch-kind.*reply|kind === \"reply\"/);
  });
});

describe("isMoreRepliesControl contract (mirrored)", () => {
  function isMoreRepliesControl(bits) {
    return /more\s*replies|view\s*more\s*replies|load\s*more|show\s*more|continue this thread|xem thêm|thêm trả lời|thêm phản hồi|more comments/i.test(
      bits
    );
  }
  it("flags more-replies expanders", () => {
    assert.equal(isMoreRepliesControl("3 more replies"), true);
    assert.equal(isMoreRepliesControl("Continue this thread"), true);
    assert.equal(isMoreRepliesControl("12 more comments"), true);
  });
  it("does not flag real Reply", () => {
    assert.equal(isMoreRepliesControl("Reply"), false);
    assert.equal(isMoreRepliesControl("Share"), false);
  });
});

describe("removed-comment detection contract", () => {
  function isRemovedText(slice) {
    return /comment removed by moderator|removed by moderator|comment deleted by user|deleted by user|\[removed\]|\[deleted\]|this comment was removed|comment has been removed/i.test(
      slice
    );
  }
  it("flags moderator removals", () => {
    assert.equal(isRemovedText("Comment removed by moderator"), true);
    assert.equal(isRemovedText("[removed]"), true);
    assert.equal(isRemovedText("Comment deleted by user"), true);
  });
  it("does not flag normal comments", () => {
    assert.equal(isRemovedText("I removed the old feature and shipped v2"), false);
    assert.equal(isRemovedText("moderator tools are useful"), false);
  });
  it("source exports isRemovedComment and skips inject", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /function isRemovedComment/);
    assert.match(src, /isRemovedComment\(cEl\)/);
    assert.match(src, /Comment removed by moderator/i);
  });
});
