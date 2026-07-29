import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadExtractContent } from "./helpers/load.mjs";

const { extractContent } = loadExtractContent();

describe("extractContent() — 9router / OpenAI payloads", () => {
  it("parses non-stream JSON completion", () => {
    const payload = JSON.stringify({
      choices: [{ message: { content: "that makes sense tbh :)" } }],
    });
    const got = extractContent(payload);
    assert.match(got, /That makes sense/i);
  });

  it("parses SSE stream chunks", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"hello "}}]}',
      'data: {"choices":[{"delta":{"content":"world"}}]}',
      "data: [DONE]",
    ].join("\n");
    const got = extractContent(sse);
    assert.match(got, /Hello world/i);
  });

  it("strips think blocks", () => {
    const payload = JSON.stringify({
      choices: [
        {
          message: {
            content: "<think>secret plan</think>real comment here",
          },
        },
      ],
    });
    const got = extractContent(payload);
    assert.ok(!/secret plan/i.test(got), got);
    assert.match(got, /Real comment here/i);
  });
});
