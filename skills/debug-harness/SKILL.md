---
name: debug-harness
description: Reproduce a bug with a failing test first, then fix it and watch the test go green. Use when the user (Engineer hat) reports a bug, regression, or "this is broken" and wants it fixed properly rather than patched blind. Routes test authoring to Glitchtrap.
model: sonnet
---

> **Home robot:** 🔩 Bitforge (Engineer). Seat-kit cockpit for the human. **Robots cannot dispatch robots —
> Otto mediates every handoff.** So where this skill says *"hand to Glitchtrap"*, it means: return to Otto with
> what he needs to dispatch. Test authoring goes to 🔘 Glitchtrap; a design flaw goes to 🟣 Vector.

## When to use
The user is wearing the **Engineer hat** and reports a defect: a crash, wrong output, regression, or
"X stopped working". Use this instead of jumping straight to a patch — a fix without a reproducing test
is a guess.

## Steps
1. **Pin the symptom.** Get the exact inputs/state and the observed vs expected behavior. If the report
   is vague, ask one sharpening question, then reproduce.
2. **Write the failing test FIRST.** The repro belongs to QA, so it is real and stays as a regression guard:
   > **Hand it back to Otto** with the symptom and the exact inputs, and ask him to put **🔘 Glitchtrap** on a
   > minimal test that reproduces the bug. Confirm it **fails for the right reason** before any product code is
   > touched. *(If Otto himself is running this skill, he dispatches Glitchtrap directly.)*
3. **Isolate.** Read the failing path top-down; form one hypothesis at a time. Add temporary logging or
   a narrower assertion if the cause isn't obvious. Change one thing per iteration.
4. **Fix at the root, not the symptom.** Prefer the smallest correct change. If the fix reveals a design
   flaw (not just a typo), **say so and hand it back** — a schema/boundary rethink is 🟣 Vector's, and patching
   around a bad boundary just gives the bug a new place to live.
5. **Watch it go green.** Re-run the new test + the surrounding suite. The new test must pass and nothing
   else may regress. On failure, back to step 3.
6. **Self-healing loop.** lint/typecheck/build clean before "done".
7. **Report.** One-line root cause, the fix, and the test that now guards it.

## Guardrails
- Never delete or weaken a test to make it pass. If a test was wrong, say so explicitly and fix the test
  as its own change.
- Work on a branch; commit/push only when asked.
- **If two honest hypotheses have both failed, stop — do not try a third.** Your context is now full of
  reasoning that did not work, and you will keep proposing variations of it. **Hand back to Otto the symptom
  and what you ruled out — never the failed reasoning** — and he runs the `stuck-loop` ladder: fresh eyes on
  clean context, then a harder model, then the architecture. **You cannot escalate your own model** (it is
  pinned frontmatter); only Otto can, by dispatching a robot pinned higher.
