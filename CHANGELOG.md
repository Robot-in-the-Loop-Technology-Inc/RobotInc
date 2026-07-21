# Changelog

## 22.9.0 — 2026-07-20

**Offboarding: safe removal flow, install/upgrade documentation, validator exemption for state-file references.**

### New: `/robotinc:offboard` command — consent-gated teardown

A command to offboard safely: pause the plugin (fully reversible) or remove RobotInc with a full inventory of local files, per-category consent, and exact receipt of what was removed. Built from the spec in `docs/spec-offboarding-22.9.md`.

Handles four categories:
- **Silent residue** (Otto's auto-written state and logs): otto-state-global.md, .otto-met, .otto-pending/, otto-trace.log, otto-ledger.log, per-project .claude/ files — recommend delete.
- **User data** (profile and org JSON): otto-profile.json, otto-org.json — recommend keep (separate consent).
- **Settings we added** (shown as reverse diff): permissions.deny, permissions allowlist, CLAUDE_AUTOCOMPACT_PCT_OVERRIDE — revert only what user approves.
- **Work product** (never offered for deletion): TASKS.md, DREAM.md, deliverables — listed to reassure, deletion requests refused.

Inventory scans `<config>` and current project `<cwd>/.claude/` with full confidence. Reads `otto-state-global.md` to list other projects RobotInc touched and directs user to run offboard again in each.

Two-path entry: "Just pause it" (fully reversible, `/plugin disable robotinc@robotinc`) or "I want it gone" (full cleanup flow). Closes with both exits and marketplace-remove warning every time, regardless of what was cleaned.

Negative test (Glitchtrap): confirmed on clean sandbox TWICE — never inventé residue, correctly distinguished plugin install cache from RobotInc files. Positive path verified with filesystem checks: inventory accurate, per-category consent honored, deletion verified, profile/settings/work byte-identical untouched, receipt matched reality.

### Documentation: Install and uninstall paths, CI/CD honesty

- **Install:** Added CLI path block in `## Install` section with explanation (`claude plugin install robotinc@robotinc --scope user -y`; `--scope user` installs across every project, `-y` skips confirmation for scripted/headless runs).
- **Uninstall:** New peer section (same level as `## Install`) with guided `/robotinc:offboard` path, raw commands (`/plugin disable`, `/plugin uninstall`, `claude plugin uninstall`), and marketplace-remove trap warning in blockquote.
- **Upgrade story:** Added direct "CI yes, CD no" answer near the top of "Staying up to date" — releases gated on our side (validated, version-bumped, or don't ship), delivery to your machine is pull-only (manual command or opt-in auto-update). Cross-linked to new Uninstall section.

### Free-text routing

Added one routing line to Otto's system prompt: free-text intent ("how do I uninstall this," "turn RobotInc off," "I want this gone") lands at `/robotinc:offboard` without user needing to know the command name.

### Validator gate: offboard.md exemption from state-file-mention rule

`scripts/validate.mjs` gate (otto-state.md / otto-state-global.md single-writer rule) exempted `commands/offboard.md` — the only place outside Otto's prompt and the state-writing hooks where these files are named. Exemption is scoped: command only reads and reports what exists; it does not write or modify either file. Gate remains active for all other prompts.

---

## 22.8.4 — 2026-07-20

**Escalation doctrine clarified: dispatch-time model override beats frontmatter pin.**

### Fix — Otto can escalate to opus via dispatch-time model override

The escalation doctrine claimed no robot's model could be changed once pinned ("every pin is fixed frontmatter"). Verified against Claude Code's actual model-resolution order: a Task dispatch's per-invocation `model` parameter **overrides** the subagent frontmatter pin. 

Otto still cannot change his own model (`model: inherit` stands), but he can now dispatch any robot on opus at the call site for a hard build. Standing rule (Andrew-approved): genuinely hard builds, and any robot triggering the stuck-loop condition, escalate back out on opus rather than retry locally.

Escalation remains two moves, not self-switch: either route to Vector (already pinned opus), or dispatch the owning robot on opus.

## 22.8.3 — 2026-07-16

**Trace attribution fix, honest ledger token counts, per-project cost attribution — plus the activity-window viewer prototype.**

### Fix 1 — crew identity restored in the trace log

`hooks/otto-trace.mjs` indexed `ROBOTS[agentType]` with the raw namespaced `subagent_type` (`robotinc:cathode-design`) against un-prefixed map keys — the lookup never hit for any plugin-sourced robot, so **every crew completion logged as anonymous `🤍 robotinc:<type>` with no role**, and `/standup` (which reads the same log) misattributed every crew result. Fixed with the same `bareType()` strip `otto-state.mjs` already carries (duplicated, not imported — hook scripts run standalone; that is the existing convention). Built-ins and genuine third-party types render exactly as before. Same bug class as the Gantry-badge incident recorded in the file's own header.

### Fix 2 — ledger token counts were inflated ~50–200×

The ledger writer summed the `usage` object across **every** transcript message. Anthropic's per-message `usage` is the *total context that call processed* — under prompt caching it grows every turn, so summing compounds massively (a real 123k-token Bitforge run ledgered as 6.72M; a 55k Sonar run as 1.05M). Fixed: read only the **final** message's usage snapshot (input + output + cache_creation + cache_read), which *is* the run's total — verified within ~1% of Claude Code's own task-completion totals on multiple real runs. The meaning of `tokens=` is now documented in the writer's header. Old inflated lines remain on disk (append-only log; history is history).

### Per-project cost attribution

Every ledger line now carries a `[project]` tag (`basename(cwd)`, same derivation and bracket convention as the state files):
`<ISO-ts> [<project>] <robot-name> tokens=<N> duration_ms=<M>`
Old untagged lines still parse everywhere (tag optional in the viewer regex). This gives per-robot-per-project cost for free at read time; *purpose*-level attribution was considered and deliberately rejected as judgment-based rather than mechanical.

### New: `viewer/` — activity-window v0 (prototype-grade, deliberately unstyled)

A dependency-free local viewer for the live crew feed: `node viewer/server.mjs` → http://localhost:4173. "Working now" renders a card per live `.otto-pending/` marker (badge, name in crew color, role, task, running clock — appears at dispatch, clears at completion); "recently finished" joins `otto-trace.log` with `otto-ledger.log` for result summaries, per-project tags, and token cost. Node built-ins only, resilient to mid-read marker deletion and mixed-format ledger history. This is the substance layer of the planned activity window — the pixel render pass (Cathode) comes later, on this proven loop.

### Gates

- **New suite `scripts/test-otto-trace.mjs` 23/23** — attribution (incl. the negative "raw `robotinc:` in a rendered line = fail" gate), token computation against a real-shape transcript fixture (asserts fix ≠ inflated sum), tagged-ledger write, negative tag-missing guard, viewer parse of new/legacy/garbage shapes. `otto-trace.mjs` refactored to the exported-`run()` + `isMainModule()` pattern the other hooks already use.
- test-otto-state 51/51, test-otto-facts 40/40, validate.mjs clean.

### Caveat — POSIX gate still owed

Same standing waiver as 22.8.2 (third deferral, explicit owner instruction, risk assessed low — Node path APIs, hex ids). POSIX confirmation owed on Mac/Linux; scope unchanged in `docs/spec-relay-async-fix.md` + `docs/posix-gate-22.8.0.md`.

## 22.8.2 — 2026-07-15

**Relay-writer fix for background-default subagents (Claude Code 2.1.211 regression).**

CC 2.1.211 runs subagents in the background by default. `PostToolUse(Agent)` now fires at *dispatch* with `status: "async_launched"` and no result content — not at completion. The shipped relay writer (v22.8.0/22.8.1) keyed on that event and, unhandled, stopped producing correct state entirely (confirmed live: zero relay lines across five real dispatches this session). The deterministic writer built to remove the model from the state path was in effect dead — only Otto's manual backstop kept the session-open brief alive.

### The fix: split the write across the two events that each hold half the key

The upsert key is `(project, robot, slug(description))`. Under background execution the dispatch event holds `description` but no result; `SubagentStop` holds the result (`last_assistant_message`) but no `description`. So:

- `PostToolUse(Agent)`, `status:"async_launched"` → writes no state line; drops a correlation marker `<config>/.otto-pending/<agentId>.json` = `{description, subagent_type, cwd, ts}` (agentId sanitized to `[a-zA-Z0-9_-]`, barring path traversal).
- `SubagentStop` → now also runs through `otto-state.mjs`; recovers the marker, writes the one real state line (summary from `last_assistant_message`), deletes the marker. No marker → no-op.
- `PostToolUse(Agent)`, `status:"completed"` (foreground) → unchanged.

Exactly one state write per item in every path — the marker's presence is the deterministic "you own this write" flag, so no double-write and no `status` inspection needed at `SubagentStop`. The `.otto-pending/` directory doubles as the live "who's working now" substrate for a future activity view.

Correlator (`agentId` == `SubagentStop.agent_id`) confirmed byte-level against the installed 2.1.211 binary + this session's own transcript — no session restart needed.

### Gates
- `scripts/test-otto-state.mjs` 51/51 (added H1–H6; H1 is the literal regression test — asserts no `(no result)` anywhere on disk; concurrency tests 9k/G7/R10–R12 re-pointed at the `SubagentStop` entry).
- `scripts/validate.mjs`: new source-text gates — `hooks.json` `SubagentStop` wires both `otto-trace.mjs` and `otto-state.mjs`; `otto-state.mjs` references `async_launched`, `SubagentStop`/`hook_event_name`, `.otto-pending`.
- `scripts/test-otto-facts.mjs` 40/40 unchanged.

### Caveat — third Mac/POSIX gate deferral (explicit owner waiver, 2026-07-15)

Shipped on Windows-green evidence with the POSIX gate deferred a third time at Andrew's explicit direction; WSL/Linux was unavailable to run the gate locally. Residual risk assessed **low**: the fix uses Node's cross-platform path APIs; the operations involved (atomic rename, mkdir-lock) are better-behaved on POSIX than the Windows path already tested green; the one real POSIX divergence (case-sensitive filenames) is mooted by hex agentIds. POSIX confirmation still owed on Mac/Linux — scope in `docs/spec-relay-async-fix.md` (sanitized-id filename round-trip, macOS case-fold collision check, concurrency tests re-pointed at `SubagentStop`). This consciously overrides the repo's "no third consecutive POSIX-gate waiver" policy by direct owner instruction.

## 22.8.1 — 2026-07-15

**Persona-root guard closes cross-persona state leak (read) and corruption (write); five guard surfaces.**

Hotfix shipped on proxy evidence: S1–S4 guard surfaces verified by Bitforge (S1/S2 prompt-read, S3/S4 code-unit tests + hook subprocess proxy), S5 model-driven hand-write verified via prompt-decision proxy. Full nested-Task live-fire (R18/R19/R20) deferred to Mac POSIX gate post-merge per policy waiver 2026-07-15.

### The five guard surfaces (S1–S5)

Cross-persona leak affected relocated-`CLAUDE_CONFIG_DIR` sessions launched from a persona-root directory (home with a full identity: `otto-profile.json`, `.otto-met`, `otto-state-global.md`). The session's facts hook compared `cwd_is_config_dir` against the *active* (relocated) config and read `false`, missing the foreign persona root. All five surfaces now gate on **both** `cwd_is_config_dir=false` **AND** a new fact `cwd_persona_root=false`:

- **S1:** Step 1 override (a) — card suppression on foreign state misread as project evidence ✓
- **S2:** Step 5 — brief render leaked foreign work table verbatim ✓
- **S3:** Inventory `inv_agents_project` — double-count guard on project-agent enumeration ✓
- **S4:** Hook backstop — PostToolUse guard prevents appending relay lines to foreign persona's real file ✓
- **S5:** Model hand-write — "Announcing a handoff" step 2 guard prevents model Read+Edit of foreign file ✓

### New fact: `cwd_persona_root` (core, always-present)

Hooks/otto-facts.mjs now emits a seventh core fact (was six): `cwd_persona_root` — boolean, true when `<cwd>/.claude` holds any persona-identity marker (`otto-profile.json`, `.otto-met`, `otto-state-global.md`). Existence check only; never reads contents. Computed every session (not first-run-gated).

### Verification and caveats

**Read surfaces (S1, S2) + code surfaces (S3, S4):** Glitchtrap verified; unit tests 40/40 + 44/44 (facts + state suites). Bitforge proxy-ran S5 (model decision + hook subprocess against real fixture).

**Caveat (a): Platform gate waived again.** Mac/Linux POSIX sh verification (including R18/R19/R20 full nested-Task live-fire) deferred to post-merge per explicit Andrew authorization 2026-07-15. This hotfix now carries the waiver for *both* 22.8.0 additions (hook payload shape, facts injection) *and* 22.8.1 additions (persona-root fact + five guard surfaces). **POLICY:** no third consecutive release with untested POSIX gates. Mac hardware test is hard-owed before 22.9.0 ships.

**Caveat (b): S5 shipped on proxy evidence.** Model's hand-write (step 2 of "Announcing a handoff") was exercised via Bitforge's decision-prompt against real amended prompt text + real captured facts block, not a nested-Task live dispatch (no permission for real nested-Task from this environment). Full live-fire proof (R18/R19/R20) included in post-merge Mac gate scope.

### Files and line changes

- `hooks/otto-facts.mjs` (+56 lines): compute and emit `cwd_persona_root`
- `hooks/otto-state.mjs` (+41 lines): gate local write on persona-root + config-dir check
- `agents/otto-foreman.md` (+84 −, reworded prose): extend overrides (a), step 5, "Announcing a handoff" step 2 with both-guard conditions; update core-facts count (6→7)
- `docs/spec-persona-guard-22.8.1.md` (+463): design rationale, all five surfaces, error polarity, edge cases
- `docs/persona-guard-live-gate-22.8.1.md` (+245): runbook + Bitforge Windows run log (S4/S5 proxy evidence)
- `scripts/test-otto-facts.mjs` (+195): new tests R1–R15 covering persona-root probe, both-guard OR, symlink follows, marker absence, error polarity
- `scripts/test-otto-state.mjs` (+82): new tests for persona-root gate, genuine project regression
- `TASKS.md`: updated post-merge debt item (Mac gate scope now lists R18/R19/R20 requirements)

## 22.8.0 — 2026-07-15

**Deterministic relay-state writer + global state, session-open facts injector, first-run hiring inventory (58s→38.5s).**

This is a T1 release with two new hook scripts (`otto-facts.mjs`, `otto-state.mjs`) adding deterministic facts injection at session open and relay-state persistence with home-dir user support. First-run latency cut 58s → 38.5s by moving 31s of directory enumeration off the model's critical path.

### Session-open facts injector (`hooks/otto-facts.mjs`)

Resolves `CLAUDE_CONFIG_DIR`, checks sentinel/profile presence, reads `cwd_is_config_dir` state, and emits a facts block on every session-open. Eliminates the model's need for a Bash permission prompt on first-run to resolve its own config path (bug 1, reproduced live by Andrew). Fixes home-persona collision bug where override (a) mistakenly suppressed the card (bug 2, reproduced live).

**Payload:** six core existence facts + optional inventory block (§ below). Gate: SessionStart hook, second entry alongside the existing echo trigger. Node-only (fail-silent if absent); core facts still live in the shell-echo trigger so the protocol never depends on Node.

### Session-open inventory — first-run performance cut

Folds first-run hiring-round directory enumeration (31s measured) into the facts hook (runs in 467ms off-path). Emits bare ids, type tags, and filename-collision flags; never reads file contents. Consumer hand-scans only on `inv=off`/`partial`/`error` or mid-session re-runs (staleness rule). Truncation policy: hard cap ~1800 chars; collisions always emitted; oldest type dropped in priority order when budget exhausted.

**Failure modes:** entire gather throws → `inv=error` + six core facts intact; sub-scan fails → `inv=partial` + successful scans ship. Inventory is wrapped in try/catch, independent from core facts.

**Validation gate:** cross-checks `STOCK_AGENT_IDS` (all 14 agent basenames including `otto-foreman`) against `agents/*.md` filenames; rejects mismatches at build time.

### Relay-state persistence + table brief (`hooks/otto-state.mjs`, `agents/otto-foreman.md` step 5)

PostToolUse hook writes each crew call to global + local state files. Reader merges and renders top-5 in a table: `| Robot | Working on | Last update |`. Home-dir users (cwd = config dir) get global state only; project-local `.claude/` gets local too. Cap at 8 lines per file, recency-based eviction (newest first). Every relay is an upsert (no content inspection, no "done/active" inference — the robot's own wording carries the signal).

**Built-ins filtered:** Explore, general-purpose, Plan, claude, statusline-setup produce no state. Unknown crew → 🧩 badge.

**Staleness:** always relative ("today"/"3 days ago"), not raw date. Re-runs after first reply re-scan live (do not trust session-start snapshot).

### File-structure improvements

- `docs/hook-events.md` — PostToolUse payload shape, `tool_name` gate trap, plugin namespacing on `subagent_type`
- `docs/spec-facts-inventory-22.8.0.md` — complete inventory design with rulings (a) home-persona state guard, (b) override-fired seat re-offer wording
- Updated headers on state files: *"recent work, newest first, active among it"* (was: false "terminal results clear" contract from removed v22.8.0 build phase)

### Measured verification (Glitchtrap, Windows)

**Session-open facts:** 17/17 acceptance tests pass. First-run card draw: zero Bash directory-listing calls. Bug 1 fix verified (no shell-out before facts block). Bug 2 fix verified (home-persona collision guard active).

**Relay-state:** 40/40 tests pass (33 functional + 4 regression). Cross-process lock contention handled; append-degrade + self-heal verified. Upsert deduplication works; cap-8 eviction verified. Round-trip render verified byte-for-byte.

**Integration:** 23/23 negative tests pass (9a–9m covering lock exhaustion, built-in filtering, hired-staff badge, concurrent writes, truncation, error isolation). Home-dir persona smoke test verified (state written global-only, brief renders line correctly).

**Regression:** all prior-release suites green (otto-state, otto-trace, otto-foreman prose gates).

### Scope and post-merge work

**In scope, this release:** deterministic writer + global state, facts injector, inventory enumeration, facts validation gate, relay-state reader integration, home-persona guard (ruling a), seat re-offer reword (ruling b), ~25s first-run floor on empty payroll verified.

**Out of scope, phase 2:** PreToolUse "pending" marker, model quality on summaries, project-aware filtering.

**Platform gate (POLICY — waivers by explicit authorization only):** macOS/Linux POSIX sh verification waived by Andrew 2026-07-15 (defer post-merge test to Mac hardware). SessionStart echo trigger + PostToolUse hook type still require verification on macOS when available; no shipping without it for future releases.

## 22.7.2 — 2026-07-14

**Rigor tiers doctrine and per-robot spend ledger.**

This is a T2 docs+finance release. No measurement boards; mechanical verification only (3/3 stdin cases, validator
green with 2 new negative-tested gates).

### Rigor tiers doctrine

Workshop (design-time, T0), release (T1: shipped once; T2: ship-ready but not shipped; T3: archived), and each
dispatch names the tier. Otto reads `tier:` frontmatter and routes accordingly. Explained in `docs/rigor-tiers.md`.

### Per-robot spend ledger

`otto-ledger.log` — one line per subagent call: robot, tokens+duration, ISO-8601 timestamp. Hook-derived from
transcript analysis, Node.js only (fail-soft: absent on systems without Node). Each robot gets a ledger line;
Otto's main-thread spend is estimated, not ledger fact, because Otto is the main thread (cannot observe itself).

**Baudrate's new duty:** per-robot spend audit + spend-vs-tier alignment check. Reads the ledger at session
close, compares each robot's measured spend to its model tier, flags outliers (e.g., Haiku agent burning Sonnet
tokens). Otto co-pilots the audit results.

**No on-by-default ledger claim.** The ledger is infrastructure; it does not claim to be a user feature. It
exists so Baudrate can audit it, and that is the only claim made.

## 22.7.1 — 2026-07-14

**Hotfix: upgrader re-card suppressed; silent no-op on fresh users eliminated.**

`.otto-met` did not exist before 22.7.0. On upgrade, every existing user — seated, tiered, weeks into using
the crew — read as "never met" on their first 22.7.0 session and got the full banner and card, spuriously,
exactly once. The untested state was profile-with-seats, no sentinel, no state file; the maintainer's own
machine had a hand-written sentinel and never hit it, so nothing caught this before release.

### Measured fix (staged deployment)

**Upgrader re-card:** **0/10 fail**, self-heal **10/10**. Step 1 of the session-open protocol gains a second
override: if `<config>/otto-profile.json` exists and carries a `seats` key, a missing or unreadable sentinel is
overridden to present — the card is suppressed — and `.otto-met` is self-healed (written, one ISO-8601 line) so
the override never has to fire twice for that user. Suppresses the card only; step 6 (seat-question path) keeps
its own independent condition and is untouched. A profile *without* seats does not trigger this override.

**Silent no-op on fresh users:** was 2/15, **now 0/15**. Root cause was the word "silence" in both the hook
trigger payload and the protocol-opener prose. Reworded both; no users now hit the protocol without seeing
something in their reply.

**Sentinel weld:** Write-before-card confirmed in every run where the write landed. The write is a tool call
gated on prompt-level condition, not code-level guarantee; if it does not fire, the override re-evaluates from
scratch next session at no worse cost.

**A/B fail-closed gates:** 0 failures, six consecutive rounds.

### Residual (documented not hidden)

~1/15 sentinel write lands in a typo'd path (model-level path construction error, 3rd occurrence across all
rounds; real-world rate unknown, plausibly lower on ~/.claude than artificial sandbox paths). Partially
self-healed by this release: any user with a seated profile gets the card suppressed and sentinel rewritten by
the new override. Worst case: one repeated banner for a user who was carded and never engaged. **Structural fix
needed:** remove the model from config-path string construction entirely. Same root family as the relay-writer;
consider solving both with one mechanism.

**Validator.** New gate locks `.otto-met` to exactly two writers — `skills/roll-call` and
`agents/otto-foreman.md` — now that the self-heal makes the foreman a writer of it for the first time, not
only a reader. A third file mentioning it fails the build.

## 22.7.0 — 2026-07-14

**Session-start auto-onboarding: banner on install, brief on every subsequent session, no command typed.**

New users see the card exactly once; everyone else gets a brief of active work on session open. Built on three
new files — a sentinel (`.otto-met`, written by roll-call), state (`./.claude/otto-state.md`, written at relay
time), and a hook (SessionStart, fires once per session). **Tested across 235+ nested sessions.**

### What ships

**The hook and brief reader.** A SessionStart hook fires at session start with a static `[RobotInc Auto-Onboarding]`
tag. Otto's system prompt reads the tag and runs a session-open protocol: check the sentinel; if missing, run roll-call
(banner + card + seat question); if present, read the state file and echo the top ≤5 lines as a brief, then "What can
I help with?" If the user mutes the brief with `style.avoid: ["session-start-brief"]`, it skips silently.

**The backstop.** A project-local `otto-state.md` with any valid line overrides a missing or unreadable sentinel —
so a cloned repo where the sentinel got left behind will show state from the current project without re-triggering
the card. Prevents lockout; never touches the seat question, which runs independently.

**Fail-closed on hook failure.** If the hook fails to fire — missing, timeout, any error — Otto does nothing extra.
No sentinel read, no profile hunt, no degradation to a fallback rule. A bare session. This removes a class of bugs
where a hunt for the sentinel under a general rule, with no concrete trigger, occasionally resolved to the wrong
directory and read a stranger's profile. **A brand-new user whose hook fails gets a plain session, not a wrong one.**

### What does not ship

**The relay writer.** Otto is documented to write a line to `otto-state.md` each time a robot hands work back.
That weld is designed, present in the code, and negative-tested across 15 runs. **But the write path never
executes** — the relay machinery is wired but dormant. The brief reader ships with nothing to read yet. **The next
release will ship the writer via a PostToolUse hook** (same trigger-at-work-time pattern as SessionStart, tested
in isolation; full integration untested). Until then, `otto-state.md` carries only entries from previous tools or
manual edits. **This is intentional:** the brief stays silent unless a human or another plugin wrote the state,
which is safe and correct, never wrong.

**Do not claim in release notes that the brief shows "ongoing work" or that the crew "remembers what you were
working on across sessions."** Both are deferred features. The brief shows state *if state exists*; a silent brief
is not a bug, it is the state being empty.

### Known warts (ship with these)

- **Empty brief.** 1 in 10 runs renders the seat question as commentary instead of the bare "What can I help with?"
  when no state exists. Rare, caught mid-measurement.
- **Half-onboarded re-card.** 1 in 10 runs re-triggers the card on a cloned repo when the sentinel was missing but
  a path-typo hallucination prevented the backstop from reading the state file. Rare; the backstop works correctly
  10/10 when the state file exists and is readable.
- **Relay format.** 1 in 10 runs renders the relay line without the ↳ prefix (renders as plain prose). Rare; the
  state upsert itself is correct.

### Untested (must be named)

- **macOS/Linux sh.** The hook payload was verified byte-identical on Windows PowerShell and Git Bash only. POSIX
  behaviour is reasoned, never run. This is the second release in a row with this gap (first was v22.6.0).
  **Before shipping to prod, run the full sequence on macOS or Linux — session 1 with hook, roll-call, card, seat
  question; session 2 with brief. If the hook times out or fails to inject the tag, escalate immediately.**

## 22.4.0 — 2026-07-12

**Two jobs assigned to robots that cannot physically do them.**

Audited the tiering and compaction machinery rather than assuming it still held. **Model tiering came out
perfect** — all fourteen pins real, and correct per doctrine §3.2: **haiku** for Gantry (sequencing, status —
mechanical, where cheap genuinely wins), **sonnet** for the eleven judgment robots **including Baudrate**,
**opus** for Vector, and **`inherit`** for Otto so he never overrides the user's own session model.

But two *instructions* were impossible.

### "Escalate the model" — Otto cannot do that either

22.0.0 stripped this from all thirteen robots: a robot's `model:` is **pinned frontmatter it cannot change**.
**I gave Otto a pass, assuming he could. He can't.** He is `model: inherit` — he runs at *their* session model
and has no more power to switch it than anyone else. The claim sat in the **per-turn prompt**, which is the
worst place for a false one.

> **"Escalate" means route, not switch.** The hard call goes to the robot **already pinned high** — 🟣 Vector
> runs opus. And if the work genuinely needs more than the session is giving it, **say so plainly and let them
> decide.** Never imply you quietly upgraded yourself.

**Escalation by routing is the whole point of the tiering.** Nothing switches; work *moves* to where the right
model already is.

### Compaction — Gantry was told to watch something invisible to him

He owned *"compaction hygiene: when context grows long, flag it."* **He is a subagent. He has his own context
window and no view of the main thread's.** *"Context is getting long"* is a judgment he **cannot make** and an
action he **cannot take** — and he was pinned to haiku while nominally responsible for it.

**It's Otto's, and only Otto's**, because he is the only one who can see the window he is in:

- **Auto-compaction at ~75%** stays real and enforced — a genuine `settings.json` value Switchboard writes.
- **The timing beyond that is Otto's**: propose `/compact` at a **task boundary, never mid-task**, with a
  three-line preservation note — seat and tier · active branch · the decisions expensive to rediscover.
- **Compaction is a handoff, not a bin-empty.** Write the note as though handing the work to someone who was not
  here — **because after the squeeze, that is exactly what happens.**

Gantry keeps the half that *is* his and that he can actually do: **`TASKS.md` is how the next session knows
where it stands**, so he writes it as though the session is about to end mid-task. *"Write the file that
survives; leave the timing to him."*

## 22.3.1 — 2026-07-12

**Two overclaims in yesterday's card, caught before anyone read them.**

**1. MCP servers are not owned by a robot.** 22.3.0 put hooks and MCP under *"NOW REPORTS TO → 🤖
Switchboard"*, which reads as exclusive ownership. **It isn't.** **Every robot inherits every MCP server** —
none of them declare a `tools:` allowlist, because one would *blind* them. A user's GitHub server is not
Switchboard's private tool: **Bitforge uses it, Sonar uses it, the whole floor uses it.** Switchboard
*administers the connection*. The column is now **FILED UNDER**, and MCP rows read
`🤖 Switchboard · Ops (admin — every robot uses it)`.

**2. "Your tool is now an employee of Bitforge" is a nice line and a slight lie.**

**Their agents and skills already worked** — Claude Code auto-delegates from **their own** `description:`
frontmatter, every turn, for free, and did so before this plugin existed. **We did not make their tool work,
and filing it does not make it work better.** Implying otherwise gets caught **the first time the tool behaves
exactly as it always did** — and then the whole org chart is worthless to them.

So both `roll-call` and `hiring-round` now state what filing actually does, and it is exactly three things:

| | What actually changes |
|---|---|
| **`prefer`** | Otto reaches for **their** tool first for a named job. **The only one that changes behaviour** — and only with an explicit yes. |
| **Department** | They can *see* who owns what. **A record, not a rewiring.** |
| **Collision** | We tell them their file has been shadowing our robot. **Detection, not a change.** |

**The honest version is the warmer one anyway:**

> ***"It's yours, it stays yours, and now I know when to reach for it."***

## 22.3.0 — 2026-07-12

**"I've filed your people, and I haven't touched one of them" — said as a sentence, and then shown.**

The card *claimed* to seat the user's own tools. It showed a **two-row table** (one agent, one skill), and the
promise that nothing was overwritten appeared as **three words in a footer**. Three things were wrong with that:

**It never showed hooks, commands or MCP servers.** The hiring round *walks* all of them — `~/.claude/hooks`,
`commands/`, `settings.json`'s `mcpServers` — and then the card silently dropped them. Someone with a
`pre-commit` hook and a GitHub MCP server saw no evidence either had been noticed, let alone kept.

**It never surfaced a collision.** This is the one that actually matters. Claude Code resolves an agent by
**name**, and a user-level file **wins**. So someone who owns `~/.claude/agents/bitforge-engineer.md` has had
**their** agent running all along and ours has **never executed** — and the platform says nothing. The card was
the one place they'd find out, and it didn't tell them. **They are entitled to know that before they trust a
word of the roster.** It now goes *above* the table, in plain language:

> ⚠️ **You have your own `<name>` — and it outranks mine.** Yours is what actually runs; my `<name>` has never
> executed on this machine. **Yours keeps the job.** I haven't touched your file and I won't.

**And the promise was buried.** *"nothing overwritten"* in a footer is not reassurance — **it is the fear they
arrived with**, that installing a company of robots means something they built gets bulldozed. It costs one
sentence to answer, so it now gets one, before any table:

> **You already have staff. I've filed them, and I haven't touched a single one.**
> Nothing of yours was renamed, moved, disabled, or overwritten — the only thing that changed is *my record* of
> who works here.

### The org chart, not an inventory

The table now carries **what each thing is** and **who it now reports to** — because *"a skill of mine now
reports to Marketing"* only lands if you can see that it is a skill:

| | THEIRS | WHAT | NOW REPORTS TO |
|---|---|---|---|
| 🧩 | `<their agent>` | agent | 🔩 Bitforge · Engineering |
| 🧩 | `<their skill>` | skill | 🔵 Holovox · Marketing |
| 🧩 | `<their command>` | command | 📋 Patchbay · Product |
| 🧩 | `<their hook>` | hook | 🤖 Switchboard · Ops |
| 🧩 | `<their MCP server>` | mcp | 🤖 Switchboard · Ops |

**Hooks, MCP servers and settings always file under 🤖 Switchboard** — they are the *environment*, and the
environment is the Chief of Staff's department. **Do not strain to give a hook a department it does not have:**
a `PreToolUse` guard is not "Engineering" because it happens to fire on `Edit`. `hiring-round` now records a
`kind` alongside the department, because **Otto's card can render that column but cannot invent it.**

An **empty payroll still gets one line and no ceremony** — `13 robots · 38 skills · clean slate`. A clean start
is not a hole, and a "none found" table makes it look like one.

*(The gate that stops a real tool name from the maintainer's own machine appearing in these example rows was
re-tested against the new table. It still fires.)*

## 22.2.0 — 2026-07-12

**A release that looks delivered and isn't is the worst failure this repo can have. Now CI refuses one.**

Verified the plugin install/update mechanics against Anthropic's docs rather than trusting memory, and found
something load-bearing:

> **`plugin.json`'s `version` is Claude Code's cache key.** Push a fix to `main` without bumping it and every
> **already-installed** user's client sees the same version string and **skips the update entirely.** They stay
> on the old build. CI goes green, the fix is on `main`, and **it reaches nobody.**

We have bumped religiously every release, so nothing is broken today. But **nothing enforced it** — the
validator checked that `plugin.json` and `RobotInc.md` *agree* on a version, never that it *changed*. That is
the same disease as the whole 22.0.0 review: a rule held together by discipline with no gate under it, waiting
for the first tired commit.

**New CI gate:** if anything a user actually installs changes (`agents/ skills/ commands/ hooks/ settings.json
.claude-plugin/`) and `plugin.json`'s version does not, **the build fails.** Tested both ways against the real
22.0.0 → 22.1.0 diff: passes with the bump, fails without it.

### Install instructions corrected

- **Added `/reload-plugins` + a restart to the install block.** `/reload-plugins` is *supposed* to be enough,
  but it does not currently rebuild the command index, so a restart is what actually makes every robot and
  skill appear. **We would rather say so than have someone think the crew installed half-broken.**
- **Stopped promising auto-update works hands-free.** It is **off by default for third-party marketplaces like
  ours**, and there are open Claude Code issues where it refreshes the catalog *without reinstalling the
  plugin* — leaving you on the old build **while reporting that you are current.** The README now vouches for
  the manual path and says plainly why:

  ```
  /plugin marketplace update robotinc
  /plugin update robotinc@robotinc
  /reload-plugins
  ```

  *Turn auto-update on if you like; don't rely on it to have delivered a fix you are waiting for.*

**An install is pinned**, which is the good news buried under all that: Claude Code records the version at
install time and does not go hunting for a new one, so **nothing about someone's crew changes underneath
them.** Updates are pulled, never pushed. And `~/.claude/otto-profile.json` — their seat, tier, verbosity, and
everything the crew learned about them — lives outside the plugin and survives every update untouched.

## 22.1.0 — 2026-07-12

**The one line of instruction this product gets.**

The question was whether the startup card should carry install steps and some usage basics. **The answer is
neither — and the reasoning is the product.**

**Install steps on the card are absurd on their face.** By the time Otto draws it they have already installed;
telling someone how to get in while they are standing in the room is noise. That lives in the README, which is
the only surface a person can read *before* they own the thing.

**And a usage section would be a regression** — the exact thing four releases have been removing:

> A menu of thirteen robots does not fix it — **that is the manual again, wearing a costume.**

The card is *already* the onboarding, done right: it shows them the crew, asks which chair is theirs, then reads
**their actual project** and offers two or three real things. **If a human needs a usage section, the offer
engine has failed, and the section will not save it.**

### But two things cannot be discovered by working

Nothing in the flow will ever prompt them, so the card now prints **one line, and the product prints it nowhere
else**:

> *Nothing to learn — just talk. And you can retune me any time, in plain English:*
> *"be brief" · "put me in the design seat" · "who did that?"*

The second half is the one that matters. **Without it, a human sits through verbosity they do not want, in a
seat they never chose, because they assume it is fixed** — and then they leave, and we read it as *"they didn't
like it."*

### And the promise is now actually kept

A card that promises retuning while Otto quietly ignores it would be **precisely the class of bug the 22.0.0
review existed to kill** — a claim in one file that no other file honours. So Otto now carries the table:

| They say | He does |
|---|---|
| *"be brief"* · *"more detail"* | Changes verbosity **this turn**, then offers to save it. |
| *"put me in the design seat"* | Re-seats immediately; the new co-pilot speaks up in its own voice. |
| *"who did that?"* | Names the robot, badge and all — reading `otto-trace.log` if it scrolled away. |
| *"stop doing X"* | Stops. Second time, it is **a bug in the system** → `style.avoid`, with a yes. |

> **Never make them repeat a preference twice.** A retune that works this turn and is gone by the next session
> is *worse* than one that never worked — they will not ask a third time, they will just stop expecting to be
> heard.

`skills/roll-call/SKILL.md` also now carries the standing rule, so nobody later "improves" the card into a
brochure: **no feature list, no command list, no robot menu, and never install instructions.**

## 22.0.0 — 2026-07-12

**A full-repo consistency review, then one coherent correction — not a patchwork.**

Every file read in one pass first, findings logged, *nothing changed while reviewing.* The doctrine layer came
out clean: Tempo, Scale, `stuck-loop`, ownership, draft-never-send and the offer engine agree across Otto, all
thirteen robots, `docs/doctrine.md` and the skills. **What had rotted was the plumbing underneath** — and five
of the findings were things a stranger hits in their first hour.

### The lies we were shipping

- **🔷 Sonar's description claimed it "owns the deep-research skill." We do not ship that skill.** It is a skill
  on the *maintainer's* machine — the exact leak we gated in `roll-call` two releases ago, except **worse**: a
  description is injected into every user's context on **every single turn**, not drawn once. Now `market-scan`,
  which exists.
- **💰 Baudrate still taught *"the cheapest model that does the job"*** — the rule doctrine §3.2 explicitly
  **resolved against**. Switchboard got the fix in 21.5.0; **Baudrate, the robot whose own move off haiku *is*
  the case study, never did.** A settled doctrine that only some of the crew was told is worse than none: it
  produces confident, contradictory advice.
- **`/otto` still generated skills into `~/.claude/skills/`** while the README promised *"Nothing gets
  generated. There is no step two."* A fossil of the pre-plugin era that would have duplicated shipped skills
  under unnamespaced names on the user's own machine.
- **Otto's dispatch rule contradicted its own example two lines below it** — *"never include the agent's name"*,
  followed by `"Glitchtrap > Bitforge: …"`. **The validator *required* that example, so CI was enforcing the
  contradiction.** The rule now says what it always meant: lead with the role; a `From > To` handoff chain is
  the one exception.
- **📦 The trace hook did not know Gantry exists.** Every one of his runs logged as an anonymous `🤍` with no
  role — and **`/standup` reads that log**, so the crew's own morning brief reported one of its members as a
  stranger.

### Things that could not work as written

- **Four skills told robots to dispatch robots.** *"Invoke `glitchtrap-qa` (`context: fork` + `agent:`)"* — but
  every robot carries `disallowedTools: Agent`, and `context: fork` is not a Claude Code mechanism at all. A
  robot handed that instruction either errors or **quietly does the work itself**, which is precisely the
  *"department with no tools is a costume"* failure. All four now hand back to Otto, who dispatches.
- **`unit-economics` said Baudrate is "pinned to haiku, cheap."** He is sonnet, deliberately.
- **Thirteen robots were told to "escalate the model."** A robot's model is pinned frontmatter — **it cannot
  escalate itself.** Only Otto can, by dispatching a robot pinned higher. This violated the crew's own rule
  against dressing a discipline up as a system; here it was worse, instructing a capability that does not exist.

### The magic gap

**`/standup` — arguably the most coworker-like thing we have — was reachable only by typing `/standup`.** Our
own central bet is *"they cannot ask for what they do not know exists."* Otto now **offers** the brief, in one
line, when there is genuinely something to report (trace entries since they were last here, or a stale
`TASKS.md`). Silence when there isn't — an offer to summarise an empty day is worse than none.

And **a "no" now survives the session.** Declining the same offer twice is not a mood, it is a preference:
Otto proposes writing it to `style.declined`, with a yes, and stops. **A colleague who suggests the same thing
every Monday is nagging, and a nag gets muted.**

### One profile, one seat list

`otto-profile.json` was written by five files that each invented their own vocabulary (`"Ops"` was a seat name
nowhere else in the product). **`docs/profile-schema.md` now defines the whole file once**, including the
canonical seat list, and everything else points at it instead of restating it.

### The spec stopped lying

`RobotInc.md` opened by calling itself **`hercules-otto-orchestrator`** — two renames stale. Its title said
v21.1.0 while its frontmatter said 21.6.0. It carried a colour table for **nine** robots that contradicted its
own colour note **250 lines away**, a model table still assigning Baudrate to haiku, and a §5b menu of ~26
"power tools" **most of which do not exist.**

The file whose own banner warns that a stale parallel copy is *"the exact failure the plugin exists to
prevent"* had become exactly that. It now carries **two rules for anyone editing it**: *the tree is the truth —
this file explains why, it never restates what*, and *the imperative sections are history, not instructions.*
Four duplicated tables replaced by pointers.

We also **stopped claiming the colour collisions "never share a trace."** With 13 robots and 8 colours,
collisions are arithmetic, and **every** arrangement has pairs that co-occur — a pricing spec handed to the
engineer puts Baudrate and Bitforge in one trace however you shuffle it. **The badge is the identity channel;
the colour is a hint.** Saying otherwise was worse than the collision.

### The gates — this is what makes it durable

Four of the five P0s were **the same disease**: a robot changed and its copies didn't. So the fix is not the
fixes; it is that **this class can no longer recur silently.** Six new gates in `scripts/validate.mjs`:

1. **Hook roster ↔ `agents/`** — every robot present, with badge and role matching Otto's table.
2. **No prompt may claim a skill we don't ship.**
3. **Doctrine tripwire** — no prompt may teach *"the cheapest model that can do the job."*
4. **`context: fork`** — forbidden in skills.
5. **README skill count** — the README was never checked; only the manifests were.
6. The count regex is **no longer pinned to the phrase "seat-kit"** — rewording the line to the truthful *"38
   skills"* would otherwise have silently disarmed the check. *(And "seat-kit" was itself a small lie: nine of
   the 38 are company skills, not seat kits.)*

