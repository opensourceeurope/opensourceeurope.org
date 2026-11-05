import { createServer } from "node:http";
import { handleChat, handleChatStream, PROMPT_VERSION, type Env } from "./handler.js";
import { wantsEventStream } from "./stream.js";
import { isOriginAllowed } from "./origin.js";
import { handleSummary, isSummaryRequest } from "./summary.js";

const env = process.env as unknown as Env;
const allowed = process.env.ALLOWED_ORIGINS || "*";
// Generous cap for 12 chat turns; the handler trims history anyway.
const MAX_BODY_BYTES = 128 * 1024;

function cors(res: any, origin: string | undefined) {
  if (allowed === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && isOriginAllowed(origin, allowed)) {
    // Echo only an allowlisted origin; disallowed origins get no ACAO header.
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  // The response is JSON or an event stream, depending on Accept.
  const vary = res.getHeader("Vary");
  res.setHeader("Vary", vary ? `${vary}, Accept` : "Accept");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  if (req.method !== "POST") { res.writeHead(405).end(); return; }
  // Enforce the allowlist server-side, not only via CORS headers — CORS by
  // itself never blocks a request, it only limits what cross-origin JS can
  // read. Note: non-browser clients can forge the Origin header, so this stops
  // all browser-based abuse and casual scripts; platform-level rate limiting
  // remains the backstop against determined direct callers (see docs/knowledge/deploy-chat.md).
  if (!isOriginAllowed(origin, allowed)) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "origin_not_allowed" }));
    return;
  }
  let data = "";
  let size = 0;
  let tooLarge = false;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY_BYTES) {
      if (!tooLarge) {
        tooLarge = true;
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "payload_too_large" }));
        req.destroy();
      }
      return;
    }
    data += c;
  });
  req.on("end", async () => {
    if (tooLarge) return;
    let body: unknown;
    try {
      body = JSON.parse(data || "{}");
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad_request" }));
      return;
    }
    // The summary the browser sends when the visitor leaves (fetch keepalive,
    // as text/plain, so no preflight request). Its reply is never read.
    if (isSummaryRequest(body)) {
      try {
        const out = await handleSummary(body, env, PROMPT_VERSION);
        if (out.json) res.writeHead(out.status, { "content-type": "application/json" }).end(JSON.stringify(out.json));
        else res.writeHead(out.status).end();
      } catch (e: any) {
        console.error("summary_error", e?.name ?? "Error");
        res.writeHead(204).end();
      }
      return;
    }
    if (wantsEventStream(req.headers.accept)) {
      // SSE: the origin check and the CORS headers above apply as for JSON.
      // X-Accel-Buffering asks proxies not to buffer the stream.
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
      });
      res.flushHeaders();
      // The client went away: stop the agent, the search and the model call.
      const abort = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) abort.abort();
      });
      await handleChatStream(body as any, env, (chunk) => void res.write(chunk), { signal: abort.signal });
      if (!res.writableEnded) res.end();
      return;
    }
    try {
      const out = await handleChat(body as any, env);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.json));
    } catch (e: any) {
      // Log detail server-side only; never echo internals to the client.
      // Only the error name and the code: a message may echo the request.
      console.error("chat_error", e?.name ?? "Error", "error");
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "error" }));
    }
  });
});
const port = parseInt(process.env.PORT || "8080", 10);
server.listen(port, () => console.log(`ose-chat-function on :${port}`));
