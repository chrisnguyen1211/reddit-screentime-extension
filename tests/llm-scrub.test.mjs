import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadLlmPure } from "./helpers/load.mjs";

const { scrub } = loadLlmPure();

describe("scrub() — AI tells & openers", () => {
  it("strips wrapping and internal double quotes", () => {
    assert.equal(scrub('"hello world"'), "Hello world");
    assert.equal(scrub('he said "no" to me'), "He said no to me");
  });

  it("replaces em/en dashes with commas", () => {
    const got = scrub("wait — actually no");
    assert.match(got, /Wait,\s*actually no/);
    assert.ok(!/[—–]/.test(got), got);
  });

  it("strips great question / hope this helps", () => {
    assert.equal(scrub("Great question. try again later"), "Try again later");
    assert.equal(scrub("just ship it. Hope this helps!"), "Just ship it.");
  });

  it("strips oof yeah / yeah openers", () => {
    assert.equal(scrub("oof yeah that stings"), "That stings");
    assert.equal(scrub("yeah, mods suck"), "Mods suck");
    assert.equal(scrub("oof, rough day"), "Rough day");
  });

  it("strips honestly opener (quote-back bot pattern)", () => {
    const got = scrub(
      "honestly 7 rounds for something thats not even a promotion is wild, thats the real story here"
    );
    assert.ok(!/^honestly/i.test(got), got);
    assert.match(got, /^7 rounds/i);
  });

  it("keeps real content starting with same boat", () => {
    assert.equal(scrub("same boat tbh :)"), "Same boat tbh :)");
  });

  it("strips hollow this./same. openers only", () => {
    assert.equal(scrub("same."), "");
    assert.equal(scrub("this."), "");
    assert.equal(scrub("this is so true I dropped out"), "I dropped out");
  });

  it("preserves ASCII emoticons", () => {
    assert.match(scrub("that sucks :/"), /:\//);
    assert.match(scrub("nice one :)"), /:\)/);
  });

  it("converts word/word slashes to or", () => {
    assert.match(scrub("founders/marketers win"), /founders or marketers/i);
  });

  it("keeps contractions with apostrophe", () => {
    assert.match(scrub("don't skip this"), /don't|Dont/i);
  });
});

describe("scrub() — sentence casing", () => {
  it("capitalizes first letter", () => {
    assert.match(scrub("hello there"), /^H/);
  });

  it("capitalizes after . ? !", () => {
    const got = scrub("that stings. id start tracking. wait what?");
    assert.match(got, /\. Id /);
    // trailing ? may leave end without following letter
    assert.ok(!/\.\s+[a-z]/.test(got), got);
  });

  it("handles multi-sentence manager example", () => {
    const got = scrub(
      "that manager going cold is the tell. internal pick was probably locked."
    );
    assert.match(got, /^That /);
    assert.match(got, /\. Internal /);
  });
});