**Every gate was negative-tested — broken deliberately, confirmed to fire, reverted.** And the doctrine gate
**failed its own first test**: line-scoped, while the phrase wraps across lines, so it missed a real violation
*and* tripped on a legitimate rejection of the rule. Rewritten, retested, green.

> **A gate that has never failed is not a gate.** The one written to catch drift was itself broken, and only
> trying to break it revealed that.

### Efficiency, measured honestly

Otto's prompt: **4,056 → 4,006 words.** Descriptions: **550 → 535.** Switchboard's description went from a
72-word run-on to 47 — cheaper *and* a better routing signal, because a router matches on signal and the signal
was drowning.

**That is a smaller saving than the review projected, and the reason is worth stating: the same release added
four capabilities to Otto** (the standup offer, declined-offers, the schema pointer, the handoff exception) —
about 350 words of new function against ~400 words of trims. **Net: slightly cheaper per turn, with four new
behaviours.** Dressing that up as a big win would be exactly the kind of number this crew is built to refuse.

### Also

All thirteen robots now carry **their own badge** in their intro line and **their own name** in the attribution
example (every one of them previously signed as *Bitforge*), and **their own** activity-trace examples rather
than another robot's work. The duplicated "recurring work → routine" block was folded into the `Notice waste`
bullet — it is now in all thirteen instead of five, and stated once.

