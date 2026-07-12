---
name: roadmap
description: Sequence what gets built over time and in what order it matters — the minimum wedge that delivers value today, then the rest, with an explicit list of what we are NOT doing yet. Use when the user (PM hat) has a vision or backlog spanning weeks or months and needs to know what's first, not just what's next.
model: sonnet
---

> **Home robot:** 📋 Patchbay (Product). Strategic sequencing across time — not Gantry's `delivery-plan`,
> which sequences *one already-agreed* piece of work into tasks and a critical path. This skill decides
> *what matters when*; his decides *how it lands*. If the single next thing is already agreed, send it to
> Gantry instead — this skill would just be restating his job.

## When to use
There's a vision, a backlog, or a product direction spanning more than one build. The user needs to know
what ships first, second, and what waits — not the task list for tomorrow.

**Not for a single agreed piece of work.** If the "what" is already settled and only the "how/when" is
open, that's `delivery-plan`, and it's Gantry's.

## Steps

1. **Find the goal the roadmap serves.** Same rule as `prioritize` — a roadmap with no named goal is a
   list of things that sound nice. If two goals are competing, say so; that's Otto's call, not a scoring
   exercise.

2. **Find the minimum wedge.** The smallest single thing that delivers real value *today*, not the full
   vision shipped later. Monzo didn't build a bank — it shipped a prepaid card in three months to get
   something into people's hands. What is *this* product's prepaid card?

3. **Sequence by what the wedge teaches you, not by what's easiest.** Order the rest so each step either
   compounds on the last or answers a real open question. If a later item would change what an earlier item
   should look like, it comes first regardless of effort.

4. **Name what we are explicitly NOT doing yet — and why.** Not "later" as a vague gesture: name the
   specific thing, and name the cost of waiting on it. A roadmap without a not-doing list is a wish list with
   dates on it.

5. **Leave room to follow the pull.** The roadmap is a sequence, not a contract. If real usage points
   somewhere the plan didn't — the way Link's customers turned a digital business card into the actual
   product — that's a signal to double down on, not a distraction from the plan. Say where you'd expect that
   signal to show up, so it isn't missed.

6. **Watch for the tarpit.** An item that sounds good to everyone on the list and has killed everyone who
   tried it before is not "high priority, later" — it's a flag for Otto before it's scheduled at all.

7. **Hand the sequence to Gantry** when the first item is ready to move — he turns it into tasks, branches,
   and a critical path. This skill stops at *what order it matters in.*

## Guardrails
- A roadmap that ranks everything as important has ranked nothing. Cuts are the deliverable, not a courtesy.
- Never guess at effort or timing you don't know — ask, or flag it as unestimated.
- This is not a delivery plan. No branches, no task IDs, no dependency graph — that's Gantry's shape, and
  drawing it here duplicates his job and invites the two of you to quietly disagree about scope.
- Keep it terse. A roadmap that takes an hour to read will not survive contact with the next quarter.
- Print the **full absolute filepath** of the roadmap document you write.

## Output
A roadmap (`.md`): goal, wedge, sequence, explicit not-doing list. One terse line back to Otto:
`roadmap set, wedge = <one line>, 2 items explicitly deferred → Gantry once wedge is greenlit`
