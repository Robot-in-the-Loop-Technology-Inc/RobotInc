---
name: scaffold-service
description: Scaffold a new module/service with a clean structure and tests wired in. Use when the user (Engineer hat) wants to stand up a new feature module, endpoint, package, or service from scratch. Routes the spec to Vector, test authoring to Glitchtrap, and a dep/secret audit to Cipherplate.
model: sonnet
---

> **Home robot:** Bitforge (Engineering seat). Seat-kit cockpit for the human — delegates all non-seat work to the crew (spec→Vector, tests→Glitchtrap, audit→Cipherplate).

## When to use
The user is wearing the **Engineer hat** and wants to create a new module, service, endpoint, package,
or feature scaffold — not edit an existing one. Triggers: "scaffold a…", "stand up a new service/module",
"new feature package", "spin up an endpoint".

This is a **cockpit for the human's build hat** — it produces the scaffold the human reviews, and it
**routes the rest of the org's work to the crew** rather than doing everything itself.

## Steps
1. **Confirm the shape.** One question if unclear: language/framework, where it lives, and the single
   responsibility of the module. Match existing project conventions — read a sibling module first.
2. **Get the spec from Vector.** For anything with a data model or API surface, delegate the schema +
   route map + boundaries to the architect before writing code:
   > Invoke `vector-architect` (via the Task/Agent tool, or a skill step with `context: fork` +
   > `agent: vector-architect`) with the module's responsibility. Wait for the spec.
3. **Write the scaffold** on a `feature/<module>` branch (never on main). Clean, modular, typed to the
   project's standard. Stub the public surface; leave `TODO(owner)` markers for real logic.
4. **Hand tests to Glitchtrap.** Do NOT write the tests here — delegate:
   > Invoke `glitchtrap-qa` (`context: fork` + `agent: glitchtrap-qa`) to write unit/route tests
   > alongside the scaffold and run them. Regression-first if this replaces something.
5. **Audit before done.** Delegate a dependency + secret-hygiene pass:
   > Invoke `cipherplate-security` (`context: fork` + `agent: cipherplate-security`) if any new deps,
   > auth, or secrets were introduced. Confirm nothing landed outside `.env`.
6. **Self-healing loop.** Run lint/typecheck/build; on error read logs → fix → re-run until clean.
7. **Report.** Print a short "Built:" list — files created, the branch name, and how to run the tests.

## Guardrails
- `feature/<task>` branch only; commit/push only when the user asks.
- No secrets in code — `.env` + env vars only (`.env` git-ignored).
- Stay in the user's tier (from the routing brief): explain tradeoffs briefly, use standard terms, don't over-narrate.