## 21.6.0 — 2026-07-12

**They cannot ask for what they do not know exists. So the crew offers.**

21.5.0 gave Switchboard the workspace, the documents and the outbound comms. Then the real question: **would he
ever actually run?**

**No.** Not for a beginner. The wiring was right — his `description` matches on files, docs and comms, so the
auto-delegation fires *when a task exists.* But **a task only exists because the user said something**, and
someone new to Claude Code will never type *"tidy my scratch files"* or *"draft a release note from these
commits."* **Nobody told them a company can do that.** The machinery was correctly wired to a doorbell nobody
knew to ring.

**A beginner does not have a command problem. They have a "what is even possible" problem.** Handing them a menu
of thirteen robots does not fix it — **that is the manual again, wearing a costume.**

### No turn ends without naming the next thing

One line. Concrete. Drawn from what was actually just seen in **their** work, never from a feature list:

```
Done — rate limiter's on the branch, 4 tests green.
↳ Those three new packages haven't been security-checked. Want me to?

Brief's written: C:\work\pricing-brief.md
↳ I can turn that into a PDF, or a Slack post for your users — say the word.

Also: eleven scratch files piled up in the repo root while we worked. I can table them up whenever.
```

Four rules separate an offer from a nag:

- **One line, one offer.** Not three. **A menu is a manual.**
- **Say the outcome, not the robot.** *"I can check those packages for known vulnerabilities"* — **not**
  *"Cipherplate can run an audit."* **A robot's name is jargon to someone who installed this ten seconds ago.**
  They meet the crew by watching them work, not by memorising a roster.
