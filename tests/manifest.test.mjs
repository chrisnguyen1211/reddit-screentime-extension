import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rootPath, readSrc } from "./helpers/load.mjs";

describe("manifest.json", () => {
  const manifest = JSON.parse(fs.readFileSync(rootPath("manifest.json"), "utf8"));

  it("is MV3 with expected name", () => {
    assert.equal(manifest.manifest_version, 3);
    assert.match(manifest.name, /Reddit Growth Lab/i);
  });

  it("lists all content scripts that exist on disk", () => {
    const scripts = manifest.content_scripts[0].js;
    assert.ok(scripts.length >= 7);
    for (const rel of scripts) {
      assert.ok(fs.existsSync(rootPath(rel)), `missing ${rel}`);
    }
  });

  it("lists CSS files that exist", () => {
    for (const rel of manifest.content_scripts[0].css) {
      assert.ok(fs.existsSync(rootPath(rel)), `missing ${rel}`);
    }
  });

  it("has background service worker", () => {
    assert.ok(manifest.background?.service_worker);
    assert.ok(fs.existsSync(rootPath(manifest.background.service_worker)));
  });

  it("content script order: shared → overlay → ban → dist → auto → assist → comment → orch", () => {
    const js = manifest.content_scripts[0].js.join(" ");
    const order = [
      "00-shared",
      "05-overlay",
      "08-ban-guard",
      "12-distribution",
      "10-automation",
      "20-assist-ui",
      "30-auto-comment",
      "40-orchestrator",
    ];
    let last = -1;
    for (const name of order) {
      const idx = js.indexOf(name);
      assert.ok(idx > last, `${name} out of order`);
      last = idx;
    }
  });

  it("permissions include storage", () => {
    assert.ok(manifest.permissions.includes("storage"));
  });
});

describe("CSS integrity", () => {
  it("mascot has required fixed positioning rules", () => {
    const css = readSrc("content.css");
    assert.match(css, /\.rch-mascot\s*\{/);
    assert.match(css, /position:\s*fixed/);
    assert.match(css, /z-index:\s*2147483646|z-index:\s*2147483001/);
    // no orphaned property block (property without selector) after rch-has-bubble
    assert.ok(
      !/\.rch-mascot\.rch-has-bubble[^{]*\{[^}]*\}\s*width:\s*92px/.test(css),
      "orphaned width block after has-bubble should be fixed"
    );
  });

  it("bubble has background styling on .rch-bubble selector", () => {
    const css = readSrc("content.css");
    assert.match(css, /\.rch-bubble\s*\{[^}]*background:\s*#1b1b1f/s);
  });
});

describe("background wiring", () => {
  it("background.js imports or loads llm module", () => {
    const bg = readSrc("background.js");
    // either importScripts or inline re-export
    assert.ok(
      /background-llm|importScripts|generate/.test(bg),
      "background should wire LLM"
    );
  });
});
