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
  it("place() uses dedicated row and skips vote controls", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /isVoteControl/);
    assert.match(src, /findSafeActionAnchor|fallbackTriggerRow/);
    assert.match(src, /NEVER use a dedicated row|ALWAYS use a dedicated row|below the action bar/i);
    // Must not re-introduce insert next to raw upvote via broad regex in findActionCluster
    assert.ok(
      !/findActionCluster\(host,\s*\/share\|comment\|upvote/.test(src),
      "old upvote-first cluster finder should be gone"
    );
  });

  it("injectComments covers nested shreddit-comment", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /nested shreddit-comment|every depth|SHREDDIT-COMMENT including nested/i);
    assert.match(src, /requestAnimationFrame/);
  });
});
