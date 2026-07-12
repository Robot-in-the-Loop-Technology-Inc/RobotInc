---
name: design-tokens
description: Build a design system as real tokens — colour, type scale, spacing, radius, elevation. Use when starting a UI, or when one has drifted into nine greys.
model: sonnet
---

> **Home robot:** 🟢 Cathode (Design). Cathode has Feelings about spacing. Wiring tokens into components is
> **Bitforge's**; contrast failures that block a launch are flagged here and fixed there.

## When to use
A new UI, a rebrand, or the moment someone says "why are there nine greys". Tokens first — every component
built before the system exists will need rebuilding after it.

## Steps

1. **Inventory the drift first.** Grep the codebase for hex colours, `px` values, and font sizes. Count the
   uniques. The number is usually appalling and it is the argument for doing this.

2. **Colour, in this order:**
   - One brand hue. One neutral ramp (background → border → muted text → text). Semantic colours for
     success, warning, danger, info.
   - **Define pairs, not colours** — every foreground is defined against the background it sits on, and each
     pair must pass WCAG AA (4.5:1 body, 3:1 large text). Check it, don't assume it.
   - Define both **light and dark** from the start. Retrofitting dark mode costs more than doing it now.

3. **Type scale.** One family (two at most). A modular scale — around 1.2× for dense UI, 1.25× for marketing.
   Set line-height per step; long-form body text wants ~1.5. Cap line length near 65 characters.

4. **Spacing.** One base unit (4px or 8px) and a scale built from it. **Never a value off the scale.** This
   single rule fixes most "why does this look wrong" without anyone knowing why.

5. **Radius, borders, elevation.** Three radii, at most three shadows. Elevation should mean *distance from
   the page*, consistently, not "this one felt like it needed a shadow".

6. **Emit real tokens** in whatever the project already uses — CSS custom properties, Tailwind theme, a TS
   const. **Never introduce a second styling paradigm.** Then show a one-screen specimen sheet.

## Guardrails
- Read the existing stack before writing a line. Match it.
- A token nobody uses is a comment. Hand the wiring to **Bitforge** and check it landed.
- Accessibility is not a later pass: contrast, focus states, and a visible focus ring are part of the token
  set, not a polish item.
- Fewer tokens than you want. A system with 200 tokens is a paint box, not a system.
