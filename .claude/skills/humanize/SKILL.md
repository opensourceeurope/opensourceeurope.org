---
name: humanize
description: Use to make drafted text read like a person wrote it instead of an AI. Invoke when asked to "humanize this", "make this sound less like AI" or "does this read like a bot wrote it", and as the final pass over new or rewritten docs pages, pull request descriptions and review comments before they are shown or posted.
---

# Humanize

Rewrites drafted text to remove the signs of AI writing, then reports what it changed. The docs-authoring skill runs it over every new sentence in the OSE docs.

This is an adapted copy of the humanize skill in the Cennso `ai-docs` project. That version defers several tells to the Cennso writing guidelines. This one states those rules itself, because OSE has no separate style guide.

Read `references/tells.md` before every run. It lists the tells, how to detect each one, and a before and after example.

## When to run

- On demand, when someone asks you to humanize a piece of text.
- As the final pass over a new or rewritten docs page, a pull request description or a review comment, before you show, write or post it.

## The loop

1. Read `references/tells.md`.
2. Check the drafted text against every tell. For each hit, note the tell, the span and the rewrite.
3. Apply the rewrites.
4. Show the verdict (below), then pass the humanized text on to the next step: show the draft, write the file or post the comment.

If no tell fires, the verdict is `Humanizer: clean` and the text passes through unchanged.

## Verdict format

Show the verdict in the conversation. Never post it to GitHub or write it into a file. Write one line for each tell caught, with the span and the rewrite. Name the text you checked when you checked more than one.

```text
Humanizer: 3 tells caught
- Negative parallelism: "not just a host, it is a partner" -> "OSE hosts your project and also advises you"
- Buzzword cluster: "leverage / seamless" -> "use / simple"
- Em-dash: rewrote the dashed clause as two sentences

Clean: pull request description (no tells)
```

## Rules

- Write for the least fluent reader. The OSE docs reach project maintainers across Europe, many of whom read English as a second or third language. Plain words beat precise-sounding ones.
- Do not change the meaning. A humanized sentence says the same thing in plainer words. If a rewrite would drop information, keep the information and change only the wording. Never add a claim that was not in the original.
- Leave quoted text alone: legal text, the terms of hosting and text quoted from another organisation keep their wording.
- These instructions follow their own catalog: plain English, no em-dashes, no Latin abbreviations.
