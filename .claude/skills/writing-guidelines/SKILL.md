---
name: writing-guidelines
description: Use when writing or reviewing any text in this repository that people read, such as a docs page under docs/, page text in src/content/, a blog post, a pull request description, or a code comment. Holds the OSE writing rules for style, grammar, lists, headings, tables, links, callouts, and examples. The humanize skill is the final pass after these rules.
---

# OSE writing guidelines

These are the writing rules for Open Source Europe (OSE). They apply to the docs, the site text, blog posts, pull request descriptions, and code comments. The OSE docs reach maintainers across Europe, and many of them read English as a second or third language. Every rule here serves that reader.

Write the text with these rules, check it against every section, then run the `humanize` skill as the final pass. The `docs-authoring` skill covers the Starlight syntax and the checks that a docs page needs.

Where a topic is not covered here, write it the way the rest of the page does.

## Decisions that are specific to OSE

- Use American spelling: organization, license, program, behavior, center.
- Call the reader "you". Do not write "we", "us", "our", or "let's". Name OSE instead: "OSE pays the expense", not "we pay the expense".
- Use the Oxford comma: "invoices, receipts, and bank statements".
- Use the Starlight callouts `:::note`, `:::tip`, `:::caution` and `:::danger`. See [Callouts](#callouts).
- Leave legal text, the Terms of Service, and quoted text from other organizations in their own wording.

## Structure

- Start with the general idea, then add detail.
- Keep one idea per paragraph and one instruction per sentence.
- Write for the person who uses the page. Keep a detail only if the reader needs it to understand something or to act.
- Order a page as: what it is, why it matters to the reader, how to do it, then its limits and problems.
- Say what works, not what is missing. "There is no way to do X" leaves the reader with nothing. Give the route that works, at the step where the reader needs it.
- Keep one topic per page. When a page is too long to find the essentials, split it.

## Plain English

- Keep instructions to 20 words or fewer per sentence, and descriptions to 25 words or fewer.
- Prefer common words. Leave out idioms, metaphors, and vivid descriptions.
- Use one word for one meaning, and the same word for the same thing on the whole page. If the page says "fiscal host", do not switch to "sponsor" or "host entity".
- Avoid -ing forms where you can. Write "Submit the form", not "Submitting the form".
- Avoid the subjunctive and complicated conditions.
- Write complete sentences. Do not drop words to save space.
- Keep verbs as verbs. Write "review the expense", not "carry out a review of the expense".
- Give the concrete case before its name. Write "one page says 30 days and another says 14", not "an inconsistency".
- Break up chains of nouns. Write "a notification about a failed payment", not "payment failure notification".

## Plain statements, not images

- Say what happens. Do not describe it with a picture or a comparison.
- Do not explain a feature as turning one thing into another. State the result.
- Software and organizations do not want, think, or decide. Write "Open Collective waits until the form is complete", not "Open Collective wants the form complete".
- Do not invent short names for parts of a process. Use the established term, or describe the thing in plain words.

## Grammar and tone

- Use the present simple and the past simple. Use the future rarely, and never promise a future feature or policy.
- Use the active voice. Write "OSE pays the expense", not "The expense is paid".
- Use a semi-formal tone, and the imperative for instructions.
- Avoid an "it" that could point to two things. Repeat the noun instead.
- Follow "this", "these", "that" and "those" with a noun: "this deadline", not "this".
- Common contractions such as "don't" and "it's" are fine in moderation.

## Words to avoid

The following table lists words to replace:

| Avoid | Write |
|---|---|
| e.g. | for example |
| i.e. | that is |
| etc. | a complete list, or "and others" |
| via | through, by |
| vs. | compared to |
| ad hoc | as needed |
| per (meaning "according to") | according to. Keep "per" in rates: "per month" |
| please, remember | nothing. Leave the word out |
| however, nevertheless, although | nothing, or a new sentence |
| simply, just, obviously | nothing. These words assume the reader's level |

## Inclusive language

- Use singular "they" with a plural verb for a person whose gender is unknown: "Ask the treasurer to send their receipt."
- Do not write "he or she" or "(s)he".
- Replace gendered terms. Write "staff" for "manpower", "work hours" for "man-hours", "everyone" for "guys" and "people" for "mankind".

## Names and terms

- Write out an abbreviation the first time it appears on a page: "Open Source Europe (OSE)". Use the short form after that.
- Spell names the way their owners do: GitHub, GitHub Sponsors, Open Collective, LinkedIn.
- Write "Collective", with a capital C, for a project hosted on Open Collective.
- Use the current name of a thing, not an old one.
- Introduce each OSE term with a short description the first time a page uses it. `docs/about/terminology.md` is the authority for OSE terms. When a page and the terminology page disagree, fix the terminology page first.
- Do not write informal shorthand such as "mgmt". Write the full word.
- Do not cite internal ticket numbers or private links. Readers cannot open them. Explain the change on the page itself.
- Keep abbreviations short inside text that the reader copies, such as an example question for the Ask chat. Explain them in the sentence around it.

## Numbers

- Spell out the numbers one to ten: "two ways to apply". Use digits for step numbers: "step 3".
- Use a comma for thousands and a full stop for decimals: "125,000" and "1.5 hours". Do not write "125k".
- Give the conditions for any figure the reader cannot check, such as a processing time.

## Punctuation and capitals

- Use a colon to introduce a list.
- Use brackets only now and then.
- Write titles, headings, and body text in sentence case.
- Do not write words in capitals for emphasis.

## Formatting

- Format the same kind of element the same way on the whole page.
- Use bold only for names on a screen that the reader clicks or reads, such as **Submit expense** or the **Legal name** field.
- Use code font for file names, paths, commands, values, and environment variables.
- Write a plural outside the code font: "`docs.yaml` files", not "`docs.yaml`s".
- Do not format version numbers.
- Do not force a line break inside a sentence with `<br>`.
- Use lists for sets of items, and tables for data that readers compare.
- Use images to explain, not to decorate.

## Lists

- Use a list only for parallel items or for steps. When ideas build on each other, write prose.
- Introduce every list with a lead-in sentence. End it with a colon when the list completes the sentence, or a full stop when the sentence is complete. Do not repeat the heading in it.
- Make each item understandable on its own, because a search result can show one item alone.
- Give every item the same form: all noun phrases, all instructions, or all full sentences.
- Keep one idea per item.
- Do not start two items in a row with the same word.
- Nest one level deep at most. End an item that introduces a sub-list with a colon.
- Punctuate items the same way. Full sentences take a full stop, fragments take none. Never end an item with a comma or a semicolon.
- Start each item with a capital letter, unless the items are names that are always in lower case.
- Turn three or more items in a sentence into a list. Two items can stay in the sentence.

The following rules apply to numbered lists:

- Use a numbered list for steps in order. Give each procedure its own list.
- Start each step with an imperative verb. Do not open a step with a bold summary.
- Write one sentence that says what the step does, then any detail.
- Put the condition before the action: "If you are VAT-registered, add your VAT number."
- Start an optional step with "(Optional)".
- Turn a step into a `###` heading when it needs sub-steps or several paragraphs.
- End a procedure with a sentence that says what the reader sees when it is done.

## Headings

- Write every heading in sentence case, on one line, without bold, code, or italics in the page title.
- Use `##` and `###`. Use `####` only on a dense reference page. Do not skip a level.
- Do not add a generic "Overview" or "Introduction" heading. Start with a specific paragraph.
- Put at least one sentence under each heading before the next heading.
- Keep the articles: "Submit an expense", not "Submit expense".
- Start a task heading with an imperative verb: "Configure the account".
- Do not end a heading with punctuation. FAQ pages can use questions.
- Do not use the same heading twice on a page, because the two get the same anchor.

## Tables

- Introduce every table with a lead-in sentence, never directly under a heading.
- Keep tables short enough that readers do not scroll. Split a long table into several.
- Give every column a header, and fill every cell. Write "none" where there is no value.

## Links

- Put the link on words that say where it goes. Do not paste a bare URL.
- Link to a section with its anchor when that is more useful than the whole page.
- Phrase link sentences the same way, for example "For more information, see [Refunds](…)."
- Keep links few. Too many links make a page harder to read.
- Do not point with "above", "below", "left" or "right", because the layout changes with the screen. Name the section, or write "the previous step" or "the following table".

## Callouts

Use a callout only for information that must stand out. Choose the level by what happens to the reader:

- `:::note` for context the reader can skip.
- `:::tip` for advice that gives a better result.
- `:::caution` for something the reader must do to succeed, or a risk in what they are about to do.
- `:::danger` for something that loses money or data.

Do not use a note for something the reader must act on. Keep the callout under the same heading as the step it belongs to, because search splits pages at headings.

## Tabs

- Use tabs only for parallel versions of the same content, such as instructions per country.
- Make each tab complete on its own. Repeat the conditions and warnings in each tab, because search can show one tab alone.
- Do not use `syncKey`. It writes to `localStorage`, and the site stores nothing but the consent choice.

## Examples and code

- Introduce every code block with a sentence that says what it shows: "The following command starts the server:"
- Give every code block a language tag, such as `bash` or `yaml`.
- Leave out the `$` prompt, and put the output in its own block.
- Write placeholders in capitals inside curly brackets: `{COLLECTIVE_SLUG}`.
- Use `example.com`, `example.org` or a `.example` domain in examples, never a real domain that is not yours.