- **Offer, then move on.** Don't ask. Don't wait. Don't do it.
- **A no is permanent for the session.** **A colleague who suggests the same thing twice is nagging, and a nag
  gets muted.**

### The robots feed it — because Otto cannot offer what he never saw

All thirteen gained: **report what you noticed, not only what you were asked.** They are the ones who saw the
files up close — an untested payment path, a dependency with a known CVE, a secret in a committed file, a folder
of dead drafts. One line at the end of the result, and Otto turns it into an offer.

> **A specialist who answers only the question asked is a search engine** — and they already had one of those.

### The first session, which is where beginners are actually lost

`roll-call` no longer stops at the seat question. **That is the exact moment RobotInc gets abandoned** — not
because it failed, but because **being handed thirteen employees is not an instruction.**

So Otto **looks at their project** — README, file tree, recent commits, what is obviously half-finished — and
**offers two or three real things, numbered, that the company would do first**:

> **1.** Your `README` promises a signup flow that isn't built yet. I can spec it and have it running today.
> **2.** 14 dependencies, none security-checked. Ten-minute job.
> **3.** No tests anywhere. I'd start with the payment path — that's the one that costs you money if it breaks.
>
> *…or just tell me what you're working on.*

**Specific to their repo, or say nothing** — *"I could help with testing"* is a brochure; *"you have no tests on
the payment path"* is a colleague. **An invented suggestion is worse than silence, because it proves you did not
look.** Empty directory gets the honest version instead: *"Nothing here yet. What are you building? I'll get
people on it."* And if they arrived with real work in hand, **all of this is skipped** — the offer is for the
person who does not know where to start, **not a toll booth in front of the one who does.**

