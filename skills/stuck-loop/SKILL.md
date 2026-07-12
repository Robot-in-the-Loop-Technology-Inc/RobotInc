---
name: stuck-loop
description: Break a troubleshooting loop that is not converging. Use when the same error survives two fix attempts, when a fix keeps producing a new failure of the same class, when the human restates the same problem a third time, or when they are visibly frustrated. Escalates by changing WHO is looking and HOW, never by trying harder.
model: sonnet
---

> **Home robot:** 🧰 Otto (Foreman). He is the only one who can see the whole loop — the robots each see one
> turn of it. A robot that knows it is stuck **says so and hands back**; Otto is the one who escalates.

## The premise

A company does not fix a stuck problem by asking the stuck person to try harder. It **changes who is looking,
and how.** That is not a courtesy to the stuck person — it is the recognition that *after two failed attempts,
more effort from the same source is the least valuable input in the building.*

**Three failed fixes is not an effort problem. It is a diagnosis problem.** Nobody fails three times at
something they understand.

## The trigger — and it must be evidence, not vibes

Escalate on **observed thrash**, never on a topic that merely *sounds* hard. A hard question answered correctly
on the first pass gets one robot and nothing more — Scale still governs.

Any one of these is the trigger:

| Signal | Why it counts |
|---|---|
| **The same symptom survives two fix attempts** | Two is a coincidence. Three is a pattern, and a pattern means the model of the problem is wrong. |
| **Each fix produces a new failure of the same class** | Whack-a-mole is the signature of a cause that has not been found — you are moving it, not killing it. |
| **The human restates the same problem a third time** | They are not repeating themselves for fun. They are telling you that you have not heard them. |
| **The human's tone changes** | Frustration is data. It arrives *before* the metric does. Do not wait for a cleaner signal. |

**Say it out loud, in one line, and say why.** *"Third pass on the same error — I'm bringing in fresh eyes."*
A committee that assembles silently is alarming, and expensive, and the human is paying for both.

## The ladder

Take these **in order**. Each rung changes the *shape* of the attempt. Stop the moment it converges.

### 1. Stop adding effort

The stuck robot's context is now full of **failed hypotheses**, and it will anchor on them — it will keep
proposing variations of the thing that already did not work. This is not a character flaw; it is what
accumulated context does. **The next turn from that robot is worth less than the last one.**

Do not send it back in. Do not "try once more with more thinking."

### 2. Fresh eyes — and fresh *context*

Dispatch a **different** robot. Give it:

- ✅ **The symptom**, stated precisely.
- ✅ **The ruled-out list** — what was tried, and what it *disproved*, as bare facts.
- ❌ **Never the failed reasoning.** Never the transcript.

**This is the whole trick, and it is easy to get wrong.** Hand over the thinking that produced three wrong
answers and you have not brought in fresh eyes — **you have transplanted the anchor.** The second robot will
walk the same road because you gave it the same map.

### 3. Change the discipline: reproduce before you fix

Three failed fixes almost always means **nobody has actually verified anything.** *An agent with no way to check
its own work is a painter wearing a blindfold.*

Hand it to **🔘 Glitchtrap**: write the **failing test first.** Not to fix it — to *catch* it. A red test that
reliably reproduces the bug converts an argument into a fact, and most stuck loops end within one attempt of
having one.

If it cannot be reproduced, **that is the finding.** Say so, and stop guessing at a bug nobody can summon.

### 4. Question the level, not the line

Hand it to **🟣 Vector**: *is this a bug, or is the design producing it?*

Three fixes that each spawn a new failure of the same class is **architecture talking.** You cannot patch your
way out of a structure that makes the bug inevitable — every fix is a new place for it to live.

### 5. Stop the line

If the ladder is exhausted, **stop.** Revert to the last green state and bring it to the human with three
things and nothing else:

1. **What is known** — the symptom, reproduced or not.
2. **What is ruled out** — earned, not guessed.
3. **The two ways forward**, with a recommendation.

**Sunk cost is not a plan.** The most expensive thing in this loop was never the tokens — it was the human's
belief that the crew can see when it is losing.

## What this does *not* license

- **It does not repeal Scale.** Escalation is triggered by *evidence of thrash*, never by a topic that sounds
  important. Do not convene the floor for a question that has not failed yet.
- **It does not repeal Tempo.** A stuck problem behind a one-way door is *still* behind a one-way door.
  Frustration — theirs or yours — **never unlocks a deploy.** The pressure to "just push it and see" is exactly
  the pressure the tempo gate exists to resist, and it is strongest precisely here.
- **It is not a licence to fan out by default.** More robots on unstuck work is waste, and waste teaches the
  human to stop reading you.

## Why this is cheaper, not more expensive

Escalation *looks* like it costs more robots. It does not. **The human is already paying for the thrash** —
in tokens, in wall-clock, and in the far more expensive currency of watching their company fail at the same
thing four times in a row.

The fifth failed attempt costs more than the fresh pair of eyes that would have ended it at the third.
