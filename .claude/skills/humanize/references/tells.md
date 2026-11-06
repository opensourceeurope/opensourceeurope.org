# AI-writing tells

This catalog lists the signals that make text read as machine-generated. `SKILL.md` applies it as a pass over drafted text. Each tell has a detect signal and a before and after rewrite.

The catalog is for documentation and pull request prose. It does not score text or imitate a personal voice.

## 1. Negative parallelism

The "not just X, but Y", "not only A but also B" or "it is not A, it is B" shape. It invents a contrast that the content does not support.

- Detect: "not just", "not only", "it is not ... it is", "this is not about ... it is about".
- Before: "OSE is not just a fiscal host, it is a partner for your project."
- After: "OSE holds your funds and also advises your project."

## 2. AI-buzzword clusters

A cluster of filler words: delve, leverage, robust, seamless, showcase, underscore, foster, streamline, utilize, harness, holistic, tapestry, landscape (in the abstract sense), realm, empower. One use can be fine. Flag the cluster.

- Detect: two or more of these words in nearby sentences, or any one used where a plain verb fits.
- Before: "Leverage our robust platform to seamlessly streamline your expenses."
- After: "Use the Open Collective platform to submit your expenses."

## 3. False significance

Inflated stand-ins for "is" or "has": "stands as", "serves as", "plays a vital role", "a testament to", "marks a pivotal moment", "a cornerstone of".

- Detect: "stands as", "serves as", "plays a (vital|key|crucial) role", "a testament to", "cornerstone", "pivotal".
- Before: "The expense policy serves as a cornerstone of our transparency."
- After: "Every expense is public on the Collective's page."

## 4. Lexical churn

Different names for the same thing in nearby sentences, so one thing gets three names ("the Collective", "your initiative", "the group"). Pick one term and repeat it.

- Detect: the same thing named two or more ways within a few sentences.
- Before: "Your Collective receives the grant. The initiative then submits an expense. The group gets paid within seven days."
- After: "Your Collective receives the grant, then submits an expense to get paid."

## 5. Em-dash

Do not use the em-dash (—). An aside in dashes is a habit, and text full of them reads as machine written. Leave em-dashes in `CHANGELOG.md` and in quoted text.

Replace each one with the mark that fits the sentence, and vary the choice. A period or a comma usually works. A colon fits when the second half explains the first. Brackets fit a true aside.

- Detect: the em-dash character anywhere in drafted text.
- Before: "Prepare the receipt first [em-dash] a bank statement is not enough [em-dash] then submit the expense."
- After: "Prepare the receipt first, because a bank statement is not enough. Then submit the expense."

## 6. Rule-of-three padding

Three items in a row that add rhythm, not content ("transparent, simple and efficient"), and lists of abstract nouns ("trust, openness and community").

- Detect: three adjectives or abstract nouns in a row that repeat one idea.
- Before: "A transparent, simple and efficient expense process."
- After: "An expense process where every payment is public."

## 7. Hedge and filler openers

Phrases that delay the point: "it is important to note that", "it goes without saying", "in today's world", "when it comes to", "at the end of the day".

- Detect: a sentence that opens with one of these before its claim.
- Before: "It is important to note that a bank statement is not a receipt."
- After: "A bank statement is not a receipt."

## 8. Label-colon pseudo-framework

Plain observations packed into invented "Label: description" pairs, so the text looks like a framework when sentences would do. A real, named process is fine.

- Detect: two or more invented "Term: explanation" pairs in a row.
- Before: "Safety: OSE reviews every expense. Clarity: the status is public."
- After: "OSE reviews every expense and shows its status on the Collective's page."

## 9. Self-posed question and reveal

Suspense built with "Why? Because ...", "The answer is simple:", "Here's the thing:" or a question used as a transition.

- Detect: a question or setup phrase whose only job is to introduce the next sentence.
- Before: "Why does this matter? Because a bank statement is not a valid receipt."
- After: "This matters because a bank statement is not a valid receipt."

## 10. Uniform rhythm and stacked fragments

Every sentence the same length and shape, or short fragments used for effect ("Fast. Safe. Simple."). Vary the rhythm and write full sentences.

- Detect: three or more sentences in a row of nearly the same length, or short fragments without a verb used for emphasis.
- Before: "Apply. Get accepted. Raise funds."
- After: "Apply, and once OSE accepts your project, you can start raising funds."

## 11. Promotional tone

Marketing language where a fact belongs: "world-class", "cutting-edge", "unparalleled", "best-in-class", "we are thrilled". Docs describe what happens. The main site's pages can sell. The docs do not.

- Detect: adjectives that praise instead of describe, and claims that nobody could check.
- Before: "Our world-class team provides unparalleled support."
- After: "OSE aims to answer general questions within seven business days."

## 12. Title case headings

Capitalising every main word of a heading. Write headings and titles in sentence case: capitalise the first word and names only.

- Detect: a heading where most words start with a capital letter.
- Before: "## Before You Submit Your Expense"
- After: "## Before you submit your expense"

## 13. Bold lead-ins and bold overuse

A bold label at the start of a list item or paragraph, and bold used for emphasis. Keep bold for the names of buttons, fields and menu items on a screen. Let the sentence carry the point.

- Detect: `**` at the start of a list item or a paragraph, and any bold span that is not a name on a screen.
- Before: "- **Receipts.** Every expense needs a receipt."
- After: "- Every expense needs a receipt."

## 14. Figurative language

Software or organisations that want, think or decide, and images in place of facts ("the platform turns your community into a movement").

- Detect: a thing that acts like a person, or a metaphor that a literal reader would misread.
- Before: "The platform decides when your funds arrive."
- After: "Your funds arrive once OSE confirms the bank transfer."

## 15. Complicated language

A long word where a common one fits, a long sentence with stacked clauses, or a noun made from a verb. Write for the least fluent reader: common words, one meaning per word, sentences under 25 words, no nominalisations.

- Detect: utilize, facilitate, comprehensive, subsequently, methodology, prior to, in order to; a sentence over 25 words; two or more subordinate clauses in one sentence; "perform a review of" instead of "review".
- Before: "Subsequently, the Collective must facilitate the submission of documentation prior to the processing of the reimbursement."
- After: "Send the receipts before OSE pays the reimbursement."

## 16. Names in the wrong form

An official name written another way. A rewrite tends to carry the wrong form over from the text it rewrites. The forms the OSE docs use:

- Open Source Europe, shortened to OSE after the first use on a page
- Open Collective Europe (OCE), the former name, only where the text is about it
- Open Collective, the platform; Open Collective Foundation is a different organisation
- Collective, with a capital C, for a project hosted on Open Collective
- GitHub, GitHub Sponsors, LinkedIn, YouTube

- Detect: any of these in another case or spelling, such as "Github", "open collective" or "your collective".
- Before: "Connect Github sponsors to your collective."
- After: "Connect GitHub Sponsors to your Collective."
