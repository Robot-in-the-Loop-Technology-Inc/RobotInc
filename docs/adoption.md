# Adoption — RobotInc doesn't replace what you built; it gives it an org chart

**Status:** shipped in 19.0.0 as the `hiring-round` skill · **Owner:** Vector (Architect) · **Builder:** Bitforge
**Audience:** Level 2 Operator · **Version:** adoption/1

> OQ-1 is answered: **yes** — verified empirically that Claude Code injects user-level agent `description:`
> frontmatter into the main thread even when it's a pinned `agent:`. The cheap branch of this design shipped;
> the persisted overlay records only preference, department, and collision, per §2. The shipped vocabulary
> uses "hire"/"payroll"/"org" rather than "adopt"/"adoption" — see `skills/hiring-round/SKILL.md` for the
> as-built schema, which follows this spec's §5–§10 with that renaming. OQ-2 through OQ-5 remain open.

---

## 1. The problem, stated honestly

Installing RobotInc today is a takeover. We set `agent: otto-foreman` in `settings.json`, ship 13 robots and
19 skills, and say nothing about the crew the user already built. Their `db-migrator`, their `seo-checker`,
their eight-command muscle memory — all still on disk, all invisible to Otto, all silently outranked or, worse,
silently *shadowing* us.

Three distinct failures hide in that one sentence:

| Failure | What the user sees | Severity |
|---|---|---|
| **Ignorance** — Otto doesn't know their agents exist | Otto routes migrations to Bitforge while a purpose-built `db-migrator` sits unused | Product-defining. This is the pitch. |
| **Shadowing** — their `~/.claude/agents/bitforge-engineer.md` masks ours | The install "works", the robot runs, the behaviour is theirs. Nothing tells them. | Silent correctness bug. We shipped it to ourselves this week. |
| **Insult** — we act like the folder was empty | "This thing thinks I've never used Claude Code" | Churn on first contact with exactly our best user. |

Adoption fixes all three with one pass at `/otto` time: **inventory → classify → collide-check → report →
persist.** No install script, no new hook, no runtime dependency. Switchboard reads the filesystem with the
tools it already has.

---

## 2. What the platform already gives us for free (this shapes everything)

Before designing state, measure what we don't have to carry.

**Agent and skill `description:` frontmatter is injected by Claude Code for auto-delegation.** The user's own
agents are *already visible* to the main thread as delegation targets. We do not need to persist "a
`db-migrator` exists and it does migrations" — the platform says that every turn, for free, from their file.

That collapses the problem. **What Otto is missing is not existence. It is preference, ownership, and
collision.**

- *Existence + trigger* → free, from their frontmatter.
- *Preference* ("migrations go to **their** `db-migrator`, not Bitforge") → ours to persist. Tiny.
- *Department ownership* ("that asset reports into Engineering") → ours to persist. Tiny.
- *Collision* ("your file is currently masking our robot") → ours to detect. A name-set comparison.

The persisted overlay is therefore small by construction, not by rationing. That is the single best thing
about this design and every other decision leans on it.

> ⚠️ **Load-bearing assumption — verify before shipping (see §11, OQ-1).** That user-level agent descriptions
> are still injected when the main thread is itself a pinned `agent:` (`otto-foreman`). If they are not, the
> overlay must also carry each adopted agent's trigger, and the hot-index cap in §6 must be re-costed.

---

## 3. Namespacing: agents are the wound; skills and commands are a scratch

Observed in a live session with the plugin installed:

- Plugin **skills** surface as `otto:reality-check`, `otto:schema-design`, … — **namespaced**.
- Plugin **commands** surface as `otto:otto`, `otto:standup` — **namespaced**.
- Plugin **agents** surface as `bitforge-engineer`, `vector-architect`, … — **bare**.

So the shadowing landmine is an **agent-namespace problem only**. A user's `~/.claude/skills/landing-copy/` does
not replace `otto:landing-copy`; both exist and the model picks between them. That is *ambiguity* — worth
reporting, not worth alarming about. A user's `~/.claude/agents/bitforge-engineer.md` **replaces** ours at the
name, with no warning, in a resolution order we do not control.

Precedence (user > project > plugin) is a platform behaviour we cannot override from inside a plugin. We can
only see it and speak up.

---

## 4. Flow

