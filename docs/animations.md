# Animation inventory

This document lists every animated or interactive effect on the live WordPress site at https://opensourceeurope.org, with the values the rebuild has to match. The rebuild implements the effects from it, and the header uses E7 and E12.

The values come from Playwright scripts run against the live site on 27 October 2026 in Chromium at 60 frames per second, at 1440 × 900 and 390 × 844, with spot checks at 768, 1023, 1024, 1279 and 1280 px wide. The scripts scrolled, hovered and clicked, and sampled `getComputedStyle()` and inline styles on every animation frame. Times and distances are measured, not read from the theme's code. A value marked "about" varied by a frame or two between runs.

`npm run capture` writes screenshots of every scroll-driven section at 0, 25, 50, 75 and 100 % of its scroll range to `reference/screens/<page>-<width>-pin1-<percent>.png`. Open them next to this document when you build E2, E9 and E10.

## Effects at a glance

The following table lists each effect with its trigger, its timing and the planned fallbacks. The sections after the table give the full measurements.

| Id | Effect | Pages | Trigger | Timing and easing | Below 1024 px | Reduced motion | Without JavaScript |
|---|---|---|---|---|---|---|---|
| E1 | Highlighted words in headings grow letter by letter, with a bar behind them | Every page except the legal pages | The word enters the viewport, once | Letters: 0.5 s each, 0.05 s apart, start after 0.38 s, `cubic-bezier(0.37, 0, 0.63, 1)`. Bar: 0.7 s, `ease` | Same | Letters and bar shown in their final state | Letters and bar shown in their final state |
| E2 | Pinned section with round images that grow into one large circle, then step cards that slide over it | Home | Scroll, pinned for three viewport heights | Linear, follows the scroll with about 1 s of smoothing | Same, with mobile sizes | Static final layout, not pinned | Static final layout, not pinned |
| E3 | Logo marquee in "No ecosystem grows alone" | Home | Runs from page load, never stops | 30 px/s to the left | 15 px/s at 768 px and narrower | Does not move; logos wrap into rows | Does not move; logos wrap into rows |
| E4 | Project card carousel in "Trusted by hundreds of open source projects across Europe" | Home | Previous and next zones, dots, drag | 0.6 s `ease` per card, 0.3 s from a dot | One card, dots instead of arrows | Cards jump without the slide | Cards in a horizontally scrollable row |
| E5 | Soft glow that follows the pointer inside buttons and step cards, and the arrow circle in E4 | Every page | Pointer over the element | Moves 18 % (buttons) or about 15 % (cards) of the remaining distance per frame | Not shown on touch | Glow stays still under the pointer, or is not shown | Not shown |
| E6 | Scroll reveals | None found | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |
| E7 | Header turns solid when the page scrolls, hides on scroll down, returns on scroll up | Every page | Scroll position and direction | Slide: 0.5 s, `cubic-bezier(0.4, 0, 0.2, 1)`. Background: instant | Same | Header hides and returns without the slide | Header stays at the top of the page |
| E8 | Decorative glyphs `<_`, `()`, `_` and `<` in headings | Every page except the legal pages | None, static text | None | Same | Same | Same |
| E9 | Pinned "Our values" section that scrolls its cards sideways | About | Scroll, pinned for the width of the card row | Linear, about 1 s of smoothing | Same, longer pin | Cards in a horizontally scrollable row, not pinned | Cards in a horizontally scrollable row, not pinned |
| E10 | Pinned "How it works" section where four numbered cards stack on top of each other | The three service pages | Scroll, pinned for 1500 px | Three steps, `cubic-bezier(0.165, 0.84, 0.44, 1)` in each step, about 1 s of smoothing | Earlier cards move up instead of down | Cards listed one after another, not pinned | Cards listed one after another, not pinned |
| E11 | FAQ answers open and close | Home, How to join, Contact, the three service pages | Click on a question | 0.3 s, `cubic-bezier(0.4, 0, 0.2, 1)` | Same | Answer opens without the height animation | Answers open with `<details>` |
| E12 | Mobile menu panel slides down | Every page, below 1280 px | Click on the menu button | 0.3 s, `cubic-bezier(0.4, 0, 0.2, 1)` | This is the mobile behavior | Panel opens without the slide | Menu reachable without the script (`Header.astro`) |
| E13 | Link underlines, button halo and card image zoom on hover | Every page | Pointer over a link or card | 0.3 s `ease` for underlines, 0.3 s and 0.5 s `cubic-bezier(0.4, 0, 0.2, 1)` for the rest | Not shown on touch | State changes without the transition | Works, CSS only |

## Status in the rebuild

The following table lists the state of each effect in the rebuild. "Done" means the effect matches the measurements in this document. A migration note id marks a deliberate difference, which `docs/migration-notes.md` describes. MN-032 covers reduced motion for every effect.

