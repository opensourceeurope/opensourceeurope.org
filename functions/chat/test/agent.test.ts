import { describe, it, expect, vi } from "vitest";
import { runAgent, FALLBACK_ANSWER, ANSWER_NOW_NOTE, SEARCH_UNAVAILABLE } from "../src/agent.js";

describe("runAgent", () => {
  it("performs a tool call then returns a cited answer", async () => {
    const search = vi.fn(async (q: string) => ({
      text: "Source: https://docs.opencollective.com/open-source-europe\nSource Name: open-source-europe\nOSE is a Belgian association.",
      citations: [{ url: "https://docs.opencollective.com/open-source-europe", source_name: "open-source-europe" }],
    }));
    const mistralChat = vi
      .fn()
      // round 1: ask for a search
      .mockResolvedValueOnce({ content: null, tool_calls: [{ id: "t1", function: { name: "search_docs", arguments: JSON.stringify({ query: "what is OSE" }) } }] })
      // round 2: final answer
      .mockResolvedValueOnce({ content: "Open Source Europe is a Belgian association.", tool_calls: [] });

    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "what is OSE?" }], mistralChat, search });
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith("what is OSE");
    expect(r.answer).toContain("Belgian association");
    expect(r.citations).toEqual([{ url: "https://docs.opencollective.com/open-source-europe", source_name: "open-source-europe" }]);
    expect(r.rounds).toBe(2);
  });

  it("returns directly when no tool call is requested", async () => {
    const search = vi.fn();
    const mistralChat = vi.fn().mockResolvedValueOnce({ content: "Hello!", tool_calls: [] });
    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "hi" }], mistralChat, search, searchFirst: false });
    expect(search).not.toHaveBeenCalled();
    expect(r.answer).toBe("Hello!");
    expect(r.citations).toEqual([]);
  });
});

describe("runAgent forced final answer", () => {
  const toolTurn = (i: number) => ({
    content: null,
    tool_calls: [{ id: `t${i}`, function: { name: "search_docs", arguments: JSON.stringify({ query: `q${i}` }) } }],
  });
  const searchFor = () =>
    vi.fn(async (q: string) => ({
      text: `Result for ${q}`,
      citations: [{ url: `https://docs.example/${q}`, source_name: "ose" }],
    }));

  it("makes a 5th call without tools after 4 tool rounds and uses its text", async () => {
    const search = searchFor();
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce(toolTurn(1))
      .mockResolvedValueOnce(toolTurn(2))
      .mockResolvedValueOnce(toolTurn(3))
      .mockResolvedValueOnce(toolTurn(4))
      .mockResolvedValueOnce({ content: "Here is what the docs say [1].", tool_calls: [] });
    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "q" }], mistralChat, search, maxRounds: 4 });
    expect(mistralChat).toHaveBeenCalledTimes(5);
    expect(search).toHaveBeenCalledTimes(4);
    const [messages, tools, toolChoice] = mistralChat.mock.calls[4];
    expect(toolChoice).toBe("none");
    expect(tools.length).toBe(1);
    // the answer-now note is appended to the last tool result, not sent as a
    // user message straight after it
    const last = messages[messages.length - 1];
    expect(last.role).toBe("tool");
    expect(last.content.endsWith(ANSWER_NOW_NOTE)).toBe(true);
    expect(messages.filter((m: any) => m.role === "user").length).toBe(1);
    expect(r.answer).toBe("Here is what the docs say [1].");
    expect(r.forced).toBe(true);
    expect(r.rounds).toBe(5);
  });

  it("keeps the citations from all rounds", async () => {
    const search = searchFor();
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce(toolTurn(1))
      .mockResolvedValueOnce(toolTurn(2))
      .mockResolvedValueOnce({ content: "Answer.", tool_calls: [] });
    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "q" }], mistralChat, search, maxRounds: 2 });
    expect(r.citations.map((c) => c.url)).toEqual(["https://docs.example/q1", "https://docs.example/q2"]);
  });

  it("falls back to the fixed message when the forced call returns no text", async () => {
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce(toolTurn(1))
      .mockResolvedValueOnce({ content: "", tool_calls: [] });
    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "q" }], mistralChat, search: searchFor(), maxRounds: 1 });
    expect(r.answer).toBe(FALLBACK_ANSWER);
  });

  it("skips the next search and answers when the time budget runs low", async () => {
    const search = searchFor();
    let left = 60_000;
    const mistralChat = vi
      .fn()
      .mockImplementationOnce(async () => toolTurn(1))
      .mockImplementationOnce(async () => {
        left = 5_000; // the budget is now nearly spent
        return toolTurn(2);
      })
      .mockResolvedValueOnce({ content: "Short answer.", tool_calls: [] });
    const r = await runAgent({
      persona: "P",
      userMessages: [{ role: "user", content: "q" }],
      mistralChat,
      search,
      maxRounds: 4,
      timeLeftMs: () => left,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(mistralChat).toHaveBeenCalledTimes(3);
    const [messages, , toolChoice] = mistralChat.mock.calls[2];
    expect(toolChoice).toBe("none");
    // the unanswered tool-call turn is not sent back to the model
    expect(messages.filter((m: any) => m.tool_calls).length).toBe(1);
    expect(r.answer).toBe("Short answer.");
  });

  it("reports progress through onEvent", async () => {
    const events: string[] = [];
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce(toolTurn(1))
      .mockResolvedValueOnce({ content: "Done.", tool_calls: [] });
    await runAgent({
      persona: "P",
      userMessages: [{ role: "user", content: "q" }],
      mistralChat,
      search: searchFor(),
      onEvent: (e) => events.push(e.type),
    });
    expect(events).toEqual(["model_call", "search", "search_done", "model_call", "answer"]);
  });
});

