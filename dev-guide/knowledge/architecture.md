# Architecture

There is **one core product — the documentation MCP server** — and an **optional public chat**
layered on top. The RAG (retrieval) lives entirely in the MCP; answer *generation* is done by
whatever LLM the consumer brings. The chat on opensourceeurope.org is just one such consumer that we host.

## Components

| Component | Path | Role |
|---|---|---|
| **OpenCrane MCP server** | `.opencrane/` | The RAG. Indexes the OSE docs into Milvus Lite and exposes the `search_docs` tool over MCP. Shipped two ways: a public Scaleway container, **and** the `ose-knowledge-mcp` PyPI package (runs locally via `uvx`). |
| **Claude plugin** | `plugins/ose-knowledge/` | Registers the MCP + an `ose-researcher` agent for Claude Code. |
| **Chat** *(optional)* | `/ask/` and the Ask panel on the site (`src/pages/`, `src/components/chat/`, `src/scripts/chat/`) + `functions/chat/` | The `/ask/` page and the slide-out panel are part of the static site (Scaleway Object Storage). They call a stateless function (Scaleway Serverless container) that runs the agent loop with EU-hosted inference (Mistral Medium on Scaleway Generative APIs). **The only part that calls an LLM or holds a key.** |

Two ways to consume the knowledge base, below.

## Flow 1 — Public chat on the site

We provide the model (Mistral Medium on Scaleway, EU) and the orchestration, so a visitor needs **zero setup**.
Everything in the request path is EU-hosted (sovereign).

```mermaid
sequenceDiagram
    actor User
    participant UI as /ask/ page and Ask panel<br/>opensourceeurope.org, Scaleway Object Storage
    participant Fn as Chat function<br/>Scaleway Serverless, holds inference key
    participant LLM as Scaleway Generative APIs · EU<br/>mistral-medium-3.5
    participant MCP as OSE MCP<br/>Scaleway container
    participant DB as Milvus Lite index

    User->>UI: ask a question
    UI->>Fn: POST {messages, analyticsOptIn}<br/>Accept: text/event-stream
    Fn-->>UI: event: status {searching}
    Fn->>LLM: chat + search_docs tool<br/>(ose-researcher persona)
    LLM-->>Fn: tool call search_docs("…")
    Fn-->>UI: event: status {searching, query}
    Fn->>MCP: search_docs(query)
    MCP->>DB: hybrid vector + keyword search
    DB-->>MCP: matching chunks
    MCP-->>Fn: results (text + sources)
    Fn->>LLM: tool results (streamed call)
    Fn-->>UI: event: status {writing}
    loop as the model writes
        LLM-->>Fn: answer text
        Fn-->>UI: event: delta {text}
    end
    Fn-->>UI: event: done {answer, citations, unanswered, followups}
    UI-->>User: answer + citation chips<br/>+ follow-up question chips
```

The loop (tool call → MCP → results → continue) can repeat up to `MAX_TOOL_ROUNDS`. The browser
asks for Server-Sent Events: the status line in the chat follows the `status` events, the answer
text appears as plain text while it streams, and `done` replaces it with the cleaned, rendered
answer and its citations. A request without `Accept: text/event-stream` gets one JSON response
with the same object as `done`, and the browser reads that too (see
[`functions/chat/README.md`](../../functions/chat/README.md), "Streaming"). The function
holds the inference key, enforces the origin allowlist, and builds each citation from the
`search_docs` result — linking to the exact section (`source_url#section_anchor`) when opencrane
supplies one, else the page.
Nothing is persisted. Only when the visitor accepted analytics in the site's consent banner, the chat logs to Scaleway Cockpit the answer details and, when the visitor closes the panel or leaves the page, a summary of what was asked and answered without personal data.

## Flow 2 — Your own agent (local or any MCP client)

You bring your own model and client; you consume **only** the `search_docs` retrieval tool.
**No hosted model, no chat function, no website involved.**

```mermaid
flowchart LR
    subgraph yours["Your machine / your AI client"]
        client["AI client<br/>Claude Code · Cursor · Claude Desktop · any MCP client"]
        model["Your LLM<br/>(you bring this)"]
        client <--> model
    end

    subgraph mcpopts["OSE MCP — pick one"]
        local["Local<br/>uvx ose-knowledge-mcp<br/>(PyPI, stdio)"]
        hosted["Hosted<br/>Scaleway container<br/>public HTTPS /http"]
    end

    DB[(Milvus Lite index)]
    plugin["Claude plugin 'ose-knowledge'<br/>MCP config + ose-researcher agent<br/>+ ask-about-ose skill"]

    plugin -. "installs / configures" .-> client
    client -- "search_docs" --> local
    client -- "search_docs" --> hosted
    local --> DB
    hosted --> DB
    model -. "generates the cited answer" .-> client
```

The Claude plugin is just a convenience that pre-wires the MCP connection and ships the
`ose-researcher` persona; pointing any MCP client at `uvx ose-knowledge-mcp` (local) or the
hosted endpoint works the same way.

## Why it's split this way

- **Retrieval vs generation.** The MCP only *retrieves* (`search_docs` over Milvus). Generating a
  cited answer needs an LLM + a tool-calling loop — that runs in the consumer (the chat function,
  or your own agent), never in the MCP.
- **The chat function is thin and optional.** It exists only because a *public, static* website
  cannot hold an API key or run the agent loop itself. Drop `functions/chat/` and the chat UI and the product
  is still complete: MCP + plugin + PyPI package.
- **One release run ships everything:** merging the release PR runs `release.yml`, which in the
  same run publishes the `ose-knowledge-mcp` PyPI package, deploys the hosted MCP container, and
  deploys the chat function, the contact function and the site. Each is a downstream job gated on
  release-please's `releases_created` output. The site deploy waits for the PyPI publish, so `/ask/`
  never shows a package version that PyPI lacks. `deploy-chat-function.yml`, `deploy-function.yml`
  and `deploy-site.yml` are reusable workflows that can also be run on their own with
  `workflow_dispatch`.