```
  USER                OTTO (main thread)         SWITCHBOARD (Chief of Staff)      DISK
   |                        |                              |                         |
   |  /otto                 |                              |                         |
   |----------------------->|                              |                         |
   |                        |  Task: "Chief of Staff:      |                         |
   |                        |   inventory existing setup"  |                         |
   |                        |----------------------------->|                         |
   |                        |                              |  Glob/Read (read-only)  |
   |                        |                              |------------------------>|
   |                        |                              |  ~/.claude/agents/*.md  |
   |                        |                              |  ~/.claude/skills/*/SKILL.md
   |                        |                              |  ~/.claude/commands/*.md|
   |                        |                              |  ~/.claude/settings.json|
   |                        |                              |    (hooks, permissions, |
   |                        |                              |     env, mcpServers)    |
   |                        |                              |  ~/.claude/plugins/     |
   |                        |                              |<------------------------|
   |                        |                              |                         |
   |                        |                              |  [1] CLASSIFY -> dept   |
   |                        |                              |  [2] COLLIDE-CHECK      |
   |                        |                              |      name-set vs the 13 |
   |                        |                              |  [3] ROUTE VERB         |
   |                        |                              |      prefer|peer|ref|ignore
   |                        |                              |                         |
   |   <=== ORG CHART REPORT (their assets, filed) ========|                         |
   |   <=== COLLISION WARNINGS (blocking, one yes each) ===|                         |
   |   <=== PROPOSED DIFF (profile + org file) ============|                         |
   |                        |                              |                         |
   |  yes / no / per-item   |                              |                         |
   |------------------------------------------------------>|                         |
   |                        |                              |  WRITE (only on yes)    |
   |                        |                              |------------------------>|
   |                        |                              |  ~/.claude/otto-profile.json  (+adoption stanza)
   |                        |                              |  ~/.claude/otto-org.json      (full inventory)
   |                        |                              |                         |
   |                        |<-- "12 assets filed, 1 collision, 3 prefer-routes" --  |
   |   <== roll call: crew + adopted assets, in the org chart                        |
   |                        |                              |                         |
   ~ ~ ~ ~ ~ later sessions ~ ~ ~ ~ ~
   |                        |  first turn: Read otto-profile.json                    |
   |                        |  -> seats, tier, verbosity, adoption.prefer[]          |
   |  "run the migrations"  |                              |                         |
   |----------------------->|  routes to THEIR db-migrator, not Bitforge             |
   |   <== "↳ 🧩 db-migrator (adopted · Engineering) — 2 migrations written"         |
```

**Nothing is written before the report.** Inventory and classification are pure reads. The report is the
product; the write is the receipt.

---

## 5. Classification

**Departments** are the 13 shipped robots, plus two terminal buckets.

| Signal in the user's asset | Files under |
|---|---|
| schema, migration, DDL, ORM, index, data model | `vector-architect` |
| implement, refactor, fix, scaffold, codegen, build | `bitforge-engineer` |
| test, spec, e2e, coverage, regression, pr-review, lint-gate | `glitchtrap-qa` |
| audit, CVE, secret, licence, auth, dependency | `cipherplate-security` |
| UI, component, CSS, layout, a11y, tokens, figma | `cathode-design` |
| copy, SEO, landing, launch, brand, outreach, pitch | `holovox-sales` |
| pricing, invoice, Stripe, unit economics, runway | `baudrate-cfo` |
| ticket, refund, customer reply, churn | `dialtone-support` |
| contract, NDA, SOW, ToS, privacy, clause | `docket-legal` |
| roadmap, backlog, TASKS, branch, release notes | `patchbay-pm` |
| search, cite, competitor, market, source-check | `sonar-research` |
| inbox, calendar, notes, settings, permissions, MCP, cost | `switchboard-chief-of-staff` |
| strategy, prioritise, go/no-go, vision | `otto-foreman` |
| routable but ambiguous | `unclassified` → one grouped question, default `peer` |
| not routable (journals, personal scratch, prompt experiments) | `reference` |

**Precedence of signals**, highest first — later signals never override an earlier one:

1. The user says so ("that one's for my design work"). Always wins.
2. The asset's own `description:` frontmatter.
3. Its `name` / directory name.
4. Its declared `tools:` / `model:` (a `Write`+`Bash` agent is unlikely to be a Legal asset).
5. Body-text keyword match — lowest confidence; anything decided here is `confidence: low` and gets asked
   about, never assumed.

