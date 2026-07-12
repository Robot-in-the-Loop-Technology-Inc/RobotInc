---
name: user-stories
description: User stories that name who wants this, the job they are hiring it for, and how we will know it worked. Use to turn a persona or feature ask into something buildable and verifiable.
model: sonnet
---

> **Home robot:** 📋 Patchbay (Product). Feeds `spec-writer` and Gantry's `delivery-plan` — a story with no
> success signal is not ready to hand off either way.

## When to use
A feature or persona is named but nobody has said what the person is actually trying to accomplish, or how
you'd know the thing worked. Useful on its own, or as an input to `spec-writer` when the spec needs to be
grounded in an actual user rather than a stakeholder's phrasing.

## Steps

1. **Name the who — specifically.** Not "users." A role, a situation, a moment: "a freelancer invoicing a
   client for the first time," not "freelancers."

2. **Find the job, not the ask.** What are they actually trying to accomplish? If asked what they want,
   people describe the solution they can already picture — *"if I'd asked people what they wanted, they
   would have said a faster horse."* Your job is the destination, not the vehicle they proposed.

3. **Say what they do instead, right now.** Every story has an incumbent — a spreadsheet, a competitor, a
   manual workaround, doing nothing. If you can't name it, you don't understand the job yet.

4. **Write it in the standard shape, then go further:**
   `As a <specific who>, I want to <accomplish the job>, so that <the real outcome>.`
   The "so that" is the part worth checking hardest — if it restates the "I want", you've written the vehicle
   again, not the destination.

5. **State how we'll know it worked.** A concrete, observable signal — not "they'll be happier" but "they
   complete the invoice in one sitting without opening a spreadsheet." No signal, no story — it's a wish with
   a persona attached.

6. **Watch what they'd actually do, not just what they say.** If you have any real usage, support tickets, or
   observed behavior, weigh it over stated preference. Link became a business-card product because customers
   used it that way, not because they asked for it — the story should be able to absorb that kind of signal.

## Guardrails
- Never invent a persona's motivation to make a feature sound justified. If you don't know why they'd want
  this, that's a question for the user or for Sonar — not a gap to paper over.
- A story that only restates the feature request has failed at step 2. Redo it.
- No success signal, no ship. Hand a signal-less story back before it reaches `spec-writer` or Gantry.
- Keep each story to a few lines. A user story that needs a paragraph has smuggled in a spec — write the
  spec instead, with `spec-writer`.
- Print the **full absolute filepath** of the story set you write.

## Output
A short set of stories (`.md`): who, job, incumbent, story line, success signal. One terse line back to
Otto: `4 stories written, 1 lacked a success signal — sent back` or `stories ready → spec-writer`.