describe("runAgent always searches once", () => {
  it("asks for a tool on the first call and auto on later calls", async () => {
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce({ content: null, tool_calls: [{ id: "t1", function: { name: "search_docs", arguments: '{"query":"x"}' } }] })
      .mockResolvedValueOnce({ content: "Done.", tool_calls: [] });
    const search = vi.fn(async () => ({ text: "r", citations: [] }));
    await runAgent({ persona: "P", userMessages: [{ role: "user", content: "q" }], mistralChat, search });
    expect(mistralChat.mock.calls[0][2]).toBe("required");
    expect(mistralChat.mock.calls[1][2]).toBe("auto");
  });

  it("searches with the question itself when the model answers without searching", async () => {
    const search = vi.fn(async () => ({ text: "Result", citations: [{ url: "https://d.example/a" }] }));
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce({ content: "From memory.", tool_calls: [] })
      .mockResolvedValueOnce({ content: "Grounded [1].", tool_calls: [] });
    const r = await runAgent({
      persona: "P",
      userMessages: [{ role: "user", content: "earlier" }, { role: "assistant", content: "a" }, { role: "user", content: "How do I join?" }],
      mistralChat,
      search,
    });
    expect(search).toHaveBeenCalledWith("How do I join?");
    expect(r.answer).toBe("Grounded [1].");
    expect(r.citations).toEqual([{ url: "https://d.example/a" }]);
    // the model's ungrounded text is not kept; a tool-call turn and its result are
    const sent = mistralChat.mock.calls[1][0];
    expect(sent.some((m: any) => m.content === "From memory.")).toBe(false);
    expect(sent.at(-1).role).toBe("tool");
  });

  it("can be turned off", async () => {
    const search = vi.fn();
    const mistralChat = vi.fn().mockResolvedValueOnce({ content: "Hello!", tool_calls: [] });
    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "hi" }], mistralChat, search, searchFirst: false });
    expect(search).not.toHaveBeenCalled();
    expect(r.answer).toBe("Hello!");
    expect(mistralChat.mock.calls[0][2]).toBe("auto");
  });
});