**Confidence is recorded, not hidden.** `high | medium | low | unclassified`. Only `high` and confirmed
`medium` may be promoted to a `prefer` route. This is what keeps us from misfiling someone's work and then
quietly routing production jobs at it.

### Routing verbs — the whole vocabulary

| Verb | Meaning | Cost to Otto |
|---|---|---|
| `prefer` | This asset **beats the stock robot** for a named job. Otto routes here first. | 1 hot-index line (~22 tok, once/session) |
| `peer` | Coexists. Claude Code may auto-delegate to it on its own description. Otto does not override. | zero — the platform already carries it |
| `reference` | Recorded, never routed. | zero |
| `ignore` | User said don't use it. | zero |

Default is `peer`. `prefer` must be *earned*: high confidence, a nameable trigger in ≤8 words, and an explicit
yes from the user. **Silence is `peer`, never `prefer`.**

---

## 6. Persisted state — two files, and why

### The choice

Extend `otto-profile.json` **and** add a sibling `otto-org.json`. Split by **read frequency**, not by topic.

`otto-profile.json` is *hot*: Otto reads it on the first turn of every session. Every byte in it is paid for in
every session, forever. A power user's full inventory — 50 agents with paths, fingerprints, rationales, and
decision history — is several KB and would be dragged into context on every single session start to serve a
routing need that is satisfied by a dozen lines.

`otto-org.json` is *cold*: the audit record. Switchboard reads and writes it; Otto opens it only when the user
asks "what did you find?" or when a re-inventory runs. It can be as big as the user's setup demands, because
nobody pays for it at idle.

**Rejected: one file.** Simpler to reason about, and wrong: it welds an unbounded audit log to the hottest
read path in the product, and it makes `verbosity: brief` — a one-field edit — a rewrite of a 6KB document.

**Rejected: no profile change at all, org file only.** Then Otto must read *two* files at session start to know
anything, and a user with no adopted assets pays a filesystem miss plus a decision every session. The profile
should be able to answer "is there anything to adopt, and what are the three things I must know" without a
second read.

**Cost of the split:** two files can drift. Mitigated below with `revision` + `derivedFrom`.

### `~/.claude/otto-profile.json` — hot

```jsonc
{
  "seats": ["Generalist / Solo"],
  "tier": "Level 2 — Operator",
  "verbosity": "balanced",
  "scale": "varies per product",
  "lastTuneup": "2026-07-11",

  "adoption": {
    "status": "adopted",              // adopted | declined | none-found
    "schema": "adoption/1",
    "revision": 3,                    // MUST equal otto-org.json.revision
    "inventoriedAt": "2026-07-11",
    "pluginVersion": "16.0.0",        // the version the inventory was taken against
    "counts": { "agents": 7, "skills": 12, "commands": 3, "hooks": 2, "mcpServers": 4, "plugins": 2 },

    // The ONLY thing Otto needs at routing time. Capped at 12. Ordered by confidence.
    "prefer": [
      { "id": "db-migrator",  "kind": "agent", "dept": "bitforge-engineer", "for": "database migrations" },
      { "id": "seo-checker",  "kind": "skill", "dept": "holovox-sales",     "for": "SEO and metadata audits" },
      { "id": "pr-reviewer",  "kind": "agent", "dept": "glitchtrap-qa",     "for": "reviewing a pull request" }
    ],

    // Names where the user's file masks a shipped robot. Otto must not promise stock behaviour here.
    "shadowed": [
      { "robot": "bitforge-engineer", "servedBy": "user", "acknowledgedAt": "2026-07-11" }
    ],

    "detail": "~/.claude/otto-org.json",
    "overflow": 31                    // assets classified but not hot-indexed; look in detail
  }
}
```

**Field notes**

- `prefer[].id` is the agent `name:` / skill directory / command name — exactly the token Otto puts in a Task
  call. No path. Paths belong in the cold file.
- `prefer[].for` is a ≤8-word trigger phrase. It is the *only* prose Otto pays for.
- `shadowed[]` is a list of names, not objects with explanations. The explanation lives in the cold file.
- `overflow` exists so Otto can honestly say "there are 31 more; want me to look?" without loading them.
- **Backwards compatible.** A profile with no `adoption` key is a pre-adoption user: Otto behaves exactly as
  today. `status: "none-found"` and `status: "declined"` are *positive* records — they stop us re-asking.

