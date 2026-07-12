---
name: hiring-round
description: File the user’s existing agents, skills, commands, hooks and MCP servers under the right robot, and catch name collisions. Use at the first meeting, on "I added some agents", or "why is my own agent not being used".
model: sonnet
---

> **Home robot:** 🤖 Switchboard (Chief of Staff). He already runs the user's Claude Code environment; the
> payroll is part of it.

> **`<config>` = the Claude config directory: the `CLAUDE_CONFIG_DIR` environment variable if set, otherwise
> `~/.claude`. **Check it; never hardcode the path** — a user who moves their config would otherwise get a crew
> reading a different machine's files.


## The frame

The user's existing subagents, skills, commands and hooks are not files to migrate. **They're staff who
already work here.** Our job on install isn't to inventory them like abandoned property — it's to **hire**
them: give each one a department, a manager, and a reason Otto reaches for it. Nobody gets fired. Nothing
they built gets deleted, overwritten, renamed, or disabled. The only thing that changes is *our record* of
who works here.

## When to use

- Once, near the top of `/otto` onboarding, before the profile is written.
- Any time after — "run the hiring round again", "I added a new agent", "why is Bitforge doing my
  migrations, I have a `db-migrator`". Re-running is cheap: it's a read, a diff against last time, and a
  short report.

## What the platform already gives us for free

Claude Code injects every agent's and skill's `description:` frontmatter into the main thread for
auto-delegation — **including the user's own, even though Otto runs as a pinned `agent:`.** Verified
empirically. So Otto already *sees* the user's staff as delegation targets, for free, from their own files,
every turn. Existence and trigger cost nothing.

**What's missing is preference, department, and collision** — and those are small by construction:

- *Existence + trigger* → free, from their frontmatter. Never record it.
- *Preference* ("migrations go to **their** `db-migrator`, not Bitforge") → ours to record. One line.
- *Department* ("that one reports to Engineering") → ours to record. One line.
- *Collision* ("your file is currently standing in for our robot, and ours has never run") → ours to detect.

Don't re-derive what the platform already carries. Record only what it doesn't.

## Steps

### 1. Walk the payroll (read-only)

`Glob`/`Read`, nothing else:

- `<config>/agents/*.md` and `./.claude/agents/*.md` (project-level outranks user-level, which outranks
  plugin — check both)
- `<config>/skills/*/SKILL.md`
- `<config>/commands/*.md`
- `<config>/settings.json` — `hooks`, `mcpServers`, `permissions`
- other installed plugins (`<config>/plugins/`)

**Empty payroll is not a failure.** Most users have nothing here. One line —
*"Nothing on the payroll yet — clean org chart, the crew's all yours."* — and move on. Skip straight to
writing `org: { "status": "none-found" }` (step 6). Do not interrogate a brand-new user about agents they
don't have.

### 2. Classify — give each one a department

Read the asset's own words before guessing. Signal precedence, highest first, and an earlier signal always
beats a later one:

1. The user says so ("that one's for my design work") — always wins.
2. Its own `description:` frontmatter.
3. Its `name:` / directory name.
4. Its declared `tools:` / `model:` (a `Write`+`Bash` agent is unlikely to be doing Legal's job).
5. Body-text keyword match — lowest confidence. Anything decided only here is `confidence: low` and gets
   asked about, never assumed.

| Their asset sounds like | Department |
|---|---|
| schema, migration, DDL, ORM, index, data model, API route map | 🟣 Vector (Architect) |
| implement, refactor, fix, scaffold, codegen, write code | 🔩 Bitforge (Engineer) |
| test, spec, e2e, coverage, regression, pr-review, lint-gate | 🔘 Glitchtrap (QA) |
| audit, CVE, secret, licence hygiene, auth, dependency vuln | 🔒 Cipherplate (Security) |
| UI, component, CSS, layout, a11y, tokens, figma | 🟢 Cathode (Design) |
| copy, SEO, landing, launch, brand, outreach, pitch | 🔵 Holovox (Sales & Marketing) |
| pricing, invoice, Stripe, unit economics, runway, billing | 💰 Baudrate (CFO) |
| ticket, refund, customer reply, churn | 📞 Dialtone (Support) |
| contract, NDA, SOW, ToS, privacy, clause | 📜 Docket (Legal) |
| spec, PRD, prioritise, roadmap, user stories, scope | 📋 Patchbay (Product) |
| TASKS.md, sequencing, blockers, critical path, release, branch | 📦 Gantry (Project) |
| search, cite, competitor, market, source-check, vendor eval | 🔷 Sonar (Research) |
| inbox, calendar, notes, settings, permissions, MCP, cost | 🤖 Switchboard (you) |
| strategy, prioritise the business, go/no-go, vision | 🧰 Otto |
| routable but genuinely ambiguous | one grouped question, default `peer` |
| not routable at all (journals, scratch notes, prompt experiments) | `reference` |

**Hooks, MCP servers and `settings.json` entries file under 🤖 Switchboard — as *admin*, not as owner.** They
are the environment, and the environment is the Chief of Staff's department to **manage**. **Do not strain to
give a hook a department it does not have** — a `PreToolUse` guard is not "Engineering" because it happens to
fire on `Edit`.

> ⚠️ **And never imply a robot owns an MCP server exclusively.** **Every robot inherits every MCP server** —
> none of them declare a `tools:` allowlist, because one would blind them. A user's GitHub server is not
> Switchboard's private tool: Bitforge uses it, Sonar uses it, the whole floor uses it. Switchboard
> *administers the connection*. Mark it `admin` and move on.

**Record the `kind` alongside the department** — `agent | skill | command | hook | mcp`. The human is not
looking at an inventory, they are looking at **their own org chart**, and *"a skill of mine is filed under
Marketing"* only makes sense if they can see that it is a skill. Otto's card renders this column; it cannot
invent it.

### Say what filing actually does — nothing more

**Their agents and skills already worked, and they will behave identically after we file them.** Claude Code
auto-delegates from **their own** `description:` frontmatter, every turn, for free — that was true before this
plugin existed. **We did not make their tool work, and filing it does not make it work better.**

**If the report implies otherwise, they catch us the first time the tool behaves exactly as it always did** —
and then the rest of the org chart is worthless to them. Three things change, and only three:

| | What actually changes |
|---|---|
| **`prefer`** | Otto reaches for **their** tool first for a named job. **The only one that changes behaviour** — and only with an explicit yes. |
| **Department** | They can *see* who owns what. A record, not a rewiring. |
| **Collision** | We tell them their file has been shadowing our robot. Detection, not a change. |

The honest line is also the better one: ***"It's yours, it stays yours, and now I know when to reach for it."***

**Confidence is recorded, not hidden**: `high | medium | low | unclassified`. Only `high`, or `medium`
confirmed by the user, may ever become a `prefer` route. A misfiled asset defaults to `peer`, which is
harmless — Claude Code was already going to surface it on its own description.

### 3. Collision check — the one that actually matters

A collision is a user-level (or project-level) **agent** whose `name:` matches one of the 13 shipped robots.
Check both the declared `name:` and the filename — a mismatch between the two is itself worth a line.

**This is an agent-namespace problem only.** Plugin skills and commands surface namespaced
(`robotinc:landing-copy`, `/robotinc:otto`); a same-named user skill doesn't mask ours, both are live and the
model picks. That's *ambiguity* — one line, not an alarm: *"you and Holovox both have a `landing-copy`
skill; want me to prefer yours?"*

Agents are bare (`bitforge-engineer`, not `robotinc:bitforge-engineer`). A user-level
`<config>/agents/bitforge-engineer.md` **replaces ours at that name, silently, with no warning from the
platform.** If the user owns it, their file has been running — ours never has.

**Say it plainly, don't dress it up:**

> *"You have your own `bitforge-engineer` — yours is what's been running this whole time; mine never was.
> Yours keeps the job."*

Then offer, don't do:

- **A. Keep theirs (default).** File it as Engineering, route there, done. Zero files touched.
- **B. Rename theirs.** Only on an explicit yes, with the exact diff shown first and the undo stated
  ("rename it back"). Never touch their file to fix a problem we created.
- **C. Decide later.** Record the collision, mention it once next session, change nothing.

**Never propose `permissions.deny: ["Agent(<name>)"]` for a name the user owns.** The deny is keyed on the
*name*, not the source file — if they hold that name, denying it fires **their** agent, not ours. This was a
real shipped bug (fixed 16.3.1). Cross-check every department-retirement candidate against the collision list
before proposing a single `deny` line, in this pass and in step 3 of `commands/otto.md`.

### 4. Route — the routing verbs

| Verb | Meaning | Default |
|---|---|---|
| `prefer` | Beats the stock robot for a named job. Otto routes here first. | Only on explicit yes |
| `peer` | Coexists; the platform already surfaces it on its own description. | **Default. Silence is peer.** |
| `reference` | Recorded, never routed. | For journals/scratch work |
| `ignore` | User said don't use it. | On request |

`prefer` must be earned: high confidence, a nameable trigger in ≤8 words, and an explicit yes. Cap at **12**
— a user with 50 agents doesn't get 50 hot routes, they get the dozen that most clearly beat a stock robot;
the rest sit in the cold file as `overflow`.

### 5. Report as an org chart, then get a yes

**Lead with the promise, in a sentence, before any table:** *nothing of theirs was renamed, moved, disabled or
overwritten; the only thing that changed is our record of who works here.* **This is the fear they arrived
with** — that installing a company of robots means something they built gets bulldozed — and it costs one line
to answer. Do not make them infer it from a word in a footer.

Then **collisions first** (they are the correctness bug), then the org chart itself: every asset with its
**kind** and **the robot it now reports to**, grouped by department. Then the `prefer` shortlist. Everything
else, one line each.

**Nothing is written before this report.** Inventory and classification are pure reads; **the report is the
product, and the write is only the receipt.**

For a payroll of size N, this is at most three asks, never N: one yes on the classification table, one yes
*per collision*, one yes on the `prefer` shortlist as a whole list. Everything unasked defaults to `peer`.

### 6. Persist — two files, split by how often they're read

`<config>/otto-profile.json` gets a small `org` stanza — Otto reads this file on the first turn of *every*
session, so every byte here is paid for forever:

```jsonc
"org": {
  "status": "hired",              // hired | declined | none-found
  "schema": "org/1",
  "revision": 2,                  // must equal otto-org.json's revision — mismatch means re-run this skill
  "hiredAt": "2026-07-12",
  "pluginVersion": "19.0.0",
  "counts": { "agents": 7, "skills": 12, "commands": 3, "hooks": 2, "mcpServers": 4 },

  // The only thing Otto needs at routing time. Capped at 12, ordered by confidence.
  "prefer": [
    { "id": "db-migrator", "kind": "agent", "dept": "bitforge-engineer", "for": "database migrations" }
  ],

  // Names where the user's file is standing in for a shipped robot. Otto must
  // never claim stock behaviour for these.
  "shadowed": [
    { "robot": "bitforge-engineer", "servedBy": "user", "acknowledgedAt": "2026-07-12" }
  ],

  "detail": "<config>/otto-org.json",
  "overflow": 4                   // classified but not hot-indexed; look in detail
}
```

`<config>/otto-org.json` is the full personnel file — every asset, its fingerprint (size + mtime, so a
later edit is detectable), why it was filed where, and the collision record with its resolution and undo.
Switchboard reads and writes it; Otto opens it only on request or when `revision` disagrees with the profile.
Nobody pays for it at session start.

**Backwards compatible.** A profile with no `org` key is a pre-hiring-round user: Otto behaves exactly as
before. `status: "none-found"` and `status: "declined"` are *positive* records — they stop us re-asking.

### 7. Re-running

Same skill, same steps, cheap the second time: re-walk the payroll, diff fingerprints against the last
`otto-org.json`, report only what changed (new hires, edited files, anything that vanished), bump `revision`
in both files. If a `prefer`-routed asset is gone, say so loudly — *"you had a `db-migrator` I was routing
migrations to; it's gone. Bitforge instead, or point me at its replacement?"* — never fail silently onto the
stock robot without telling the user their asset disappeared.

## Guardrails

- **Never delete, overwrite, rename, or disable anything the user built.** Said plainly: this is not
  enforced by any hook or permission gate — Switchboard holds `Write`/`Edit`/`Bash`, same as always, and this
  skill adds no new restriction. It's discipline, not a lock. The one real backstop is `fingerprint` (size +
  mtime) in `otto-org.json`, which makes loss *detectable and reportable* even though it isn't *preventable*.
  Recommend the user keep `<config>/` in git — that's a real backstop, and it's theirs, not ours.
- **Never propose a `deny` for a name the user owns.** See step 3. This is the load-bearing rule; do not
  soften it.
- **Nothing irreversible without consent.** Show the diff, get a yes, before any write — including the two
  state files.
- **An empty payroll gets one line, not a form.** Ceremony over nothing is worse than silence.
- **Silence is `peer`, never `prefer`.** Promotion is earned, per-item, explicit.
