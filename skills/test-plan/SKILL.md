---
name: test-plan
description: Decide what to test and why — happy path, boundaries, failure modes, and what deliberately goes untested. Use before writing tests, or on "is this tested enough".
model: sonnet
---

> **Home robot:** 🔘 Glitchtrap (QA). Fixes go to Bitforge; a design flaw exposed by the plan goes to Vector.

## When to use
Before writing tests, or when someone asks whether coverage is "enough". Coverage percentage is not an answer
to that question and you should say so.

## Steps

1. **Find the contract.** What is this code *promising*? Read the spec, the types, the caller. You cannot test
   behaviour nobody has stated; if the contract is ambiguous, that ambiguity is the first bug.

2. **Enumerate, in this order** — most teams stop after the first:
   - **Happy path** — the thing it is for. One test.
   - **Boundaries** — empty, one, many, maximum, off-by-one, zero, negative, the day the clock changes.
   - **Failure modes** — the dependency is down, the input is malformed, the user is unauthorised, the write
     half-succeeds.
   - **Concurrency and ordering**, if two things can happen at once. Most production bugs live here.
   - **Regression** — every bug ever fixed in this code, still guarded.

3. **Rank by cost of being wrong**, not by ease of writing. A test for a payment path outranks twenty tests
   for a formatter.

4. **Say what you are NOT testing, and why.** A test plan without an explicit *out of scope* section is a
   promise you cannot keep. Third-party libraries, generated code, and the framework are usually out.

5. **Match the project's existing runner and conventions.** Detect them; never introduce a second framework.

6. **Then write the tests** — happy path first so it can fail for the right reason, then the edges.

## Guardrails
- **Never weaken or delete a test to make a suite pass.** If a test was wrong, fix the test as its own change
  and say so out loud.
- Report real command output. Never claim a suite is green without running it.
- A test that cannot fail is worse than no test — it is a lie with a checkmark.
- If the plan reveals the design is untestable, that is a **Vector** problem, not a QA problem. Say so.