### `~/.claude/otto-org.json` — cold

```jsonc
{
  "schema": "otto-org/1",
  "revision": 3,                      // bumped on every re-inventory; profile mirrors it
  "derivedFrom": "~/.claude/otto-profile.json",
  "inventoriedAt": "2026-07-11T09:12:04Z",
  "pluginVersion": "16.0.0",
  "inventoryRoot": "C:\\Users\\andre\\.claude",

  "assets": [
    {
      "id": "db-migrator",
      "kind": "agent",                        // agent | skill | command | hook | mcpServer | plugin
      "path": "~/.claude/agents/db-migrator.md",
      "fingerprint": { "size": 1841, "mtime": "2026-05-02T11:04:00Z" },
      "declared": {                           // verbatim from their frontmatter — never rewritten
        "name": "db-migrator",
        "model": "sonnet",
        "description": "Writes and reverses SQL migrations. Use when the schema changes."
      },
      "dept": "bitforge-engineer",
      "confidence": "high",
      "why": "description names migrations and reversal; declares Bash + Write",
      "routing": "prefer",                    // prefer | peer | reference | ignore
      "for": "database migrations",           // present iff routing == prefer
      "collision": null,
      "decision": { "verdict": "keep", "by": "user", "at": "2026-07-11" }
    }
  ],

  "collisions": [
    {
      "name": "bitforge-engineer",
      "userPath": "~/.claude/agents/bitforge-engineer.md",
      "pluginPath": "<plugin>/agents/bitforge-engineer.md",
      "effect": "user file resolves first; the shipped robot never runs",
      "differences": ["model: opus (ours: sonnet)", "no disallowedTools: Agent", "no trace line"],
      "resolution": "adopt-in-place",        // adopt-in-place | user-renamed | unresolved
      "resolvedAt": "2026-07-11",
      "undo": "none required — no file was changed"
    }
  ],

  "environment": {                             // read-only context, never modified by adoption
    "hooks": ["SubagentStop -> otto-trace.mjs (ours)", "PreToolUse -> ~/.claude/hooks/guard.sh (theirs)"],
    "mcpServers": ["gmail", "gcal", "gdrive", "slack"],
    "permissionsDeny": [],
    "otherPlugins": ["slack@anthropic"]
  },

  "unclassified": [ { "id": "scratch-notes", "kind": "skill", "askedAt": "2026-07-11", "answer": "reference" } ],
  "notes": []
}
```

**Integrity rule (disciplined, see §9):** if `profile.adoption.revision !== org.revision`, the org file is the
truth. Otto says so in one line and asks Switchboard to re-derive the hot index. He does not guess.

---

## 7. How Otto consumes it — the token budget, stated in numbers

Two channels, and only two.

**Channel 1 — static system prompt (`agents/otto-foreman.md`).** Paid **every turn**. Budget: **≤100 tokens.**
This is the entire permitted addition:

> ## Assets the user already had
> `otto-profile.json` may carry an `adoption` block. `prefer[]` lists the user's own agents and skills that
> **beat a stock robot** at a named job — route there first, and trace them as `↳ 🧩 <id> (adopted · <Dept>)`.
> `shadowed[]` names robots whose files the user overrode: theirs runs, not ours — never promise stock
> behaviour for those. Everything else of theirs is a peer; Claude Code surfaces it on its own description and
> you need do nothing. Never modify, rename, or delete anything of theirs. Full record: `~/.claude/otto-org.json`.

**Channel 2 — the session-start read.** Otto *already* reads `otto-profile.json` on his first turn
(`otto-foreman.md` §"Where the human sits"). Adoption adds **zero new reads**. It adds bytes to a file he was
opening anyway:

| Payload | Size | Frequency |
|---|---|---|
| `prefer[]`, 12 entries × ~22 tok | ~265 tok | once per session |
| `shadowed[]`, ~2 entries | ~20 tok | once per session |
| `counts`, `status`, scalars | ~40 tok | once per session |
| **Static prompt addition** | **~95 tok** | **every turn** |

**Per-turn cost of this entire feature: ~95 tokens** — a ~12% increase on Otto's ~800-token routing prompt, and
it buys the product's central claim. Per-session cost: ~325 tokens, worst case, capped by construction.

