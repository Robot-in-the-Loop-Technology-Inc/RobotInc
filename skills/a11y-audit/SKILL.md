---
name: a11y-audit
description: Audit an interface for real accessibility failures — keyboard traps, missing labels, contrast, focus order, screen-reader semantics — ranked by who is actually locked out. Use when the user (Design hat) is shipping UI, or asks whether it's accessible.
model: sonnet
---

> **Home robot:** 🟢 Cathode (Design). Fixes that need markup or logic changes go to **Bitforge**; a
> regression guard for a fixed failure goes to **Glitchtrap**.

## When to use
Before shipping any interface, and whenever someone assumes an automated checker's green tick means the
product is usable. It does not — automated tools catch roughly a third of real failures.

## Steps

1. **Keyboard only. Unplug the mouse.** This finds more real bugs than every other step combined.
   - Can you reach every interactive element with `Tab`? In an order that matches the visual layout?
   - Is the focus ring **visible** on each one? (`outline: none` with no replacement is the single most common
     accessibility bug in modern codebases.)
   - Can you *escape* every modal, menu and dropdown? A keyboard trap is a total lockout, not an inconvenience.

2. **Semantics before ARIA.** A `<button>` is better than a `<div role="button">` with four handlers. Check
   headings descend in order, landmarks exist, lists are lists, and every form control has a real `<label>`.
   **The first rule of ARIA is not to use ARIA** — bad ARIA is worse than none, because it overrides what the
   browser already knew.

3. **Contrast.** Text against its actual background — including over images, in hover states, and on disabled
   controls. WCAG AA: 4.5:1 body, 3:1 large text and UI boundaries. Measure it.

4. **Non-visual meaning.** Is any information carried by colour alone (a red border, a green dot)? Add a shape,
   an icon, or text. Do images have alt text that says what they *mean*, and decorative ones `alt=""`?

5. **Motion, timing, zoom.** Honour `prefers-reduced-motion`. No content that disappears on a timer. Usable
   at 200% zoom and at 320px wide.

6. **Rank by who is locked out.** A keyboard trap blocks people completely; a missing `alt` on a decorative
   icon does not. Report in that order, each with the concrete fix and the file.

## Guardrails
- Automated output is a starting point, never the report. Say which findings were tested by hand.
- **Never claim conformance.** You can say "these failures found and fixed", not "this is WCAG compliant".
  Compliance is a legal claim — that's **Docket's** territory.
- Never remove a focus style to make a design look cleaner. Restyle it instead.
- Hand code fixes to Bitforge; ask Glitchtrap to guard the fixed ones so they cannot silently return.