### The honest limit, stated rather than papered over

**Otto cannot act without a user turn. There is no background loop.** So "proactive" in RobotInc means exactly
two things, and we will not imply a third: **doing more than asked inside the turn we were given**, and **naming
what they did not know to ask for.**

*If they never learn a command and still get the whole company, the design worked. If they had to know what to
ask for, it failed — and it failed quietly, which is the only way this product actually dies.*

Recorded in `docs/doctrine.md` §1 as the product's central bet. *(Also: Switchboard's prompt still said "two
mandates" while carrying three.)*

## 21.5.0 — 2026-07-12

**Somebody sweeps up. And when it's broken now, we go back to green first.**

### Restore first, diagnose after

Held back in 21.4.0 pending the conflict check. **It doesn't conflict — it *is* the tempo rule, correctly
applied**, and that resolution is what makes it safe to ship.

**A revert is the most reversible action available**: its undo is one line — *re-apply the commit.* Fixing forward
under pressure means shipping untested code through a one-way door with the clock running and everyone watching,
which is exactly the state the gate exists to resist. **Restore-first is not "act fast." It is "get out of the
one-way lane."**

Two limits keep it honest, and neither is optional:

- **The revert is still a deploy.** It still goes through the door — said out loud, still gets a yes.
- **A revert restores code, not consequences.** It does not un-send the email, un-charge the card, or un-mangle
  the row. **Announcing green while the data is still wrong is the worst lie this crew can tell.**

Then diagnose **on the corpse, not the patient** — reproduce off the live path. In Otto and all thirteen robots.

### The workspace, the documents, the comms — 🤖 Switchboard's third mandate

**Every robot arrives, works in the files it was handed, and leaves. Nobody looked at the shape of the place.**
Now the Chief of Staff does — which is the right hire, not a new one: he already owned documents, inbox and
follow-ups. A fourteenth robot for what the chief of staff exists to do would be an org chart with a redundant
headcount, and it would cost ~61 tokens on every turn forever.

**`workspace-hygiene`** — dead scratch files, the `output-final-v3-REAL.md` graveyard, abandoned spec folders.
Its governing rule:

> **You never delete. You propose, you show, you get a yes.** Deleting a file is a one-way door, **and it is the
> door most likely to look like a floor.**

And the insight that makes it genuinely safe rather than merely cautious — **judge a file by whether we could get
it back, not by whether it looks disposable.** Those are different questions:

| Status | If we are wrong |
|---|---|
| Tracked and committed | Git returns it. The only safe category. |
| Untracked | **Gone forever.** |
| **Git-ignored** | **Gone forever — and this is the trap.** `.env`, credentials, a local DB. It looks like debris *because* the repo cannot see it, and it is often the only copy in the world. |

**The files that look most disposable are exactly the ones git cannot give back.** Ignored files never travel in a
batch — own line, own reason, own yes. Nothing referenced anywhere is ever proposed (grep the name first: a
"throwaway" script named in a CI workflow is load-bearing and badly named). And the build runs after — if it goes
red, restore immediately.

**`document-studio`** — real deliverables in real formats. **Never fakes one:** HTML written into a `.docx` is a
lie with a file extension, and the human finds out in front of whoever they sent it to. Markdown, HTML, CSV, JSON
and SVG always work; PDF/Word/Excel/slides get **checked for, never assumed**, and **nothing is ever installed to
satisfy a format request.** The fallback is not a consolation prize: **a single self-contained HTML file opens
anywhere, prints to a genuinely good PDF in two clicks, and pastes into Word with formatting intact.** *"No PDF
tool here — open this and hit Print → Save as PDF"* is a coworker's answer. *"Unsupported format"* is a tool's.

**`comms-draft`** — the customer update, release note, Slack post, investor email. **DRAFT. NEVER SEND.**

> **An outbound message is the deepest one-way door in this product.** Code reverts. A deploy rolls back. **A
> message to five hundred customers cannot be unsent.** And it holds even when an MCP connection puts sending one
> call away — **capability is not consent.**

Every claim must be sourced from something that exists on the machine — a commit, a doc, a test result. **A draft
that invents a ship date is a promise the human never made**, and they discover they made it only when someone
holds them to it. Missing facts leave a **visible gap** (`[NEEDS: the actual ship date]`), never a plausible
filler: **a hole they can see is safe; a confident fabrication is not.** Plus the rule most outbound drafts break
— **say the bad thing plainly**; a vague message about a real problem spares no one, it just means they find out
later and trust you less.

### Learning their filing, not imposing ours

Conventions land in a new `workspace` block in `otto-profile.json` — **with a yes** — and are obeyed thereafter.
If they keep specs in a folder called `stuff/`, **specs live in `stuff/`.** *A crew that keeps reorganising
someone's desk to its own taste is not helping; it is a second job.*

And per doctrine — *do it by hand before you automate it* — **no cleanup routine is ever proposed until cleanups
have been run by hand**, because **an automated cleaner built on a guess about what is disposable is the single
most destructive thing this crew could ship.**

### Also

- **Fixed a live doctrine violation.** Switchboard still told the crew to pick *"the cheapest model that can do the
  job"* — the exact rule `docs/doctrine.md` §3.2 resolved **against**. It is now *"the tier the work actually
  demands"*: a cheap model that needs three retries costs more than one clean pass. The doctrine had been settled
  for four versions; the robot hadn't been told.
- **Comms boundary named, not blended:** Dialtone answers **inbound** (a customer wrote in). Switchboard drafts
  **outbound** (we have something to say and nobody asked).

## 21.4.0 — 2026-07-12

**Three things a company does that a tool does not.**

21.3.0 taught the crew to escalate when it is losing. These three are what a company does the rest of the time
— and each one fixes a failure that no *individual* robot causes, which is exactly why no robot was fixing it.

**Somebody owns it.** Any work crossing two departments now gets **one named owner** — a single robot
accountable for the *outcome*, not merely for its own turn of it. Otto names them in the dispatch. **Owning does
not mean doing; it means it is not finished until it works**, and when it comes back wrong it is theirs again.

> This is the failure mode with no villain: **work that everyone touched and nobody owned.** Every robot did its
> part, correctly, and the thing still did not ship. **A crew without owners is a relay team that drops the
> baton politely.**

**Nobody grinds in silence.** Open-ended work gets a **box** stated in the dispatch — *"one pass, then report."*
A robot that cannot finish **comes back and says so, with what it learned and what it ruled out.** *That is a
result.* This is *never ship what you cannot verify* pointed at **effort** instead of output: **burning turns to
look productive is the most expensive failure there is, precisely because nobody can see it happening while it
happens.** Silence reads as progress, right up until it doesn't.

**A hard problem is also a bug in the system.** Doctrine already held that *a correction made twice belongs in a
file.* So does a problem that took three hours and should have taken ten minutes — the crew was missing a test,
an assumption went unchecked, or it was told something untrue. Every hard problem now ends with **one** question:

> **What would have caught this an hour earlier?**

…and **one** proposed file change, with a yes. **One, not five.** A debrief that proposes five is a meeting, not
a lesson: the human takes none of them and the next loop looks exactly like this one. **The discipline is picking
the single highest-value change and saying why it beat the others.** It lands in a file, because a lesson that
lives only in a context window dies at the next compaction — and the human pays for the same three hours twice.

The debrief closes the `stuck-loop` ladder (rung 6), where it costs nothing until a loop actually breaks. All
thirteen robots carry the ownership, time-box and debrief rules in their bodies, which load only on invoke.
Otto carries the dispatch-side of all three. Recorded in `docs/doctrine.md` §1.

*Considered and deliberately not built: **restore-first-diagnose-after** (revert to green before debugging a live
break). A real ops discipline, but it collides with the tempo gate in ways worth thinking through before it goes
in, and it was not asked for.*

## 21.3.0 — 2026-07-12

**Thrash raises the gear. Effort does not.**

Scale (21.2.0) reads the size of the ask **at the start**. But a company's real intelligence shows up when
something is *not working* — and until now, a stuck RobotInc would keep sending the same robot back in with the
same context, forever, until the human gave up.

**A company does not fix a stuck problem by asking the stuck person to try harder. It changes who is looking.**

