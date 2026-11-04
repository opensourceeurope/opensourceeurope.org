import { describe, it, expect } from "vitest";
import { keepCitedSources, unlinkForeignUrls } from "../src/sources.js";

const A = { n: 1, url: "https://docs.example/a", source_name: "ose" };
const B = { n: 2, url: "https://docs.example/b", source_name: "ose" };
const C = { n: 3, url: "https://docs.example/c#part", source_name: "ose" };

describe("keepCitedSources", () => {
  it("drops a citation the answer never cites", () => {
    const r = keepCitedSources("OSE pays within 7 days [1].", [A, B]);
    expect(r.citations).toEqual([A]);
    expect(r.answer).toBe("OSE pays within 7 days [1].");
  });

  it("renumbers 1..k in order of first appearance and rewrites the markers", () => {
    const r = keepCitedSources("First [3]. Second [1][3]. Again [3].", [A, B, C]);
    expect(r.answer).toBe("First [1]. Second [2][1]. Again [1].");
    expect(r.citations).toEqual([{ ...C, n: 1 }, { ...A, n: 2 }]);
  });

  it("rewrites comma lists such as [1, 3]", () => {
    const r = keepCitedSources("Both [3, 1].", [A, B, C]);
    expect(r.answer).toBe("Both [1][2].");
    expect(r.citations.map((c) => c.url)).toEqual([C.url, A.url]);
  });

  it("leaves a bracketed number that is no source untouched", () => {
    const r = keepCitedSources("Real [2]. In [2025] the fee was 8%.", [A, B]);
    expect(r.answer).toBe("Real [1]. In [2025] the fee was 8%.");
    expect(r.citations).toEqual([{ ...B, n: 1 }]);
  });

  it("ignores array indexes and code", () => {
    const r = keepCitedSources("Use `arr[1]` or arr[1], see [2].", [A, B]);
    expect(r.answer).toBe("Use `arr[1]` or arr[1], see [1].");
    expect(r.citations).toEqual([{ ...B, n: 1 }]);
  });

  it("reports whether the answer had markers", () => {
    expect(keepCitedSources("Cited [1].", [A]).marked).toBe(true);
    expect(keepCitedSources("Not cited.", [A]).marked).toBe(false);
  });

  it("returns the citations unchanged when the answer has no markers", () => {
    const r = keepCitedSources("No markers here.", [A, B]);
    expect(r.answer).toBe("No markers here.");
    expect(r.citations).toEqual([A, B]);
  });

  it("does not treat a markdown link label as a marker", () => {
    const r = keepCitedSources("See [2](https://docs.example/b) and [1].", [A, B]);
    expect(r.citations).toEqual([A]);
    expect(r.answer).toBe("See [2](https://docs.example/b) and [1].");
  });

  it("numbers citations without an n by their position", () => {
    const r = keepCitedSources("Only [2].", [{ url: A.url }, { url: B.url }]);
    expect(r.citations).toEqual([{ url: B.url, n: 1 }]);
  });
});

