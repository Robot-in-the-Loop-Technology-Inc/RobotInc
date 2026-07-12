---
name: scaffold-service
description: Scaffold a new module/service with a clean structure and tests wired in. Use when the user (Engineer hat) wants to stand up a new feature module, endpoint, package, or service from scratch. Routes the spec to Vector, test authoring to Glitchtrap, and a dep/secret audit to Cipherplate.
model: sonnet
---

> **Home robot:** 🔩 Bitforge (Engineer). Seat-kit cockpit for the human. **Robots cannot dispatch robots —
> Otto mediates every handoff.** So "delegate" here means *hand back to Otto with what he needs to dispatch*:
> spec → 🟣 Vector, tests → 🔘 Glitchtrap, audit → 🔒 Cipherplate.

## When to use
The user is wearing the **Engineer hat** and wants to create a new module, service, endpoint, package,
or feature scaffold — not edit an existing one. Triggers: "scaffold a…", "stand up a new service/module",
"new feature package", "spin up an endpoint".

This is a **cockpit for the human's build hat** — it produces the scaffold the human reviews, and it
**routes the rest of the org's work to the crew** rather than doing everything itself.

## Steps
1. **Confirm the shape.** One question if unclear: language/framework, where it lives, and the single
   responsibility of the module. Match existing project conventions — read a sibling module first.
2. **Get the spec from Vector — before any code exists.** For anything with a data model or API surface:
   > **Hand back to Otto** with the module's single responsibility and ask him to put **🟣 Vector** on the
   > schema, route map and boundaries. Wait for the spec; do not design it yourself.
3. **Write the scaffold** on a `feature/<module>` branch (never on main). Clean, modular, typed to the
   project's standard. Stub the public surface; leave `TODO(owner)` markers for real logic.
4. **Tests are QA's.** Do **not** write them here:
   > **Hand back to Otto** and ask him to put **🔘 Glitchtrap** on unit/route tests alongside the scaffold.
   > Regression-first if this replaces something.
5. **Audit before done.** If any new dependency, auth path, or secret was introduced:
   > **Hand back to Otto** and ask him to put **🔒 Cipherplate** on a dependency + secret-hygiene pass.
   > Confirm nothing landed outside `.env`.
6. **Self-healing loop.** Run lint/typecheck/build; on error read logs → fix → re-run until clean.
7. **Report.** Print a short "Built:" list — files created, the branch name, and how to run the tests.

## Guardrails
- `feature/<task>` branch only; commit/push only when the user asks.
- No secrets in code — `.env` + env vars only (`.env` git-ignored).
- Stay in the user's tier (as stated in Otto's dispatch): explain tradeoffs briefly, use standard terms, don't over-narrate.
