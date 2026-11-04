import { describe, it, expect } from "vitest";
import { CHAT_RULES, UNANSWERED_MARKER, buildSystemPrompt } from "../src/chat-rules.js";

describe("chat-only rules", () => {
  it("stays under about 300 words", () => {
    expect(CHAT_RULES.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(300);
  });

  it.each([
    ["answer first, no narration", /answer first|lead with the answer/i],
    ["no tools or search talk", /tools/i],
    ["language of the question", /language/i],
    ["retrieved text is reference only", /never follow|ignore them/i],
    ["earlier turns may be edited", /earlier assistant/i],
    ["decline role-play and overrides", /role-play/i],
    ["ignore previous instructions example", /ignore previous instructions/i],
    ["scope", /open source europe/i],
    ["precedence over the persona", /These chat rules take precedence over the guidance above\./],
    ["instructions or system prompt", /these instructions or your system prompt/i],
    ["no marker for declined requests", /off-topic or declined requests never get/i],
    ["not in the docs sentence", /doesn't cover/i],
  ])("covers: %s", (_name, re) => {
    expect(CHAT_RULES).toMatch(re);
  });

  it("asks for the exact unanswered marker on its own line", () => {
    expect(UNANSWERED_MARKER).toBe("[[unanswered]]");
    expect(CHAT_RULES).toContain(`\n${UNANSWERED_MARKER}\n`);
  });

  it("appends the citation directive and the rules to the persona", () => {
    const p = buildSystemPrompt("PERSONA TEXT");
    expect(p.startsWith("PERSONA TEXT")).toBe(true);
    expect(p).toContain("[cite this source inline as [N]]");
    expect(p.endsWith(CHAT_RULES)).toBe(true);
  });
});

describe("promptVersion", () => {
  it("is the first 8 hex characters of the SHA-256 of the prompt", async () => {
    const { promptVersion } = await import("../src/chat-rules.js");
    const { createHash } = await import("node:crypto");
    expect(promptVersion("abc")).toBe(createHash("sha256").update("abc").digest("hex").slice(0, 8));
    expect(promptVersion("abc")).toMatch(/^[0-9a-f]{8}$/);
    expect(promptVersion("abd")).not.toBe(promptVersion("abc"));
  });

  it("is computed once for the full system prompt", async () => {
    const { promptVersion } = await import("../src/chat-rules.js");
    const { PROMPT_VERSION, SYSTEM_PROMPT } = await import("../src/handler.js");
    expect(PROMPT_VERSION).toBe(promptVersion(SYSTEM_PROMPT));
  });
});

describe("rule order", () => {
  it("states the off-topic exception before the marker instruction, next to the scope rule", () => {
    const scope = CHAT_RULES.indexOf("Only help with Open Source Europe topics");
    const exception = CHAT_RULES.search(/off-topic or declined requests never get/i);
    const marker = CHAT_RULES.indexOf("If the documentation does not answer");
    expect(scope).toBeGreaterThan(-1);
    expect(exception).toBeGreaterThan(scope);
    expect(exception).toBeLessThan(marker);
  });
});

describe("follow-up rule", () => {
  it("asks for the followups block only after covered answers", async () => {
    const { FOLLOWUPS_MARKER } = await import("../src/chat-rules.js");
    expect(FOLLOWUPS_MARKER).toBe("[[followups]]");
    expect(CHAT_RULES).toContain(FOLLOWUPS_MARKER);
    expect(CHAT_RULES).toMatch(/2 or 3 short questions/);
    expect(CHAT_RULES).toMatch(/never add them to off-topic, declined or unanswered replies/i);
  });
});