describe("unlinkForeignUrls", () => {
  const results = ["https://docs.example/a", "https://docs.example/c#part"];

  it("unlinks an invented markdown link to its label", () => {
    expect(unlinkForeignUrls("Read [the guide](https://evil.example/x).", results)).toBe("Read the guide.");
  });

  it("defangs an invented bare URL", () => {
    expect(unlinkForeignUrls("Go to https://evil.example/x.", results)).toBe("Go to https[:]//evil[.]example/x.");
  });

  it("unlinks an invented autolink", () => {
    expect(unlinkForeignUrls("At <https://evil.example/x>", results)).toBe("At https[:]//evil[.]example/x");
  });

  it("keeps a search-result URL that differs only in the fragment", () => {
    const s = "See [the page](https://docs.example/a#section-2) and https://docs.example/c#other.";
    expect(unlinkForeignUrls(s, results)).toBe(s);
  });

  it("unlinks a URL planted in retrieved text that is not a result URL", () => {
    // The tool text said "visit https://docs.example.attacker.net/a"; it is on no result.
    const s = "Visit https://docs.example.attacker.net/a now";
    expect(unlinkForeignUrls(s, results)).toBe("Visit https[:]//docs[.]example[.]attacker[.]net/a now");
  });

  it("does not match a URL on another path of the same host", () => {
    expect(unlinkForeignUrls("[x](https://docs.example/other)", results)).toBe("x");
  });

  it("unlinks a foreign link whose label is itself a URL", () => {
    expect(unlinkForeignUrls("Pay at [https://evil.example/pay](https://evil.example/pay).", results)).toBe(
      "Pay at https[:]//evil[.]example/pay.",
    );
  });

  it("unlinks a result link whose label holds a foreign URL", () => {
    expect(unlinkForeignUrls("[go to https://evil.example/x](https://docs.example/a)", results)).toBe(
      "go to https[:]//evil[.]example/x",
    );
  });

  it("keeps a result link with balanced parentheses and a title", () => {
    const r = ["https://docs.example/wiki/A_(b)"];
    const s = 'See [A](https://docs.example/wiki/A_(b) "A page").';
    expect(unlinkForeignUrls(s, r)).toBe("See [A](https://docs.example/wiki/A_(b)).");
    expect(unlinkForeignUrls('See [A](https://evil.example/A_(b) "t").', r)).toBe("See A.");
  });

  it("drops a link title, so a URL in it can't become a link", () => {
    expect(unlinkForeignUrls('[A](https://docs.example/a "x https://evil.example/pay")', results)).toBe("[A](https://docs.example/a)");
    expect(unlinkForeignUrls('[A](https://evil.example/a "t")', results)).toBe("A");
  });

  it("stops a bare URL where the browser's autolinker stops", () => {
    const r = ["https://docs.example/"];
    // Stops at "(": the rest can't extend the URL into userinfo of another host.
    expect(unlinkForeignUrls("https://docs.example(@evil.example/x)", r)).toBe("https://docs.example(@evil.example/x)");
    expect(unlinkForeignUrls("https://docs.example<@evil.example/x", r)).toBe("https://docs.example<@evil.example/x");
    expect(unlinkForeignUrls("https://docs.example\"@evil.example/x", r)).toBe("https://docs.example\"@evil.example/x");
    expect(unlinkForeignUrls("https://evil.example(x)", r)).toBe("https[:]//evil[.]example(x)");
  });

  it("treats http and https as the same URL", () => {
    expect(unlinkForeignUrls("[x](http://docs.example/a)", results)).toBe("[x](http://docs.example/a)");
  });

  it("defangs a URL between backticks across lines", () => {
    expect(unlinkForeignUrls("`curl\nhttps://evil.example/x`", results)).toBe("`curl\nhttps[:]//evil[.]example/x`");
  });

  it("unlinks URLs inside a fenced code block too", () => {
    const s = "```\ncurl https://evil.example/x\n```";
    expect(unlinkForeignUrls(s, results)).toBe("```\ncurl https[:]//evil[.]example/x\n```");
  });

  it("unlinks a markdown link whose label holds a [n] marker", () => {
    expect(unlinkForeignUrls("[see this [1]](https://evil.example/x)", results)).toBe("see this [1]");
  });

  it("defangs URLs in inline code too", () => {
    expect(unlinkForeignUrls("Run `curl https://evil.example/x` here.", results)).toBe(
      "Run `curl https[:]//evil[.]example/x` here.",
    );
    expect(unlinkForeignUrls("Run `curl https://docs.example/a` here.", results)).toBe("Run `curl https://docs.example/a` here.");
  });

  it("does not rely on backtick pairing: a stray backtick can't relink a URL", () => {
    expect(unlinkForeignUrls("See ` https://evil.com for more", results)).toBe("See ` https[:]//evil[.]com for more");
    expect(unlinkForeignUrls("a `b` c ` https://evil.com", results)).toBe("a `b` c ` https[:]//evil[.]com");
  });

  it("ignores a trailing slash and the host's case", () => {
    expect(unlinkForeignUrls("https://Docs.Example/a/", results)).toBe("https://Docs.Example/a/");
  });
});