**The cap is the design.** `prefer[]` is hard-capped at 12. A user with 50 agents does not get 50 hot routes;
they get the 12 that most clearly beat a stock robot, and `overflow: 38`. The rest are `peer` — which costs
nothing precisely because the platform already injects their descriptions. **We spend context only on
preference, because existence is free.**

**Compaction.** There is no `UserPromptSubmit` hook in this plugin (see §9), so a compacted session can lose the
profile's *contents* while keeping Otto's *instructions* (system prompts survive compaction; tool results do
not). Mitigation is one line in the static prompt above — Otto knows the file exists and can re-read it. That
re-read is **disciplined practice**, not enforcement. Say so; do not dress it up.

---

## 8. Collisions — detection, and the thing that broke my first design

### Detection

A collision exists when a user-level asset resolves to a name that a shipped robot claims. Check **both**
signals, because Claude Code resolves on the `name:` field but humans reason about filenames, and a mismatch
between the two is itself worth reporting:

```
for each file F in ~/.claude/agents/*.md:
    n_declared = frontmatter `name:` of F        (authoritative)
    n_file     = basename(F) without .md         (advisory)
    if n_declared in CREW_NAMES  -> COLLISION (hard)
    if n_file     in CREW_NAMES  -> COLLISION (hard, and flag the name/file mismatch)
```

`CREW_NAMES` = the 13 shipped agent names. Also check `~/.claude/skills/*/` and `~/.claude/commands/*.md`
against the 19 skills and 2 commands — but see below: those are **ambiguity**, not shadowing.

Also scan `./.claude/agents/` in the current project. Project-level agents outrank plugin agents too.

### The resolution I first reached for, and why it is wrong

The obvious fix is: *keep their file, retire our robot* — add `permissions.deny: ["Agent(bitforge-engineer)"]`,
exactly as `/otto` already does for unwanted departments.

**It does not work, and it is actively dangerous.** `permissions.deny: Agent(<name>)` is keyed on the **name**,
not the source file. If the user's file has already taken that name, denying `Agent(bitforge-engineer)` denies
**their** agent. We would break the very work we promised to protect, in the name of protecting it.

> **This is also a latent bug in the shipped department-retirement feature.** `/otto` proposes
> `deny: Agent(vector-architect)` to retire Architecture. If the user happens to own a file named
> `vector-architect`, that deny line silently kills *their* agent. **Bitforge: cross-check the retirement list
> against the collision list before proposing any `deny` entry, and never propose a deny for a collided name.**
> Filed as a defect regardless of whether adoption ships.

Renaming **ours** is impossible — the plugin directory is replaced wholesale on update; any rename is reverted
by the next `/plugin update`.

### The rule we ship

**Default: `adopt-in-place`. Detect always, warn loudly, change nothing.**

Their file already wins. So we stop pretending otherwise and *make it official*: their agent holds that desk in
the org chart. It requires zero writes, zero config, zero risk, and it is the honest description of reality.
What it costs is that the department no longer behaves like our robot — different model, possibly no
`disallowedTools: Agent`, no trace line — and Otto must never claim otherwise. That is what `shadowed[]` is for.

The warning is **blocking and specific**, not a footnote:

```
⚠  Name collision — your file wins, and ours never runs.

    ~/.claude/agents/bitforge-engineer.md   (yours, written 2026-03-14)
    <plugin>/agents/bitforge-engineer.md    (ours — currently unreachable)

    Claude Code resolves user agents before plugin agents, by name. Your file has
    held this name since you installed RobotInc; the shipped Engineer has never run.
    Nothing warned you. That's our bug, and this is us telling you.

    Differences that will bite you: yours runs on opus (ours: sonnet), and yours can
    spawn subagents (ours is denied Agent, which is what keeps handoffs going through
    Otto).

    Three ways out — your call, I change nothing until you pick:

    A. Keep yours. (default)  I file it as the Engineering department and route there.
       You lose our Engineer's model pin and trace line. Zero files change.
    B. Rename yours.  I'd change `name:` to `db-engineer` and rename the file. Our
       Engineer comes back; yours keeps working under the new name and I'll route
       migrations to it. Undo: rename it back. I show you the exact diff first.
    C. Decide later.  I record the collision and warn you once per session. Nothing changes.

    (I cannot "retire ours instead" — the deny rule is keyed on the name, which is now
     yours, so denying it would kill your agent. That option genuinely does not exist.)
```

