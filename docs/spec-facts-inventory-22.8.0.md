# Spec — Session-open inventory in the facts hook (v22.8.0)

**Owner:** Vector (Architect) · **Builds:** Bitforge · **Verifies:** Glitchtrap
**Branch:** `feature/22.8.0-relay-writer-global-state` @ `f8da560` · **Status:** working-tree spec, not committed
**Approved:** Andrew (feature). This document is where quality is decided; the code follows it.

---

## 1. Goal and the latency math

First-run session-open measures **58s**. Glitchtrap's transcript decomposition attributes **31.3s (57%)** to
*two model-driven Bash directory scans plus the reasoning around them* — the roll-call / hiring-round pass that
inventories the user's own staff (`<config>/agents`, `skills`, `commands`, `settings.json` hooks/mcp) and
detects name collisions with the 13 stock robots. Every one of those reads is deterministic. They do not need a
model, and they do not need a shell.

The fix folds that enumeration into the SessionStart facts hook `hooks/otto-facts.mjs`, which already runs in
**467ms**, off the model's critical path, and already injects `config_dir` + five existence facts. The hook
gains an **inventory block** (ids, types, collision flags); the model consumes it instead of scanning.

```
first-run wall clock
  58.0s  baseline
 -31.3s  two Bash scans + surrounding reasoning  → replaced by ~0 (hook already runs, adds <10ms of readdir)
 ───────
 ~26.7s  projected floor for the COMMON case (empty payroll: nothing left to classify)
```

Projected **~25–27s**, at/under target. The residual above 25s is the model reading the facts block and
drawing the card — real work, not a scan. Populated payrolls add a small, *targeted* frontmatter-read cost for
department classification only (see §4), never the broad directory scan the hook now owns. The empty payroll —
"Most users have nothing here" (`skills/hiring-round`, step 1) — is the case the 58s number was measured on and
the case this build most directly kills.

---

## 2. What the hook does not become

The core-facts invariant is unchanged: the six existing keys are **existence checks only**, never file
contents. The inventory is a **new, separately-scoped capability** with its own narrower boundary, stated once
so it is not quietly widened later:

> The inventory reads **directory entries** (`readdirSync`) and, for `settings.json`, only the **top-level key
> names** under `hooks` and `mcpServers`. It never reads any authored content — no agent `description:`, no
> frontmatter, no skill body, no hook command string, no MCP config value.

