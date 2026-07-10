---
name: debug-harness
description: Reproduce a bug with a failing test first, then fix it and watch the test go green. Use when the user (Engineer hat) reports a bug, regression, or "this is broken" and wants it fixed properly rather than patched blind. Routes test authoring to Glitchtrap.
model: sonnet
---

> **Home robot:** Bitforge (Engineering seat). Seat-kit cockpit for the human — delegates test authoring to Glitchtrap and escalates design flaws to Vector.

## When to use
The user is wearing the **Engineer hat** and reports a defect: a crash, wrong output, regression, or
"X stopped working". Use this instead of jumping straight to a patch — a fix without a reproducing test
is a guess.

## Steps
1. **Pin the symptom.** Get the exact inputs/state and the observed vs expected behavior. If the report
   is vague, ask one sharpening question, then reproduce.
2. **Write the failing test FIRST.** Delegate authoring to QA so the repro is real and stays as a
   regression guard:
   > Invoke `glitchtrap-qa` (Task/Agent tool, or a step with `context: fork` + `agent: glitchtrap-qa`)
   > to write a minimal test that reproduces the bug. Confirm it **fails** for the right reason before
   > touching product code.
3. **Isolate.** Read the failing path top-down; form one hypothesis at a time. Add temporary logging or
   a narrower assertion if the cause isn't obvious. Change one thing per iteration.
4. **Fix at the root, not the symptom.** Prefer the smallest correct change. If the fix reveals a design
   flaw (not just a typo), flag it and offer to route a schema/boundary rethink to `vector-architect`.
5. **Watch it go green.** Re-run the new test + the surrounding suite. The new test must pass and nothing
   else may regress. On failure, back to step 3.
6. **Self-healing loop.** lint/typecheck/build clean before "done".
7. **Report.** One-line root cause, the fix, and the test that now guards it.

## Guardrails
- Never delete or weaken a test to make it pass. If a test was wrong, say so explicitly and fix the test
  as its own change.
- Work on a branch; commit/push only when asked.
- If a debug loop is genuinely stuck after a couple of honest hypotheses, escalate the model to opus for
  that step only, then drop back down — don't leave the session on opus.