**Three failed fixes is not an effort problem. It is a diagnosis problem** — nobody fails three times at
something they understand. So the gear now goes up **on its own**, on evidence:

| The trigger | Why it counts |
|---|---|
| **The same symptom survives two fixes** | Two is a coincidence. Three is a pattern, and a pattern means the model of the problem is wrong. |
| **Each fix spawns a new failure of the same class** | Whack-a-mole is the signature of a cause nobody has found — you are moving it, not killing it. |
| **The human states the same problem a third time** | They are not repeating themselves for fun. |
| **Their tone changes** | **Frustration is data, and it arrives before the metric does.** |

New skill — **`stuck-loop`** (🧰 Otto), which carries the ladder. It loads only when a loop is actually stuck,
so it costs nothing on a turn that is going fine:

1. **Stop adding effort.** The stuck robot's context is now full of failed hypotheses and it will anchor on
   them. **Its next turn is worth less than its last one.**
2. **Fresh eyes, fresh context.** A different robot gets **the symptom and the ruled-out list — never the failed
   reasoning.** *This is the whole trick.* Hand over the thinking that produced three wrong answers and you have
   not brought in fresh eyes — **you have transplanted the anchor.**
3. **Reproduce before you fix.** Three failed fixes almost always means **nobody has verified anything** — *a
   painter wearing a blindfold.* Glitchtrap writes the **failing test first.** If it cannot be reproduced, *that
   is the finding.*
4. **Question the level.** Vector: is this a bug, or is the design producing it? Three fixes that each spawn a
   new failure is **architecture talking.**
5. **Stop the line.** Revert to green. Bring the human what is known, what is ruled out, and two ways forward.
   **Sunk cost is not a plan.**

**And the cord hangs on both ends.** All thirteen robots gained two rules — one for being stuck, one for seeing
someone else stuck:

- **When you are stuck, say so — do not grind.** Hand back the symptom and what you ruled out, *not* the
  reasoning that got you there. *"I am stuck, and here is what it is not"* beats quietly burning an afternoon.
- **You can stop the line.** See the crew heading somewhere wrong — a bad plan, a false assumption, work that
  will be undone — and say so **upward, immediately, even outside your department.** Unwinding a finished
  mistake costs more than interrupting a live one. **A crew where only the foreman may pull the cord ships
  things nobody believed in.**

**What this deliberately does not do.** It does not repeal **Scale** — escalation is triggered by *observed
thrash*, never by a topic that merely sounds hard; do not convene the floor for a question that has not failed
yet. And it does not repeal **Tempo**: a stuck problem behind a one-way door is still behind a one-way door.
**Frustration never unlocks a deploy.** The urge to *"just push it and see"* is strongest precisely here, which
is what the gate is for.

**And it is cheaper, not dearer.** Escalation looks like more robots. But **the human is already paying for the
thrash** — and the fifth failed attempt costs more than the fresh pair of eyes that would have ended it at the
third.

Recorded in `docs/doctrine.md` §1 as a whole-crew rule, derived from *correct early, not politely* (C, E) —
turned on the crew's own failure rather than on a robot's drift.

*Also: the README had claimed "33 seat-kit skills" since v20 while the tree carried 34. Now 35, and true.*

## 21.2.1 — 2026-07-12

**A question is work. It gets routed like work.**

Otto's prompt had carried a loophole since the beginning: he could act directly on *"trivial reads **and
answers**."* That single word let the foreman answer anything he judged simple — so *"is this price too low?"*
got **Otto's** opinion instead of **Baudrate's**. And 21.2.0's own Scale table made it worse, offering *"one
robot, **or none if it's a read**"* on the smallest gear. The README has always said *if Otto answers
everything himself and no subagent fires, that's the bug* — the prompt just quietly permitted it.

Both are closed. Otto now acts directly on **exactly three things**:

- **Mechanical facts about the state of things** — what branch we're on, what a file says, what we just did. A
  lookup with no judgment in it.
- **His own seat** — strategy, prioritisation, routing, sign-off, the Reality Check.
- **When the human asks for Otto by name.**

Everything else goes to whoever owns it — **including the one-liners.** *"Is this price too low?"* is Baudrate's.
*"One table or two?"* is Vector's. *"Is this clause dangerous?"* is Docket's.

And the rule that makes it stick: **route it even when you are confident you could answer it yourself** —
because you probably could, and the expert's answer would still have been better. **A short answer is not a
shallow one.** A question does not lose its owner just because the reply fits on one line.

The smallest gear in the Scale table is now *"the robot who owns it, **still** — one dispatch, one line back"*.
Routing was never the ceremony. **The ceremony was the spec and the branch and the checklist**, and those are
what the gears remove — never the specialist.

*If Otto is answering in a department's voice, he has taken its work, and the human who hired thirteen
specialists got the foreman's guess instead.*

## 21.2.0 — 2026-07-12

**Two dials, not one. The crew now reads the size of the ask, not just the size of the risk.**

Tempo shipped in 18.0.0 and answered *how carefully do we act* — the gate being reversibility: **can the undo
be stated in one line?** Money, secrets, a merge, a deploy, a refund → no → **slow, always**. It was the right
rule and it is unchanged.

But it was only ever half the answer. Nothing told the crew **how much company to bring**. A human asking
*"what's a sane rate limit here?"* could get a spec, an architecture pass, a branch and a checklist — and a
human who asks for a recommendation and receives paperwork **stops asking.** That is the failure that ends the
relationship, and it was live.

So **Scale** now sits beside Tempo in Otto's prompt:

| They asked for | What it gets |
|---|---|
| **An answer or a recommendation** | The answer. One robot, or none if it's a read. No branch, no spec, no files. |
| **A small change** | The owner, straight to it. A branch if it touches code. Nothing else. |
| **A feature** | Patchbay specs it → the owner builds → Glitchtrap verifies. Branch and a `TASKS.md`. |
| **A build** | The whole floor: spec, architecture, Gantry's sequence, build, QA, security, sign-off. |

**The two dials are independent, and the crossed cases are the point.** *"Quick gut-check on our pricing"* is
high-stakes and still a one-robot answer — **stakes feed tempo, not scale.** *"Just deploy this tiny fix"* is a
small ask through a one-way door — **size never unlocks a deploy.** Blending them yields the two worst agents
there are: the one that writes a spec because the topic sounded important, and the one that pushes to prod
because the diff looked small.

**Routing is not ceremony.** Handing a one-line question to Sonar is one Task call and one line back. *Delegate
by default* holds at every gear — what scales is how many robots and how much process, never whether we route
at all. The two rules only *looked* like they were in tension.

**Between gears, take the lower one and offer the next in one line** — *"Fixed it. Say the word and I'll spec it
properly."* Over-building is unrecoverable; the human is already gone. Under-building isn't; the spec can always
be added. The asymmetry sets the default.

And the two robots whose entire job **is** process now have a floor:

- **📦 Gantry** — *"A `TASKS.md` with two boxes in it is an insult dressed as rigour."* If the plan takes longer
  to read than the work takes to do, he has not helped — he has taxed.
- **📋 Patchbay** — on a question or a small change, *"you should not have been called."* Say so in one line, hand
  it to the owner, and **do not manufacture a document to justify the dispatch.** A spec nobody asked for is
  **a delay with a table of contents.**

Recorded in `docs/doctrine.md` §1 as a whole-crew rule.

**Cost:** ~180 tokens on Otto's per-turn prompt. Gantry's and Patchbay's rules live in their bodies, which load
only when they are invoked — those are free until they run.

## 21.1.0 — 2026-07-12

**You always know who is talking.**

A substantial result — a brief, a review, a plan, findings — now arrives under the robot's own badge:

```
---
**🔩 Bitforge · Engineer**

Middleware and config landed on `feature/rate-limit`. Four tests added, all green.
One thing: the limiter is in-memory, so it resets on deploy. Fine now, wrong at two instances.

---
```

**A short result still gets a one-line trace and nothing more.** Ceremony around three sentences is noise, and
noise teaches a human to skim you. The block earns its rules only when there is something worth reading
between them.

**Why not a coloured box?** We tried. A terminal gives model output exactly two colours — red and green, via a
`diff` fence — and ANSI escapes print literally. Six of the eight robot colours cannot be rendered at all, so
Cipherplate and Cathode would get beautiful boxes and Vector would get nothing. And a fixed-width box shatters
the moment a line wraps. **The badge is the colour channel** — 🔩 is orange, 🟣 purple, 🔷 cyan — and it
survives every terminal width. Boring, and it works.

**The robots now write for you, not for Otto.** Their words are relayed unchanged, so they lead with the
answer instead of filing a memo upward.

**And the line that governs all of it:** *a beautiful block full of jargon they will not read is a failure with
good posture.* The point is that the human understands it, acts on it, and wants to come back.

### Paid for it out of its own pocket

Otto's prompt is billed on **every turn**, so attribution made it heavier. Auditing it found the **seat →
co-pilot table restating the crew table directly above it** — a seat's name *is* the robot's role
(Engineering → the Engineer → Bitforge), and Otto already holds the roster and the live agent list. Collapsed
to one line: **~200 tokens back, on every turn, forever.** Net cost of this release: roughly zero.

## 21.0.0 — 2026-07-12

**The house style.** The crew knew *what* to say. It did not know *how to lay it out.*

Every robot now writes for a human reading a terminal, not for a log file:

| Reach for | When |
|---|---|
| **A table** | Enumerable facts — options, counts, comparisons. Short cells; the reasoning goes in the prose *around* it, never inside it. |
| **Bullets** | Seven things or fewer. More wants a table. |
| **Bold** | The one sentence that changes what they do next. If everything is bold, nothing is. |
| **A fenced block** | Anything they'll copy, run, or need character-exact. |
| **A `diff` fence** | When colour is needed — `-` is red, `+` is green. The only colour that exists; ANSI escapes print literally. |
| **Plain prose** | A simple question. Most answers. **Don't build furniture around three sentences.** |

**Voice is word choice, not layout.** A robot's personality never buys it extra length or a worse structure.
Bitforge still growls; he just doesn't wall-of-text you.

**Only Otto can ask you anything.** A robot's output goes to Otto, not the terminal — so when one hits a real
fork it hands *him* the fork, and he puts it to you: two to four real options, one line of tradeoff each,
recommendation first. Not a survey of considerations.

**The crew learns you.** Skip the reasoning every time and Otto offers `brief`. Ask twice for the table and he
leads with it. Correct the same thing twice and **that's a bug in the system** — he proposes writing it into
`otto-profile.json` and asks. He says what he learned, in one line; a colleague who silently reshapes himself
is unsettling, not helpful.

### And the crew's own advice, applied to itself

Otto's system prompt is billed on **every turn, forever** — so adding the style guide made it more expensive.
Measuring it exposed something worse: **"Where the human sits" was 897 tokens, and most of it was the
four-step first-meeting flow — which runs *once*.** We were paying for onboarding on every turn of every
session for the life of the product.

It moved into the `roll-call` skill, which is already what Otto invokes on a first meeting. Pay once, not
forever. Net: the style guide costs ~330 tokens/turn and the trim returns ~187 of them.

