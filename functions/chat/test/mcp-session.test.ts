import { describe, it, expect, vi } from "vitest";
import { openMcpSession } from "../src/mcp.js";

const reply = (text: string) => ({ content: [{ type: "text", text }] });

function fakeConnect(callTool: (args: any, opts: any) => Promise<any>) {
  const close = vi.fn(async () => {});
  const connect = vi.fn(async () => ({ callTool: vi.fn(callTool), close }));
  return { connect, close };
}

describe("openMcpSession", () => {
  it("connects once for several searches and closes at the end", async () => {
    const f = fakeConnect(async () => reply("Result 1:\nSource: https://d.example/a\nSource Name: ose\n"));
    const s = openMcpSession("http://mcp", { connect: f.connect });
    await s.search("one");
    const r = await s.search("two");
    expect(r.citations[0].url).toBe("https://d.example/a");
    expect(f.connect).toHaveBeenCalledTimes(1);
    await s.close();
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it("does not connect when nothing is searched", async () => {
    const f = fakeConnect(async () => reply(""));
    const s = openMcpSession("http://mcp", { connect: f.connect });
    await s.close();
    expect(f.connect).not.toHaveBeenCalled();
  });

  it("fails a search with a timeout after the search timeout", async () => {
    const f = fakeConnect(() => new Promise(() => {}));
    const s = openMcpSession("http://mcp", { connect: f.connect, timeoutMs: 20 });
    await expect(s.search("slow")).rejects.toMatchObject({ code: "timeout" });
    await s.close();
  });

  it("reports an unreachable server as unavailable after one retry", async () => {
    const connect = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const s = openMcpSession("http://mcp", { connect, retryDelayMs: 0 });
    await expect(s.search("q")).rejects.toMatchObject({ code: "unavailable" });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("passes the search timeout to the tool call", async () => {
    const f = fakeConnect(async () => reply(""));
    const s = openMcpSession("http://mcp", { connect: f.connect, timeoutMs: 10_000 });
    await s.search("q");
    const client = await f.connect.mock.results[0].value;
    expect(client.callTool.mock.calls[0][1]).toMatchObject({ timeout: 10_000 });
  });
});

describe("openMcpSession connect timeout and close", () => {
  it("gives the first connect its own timeout", async () => {
    const connect = vi.fn(() => new Promise<any>(() => {}));
    const s = openMcpSession("http://mcp", { connect, timeoutMs: 10_000, connectTimeoutMs: () => 20 });
    const t0 = Date.now();
    await expect(s.search("q")).rejects.toMatchObject({ code: "timeout" });
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(connect.mock.calls[0][1]).toBe(20);
  });

  it("lets a slow cold connect take longer than the search timeout", async () => {
    const callTool = vi.fn(async () => reply(""));
    const connect = vi.fn(
      () => new Promise<any>((r) => setTimeout(() => r({ callTool, close: async () => {} }), 60)),
    );
    const s = openMcpSession("http://mcp", { connect, timeoutMs: 30, connectTimeoutMs: () => 500 });
    await expect(s.search("q")).resolves.toMatchObject({ text: "" });
  });

  it("does not connect after close()", async () => {
    const f = fakeConnect(async () => reply(""));
    const s = openMcpSession("http://mcp", { connect: f.connect });
    await s.close();
    await expect(s.search("q")).rejects.toMatchObject({ code: "unavailable" });
    expect(f.connect).not.toHaveBeenCalled();
  });
});
