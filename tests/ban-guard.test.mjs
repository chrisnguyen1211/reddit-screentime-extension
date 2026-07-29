import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadBanGuardMath, readSrc } from "./helpers/load.mjs";

const { promoShare, riskBand } = loadBanGuardMath();

describe("ban-guard promo ratio math", () => {
  it("all organic → 0 promo share", () => {
    const r = promoShare([
      { type: "comment", promo: false },
      { type: "upvote" },
      { type: "upvote" },
    ]);
    assert.equal(r.promoActs, 0);
    assert.equal(r.valueActs, 3);
    assert.equal(r.promoShare, 0);
    assert.equal(riskBand(r.promoShare), "none");
  });

  it("heavy seed → high promo share", () => {
    const r = promoShare([
      { type: "seed_comment", promo: true },
      { type: "seed_comment", promo: true },
      { type: "comment", promo: false },
    ]);
    // 1 organic comment + 0 upvotes = 1 value; 2 seeds = 2 promo
    assert.equal(r.promoActs, 2);
    assert.equal(r.valueActs, 1);
    assert.ok(r.promoShare > 0.5);
    assert.equal(riskBand(r.promoShare), "high");
  });

  it("9:1 style mix stays low", () => {
    const events = [];
    for (let i = 0; i < 9; i++) events.push({ type: "upvote" });
    events.push({ type: "seed_comment", promo: true });
    const r = promoShare(events);
    assert.equal(r.valueActs, 9);
    assert.equal(r.promoActs, 1);
    assert.ok(Math.abs(r.ratioValuePerPromo - 9) < 0.01);
    assert.equal(riskBand(r.promoShare), "low");
  });
});

describe("ban-guard source", () => {
  it("implements compute and 9:1 proxy", () => {
    const src = readSrc("content/08-ban-guard.js");
    assert.match(src, /function compute/);
    assert.match(src, /promoShare|valueActs|9:1|ratio/i);
    assert.match(src, /blockComment|blockSeed/);
  });
});