| Id | Status | Where | Migration notes |
|---|---|---|---|
| E1 | Done | `src/components/Heading.astro`, `src/scripts/motion/chars.ts` | MN-031 |
| E2 | Logged: the circles match, the "Getting started" block scrolls in the page flow | `src/components/motion/PinCircle.astro`, `src/scripts/motion/pin-circle.ts` | MN-028 |
| E3 | Done, with a pause button | `src/components/motion/Marquee.astro`, `src/scripts/motion/marquee.ts` | MN-029 |
| E4 | Logged: buttons instead of click zones, native scrolling instead of mouse drag | `src/components/motion/Carousel.astro`, `src/scripts/motion/cards-carousel.ts` | MN-030 |
| E5 | Done: the glow in buttons and step cards | `src/components/motion/Cursor.astro`, `src/scripts/motion/cursor.ts` | None |
| E6 | Not applicable: the live site has no scroll reveals, so the rebuild adds none | None | None |
| E7 | Done | `src/scripts/header-scroll.ts` | None |
| E8 | Done, with one glyph per heading | `src/components/Heading.astro` | MN-014, MN-015, MN-020 |
| E9 | Done | `src/components/motion/PinRow.astro`, `src/scripts/motion/pin-row.ts` | MN-018 |
| E10 | Done | `src/components/motion/StackCards.astro`, `src/scripts/motion/stack-cards.ts` | None |
| E11 | Done, with `<details>`. The height animation runs only in browsers that support `::details-content` and `interpolate-size`. Other browsers open the answer without it | `src/components/sections/Faq.astro` | MN-011 |
| E12 | Done, with the panel below the header bar | `src/components/MobileMenu.astro`, `src/scripts/mobile-menu.ts` | MN-007, MN-008 |
| E13 | Done | `src/components/Cta.astro`, `src/components/Header.astro`, `src/components/Footer.astro` | None |

## E1: highlighted words

Most section headings mark one or two words with a highlight. The marked word sits on a translucent bar (`rgb(255 255 255 / 14%)`, the full height of the line, 5 px of padding on each side), and its letters grow from the baseline. No page title (`<h1>`) has a highlighted word.

The effect starts when about 20 % of the word's line height is inside the viewport. It runs once. Scrolling away and back does not replay it.

The following list gives the measured sequence for one word:

- At the trigger, every letter drops to `scaleY(0)` with `transform-origin: 50% 80%`, and the bar starts to grow.
- The bar grows from width 0 to the full word width in 0.7 s with CSS `ease`.
- The first letter starts to grow 0.38 s after the trigger. It reaches `scaleY(1)` 0.5 s later.
- Each next letter starts 0.05 s after the previous one, with the same 0.5 s duration.
- Every letter uses a sine in-out curve, `cubic-bezier(0.37, 0, 0.63, 1)`. Half height is at half time.
- A five-letter word finishes 1.08 s after the trigger.

Mobile behavior is the same.

Before the trigger, the letters are visible at full height. Keep that default in the rebuild: hide the letters only from the script, at the moment the animation starts, so that the word stays readable without JavaScript. The visible letter spans are `aria-hidden`, and a visually hidden copy carries the word for screen readers.

## E2: growing circles on the home page

The section after "We make open source sustainable without paperwork" holds four rows of nine round image holders, 36 in total. Some holders contain project logos or a photo. The holder in the middle of the third row contains `bg-how-to.webp` and a gradient layer. Below the rows sits the "Getting started with OSE is quick and simple" block with its three step cards.

The section pins when its top reaches the top of the viewport. It stays pinned while the page scrolls three viewport heights: 2700 px at 900 px tall, 2532 px at 844 px tall. All values follow the scroll position with smoothing. After the scroll stops, the values move about 12 % of the remaining distance per frame and settle within about 1 s.

The pinned distance splits into three equal phases. The following table lists what changes in each phase:

| Phase | Part of the pinned distance | What changes at 1440 px | What changes at 390 px | Easing |
|---|---|---|---|---|
| 1 | First third | Every holder grows from 150 px to `100vh` and moves down by `100vh`. Logo padding inside a holder grows from 30 px to 150 px. The rows move from 75 px below the section to its bottom edge. | Holders grow from 45 px to `100vh`. Logo padding grows from 10 px to 150 px. | Linear |
| 2 | Second third | Holders grow from `100vh` to `150vw` and move down from `100vh` to `200vw`. Logo padding shrinks to 120 px. The gradient layer in the middle holder grows from 0 to 600 px tall, and its bottom offset goes from -20 px to 700 px. | Holders grow to `150vh` and move down to `180vh`. Logo padding grows to 220 px. The gradient's bottom offset ends at 240 px. | Linear |
| 3 | Last third | The "Getting started" block moves up by 800 px over the circle. | The block moves up by 1350 px. | `cubic-bezier(0.215, 0.61, 0.355, 1)` |