describe("runAgent search failures", () => {
  const toolTurn = (i: number) => ({
    content: null,
    tool_calls: [{ id: `t${i}`, function: { name: "search_docs", arguments: JSON.stringify({ query: `q${i}` }) } }],
  });

  it("answers from earlier rounds when the search fails in round 3", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ text: "R1", citations: [{ url: "https://d.example/1" }] })
      .mockResolvedValueOnce({ text: "R2", citations: [{ url: "https://d.example/2" }] })
      .mockRejectedValueOnce(new Error("mcp down"));
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce(toolTurn(1))
      .mockResolvedValueOnce(toolTurn(2))
      .mockResolvedValueOnce(toolTurn(3))
      .mockResolvedValueOnce({ content: "From rounds 1 and 2 [1][2].", tool_calls: [] });
    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "q" }], mistralChat, search, maxRounds: 6 });
    expect(r.answer).toBe("From rounds 1 and 2 [1][2].");
    expect(r.searchFailed).toBe(true);
    expect(r.forced).toBe(true);
    expect(r.citations.map((c) => c.url)).toEqual(["https://d.example/1", "https://d.example/2"]);
    expect(mistralChat).toHaveBeenCalledTimes(4);
    const [messages, , toolChoice] = mistralChat.mock.calls[3];
    expect(toolChoice).toBe("none");
    const tools = messages.filter((m: any) => m.role === "tool");
    expect(tools[2].content.startsWith(SEARCH_UNAVAILABLE)).toBe(true);
  });

  it("answers a tool call left in the same turn after a failure without searching again", async () => {
    const search = vi.fn().mockRejectedValue(new Error("down"));
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce({
        content: null,
        tool_calls: [
          { id: "a", function: { name: "search_docs", arguments: '{"query":"x"}' } },
          { id: "b", function: { name: "search_docs", arguments: '{"query":"y"}' } },
        ],
      })
      .mockResolvedValueOnce({ content: "Sorry.", tool_calls: [] });
    await runAgent({ persona: "P", userMessages: [{ role: "user", content: "q" }], mistralChat, search });
    expect(search).toHaveBeenCalledTimes(1);
    const tools = mistralChat.mock.calls[1][0].filter((m: any) => m.role === "tool");
    expect(tools.map((m: any) => m.tool_call_id)).toEqual(["a", "b"]);
  });

  it("reports when the only search was the automatic one", async () => {
    const search = vi.fn(async () => ({ text: "R", citations: [{ url: "https://d.example/a" }] }));
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce({ content: "No search.", tool_calls: [] })
      .mockResolvedValueOnce({ content: "Answer.", tool_calls: [] });
    const r = await runAgent({ persona: "P", userMessages: [{ role: "user", content: "q" }], mistralChat, search });
    expect(r.autoSearchOnly).toBe(true);
  });
});

describe("runAgent question note", () => {
  it("adds the note to the question the model sees, not to the automatic search", async () => {
    const search = vi.fn(async () => ({ text: "Result", citations: [] }));
    const mistralChat = vi
      .fn()
      .mockResolvedValueOnce({ content: "", tool_calls: [] }) // ignores "required": the agent searches itself
      .mockResolvedValueOnce({ content: "Answer.", tool_calls: [] });
    const userMessages = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "Hello." },
      { role: "user" as const, content: "how do I join?" },
    ];
    await runAgent({ persona: "P", userMessages, mistralChat, search, questionNote: "NOTE" });
    expect(search).toHaveBeenCalledWith("how do I join?");
    const [messages] = mistralChat.mock.calls[0];
    expect(messages[3]).toEqual({ role: "user", content: "how do I join?\n\nNOTE" });
    expect(messages[1].content).toBe("hi");
    expect(userMessages[2].content).toBe("how do I join?");
  });
});