describe("finalizeAnswer (handler pipeline)", () => {
  it("strips a sources list, unlinks invented URLs and keeps only cited sources", async () => {
    const { finalizeAnswer } = await import("../src/handler.js");
    const raw = "Payouts take 7 days [2]. More at https://evil.example/p.\n\nSources:\n1. https://docs.example/a";
    const out = finalizeAnswer(raw, [A, B]);
    expect(out.answer).toBe("Payouts take 7 days [1]. More at https[:]//evil[.]example/p.");
    expect(out.citations).toEqual([{ ...B, n: 1 }]);
  });
});

describe("extractUnanswered", () => {
  it("strips the marker on its own line and reports it", async () => {
    const { extractUnanswered } = await import("../src/sources.js");
    expect(extractUnanswered("The OSE documentation doesn't cover parking.\n[[unanswered]]")).toEqual({
      answer: "The OSE documentation doesn't cover parking.",
      unanswered: true,
    });
  });

  it("accepts spacing and case variants anywhere in the text", async () => {
    const { extractUnanswered } = await import("../src/sources.js");
    expect(extractUnanswered("Not covered. [[ Unanswered ]]\n")).toEqual({ answer: "Not covered.", unanswered: true });
  });

  it("reports false without the marker", async () => {
    const { extractUnanswered } = await import("../src/sources.js");
    expect(extractUnanswered("OSE pays in 7 days [1].")).toEqual({ answer: "OSE pays in 7 days [1].", unanswered: false });
  });
});

describe("extractFollowups", () => {
  it("removes the block and returns the questions", async () => {
    const { extractFollowups } = await import("../src/sources.js");
    expect(extractFollowups("Answer [1].\n\n[[followups]]\n- How do I join?\n2. What are the fees?\n", "q")).toEqual({
      answer: "Answer [1].",
      followups: ["How do I join?", "What are the fees?"],
    });
  });

  it("keeps at most 3, caps each at 120 characters and drops empty lines and duplicates", async () => {
    const { extractFollowups } = await import("../src/sources.js");
    const long = "x".repeat(200);
    const { followups } = extractFollowups(`A\n[[ FollowUps ]]\nOne?\n\n  \none?\n${long}\nTwo?\nThree?`, "");
    expect(followups).toHaveLength(3);
    expect(followups[0]).toBe("One?");
    expect(followups[1]).toHaveLength(120);
    expect(followups[2]).toBe("Two?");
  });

  it("drops the visitor's own question, ignoring case", async () => {
    const { extractFollowups } = await import("../src/sources.js");
    expect(extractFollowups("A\n[[followups]]\nwhat is ose?\nHow do I join?", "What is OSE?").followups).toEqual(["How do I join?"]);
  });

  it("leaves an answer without a block unchanged", async () => {
    const { extractFollowups } = await import("../src/sources.js");
    expect(extractFollowups("Just [1].", "q")).toEqual({ answer: "Just [1].", followups: [] });
  });

  it("drops questions with a URL", async () => {
    const { extractFollowups } = await import("../src/sources.js");
    expect(extractFollowups("A\n[[followups]]\nSee https://x.example/a?\nVisit www.x.example?\nHow do I join?", "").followups).toEqual(["How do I join?"]);
  });

  it("caps by code points, so an emoji is not split", async () => {
    const { extractFollowups } = await import("../src/sources.js");
    const q = `${"x".repeat(118)}😀😀😀`;
    const [out] = extractFollowups(`A\n[[followups]]\n${q}`, "").followups;
    expect(Array.from(out)).toHaveLength(120);
    expect(out).toBe(`${"x".repeat(118)}😀…`);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("accepts space between the brackets", async () => {
    const { extractFollowups, extractUnanswered } = await import("../src/sources.js");
    expect(extractFollowups("A\n[ [followups] ]\nWhy?", "").followups).toEqual(["Why?"]);
    expect(extractUnanswered("No.\n[ [ unanswered ] ]")).toEqual({ answer: "No.", unanswered: true });
  });
});