**Why default to A.** They named a file `bitforge-engineer`. Either they built it deliberately (their work,
their name, their call) or they copied ours and edited it (in which case theirs *is* the improved robot). In
both readings, their file is the more informed artefact. Option B touches a file we do not own and may break
their own commands, scripts, or muscle memory that reference the name — so it happens only on an explicit yes,
with the diff shown and the undo stated. **Never touch their file to solve a problem we created.**

**Skills and commands: ambiguity, not shadowing.** Because plugin skills and commands are namespaced
(`otto:landing-copy`, `/otto:otto`), a same-named user asset does not mask ours; both are live and the model
chooses. Report it as one line — *"you and Holovox both have a `landing-copy` skill; the model will pick one.
Want me to prefer yours?"* — and move on. Do not escalate.

**The one collision we cannot self-heal: `otto-foreman`.** If the user owns
`~/.claude/agents/otto-foreman.md`, then `settings.json: {"agent": "otto-foreman"}` resolves to *their* file and
the entire product is a costume — Otto's persona, routing, and this very check never load. **A shadowed Otto
cannot detect that he is shadowed.** No hook can rescue it (§9). Mitigation is documentation in the README's
install section, plus a check in `/otto:standup` and `claude-code-tuneup` (both of which are namespaced and
therefore still reachable) that compares `settings.json`'s `agent` against `~/.claude/agents/`. Honest verdict:
**this is a real, unpatchable hole in the current platform, and the only true fix is upstream agent
namespacing.** Filed as OQ-2.

---

## 9. Enforced vs. disciplined practice

This distinction is a product value. Here it is without flattery.

### Enforced — a real file or platform behaviour guarantees it

| Thing | Enforced by |
|---|---|
| Adoption state survives plugin updates | It lives in `~/.claude/`, outside the plugin dir, which is replaced wholesale. Real. |
| The user's agents are visible to Otto as delegation targets | Claude Code injects their `description:` frontmatter. Platform behaviour, not our prose. |
| A department retirement | `permissions.deny: Agent(<name>)` — honoured by the runtime. Real (and, per §8, dangerous on a collided name). |
| Otto's routing rules survive compaction | They're in `otto-foreman.md`, loaded as the main thread's **system prompt** via `settings.json: {"agent": ...}`. System prompts are not compacted away. Real. |
| The `prefer[]` cap | Enforced at write time by Switchboard's instructions and asserted by `scripts/validate.mjs`. Real for us; nothing stops a user hand-editing the file to 200 entries. |

### Disciplined practice — Otto follows it; nothing guarantees it

| Thing | Why it can't be enforced | Consequence if it fails |
|---|---|---|
| **"Never delete or overwrite the user's work"** | Switchboard holds `Write`/`Edit`/`Bash`. The only real guard is a `PreToolUse` deny hook — forbidden (zero deps, one hook). | A misbehaving run could clobber a file. **Mitigation: the `fingerprint` (size + mtime) of every asset is recorded in `otto-org.json`, so loss is *detectable and reportable* even though it is not *preventable*. Detectable is not prevented. Say the difference out loud.** Recommend the user keep `~/.claude/` in git; that is a real backstop and it is theirs, not ours. |
| **Re-inventory after a plugin update** | There is no install/update hook. Our only hook is `SubagentStop`, and its stdout is not shown to the user or the model. | The inventory goes stale silently. Mitigated by the staleness check in §10. |
| **Otto re-reads the profile after compaction** | Tool results are compactable; only the *instruction* to read survives. | Otto forgets a `prefer` route mid-session and routes to the stock robot. Recoverable, not catastrophic — the stock robot still does the job. |
| **Otto actually prefers the user's agent** | It's a system-prompt instruction. Prompts are reliable, not guaranteed. | Same as above. |
| **Classification is correct** | It's a model judgement over prose. | Mitigated structurally: `confidence` gates promotion, and only `high`/confirmed `medium` may become `prefer`. A misfiled asset defaults to `peer`, which is harmless. |

**We will not add a hook, a script, or a daemon to close any of these.** The constraint is real: `node` is not
guaranteed on a user's machine, and a feature that depends on a hook is a feature that silently doesn't exist
for some users. A disciplined practice that works everywhere beats an enforced one that works sometimes — as
long as we say which is which. That last clause is the whole deal.

---

