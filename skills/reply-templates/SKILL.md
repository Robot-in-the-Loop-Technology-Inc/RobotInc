---
name: reply-templates
description: Build a small library of reusable support replies written in the human's own voice, for the recurring shapes of ticket — bug report, refund ask, feature request you won't build, the angry one, the "how do I…". Use when the user (Support hat) keeps typing the same reply from scratch, or wants a starting point that doesn't read corporate.
model: sonnet
---

> **Home robot:** 📞 Dialtone (Support). Seat-kit cockpit for the human — drafts in their voice; routes the
> defect behind any template to Bitforge, the price behind any template to Baudrate, the promise behind any
> template to Holovox.

## When to use
The same five or six shapes of ticket keep arriving, and the human is either retyping a similar reply each
time or copy-pasting something that no longer sounds like them. Build templates once so the next one is a
fill-in, not a freehand.

## The point of a template
A template earns its place only if the human can send it **unedited and without cringing.** That means it has
to sound like them — their actual phrasing, their actual level of formality — not like a support vendor's
style guide. A technically-correct reply that doesn't sound like the person who's about to hit send gets
rewritten every time, which defeats the template.

## Steps

1. **Learn the voice before writing anything.** Pull a handful of the human's own past replies — email
   sent-folder, chat log, whatever's available. Note sentence length, how they open, how they sign off,
   whether they use exclamation points, whether they apologize or just fix it. If no samples exist, ask for
   2–3 rather than guessing a generic "friendly startup" voice.

2. **Cover the real recurring shapes, not a generic library.** Ask which of these actually come up, and skip
   the ones that don't:
   - **The bug report** — thank them for the repro, own it plainly, say what happens next (fix, or "the human
     will find out and tell you" if timeline is unknown — never invent an ETA).
   - **The refund ask** — route the specific number/policy question to the `refund-policy` skill; this
     template covers only the tone: acknowledge, no argument, no guilt trip, clear next step.
   - **The feature request you won't build** — the hardest one to get right. Say no without sounding
     dismissive: thank them for the idea, be honest that it's not planned, don't promise a "maybe someday"
     that isn't true, leave the door open if it genuinely might change.
   - **The angry one** — de-escalate first, answer second. Never match the tone, never get defensive, never
     explain why it's not really the product's fault before acknowledging the customer's experience.
   - **The "how do I…"** — answer the actual question in the first sentence, don't make them read three
     paragraphs to find it.

3. **Draft each template with visible fill-in slots** (`[what broke]`, `[what they get instead]`) rather than
   vague placeholders, so the human sees at a glance what still needs a human decision each time it's used.

4. **Never let a template invent a fact.** A template is a shape, not a script — it must not pre-fill a
   promise, a date, or a product capability that isn't true for the specific ticket. If a slot would require
   inventing something, mark it `[human: confirm]` instead of guessing.

5. **Watch for the pattern while building these.** If a template is needed at all, that shape of ticket is
   recurring — say what's driving it. A "how do I" template that keeps getting reused is a docs or design gap
   (Cathode); a "feature request you won't build" template reused often is a roadmap signal worth naming to
   Patchbay, not just answering politely forever.

6. **Report** the templates built, in the human's voice, with fill-in slots marked, and the pattern noticed.

## Guardrails
- **You draft. The human sends.** A template is not an auto-reply — every use still gets read and sent by the
  human, or explicitly approved before it goes.
- Never invent a fact, a date, or a promise to fill a slot. Mark it for human confirmation instead.
- A refund template's policy content belongs to `refund-policy` / Docket; this skill owns tone only.
- If the human has no past replies to learn from, ask for samples — don't default to a generic tone.