Every holder grows at the same rate, so the outer holders leave the viewport and the middle holder fills the screen as one large circle.

Without JavaScript and under reduced motion, show the settled layout: the large circle with the "Getting started" block on top of it, in normal page flow and not pinned.

## E3: logo marquee

The marquee is in the "No ecosystem grows alone" section on the home page, not in "Trusted by hundreds…". It shows six partner logos, repeated once more so that the row can loop without a gap.

The following list gives the measured layout and motion:

- Each logo box is 190 × 66 px from 1024 px up, and 127 × 44 px below that.
- The space after each logo is 72 px above 768 px, and 32 px at 768 px and narrower.
- The row moves left by 0.5 px per frame above 768 px, which is 30 px/s at 60 frames per second. At 768 px and narrower it moves 0.25 px per frame, 15 px/s.
- When the first copy of the six logos has moved fully out, the row jumps back by the width of one copy, so the loop has no visible seam.
- The row starts moving at page load. It keeps moving when it is off screen, on hover and on focus.

The live speed is counted in frames, so it doubles on a 120 Hz display. Use the per-second speeds in the rebuild.

The live logos have empty `alt` text and no pause control. The rebuild gives each logo its project name as `alt`, adds a visible pause button with `aria-pressed`, and pauses on hover and on focus (WCAG 2.2.2).

## E4: project card carousel

The "Trusted by hundreds of open source projects across Europe" section shows three project cards in a carousel. Each card is a link with a grayscale photo, a project logo, a quote and a "view project" link.

The following table lists the layout at four widths:

| Viewport width | Cards in view | Card width | Gap | Padding at each side |
|---|---|---|---|---|
| 1440 px | 2 | 593 px | 32 px | 111 px |
| 1024 px | 2 | 420 px | 25 px | 80 px |
| 800 px | 1 | 630 px | 16 px | 85 px |
| 390 px | 1 | 334 px | 16 px | 28 px |

The side padding shows part of the next card. All cards share one height: 644 px at 1024 px and up, 531 px below.

From 1024 px up, the left and right 20 % of the carousel are click zones for previous and next. Inside a zone, an 88 px white circle with an arrow sits under the pointer and follows it with no delay. The circle appears and disappears at once when the pointer enters or leaves the zone. A click moves the row by one card width plus the gap, in 0.6 s with CSS `ease`.

Below 1024 px, three 8 px dots replace the zones. The active dot is white and the others are white at 85 %. A click on a dot moves the row in 0.3 s with `ease`. Drag and swipe also work and settle in 0.6 s with `ease`.

The carousel has no autoplay and does not loop. With two cards in view and three cards in total, there is only one step. At the last position, "next" does nothing.

On hover, from 1024 px up, the card photo scales to 1.2 in 0.5 s with `cubic-bezier(0.4, 0, 0.2, 1)`. It stays grayscale.

The live click zones are `<div>` elements that a keyboard cannot reach. The rebuild uses labeled previous and next `<button>` elements, and keeps scrolling by keyboard working. Without JavaScript, the cards sit in a row that scrolls horizontally.

## E5: pointer glow

The live site has no global cursor follower, and it never hides the system cursor. Three effects follow the pointer inside one element each:

- Every pill button has an 80 px circle with a white radial gradient at 20 % opacity. The circle is centered on the pointer, and the button clips it. Each frame, the circle moves 18 % of the remaining distance to the pointer, so it settles in about 0.5 s. It appears when the pointer enters the button and disappears when the pointer leaves.
- Each "Getting started" step card in E2 has a 200 px circle filled with `radial-gradient(circle, rgb(159 231 245 / 30%) 0%, rgb(159 231 245 / 3%) 80%)` and blurred by 10 px. Each frame, the circle moves about 15 % of the remaining distance. It fades in and out in 0.2 s with `cubic-bezier(0.4, 0, 0.2, 1)`, and stays where the pointer left the card.
- The arrow circle of E4 follows the pointer without delay.

Run these effects only under `(pointer: fine)`. Under reduced motion, place the glow at the pointer without easing, or leave it out.

## E6: scroll reveals

No scroll reveal exists on the live site. A scan of every route at 1440 px recorded every class and inline style change while the page scrolled in 300 px steps. The only changes came from E1, E2, E3, E7, E9 and E10. No element fades in or slides in, and `document.getAnimations()` returns no running animation after page load. Do not add reveal animations. If a reveal is added later, log it in `docs/migration-notes.md` as a difference.

## E7: header on scroll

The header is fixed to the top of the viewport. It is 64 px tall below 1024 px and 78 px from 1024 px up.