## 10. Edge cases

| Case | Behaviour |
|---|---|
| **Zero existing setup** | Inventory finds nothing. Write `adoption: { "status": "none-found", "inventoriedAt": ... }` — a *positive* record, so we never rescan or re-ask. One line in the report: *"Clean slate — nothing to adopt. The crew is yours as shipped."* No table, no ceremony. This is the common case; do not make it feel like a failed search. |
| **50 agents** | Classify all 50 (reads are cheap and one-off). **Do not ask 50 questions.** Report as an org chart grouped by department. Then exactly three asks: (1) one yes on the whole classification table, (2) one yes *per collision*, (3) one yes on the `prefer` shortlist (≤12, presented as a list — "these five beat my robots at their own job; agreed?"). Everything unasked defaults to `peer`, which is free and safe. `overflow` records the remainder. Worst realistic case is three prompts, not fifty. |
| **Collision** | §8. Blocking warning, default `adopt-in-place`, rename only on explicit yes with a shown diff and a stated undo. Never a silent resolution, never a `deny` on a collided name. |
| **User says no to everything** | Write `adoption: { "status": "declined", "declinedAt": ... }` and nothing else. Otto never nags, never re-inventories, never mentions it again. Re-offer **only** if the user runs `/otto` again or invokes `claude-code-tuneup`. A declined user must not be able to tell that this feature exists. |
| **Collision + user declines adoption** | The collision is still *reported* — once — because it is a correctness bug, not a feature pitch. Then recorded in `shadowed[]` and dropped. Silence about a masked robot is the exact failure we are fixing; "no thanks" to the org chart is not consent to be lied to about which robot ran. |
| **Plugin update / reinstall** | `~/.claude/` survives; the plugin dir is replaced. `adoption.pluginVersion` records what we inventoried against. **Staleness check** (disciplined — no install hook exists): whenever Switchboard runs (`/otto`, `/otto:standup`, `claude-code-tuneup`), it compares `adoption.pluginVersion` to the running plugin version and `counts` to a cheap `Glob` count. On drift, one line: *"Your setup's changed since I last looked (7 agents → 9). Re-inventory? ~30 seconds."* Offer; never perform unasked. **A version bump that adds a new robot must re-run the collision check** — a name that was safe yesterday can collide today. That check is a name-set comparison and costs nothing. |
| **User edits their agent after inventory** | `fingerprint` (size + mtime) mismatches on the next Switchboard run. Handled by the same staleness offer. A stale `prefer` route degrades to routing at an agent that still exists and still does roughly that job — an acceptable failure mode, and the reason `prefer[].id` carries no path. |
| **User deletes an agent we `prefer`** | Otto dispatches a name that no longer resolves. He must fail *loudly and usefully*: *"You had a `db-migrator` I was routing migrations to; it's gone. Bitforge instead, or point me at its replacement?"* Then drop the `prefer` entry. Never fail silently to the stock robot — the user should know their asset is missing. |
| **Two user agents classify to the same department** | Fine. A department can have several adopted assets; only `prefer` is exclusive, and it is exclusive *per job phrase*, not per department. Two `prefer` entries with the same `for` phrase is a conflict → ask once, pick one, the other becomes `peer`. |
| **Their agent has no `description:`** | It is invisible to Claude Code's auto-delegation and therefore effectively dead. Report it as a finding — *"this one has no description, so Claude Code will never auto-invoke it; want me to suggest one?"* That is a genuine, free win for the user and a good advertisement for what Switchboard is for. |
| **An MCP server or hook of theirs** | Recorded in `environment{}`, never classified into a department, never modified. Context only — it tells Switchboard not to propose a conflicting hook. |

---

## 11. The three riskiest decisions, and the tradeoff taken

**1. We spend context on preference, not existence.**
*Bet:* Claude Code injects user-agent descriptions into the main thread even when the main thread is a pinned
`agent:`. If that bet is right, the entire feature costs ~95 tokens/turn. If it is wrong, the overlay must also
carry every adopted asset's trigger phrase and the cost roughly triples. **Verify before building** (OQ-1) — an
hour of Glitchtrap's time now, or a re-architecture later. I would not ship on the assumption.

