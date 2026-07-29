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

  it("injectComments only on /comments/ pages; nested still supported", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /\/comments\//);
    assert.match(src, /never home\/popular\/sub feed|ONLY on full post pages|only on full post pages/i);
    assert.match(src, /nested|SHREDDIT-COMMENT including nested|every depth/i);
  });

  it("purge strips reply triggers on feed", () => {
    const src = readSrc("content/20-assist-ui.js");
    assert.match(src, /data-rch-kind.*reply|kind === \"reply\"/);
  });
});