The following list gives the measured behavior, the same at 1440 px and at 390 px:

- At scroll position 0, the header background is transparent.
- At any scroll position above 0, the background is `#0a242b`. The change has no transition.
- When the page scrolls down past about 108 px, the header slides up by its own height.
- The header slides back down after the page scrolls up by 600 px in total since the last downward scroll. A shorter scroll up leaves it hidden.
- The header also returns when the page reaches scroll position 0.
- Both slides take 0.5 s with `cubic-bezier(0.4, 0, 0.2, 1)`.

Under reduced motion, hide and show the header without the slide. Without JavaScript, the header stays at the top of the page with the solid background.

## E8: decorative heading glyphs

Most section headings carry plain-text glyphs. They have the same color, size and weight as the heading, and they do not move. The following list shows where they appear:

- `<_` ends most section headings, for example "Frequently asked questions<_".
- `()` ends some headings, for example "Getting started with OSE is quick and simple()" and "Technical Resources & Guidance()".
- `_` or `<` replaces a space in three headings: "What makes<this _possible", "Open<source is_public infrastructures" and "Fiscal_hosting()".

The rebuild renders each glyph as an `aria-hidden` element, so screen readers and the drift check read the words alone. The section schema in `src/lib/sections.ts` offers `decor` values for a glyph at the end of a heading. The three headings with a glyph between words need a way to place a glyph inside the text.

## E9: sideways scroll on the about page

The "Our values" section on the about page holds six value cards in one row, followed by an empty spacer. The cards are 388 px wide with a 32 px gap at 1440 px, and 300 px wide with a 16 px gap at 390 px. The spacer is 120 px at 1440 px and 16 px at 390 px.

The section pins when its top reaches the top of the viewport. The pinned distance equals the row width minus the viewport width: 1200 px at 1440 px, 1522 px at 390 px. While the section is pinned, the row moves left by the same distance, so that the last card ends inside the viewport. The movement is linear and uses the same smoothing as E2.

Without JavaScript and under reduced motion, the row scrolls horizontally by itself and the section is not pinned.

## E10: stacked cards on the service pages

The "Turn your project into a collective in no time" section on each of the three service pages holds four numbered cards, 01 to 04, at the same position. The cards are 340 px tall from 1024 px up and 554 px tall below.

The section pins for 1500 px at every width. The pinned distance splits into three steps of 500 px. In each step:

- The next card slides up from 1100 px below its place to its place.
- Every card already in place moves 20 px down and shrinks by 0.04 in scale. Below 1024 px, the cards move 20 px up instead.
- All movement uses `cubic-bezier(0.165, 0.84, 0.44, 1)` across the step, with the same smoothing as E2.

At the end, the first card sits 60 px lower at scale 0.88, the second 40 px lower at 0.92, the third 20 px lower at 0.96, and the fourth at its place at full scale.

Without JavaScript and under reduced motion, list the four cards one after another, not pinned.

## E11: FAQ accordion

Each FAQ item has a question row with an icon of six orange dots (`#f27f0c`). A click on the question row opens the answer:

- The answer grows from height 0 to its full height in 0.3 s with `cubic-bezier(0.4, 0, 0.2, 1)`.
- The icon turns 90° in 0.3 s with the same curve.
- Opening one item closes any other open item.
- On hover, the item background changes from `#0a242b` to `#163037` with no transition.

The live question rows are `<div>` elements without `aria-expanded`, so a keyboard cannot open them. The rebuild uses `<details>` and `<summary>`, which open without JavaScript. The script adds the height animation and the one-open-at-a-time rule.

## E12: mobile menu

Below 1280 px, a 40 px round button replaces the navigation. A click opens a panel that is fixed to the top of the viewport. The panel moves from `translateY(-100%)` to its place while its maximum height grows from 0 to its content height. Both changes take 0.3 s with `cubic-bezier(0.4, 0, 0.2, 1)`. The menu icon changes to a close icon at once.

The live button is not a `<button>` element. `Header.astro` builds the accessible version and its fallback without JavaScript.

## E13: hover effects

The following hover effects use CSS transitions only:

- Navigation links and "view project" text links have a 1 px white line at the bottom. On hover, it grows from `scaleX(0)` to `scaleX(1)` from the left edge in 0.3 s with `ease`. When the pointer leaves, it shrinks back to the left edge in 0.3 s.
- The primary buttons with the gradient ring have a blurred copy of the brand gradient behind them. On hover, it fades from 0 to 80 % opacity in 0.3 s with `cubic-bezier(0.4, 0, 0.2, 1)`, so the button gets a colored halo.
- The carousel card photo zoom is part of E4. The FAQ item background is part of E11.

Under reduced motion, the hover state applies without the transition.