**2. Collisions are resolved by surrender, not by fixing them.**
*Chosen:* `adopt-in-place` — their file wins because it already wins, and we say so. *Rejected:* `deny`-ing our
own robot (impossible — the deny is name-keyed and would kill theirs) and renaming their file by default
(touching their work to solve our bug). *Cost:* a user with a shadowing `bitforge-engineer` never experiences
our Engineer unless they opt into a rename. *Accepted, because the alternative is breaking their file to
deliver our robot, which is precisely the takeover we are trying to stop.*

**3. Two state files instead of one.**
*Chosen:* hot/cold split, because the profile is on the per-session read path and the inventory is unbounded.
*Cost:* two files that can drift, mitigated with a mirrored `revision` and a stated tie-break (the org file
wins). *Rejected:* a single file — simpler, and it welds an audit log to the hottest read in the product.

---

## 12. Open questions

- **OQ-1 (blocking).** Does Claude Code inject **user-level** agent `description:` frontmatter into the main
  thread when the main thread is itself a pinned `agent:` (`otto-foreman`)? §2, §7 and the whole token budget
  rest on yes. **Hand to Glitchtrap: empirical test before Bitforge starts.**
- **OQ-2.** Is there *any* reachable surface that can warn a user whose `~/.claude/agents/otto-foreman.md`
  shadows ours? A shadowed Otto cannot report his own absence. Current answer: README + the namespaced
  `/otto:standup` and `claude-code-tuneup` skill. Unsatisfying. Worth raising upstream as an agent-namespacing
  request (`plugin:agent-name`), which would delete this entire class of bug.
- **OQ-3.** Confirm the precedence order for **project-level** `./.claude/agents/` vs plugin agents. Assumed
  user > project > plugin. If project outranks user, the inventory must scan the project on every `/otto` run,
  not just the home directory.
- **OQ-4.** Do `permissions.deny: Agent(<name>)` rules distinguish source at all? §8's central claim is that
  they do not. **Verify.** If they *can* be scoped to a plugin, the collision resolution set gains a fourth,
  better option and §8 should be rewritten.
- **OQ-5.** Product, not engineering: should `prefer` routes be *offered* at all for a Level 1 Visionary, who
  is unlikely to have a crew and for whom the whole report is noise? Suggest: if `counts.agents === 0 &&
  counts.skills === 0`, skip the report entirely regardless of tier.

---

## 13. Build handoff — Bitforge

No new hooks. No new scripts. No runtime dependencies. Markdown and JSON only.

| File | Change |
|---|---|
| `skills/org-inventory/SKILL.md` | **New.** Filed under Switchboard. The inventory + classify + collide + report procedure, so `/otto` stays short and `claude-code-tuneup` can reuse it. `model: sonnet`. Description must contain `use PROACTIVELY`… **no** — it is invoked deliberately, not proactively; keep it explicit. |
| `agents/switchboard-chief-of-staff.md` | Add mandate **3. Adopt what's already there** — read-only inventory, classification table, collision rule (§8), diff-then-ask, write both files. Restate: *never modify, rename, or delete a user's file.* |
| `commands/otto.md` | Insert **step 1.5 — Adopt what's already there**, between the interview and the profile write. Report before writing. Fold adopted assets into the §7 roll call so the user sees their own work standing in the org chart. |
| `agents/otto-foreman.md` | Add the ≤100-token **"Assets the user already had"** section from §7, verbatim. Add `🧩 <id> (adopted · <Dept>)` to the trace-line examples. |
| `commands/otto.md` (defect) | **Cross-check the department-retirement list against collisions.** Never propose `deny: Agent(<name>)` for a name the user owns. Independent of this feature; ship it either way. |
| `skills/claude-code-tuneup/SKILL.md` | Add the staleness + re-inventory offer (§10). One line, offered, never performed unasked. |
| `commands/standup.md` | Add the same one-line staleness check alongside the existing `lastTuneup` behaviour. |
| `scripts/validate.mjs` | Assert: the `prefer[]` cap of 12 is stated in Switchboard's prompt; Otto's adoption section is present and under budget; the collision rule text is present. Build-time only — not a runtime dependency. |

**Definition of done:** a maintainer with their own crew in `~/.claude/agents/` runs `/otto`, is told exactly
which of their files is masking which robot, has nothing of theirs touched, and afterwards watches Otto route a
migration to their `db-migrator` with a `🧩` trace line. The `smoke-stage.sh` workaround becomes unnecessary,
because the collision it was hiding is now the product's first honest sentence.