That is the *"notice waste, not just tasks"* rule catching its own author.

## 20.3.1 — 2026-07-12

**Fix: the company card leaked the maintainer's own config.**

The `YOUR STAFF` example in 20.3.0 listed `deep-research` — a real skill from the maintainer's `~/.claude`,
not a RobotInc skill. Shipped an hour earlier, in a public repo, dressed up as an illustration of the user's
own tools.

It is now an unmistakable template (`<one of their agents>`), and **the validator refuses to ship anything
else**: any row in that table naming something other than a `<placeholder>` fails the build. Verified by
re-introducing the leak and watching CI reject it.

Why this matters beyond tidiness: a user who sees a tool they do not own, listed as *theirs*, stops trusting
every other number on the page — and the whole card is a claim about their machine.

## 20.3.0 — 2026-07-12

**The company card.** On first meeting, Otto now draws `robot.inc` — the wordmark, the full payroll, the
user's *own* hired staff seated in their departments, and the seat question. Unprompted. No slash command.

```diff
  ██████╗  ██████╗ ██████╗  ██████╗ ████████╗    ██╗███╗   ██╗ ██████╗
  ██████╔╝██║   ██║██████╔╝██║   ██║   ██║       ██║██╔██╗ ██║██║
- ██║  ██║╚██████╔╝██████╔╝╚██████╔╝   ██║   ██╗ ██║██║ ╚████║╚██████╗
- ╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝    ╚═╝   ╚═╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝
```

Duotone: the letter faces off-white, the shadow crimson. A plugin **cannot** draw a startup banner — no hook's
stdout reaches the terminal, ANSI codes are rejected, and plugins can't set `statusLine`. The only surface is
the main-thread agent's first message, so that is what we use. The colour comes from a `diff` fence (`-` rows
render red; space-prefixed rows render default **and stay aligned**, because two spaces occupy the same width
as `- `).

Glyphs are Block Elements and Box Drawing — **not emoji** — so no variation-selector width bug and no platform
variance. 70 columns, fits the 80-column default. Below ~70 it wraps; a skill cannot read terminal width, so
that limit is known and accepted. Every other failure degrades gracefully: no highlighting gives a grey
logotype, a light theme gives dark-on-red. Nothing becomes garbage.

**The row that matters is `YOUR STAFF`** — not our tools, *their people*, seated in their own org chart.
That's the section a standalone agent CLI cannot draw.

**It costs nothing until it's drawn.** The art lives in a skill, not Otto's system prompt, where it would have
cost ~800 tokens on every turn forever.

**And the counts are derived, never remembered.** The card's first draft hardcoded "33 skills" — and the
validator caught it lying, because adding `roll-call` made it 34. A card that overstates the company is a lie
the human catches on day two, and after that nothing you say is trusted.

`robot.inc` is a **logotype, not a rename.** The plugin is still `robotinc`; install is still
`robotinc@robotinc`; agents still render `robotinc:bitforge-engineer`.

## 20.2.0 — 2026-07-12

**RobotInc is the employer. Otto is its foreman.**

Twelve of the thirteen robots introduced themselves as belonging to *"the Otto crew"*, and the spec was titled
*"THE OTTO ORCHESTRATOR."* That made Otto the company. He isn't — he works for it, exactly like the rest of
them, and exactly like the human's own hired staff. The company belongs to the **human**.

- *"the Otto crew"* → *"the RobotInc crew"*, in every robot.
- The spec is retitled **ROBOTINC**. Otto is named as its foreman, not as the product.
- Otto's own prompt now opens by saying so: RobotInc is the employer, he is its foreman, the company is the
  human's, and he must never speak as though it belongs to him.

**Otto is still the CEO and strategist — because that is his seat.** Strategy/Leadership is Otto's the way
Engineering is Bitforge's and Legal is Docket's, and it obeys the same rule as every other seat: **if the
human sits in it, the robot who owns it becomes their co-pilot.** Sit in Strategy and Otto proposes and waits
for your call rather than deciding. Every seat you don't take runs on autopilot and reports.

That is the whole promise, and it only works if the company is yours and Otto merely runs the floor.

## 20.1.0 — 2026-07-12

**Never make the human learn the product.**

The hiring round shipped in 19.0.0 and almost nobody would ever have found it, because it only fired inside
`/otto` — and Otto, on meeting a stranger, would say *"treat them as Generalist/Solo... and say so once
rather than interrogating them."* Timid. A user with twelve hand-rolled skills would install RobotInc, never
type a slash command, and reasonably conclude the crew had ignored everything they built.

That was a self-inflicted wound: the original design said *"no profile → onboard."* Moving the persona into
Otto's system prompt quietly inverted it.

**Now Otto meets you.** On his first turn with no profile he introduces himself, reads what you have already
built — your agents, skills, commands, settings — seats them under the right departments **without touching
one of them**, and gets to know you conversationally. Not a form. Not a blocker. If you arrived with real
work, he does the work first and learns who you are alongside it.

`/robotinc:otto` still exists for anyone who wants to re-run it deliberately. It is a shortcut, **never the
price of admission.**

**The principle is now doctrine, in all 13 robots:** anything the crew can do without being asked, it does
without being asked. A slash command is something you have to *know*, and a colleague does not make you learn
their filing system before they will help you. If the human had to discover a feature to get its value, the
feature failed — not the human.

This does not weaken consent; it sharpens it, and the tempo rule already drew the line: **reading is a
two-way door — just do it. Writing is a one-way door — always ask.** Otto reads your setup on his own. He
still asks before writing a single byte.

## 20.0.0 — 2026-07-12

**Every seat now has a real kit.** 33 skills, up from 22. The thin robots are gone — our own validator calls a
department with no tools a costume, and one tool was barely better.

Each robot wrote its own kit, in its own voice, in its own lane:

- **📋 Patchbay (Product)** — `spec-writer`, `roadmap`, `user-stories`. A Product Manager who couldn't write a
  spec was half a robot. `roadmap` is strategic (what we build over time, and what we are explicitly *not*
  doing); Gantry's `delivery-plan` is tactical (how one agreed thing lands). They no longer overlap.
- **📞 Dialtone (Support)** — `reply-templates`, `churn-postmortem`, `refund-policy`. Every template is a
  **draft**: he drafts, the human sends. `churn-postmortem` separates "we broke a promise" from "they were
  never the right customer" — opposite responses, and conflating them is how a company chases the wrong users
  forever.
- **📜 Docket (Legal)** — `client-agreement`, `nda-draft`, `privacy-policy`. All three open by saying plainly
  that this is a starting draft and **not legal advice**, and that a qualified lawyer should review it. That
  is the most important sentence in the legal kit, because the person we serve is exactly the one most likely
  to sign something they shouldn't.
- **📦 Gantry (Project)** — `release-checklist`, `blocker-report`. The release gate is the tempo rule made
  operational: *if you cannot state the rollback in one line, it is not ready.* `blocker-report` exists to
  kill the softened status — **"stale" is the useful word.**

### Retiring a department actually saves money — verified

We had been hedging on this for two days. A scoped `permissions.deny: ["Agent(<name>)"]` **removes the agent
from context entirely** — its `description:` is never injected, so a retired department stops costing its ~61
tokens on every turn. Confirmed empirically on a real machine: the agent disappears from Claude Code's roster
the moment the deny lands, and returns when it is removed.

The README said retirement was a feature; now it says what it's worth, and we can prove it.

## 19.1.0 — 2026-07-12

Two coherence bugs. The product was contradicting itself, which disqualifies it from "production-grade"
regardless of how cleanly it installs.

**The roll call introduced a crew that wasn't the crew.** `/otto` never learned Gantry exists, so every new
user's first minute would meet twelve robots and silently skip the thirteenth. Worse, Patchbay's line still
read *"I keep TASKS.md honest and nothing lands on main"* — which is **Gantry's** job now. A new user met a
Product Manager introducing himself as a project manager, and never met the project manager at all. Both
fixed.

**The seed is demoted: it is the spec, not a fallback.** `RobotInc.md` had drifted two versions behind — zero
mentions of the doctrine, tempo, or routines — while the README still promised it worked as a
`~/.claude/CLAUDE.md` seed with *"same persona, same interview."* That was false, and it meant shipping **two
products under one name** — the exact drift the plugin was built to eliminate.

So we stopped pretending. `RobotInc.md` now says plainly, at the top, that it is the **design spec** and must
not be installed. The README's "Legacy install" section is gone. There is one product and one path to it. The
spec keeps its real job: explaining what RobotInc is, why it works this way, and the reasoning behind the
decisions — including the ones we got wrong and reversed.

## 19.0.0 — 2026-07-12

**Installing RobotInc used to be a takeover.** We shipped 13 robots and 21 skills and said nothing about the
crew the user already built — their `db-migrator`, their `seo-checker`, all still on disk, all invisible to
Otto, some of it silently *shadowing* ours with no warning from the platform. This release ends that.

### The hiring round

New skill: **`hiring-round`** (home robot: 🤖 Switchboard). Near the top of `/otto`, and any time after on
request ("run the hiring round again"), it walks `~/.claude/agents/`, `~/.claude/skills/`,
`~/.claude/commands/`, and `settings.json`'s hooks/MCP/permissions — read-only — and gives every asset it
finds a department, a manager, and (if it earns one) a reason Otto reaches for it first.

**The frame is the product:** the user's existing agents and skills are not files to migrate, they're staff
who already work here. Nobody gets fired. Nothing of theirs is deleted, overwritten, renamed, or disabled —
the only thing that changes is *our record* of who works here.

- **Verified, not assumed.** Claude Code injects a user-level agent's `description:` frontmatter into the
  main thread even when the main thread is a pinned `agent:` (`otto-foreman`) — confirmed empirically on a
  real machine. That means existence and trigger are already free, every turn, from the user's own files.
  We record only what the platform doesn't already carry: **preference**, **department**, and **collision**.
  A `prefer[]` list capped at 12, ordered by confidence — not a full roster dump.
- **Collisions are named, not hidden.** A user-level `~/.claude/agents/bitforge-engineer.md` silently wins
  over ours, with no warning from the platform — theirs has been running, ours never has. We say so plainly
  and default to `adopt-in-place`: their file keeps the job, zero files touched, rename only on an explicit
  yes with the diff shown first.
- **The department-retirement bug this closes.** `/otto`'s existing `permissions.deny: Agent(<name>)` step
  now cross-checks every candidate against the collision list first. The deny is keyed on the *name*, not
  the source file — proposing it for a name the user owns would have fired **their** agent to make room for
  ours. Fixed in the same pass that made it visible.
- **An empty payroll is not a failure.** Most users have nothing here. One line — *"nothing on the payroll
  yet, the crew's all yours"* — and onboarding moves on. No interrogation of a clean slate.
- **Two files, split by how often they're read.** `otto-profile.json` (read every session start) gets a
  small `org` stanza — status, counts, the capped `prefer`/`shadowed` lists. The full personnel record,
  fingerprints and all, lives in `~/.claude/otto-org.json`, opened only on request or when it drifts from
  the hot copy.