That boundary is the whole design tension resolved: ids/types are cheap, deterministic, and privacy-inert;
descriptions are none of those. **Classification into departments stays a model judgment** (`hiring-round`
step 2's signal-precedence table needs the description) — the hook enumerates *what exists*, the model still
decides *where it reports*. The hook removes the scan, not the judgment.

---

## 3. Decision 1 — the inventory schema

Appended **after** the existing six core lines, so the core contract is untouched. Encoding is compact by
construction: ids grouped by type on one line each, comma-separated. **Paths are not stored** — every path is a
deterministic function of `config_dir` + type + id, reconstructed by the consumer (§4), so the "paths" half of
"ids/types/paths" costs zero tokens.

### 3.1 Wire format

First-run, payroll present:

```
[RobotInc facts] authoritative -- do NOT shell out to recompute:
config_dir=/Users/x/.claude
sentinel=absent
profile=absent
state_local=absent
state_global=absent
cwd_is_config_dir=false
inv=ok
inv_agents=db-migrator,bitforge-engineer*,my-planner
inv_agents_project=code-reviewer
inv_skills=deploy-helper,landing-copy
inv_commands=ship
inv_hooks=PreToolUse,PostToolUse
inv_mcp=github,linear
```

### 3.2 Field rules

| Field | Meaning |
|---|---|
| `inv` | Exactly one of `ok` \| `off` \| `partial` \| `error`, **always present** when the hook runs. Lets the consumer tell "hook too old, no inv line at all" (→ hand-scan) apart from a deliberate `inv=off`. |
| `inv_agents` | Comma-separated **bare** user-level agent ids from `<config>/agents/*.md`. |
| `inv_agents_project` | Same for `<cwd>/.claude/agents/*.md`. Emitted only when `cwd_is_config_dir=false` (else it *is* the config dir — double-count). |
| `inv_skills` / `inv_commands` | Ids from `<config>/skills/*/SKILL.md`, `<config>/commands/*.md`. |
| `inv_hooks` / `inv_mcp` | Top-level key names under `settings.json` `hooks` / `mcpServers`. |
| trailing `*` | **Collision flag** — this agent id equals a stock agent filename (§5). Only ever on `inv_agents` / `inv_agents_project`. |
| `inv_truncated=true` | Present only under `inv=partial` (§3.4). Absence means complete. |

- **Empty type → omit the line.** Under `inv=ok`/`partial`, a missing `inv_<type>` means none of that type.
  An entirely empty payroll is `inv=ok` with no `inv_*` lines at all.
- **`inv_*` lines appear only when `inv` is `ok` or `partial`.** Under `off`/`error` there are none.
- **Delimiter safety:** comma-separated. Any id containing `,` `=` `*` or a newline is **skipped** from its
  list and forces `inv=partial` — emit a short list truthfully rather than a malformed line. (Filesystem-safe
  kebab ids never hit this; a pathological filename does.)

### 3.3 Path reconstruction (consumer contract)

The consumer rebuilds any path it needs from `config_dir` + id:

```
agent          <config>/agents/<id>.md
agent (project) <cwd>/.claude/agents/<id>.md
skill          <config>/skills/<id>/SKILL.md
command        <config>/commands/<id>.md
```

Stated in `agents/otto-foreman.md` step 1 and reused by both skills.

### 3.4 Truncation policy — degrade, never lie

Hard cap on the serialized inventory: **~1800 chars (~450 tokens)**. When enumeration would exceed it:

1. **Every collision-marked agent is emitted first and is never dropped** — a collision is a correctness
   signal, not filler.
2. Remaining budget fills in priority order: non-colliding agents → commands → mcp → skills → hooks.
3. Set `inv=partial` **and** emit `inv_truncated=true`.

The consumer, on `partial`, renders what it was given and **hand-scans only the remainder** for the types that
were cut. It never presents a truncated list as complete. This is the explicit `truncated=true` marker the
build requires: the model is told it has part of the picture, so it degrades honestly instead of confidently
under-reporting a large setup.

---

## 4. Decision 2 — inject always vs first-run-only, and staleness

**Gather the inventory only when `sentinel=absent AND profile=absent`; otherwise emit `inv=off`.**

Rationale: the facts block is injected on **every** `matcher: startup` session and every session pays for its
tokens — the same ~2,933-token always-on discipline that keeps the company card in a skill and out of the
prompt. The inventory is only *consumed* at first meeting (roll-call) or on an explicit hiring-round re-run. A
returning user should pay one marker line (`inv=off`), not a full staff enumeration on every launch. The hook
already computes `sentinel` and `profile`, so this gate is free.

**Accepted over-gather:** override (a) (real project state, no sentinel/profile) will occasionally gather an
inventory that roll-call then never uses, because the hook cannot cheaply evaluate override (a) in full (it
does existence only, not the state-file grammar parse the override requires). The rule **fails toward
gathering** — better to hold an unused inventory for one session than to withhold it from a genuine first-run
user. Bounded, rare, one session, small. Do not "optimize" it by parsing state grammar in the hook.

**Staleness / the "I added some agents" trigger.** The inventory is a SessionStart snapshot — millisecond-fresh
for the session-open first-meeting pass, which is the only thing it is authoritative for. Any **hiring-round
invocation after the first reply** (the "I added a new agent", "why isn't my agent used" trigger) **must
re-scan live and must not trust the snapshot** — the entire reason that trigger fires is that the payroll
changed since session start. Because such re-runs are almost always on a returning user (`inv=off` anyway),
this falls out naturally, but it is stated as a hard consumer rule so it is not missed.

---

## 5. Decision 3 — collision detection: in the hook, deterministically

House doctrine is structure-beats-wording: when the machine can judge deterministically, it judges, and the
model never re-derives it. Collision-by-filename is exactly that.

- The hook carries `STOCK_AGENT_IDS` — **every basename in `agents/`** (all 14, *including* `otto-foreman`; a
  user file shadowing the main thread is the most serious collision of all).
- For each user agent id (config-level and project-level), string-compare against that set; on a match, append
  `*`.

**Namespacing — the trap to state explicitly.** Plugin agents surface **namespaced**
(`robotinc:bitforge-engineer`); user files are **bare** (`bitforge-engineer.md` → id `bitforge-engineer`). The
collision is a *bare user file* whose id equals a *stock agent filename*. The hook only ever reads the user's
own `<config>/agents` and `<cwd>/.claude/agents` directories — it never sees the plugin's own namespaced
agents, so `robotinc:*` can never produce a false collision. This is the same namespacing fact
`hooks/otto-state.mjs` already handles on the write side; the two must agree.

**What the hook cannot see, and the model keeps.** The hook matches on the **filename**. A pathological file
`my-thing.md` that internally declares `name: bitforge-engineer` is a real collision the hook structurally
cannot detect (it reads no frontmatter). `hiring-round` step 3 already cross-checks declared `name:` against
filename — that residual, content-level check **stays with the model**. Clean division: the hook owns the
filename collision (the common, high-value case); the model owns the name-vs-filename divergence it alone can
see. The model never re-derives the filename collision the hook already flagged.

**Gate (every rule gets one).** `scripts/validate.mjs` gains a cross-check that `otto-facts.mjs`'s
`STOCK_AGENT_IDS` equals the set of `agents/*.md` basenames — the same shape as the existing `otto-trace.mjs` /
`otto-state.mjs` ROBOTS-map gates. A robot added or renamed without updating the hook's list trips CI, not a
user's collision check.

---

## 6. Decision 4 — consumer-side changes, file by file

The detailed *consumption* wording lives in the two skills (loaded once); `agents/otto-foreman.md` gains only
the minimum, because it is billed every turn.

### `agents/otto-foreman.md` — session-open protocol, step 1

Extend the facts-block description from "six `key=value` lines" to "six core lines plus an optional inventory
block (`inv`, `inv_agents…`)". Add, tightly:

- When `inv=ok`, the inventory is **authoritative for this session-open pass**; roll-call/hiring-round consume
  it and do not scan the directories.
- When `inv` is `off`, `partial`, or `error` (or absent entirely), hand-scan as today — for `partial`, only
  the remainder.
- The inventory keys are **mechanism** and fall under the existing "never name the mechanism" no-narration
  rule — the consumer never says it read a facts block; only the card's staff table and the hiring report are
  visible output.

### `skills/roll-call/SKILL.md` — step 1 ("Look at who already works here")

Replace the directory-read instruction with: consume the injected inventory (ids, types, `*` collisions) to
build the "their own staff" table and the collision line; fall back to reading `<config>/agents`,
`skills`, `commands`, `settings.json` **only** when `inv` is `off`/`partial`/`error`/absent (partial → scan the
remainder). The `<config>` fallback path stays verbatim so the "no hardcoded config dir" validate gate is
unaffected. No visible-output or ordering change — the write-before-draw sentinel sequence is untouched.

### `skills/hiring-round/SKILL.md` — steps 1 and 3

- Step 1 (walk the payroll): consume the inventory for enumeration; hand-scan only on `off`/`partial`/`error`,
  **or whenever invoked after the first reply** (staleness rule, §4 — the snapshot cannot be trusted mid-session).
- Step 3 (collision check): consume the `*` markers for the filename collision; keep the declared-`name:`
  vs-filename cross-check as the model's residual job (§5).
- Step 2 (classification) is unchanged — it still reads frontmatter, but only for the items it is classifying,
  and for the common empty payroll there is nothing to read.

### `scripts/validate.mjs`

Add the `STOCK_AGENT_IDS` ↔ `agents/*.md` cross-check (§5). Existing SessionStart / hook-shape gates are
unaffected — the hook stays one `type: command` entry invoking `node hooks/otto-facts.mjs`, same timeout bound.

### `scripts/test-otto-facts.mjs`

New assertions (§9). **Note for Bitforge:** the current `Object.keys(facts).length === 6` and `lines.length === 7`
assertions are intentionally superseded — `computeFacts` now returns the core fields plus inventory fields, and
`formatFacts` emits more lines. Update those two assertions; their change is expected, not a regression, and
Glitchtrap should be told so it does not read the delta as a break.

---

## 7. Decision 5 — failure modes (degrade-open, never block)

The session must always open. The worst outcome is ever "hand-scan, exactly like today."

| Condition | Behavior |
|---|---|
| Whole hook throws | Prints nothing (unchanged fail-hard-silent). No facts block → protocol hand-scans everything, as before. |
| Inventory gather throws (unexpected) | Emit the **six core keys normally** + `inv=error`. Core facts must never regress — the inventory is wrapped in its own try/catch, isolated from core-fact computation. Consumer hand-scans the inventory; the Bash-permission-prompt bug the core facts fix stays fixed. |
| One sub-scan fails (e.g. malformed `settings.json`) | Emit the sub-scans that succeeded; set `inv=partial`. Not a total `error` — partial truth beats none. |
| Unreadable directory | Skip it; if it makes the enumeration incomplete, `inv=partial`. A stat/read error is never read as "empty". |
| Huge directory | Truncate per §3.4; `inv=partial` + `inv_truncated=true`; collisions preserved. |
| Delimiter-unsafe id | Skip that id; `inv=partial`. |
| Node absent | Hook never runs; no facts block; hand-scan (existing, non-regressive fallback). |

Core-fact isolation is the load-bearing rule here: **the inventory is a convenience layered on top of the core
facts, on the same footing the core facts are layered on top of the trigger.** A failure at a higher layer
never damages a lower one.

---

## 8. The two filed rulings

### (a) State reader has no home-persona guard — **FIX NOW (consumer-only)**

The writer guards `localDir !== configDir` before writing project-local state. Override (a) got the symmetric
`cwd_is_config_dir=false` guard in this branch. But **step 5 (the brief render) reads `./.claude/otto-state.md`
unconditionally** — no `cwd_is_config_dir` check. A home-persona user (cwd = home, custom `CLAUDE_CONFIG_DIR`)
whose `~/.claude/otto-state.md` is real per-machine state gets it rendered as project-local brief. Andrew
reproduced this live — his real work table surfaced inside a sandbox session.

**Ruling:** guard step 5's **local** read with `cwd_is_config_dir=false`, exactly as override (a) is guarded.
When `cwd_is_config_dir=true`, skip `./.claude/otto-state.md` entirely; **global state
(`<config>/otto-state-global.md`) still renders** — it is legitimately per-machine, cross-project, and not the
thing that leaks.

- **Cost:** ~2 sentences in `agents/otto-foreman.md` step 5. The deciding fact (`cwd_is_config_dir`) is
  **already in the block** — no hook change.
- **Why now, not phase 2:** rendering one machine's work under another persona is the "announcing green while
  the data is wrong" class of failure, not cosmetic; the fix is symmetric to a guard this same branch already
  shipped and reuses a fact already computed. Deferring leaves a known, reproduced data-leak live.
- **Not mechanically gateable** (prose semantics, like the self-heal wording). Verified by test scenario:
  plant home-persona state with `cwd_is_config_dir=true`, assert the brief does **not** render it.

### (b) Override + seats-less profile → persona chimera — **REWORD (recommend now; defer-eligible)**

Override (a) fires (card suppressed, treated as returning) + a seats-less profile (step 6 fires) → a
"welcome back" brief stapled to the first-meeting "Which chair is yours?" splash, in one reply. Andrew found it
jarring.

Note first: **fixing (a) removes the acute instance.** The chimera Andrew actually hit was the home-persona
leak (finding (a)); once step 5 is guarded, that path stops producing a brief at all. What remains is the
*legitimate* case — real project state (`cwd_is_config_dir=false`) plus a genuinely seats-less profile: a
half-onboarded returning user who never picked a seat. Rarer, and less jarring, but still a real spec gap.

**Ruling: reword, do not suppress and do not keep as-is.**

- **Not suppress:** the seat question is load-bearing ("the actual feature" per roll-call — the co-pilot
  choice). Killing it whenever an override fires strands a user on autopilot forever, unaware a seat exists —
  the exact "they assume it's fixed and leave" failure roll-call warns against.
- **Not keep:** brief + first-meeting splash in one voice is the jar Andrew named.
- **Reword:** when an override fired, step 6 uses **returning-user re-offer framing**, sequenced as one
  coherent close after the brief — *"…and you've never told me which seat to co-pilot; want to pick one?"* —
  never the fresh "Which chair is yours?" first-meeting splash. One persona, one voice.

**Timing:** recommend bundling into this build — it is ~2 sentences in the same step 6 we are already touching,
and it is a correction Andrew has already flagged once. Defer-eligible to phase 2 **only** as pure polish,
since after ruling (a) both halves are individually correct and the residual is low-severity. Also prose, not
gateable — verified by the same scenario as (a).

---

## 9. Acceptance criteria (Glitchtrap)

| # | Scenario | Pass |
|---|---|---|
| 1 | Empty-payroll first run | `inv=ok`, no `inv_*` lines; **zero** Bash directory-listing calls in transcript during card draw; card renders; time-to-card ≤ ~27s (baseline 58s). |
| 2 | Populated payroll: plant 3 user agents incl. `bitforge-engineer.md` | `inv_agents` lists all three with `bitforge-engineer*`; staff table + collision line render from facts, no Bash scan. |
| 3 | Namespacing | bare `bitforge-engineer.md` → `*`; installed `robotinc:*` plugin agents produce **no** false collision. |
| 4 | Truncation: plant > cap assets | `inv=partial` + `inv_truncated=true`; **all** collisions present; consumer hand-scans only the remainder. |
| 5 | Returning user (sentinel/profile present) | `inv=off`; no inventory tokens beyond the marker; no scan. |
| 6 | Mid-session "I added an agent" | plant an agent **after** session start, invoke hiring-round → it re-scans live and finds it (does not trust the stale snapshot). |
| 7 | Sub-scan failure: make `<config>/agents` unreadable | `inv=partial`; six core keys intact; successful sub-scans still ship; session opens; no Bash-permission regression. |
| 8 | Error isolation: genuine-throw in inventory gather | `inv=error`; six core keys intact; session opens; no core-fact regression. |
| 9 | Delimiter-unsafe id | skipped from list; `inv=partial`. |
| 10 | `scripts/validate.mjs` | `STOCK_AGENT_IDS` cross-check passes; hook shape/timeout gates still pass; expected line reflects `3 hook scripts`. |
| 11 | Ruling (a): home-persona state, `cwd_is_config_dir=true` | step 5 does **not** render local state; global state still renders. |
| 12 | Ruling (b): override fired + seats-less profile | brief + returning-user seat **re-offer** in one voice; no first-meeting splash phrasing. |
| 13 | Regression | `scripts/test-otto-facts.mjs` green (new count), `scripts/test-otto-state.mjs` green, `scripts/validate.mjs` green. |

---

## 10. POSIX gate additions (`docs/posix-gate-22.8.0.md`)

The Mac/Linux gate must additionally prove the inventory is platform-invariant — this is exactly where a
`readdir` ordering or path-separator difference would surface:

1. **Test count:** `test-otto-facts.mjs` expectation rises from `17/17` to the new total (§9 #12); update the
   PASS line. `validate.mjs` expected line already reads `3 hook scripts`.
2. **Inventory structural parity:** with a planted user payroll (incl. one collision), assert the emitted
   `inv_*` lines carry the **same keys, same order, same `*` marker** on Windows, macOS, and Linux — the
   inventory block is structurally byte-identical cross-platform, same standard the six core lines already hold
   to. Ids may sort differently across filesystems; assert on **set membership**, not line order.
3. **Path reconstruction under POSIX separators:** confirm the consumer rebuilds `<config>/agents/<id>.md` with
   `/` and the card's staff table renders — no scan.
4. **No-scan proof on POSIX:** extend the Session-1 transcript grep to assert **no Bash directory-listing call**
   (`ls`, `find`, `Glob`-shell, etc.) fired during the card draw — the POSIX analogue of the existing
   `CLAUDE_CONFIG_DIR`-grep check.

The `docs/interactive-friction-gate-22.8.0.md` Scenario 1 should also gain a "no directory scan during card
draw" watch item, and its "Findings filed upstream" section can be closed out by pointing at rulings (a) and
(b) above.

---

## 11. The 2–3 riskiest calls

1. **Gathering only when `sentinel=absent AND profile=absent` (§4).** The tradeoff: a hiring-round re-run on a
   returning user pays the old scan cost rather than reading facts. Chosen deliberately — the alternative,
   gathering every session, taxes every steady-state launch to save a rare, explicit, non-latency-critical
   action. The 58s→25s win is a *first-run* win; steady-state token cost is the thing we refuse to regress.
2. **Collision-by-filename in the hook, name-divergence left to the model (§5).** The hook cannot see
   frontmatter, so a file whose `name:` diverges from its filename is a collision only the model catches. The
   tradeoff is a two-place collision check; mitigated because `hiring-round` step 3 already does the
   content-level half and the hook owns the common case cleanly. The alternative — teaching the hook to parse
   frontmatter — reintroduces exactly the content-read the design forbids.
3. **Ruling (a) fixed in this build (§8a).** Bundling a state-reader guard into a latency spec widens scope.
   Chosen because the fix is one clause reusing a fact already in the block, closing a *reproduced data leak*
   symmetric to a guard already shipped here — the cost of deferral (one machine's work shown under another
   persona) outweighs the tidiness of a tight scope.