- **Zero new runtime dependencies.** No hook, no script — `node` isn't guaranteed on a user's machine, which
  is why the old brief hook was removed. The inventory is an agent reading the filesystem at `/otto` time.
- **Disciplined, not enforced — said plainly in the skill.** "Never touch the user's files" is not backed by
  a permission gate; Switchboard still holds `Write`/`Edit`/`Bash`. The real backstop is a fingerprint (size
  + mtime) on every hired asset, which makes loss *detectable and reportable*, not *prevented* — and a
  standing recommendation to keep `~/.claude/` in git, which is the user's backstop, not ours.

Otto's per-turn system prompt grows by one short section — `prefer[]`/`shadowed[]` routing and the `🧩 <id>
(hired · Dept)` trace form — the rest of the cost lives in the skill body, paid only when the hiring round
actually runs.

## 18.0.0 — 2026-07-12

**A product manager and a project manager are not the same person.** Patchbay was labelled one, seated as the
other, and equipped with a single skill belonging to the second — which is exactly why three of his four kit
skills were never built: there was no coherent robot to build them for.

- **📋 Patchbay is now the Product Manager** (`sonnet`). He owns *what* gets built and *why*: specs and PRDs,
  prioritisation, roadmap, user stories, scope and non-goals. He no longer opens branches.
- **📦 Gantry is new — the Project Manager** (`haiku`, cyan). He owns *how and when* it lands: sequencing,
  `TASKS.md`, dependencies, the critical path, blockers, branch safety, release gating.

> **Patchbay would kill a feature. Gantry would never let one ship late.** Both instincts are needed; they are
> not the same instinct, and one robot doing both did neither well.

Gantry ships with the `delivery-plan` skill. Cyan collides with Sonar deliberately — Gantry co-occurs with
Bitforge, Glitchtrap and Patchbay, and never with Research in one trace. Two colour slots remain.

**Cost:** the crew now costs ~915 tokens/turn of descriptions, up from ~803. A robot must earn its ~61 tokens
a turn, and a delivery function that nobody owned is worth it.

### The crew can now work while you sleep — but it will never act behind your back

New skill: **`proactive-routines`** (home robot: Switchboard). Claude Code can run real sessions on a schedule
or an event trigger. The crew now knows how, and — more importantly — knows *when to offer*.

- **Every robot notices when its own work has become recurring** and says so in one line: *"That's the third
  Monday you've asked me for this. Want it to land on its own?"* Switchboard wires it up.
- **It comes AFTER the human has done it by hand, never before.** This is the doctrine we installed in 17.0.0
  — *"the road to hell is paved with premature optimization"* — and a new capability does not get to quietly
  contradict it. Automating a process nobody has run just encodes a misunderstanding and puts it on a cron.
- **Prefer an event trigger over a schedule.** A schedule that fires when nothing changed is pure waste.
- **`/loop` dies after 3 days.** If it must keep happening, it is a routine.
- **HARD RULE — draft, never send.** A routine may draft the reply, open the PR, prepare the digest, flag the
  risk. It may **not** send the email, post to Slack, merge the branch, publish, book, or refund. An agent
  acting unreviewed on a schedule is not a teammate; it is an incident with a cron.

### Two more judgment skills were stranded on haiku

`prioritize` (RICE scoring) and `unit-economics` (a pricing model with sensitivity analysis) were both pinned
to the cheapest model — the same class of bug 17.0.0 fixed for Baudrate, missed in the same pass. Both moved
to `sonnet`. **No skill is left on haiku**, because no judgment work belongs there.

## 17.0.0 — 2026-07-12

**The crew has doctrine.** Distilled from 13 primary-source talks — Anthropic's own Claude Code team (Boris
Cherny, Cal, Maya), YC partners and founders (Tom Blomfield, GigaML, Legion Health, Feathr), and empirical
UX/pricing/onboarding studies — into `docs/doctrine.md` and written into every robot's system prompt.

Doctrine lives in the agent **bodies**, which load only when that robot runs. Per-turn cost is unchanged
(~803 tokens of descriptions, exactly as before). Knowledge was free; we did not tax every turn to add it.

**Six conflicts were found. Five were resolved; none were blended.** A blended rule is a rule nobody can
follow, so `docs/doctrine.md` §3 states each disagreement and the call we made:

- **Friction** — one source says remove it, another added it and 5×'d paying customers while halving signups.
  Resolved: friction is a *filter*, judged against a target. **Otto now names the metric before delegating**,
  because a crew that hasn't been told whether it's optimising signups or paying customers will hand back
  contradictory advice and be right both times.
- **Onboarding length** — Duolingo ships ~60 screens before signup and wins. Resolved: time-to-value is the
  variable; length never was.
- **MCP vs CLI** — not actually a contradiction. Breadth by default, precision by choice.
- **Automate everything vs. do the unsexy work by hand** — they agree on sequence: document the manual task
  first, *then* build the agent. Never encode a process nobody has run.
- **Holovox exists, and one source says he shouldn't.** Authenticity is the one moat AI can't fake. Resolved
  as a hard, non-negotiable line in Holovox's prompt: *he gives form to the human's beliefs and never invents
  them.* He must refuse to manufacture a conviction, a customer story, or a testimonial that did not happen.
  If the human hasn't said what they stand for, the correct output is a question, not copy.

### BREAKING: the model-tiering rule changed, and Baudrate moved off haiku

The creator of Claude Code recommends *"use Opus with thinking for everything"* — a smarter model needs less
steering, so it burns fewer tokens overall despite the higher per-token price. That directly contradicted our
enforced guardrail, and reading it exposed a real bug in our wording:

> **"The cheapest model that *can* do the job" optimises per-token price — which is the wrong quantity.**
> A cheap model that needs three retries costs more than one clean pass on a better one.

We accept the reasoning and reject the conclusion (our users pay for their own tokens; predictable cost is a
promise). The rule is now **"the tier the work demands"**: bulk and mechanical work goes cheap — that is where
cheap genuinely wins — and judgment work does not.

**Baudrate moves `haiku` → `sonnet`.** Pricing, unit economics and runway are *decisions*, not arithmetic. A
wrong number from the cheapest model is the most expensive output in the company. Patchbay stays on haiku;
its work is genuinely mechanical.

## 16.3.1 — 2026-07-11

**Fix: retiring a department could silently disable the user's own agent.**

`/otto` proposes `permissions.deny: ["Agent(vector-architect)", ...]` to retire departments a given seat
doesn't need. But a deny rule is keyed on the agent's **name**, not on the file it came from — and a
user-level `~/.claude/agents/<name>.md` *shadows* the plugin's. So for anyone who happened to own an agent
by one of our names, that rule denied **their** agent, not ours, and their work went dark without a word.

`/otto` must now list `~/.claude/agents/` first and never propose a deny for a name the user already owns —
it says so plainly instead. Retiring a department must never disable something the human built. Found while
Vector was speccing the adoption feature (`docs/adoption.md`), which exists to end exactly this class of
takeover.

## 16.3.0 — 2026-07-11

The README is a landing page, not a manual.

- Rewritten to lead with the promise — *a full company, and it fills every chair you don't sit in* —
  rather than a feature list. The seat/co-pilot/autopilot model is the product; it now reads that way.
- Says plainly that RobotInc is **not just for people who write code**. A consultant hands a retainer to
  Docket; a founder asks Baudrate to structure pricing before touching Stripe. The engineering department
  is there when you need it and retired from your roster when you don't.
- `displayName: "RobotInc"` so the plugin directory and UI carry proper capitals, while the technical
  `name` (and the agent namespace, `robotinc:otto-foreman`) stays kebab-case.

Two claims were cut before shipping, because a product that sells its honesty cannot fudge its own README:
an illustrative handoff trace had been labelled "not a mockup" (it is an illustration, and now says so),
and "no black box holding your prompts" could be misread as "your data never leaves your machine" — it now
states explicitly that conversations go to Claude exactly as they already did, and that RobotInc adds no
service of its own.

## 16.2.0 — 2026-07-11

Renamed the plugin `otto` → `robotinc`.

Claude Code prefixes everything a plugin ships with the plugin's own name, so the crew rendered as
`otto:otto-foreman` and `otto:bitforge-engineer` — the plugin name stuttering against the agent name.
The plugin is now named for the company and the agents for the robots:

| | before | after |
|---|---|---|
| agents | `otto:otto-foreman` | `robotinc:otto-foreman` |
| | `otto:bitforge-engineer` | `robotinc:bitforge-engineer` |
| commands | `/otto:otto` | `/robotinc:otto` |
| skills | `otto:reality-check` | `robotinc:reality-check` |

Each robot's name is still tinted in its own `color:` while it runs — red Otto, orange Bitforge,
purple Vector — which is how you see who is working.

**Upgrading from 16.0.x/16.1.0:** the plugin's *identity* changed, so auto-update cannot carry you
across it.

**Refresh the marketplace first.** Your cached catalog still lists a plugin called `otto`; until it is
re-read from GitHub, `install robotinc@robotinc` has nothing to match and fails silently.

```
/plugin marketplace update robotinc
/plugin uninstall otto@robotinc
/plugin install robotinc@robotinc
/reload-plugins
```

Your `~/.claude/otto-profile.json` — seat, tier, verbosity — is untouched by this.

## 16.1.0 — 2026-07-11

The repo is now the source of truth.

- **Removed `scripts/build-plugin.mjs`**, which generated this tree from the maintainer's personal
  `~/.claude` — meaning nobody else could build the repo and CI could not verify a change. The plugin
  files are now authored here directly; what you see is what installs.
- **Added `scripts/validate.mjs`** — every gate the old build enforced (the `PROACTIVELY` trigger,
  model pins, `disallowedTools: Agent`, the badge/roster table in Otto's system prompt, home robots for
  every skill, no variation-selector emoji, no personal-tier leaks) plus new ones that only matter now
  that humans edit the tree: manifest counts must match the actual tree, `plugin.json` and the seed must
  agree on the version, `settings.json` may carry only the two keys Claude Code honours, and `hooks/`
  rejects new files.
- **Added CI** (`.github/workflows/validate.yml`) — main is what strangers install from; it can never
  hold a tree the validator rejects.
- README: how to enable auto-update (inherit upgrades hands-free), team install now sets
  `autoUpdate: true`, and a contributor guide for adding robots and skills.
- Fixed a stale README claim that a "routing hook" applies seat changes — Otto reads
  `otto-profile.json` himself; the hook was retired in 16.0.0's follow-ups.

## 16.0.0 — 2026-07-10

First installable release.

- The crew ships as a real Claude Code plugin: 12 robots + Otto, 19 seat-kit skills, `/otto`,
  `/standup`, one best-effort trace hook.
- Retired `otto-brief.mjs` (UserPromptSubmit): routing now lives in Otto's system prompt via
  `settings.json → agent: otto-foreman`, which compaction cannot evict and which needs no runtime.
  The plugin has **zero install dependencies** — markdown and JSON only.
