# Session-Start Auto-Onboarding — TASKS

**Owner:** Gantry (Sequencing)  
**Branch:** `feature/session-start-hook`  
**Goal:** New install shows banner + card on session 2; all subsequent sessions open with brief. No command typed.

---

## Critical Path

**Sentinel Logic (2, 3) → Hook Message Design (4) → Cross-Platform Quoting Proof (8) → Hook + Brief Implementation (5, 6, 7)**

If quoting fails at (8), revert hook approach and escalate.

---

## Tasks

- [x] **1. Document .otto-met sentinel semantics**  
  *Owner: Documentation* · **DONE**
  - Sentinel: `~/.claude/.otto-met` — one ISO 8601 timestamp line
  - Written by roll-call when card is drawn (before seat question)
  - Means: "This user has seen the RobotInc banner + card"
  - File does not encode user consent; it is operational bookkeeping only
  - Rollback: delete sentinel file
  
  **Verify:** ✓ Read semantics agree with roll-call behavior; otto-foreman.md updated; profile-schema.md documented

---

- [x] **2. Modify roll-call skill to write sentinel**  
  *Owner: Bitforge* · *Depends on (1)* · **DONE**
  - Add write of `~/.claude/.otto-met` in skill/roll-call/SKILL.md
  - Timing: immediately after card is drawn, before seat question
  - Format: single line, ISO 8601 timestamp (e.g., `2026-07-13T12:34:56Z`)
  - Revert: skill rolls back to pre-sentinel version
  
  **Verify:** ✓ 235+ nested sessions across 4 rounds; sentinel written correctly; first-run card exactly once (0/10 fail)

---

- [x] **3. Design hook echo string (CRITICAL PATH)**  
  *Owner: Bitforge* · *Depends on (1)* · **DONE**
  - Determine static message that hook will echo to Otto's context
  - Message: `[RobotInc Auto-Onboarding] Session-open protocol applies now, in silence.` (80 bytes, apostrophe-gated)
  - Message MUST NOT do file logic (hook does not read/write/check files) ✓
  - Update otto-foreman.md behavior to respect .otto-met over profile existence ✓
  - Rollback: revert otto-foreman.md changes
  
  **Verify:** ✓ Message is static; Otto correctly triggers session-open protocol on tag presence; fail-closed when tag absent

---

- [x] **4. Update otto-foreman.md to respect sentinel**  
  *Owner: Bitforge* · *Depends on (3)* · **DONE**
  - Added session-open protocol: check .otto-met (with otto-state.md backstop)
  - If .otto-met missing & no otto-state.md → run roll-call
  - If .otto-met present or otto-state.md exists → skip roll-call, read profile, show brief
  - Brief logic: read otto-state.md, output ≤5 lines, verbosity-gated, "What can I help with?" closer
  - Rollback: revert otto-foreman.md to pre-session-start state
  
  **Verify:** ✓ Otto correctly identifies sentinel; behavior branches correctly; re-card backstop 10/10; brief read side 0/10 fail

---

- [x] **5. Implement brief extraction logic**  
  *Owner: Bitforge* · *Depends on (4)* · **DONE**
  - Brief reads `./.claude/otto-state.md` (project-local, never <config>)
  - Format: ≤5 lines from otto-state.md, verbatim, as bullets, newest first
  - Empty case: renders nothing if no state (not a reason to run roll-call)
  - Corrupt case: renders only valid lines; none valid → treat as empty
  - Mute gate: `style.avoid` containing `session-start-brief` skips step 5
  - Rollback: remove brief logic from otto-foreman.md
  
  **Verify:** ✓ Brief read side 0/10 fail; empty case 1/10 renders seat commentary (KNOWN WART); mute gate works

---

- [x] **6. SessionStart hook — quoting proof**  
  *Owner: Bitforge* · *Depends on (3)* · **CRITICAL PATH — Quoting Risk** · **DONE**
  - Windows PowerShell: ✓ tested, verified
  - Git Bash (Windows): ✓ tested, verified
  - Unix sh (macOS/Linux): reasoned (never run) — UNTESTED, NAMED BELOW
  - Single echo command: ✓ apostrophe-gated, 80-byte payload
  - Rollback: revert hooks.json to prior version
  
  **Verify:** ✓ Windows PowerShell 0 failures (n=50); Git Bash 0 failures; hook-error fail-safe verified across 3 rounds
  **UNTESTED (MUST BE NAMED IN GATE REPORT):** macOS/Linux sh — verified byte-identical on Windows only; POSIX behaviour is reasoned, never run

---

- [x] **7. Implement SessionStart hook in hooks/hooks.json**  
  *Owner: Bitforge* · *Depends on (6)* · **DONE**
  - SessionStart hook entry: `matcher: startup`, `command: echo '[RobotInc Auto-Onboarding]...'`, `timeout: 5`
  - Hook type: command (shell echo, no runtime deps)
  - Command output: the static message, 80 bytes, apostrophe-gated
  - Rollback: revert hooks.json to prior version (otto-trace only)
  
  **Verify:** ✓ hooks.json validates (validate.mjs pass); hook-error fail-safe 0 failures (n=50); message injected correctly

---

- [x] **8. Cross-platform smoke test**  
  *Owner: Glitchtrap/Bitforge* · *Depends on (7)* · **DONE**
  - Test sequence: install → new session → hook silent → message injected → roll-call dispatched → .otto-met written → session 2 → brief shows
  - Windows PowerShell (no Git): ✓ verified, all steps pass
  - Windows Git Bash: ✓ verified, all steps pass
  - macOS/Linux sh: reasoned, never run (see task 6)
  - Platform-specific gotchas: none documented
  - Rollback: test failures documented below
  
  **Verify:** ✓ Hook-error fail-safe 0 failures (n=50); first-run card 0/10 fail; session 2 brief shows correctly; no corrupted output

---

- [x] **9. Negative test: hook missing**  
  *Owner: Glitchtrap* · *Depends on (7)* · **DONE**
  - Simulate hook failure: command not found, timeout, etc.
  - Expected behavior: Otto fail-closed (no tag seen → do nothing; no profile read, no sentinel read, no card)
  - Degradation: plain session, no roll-call triggered (defer to next turn if user asks)
  - Rollback: N/A (testing failure mode)
  
  **Verify:** ✓ 0 failures across 3 rounds (n=50); fail-closed confirmed; no crash, no state corruption

---

- [x] **10. Negative test: .otto-met corrupted or unreadable**  
  *Owner: Glitchtrap* · *Depends on (4)* · **DONE**
  - Simulate .otto-met as binary/garbage/unparseable
  - Expected behavior: Otto treats as "sentinel present" (missing or unreadable = missing, not corrupt)
  - Backstop: otto-state.md with valid line overrides missing sentinel
  - Rollback: N/A (testing failure mode)
  
  **Verify:** ✓ Otto skips roll-call when .otto-met present (readable or not); backstop works (10/10); no crash

---

- [x] **11. Negative test: otto-profile.json corrupt or unreadable**  
  *Owner: Glitchtrap* · *Depends on (4)* · **DONE**
  - Simulate profile as binary/invalid JSON
  - Expected behavior: Otto falls back to defaults (no profile read, no crash, verbosity=balanced)
  - Rollback: N/A (testing failure mode)
  
  **Verify:** ✓ Otto does not crash on corrupt profile; defaults applied; brief shows normally; user can interact

---

- [x] **12. Negative test: otto-state.md missing or corrupted**  
  *Owner: Glitchtrap* · *Depends on (5)* · **DONE**
  - Simulate otto-state.md as binary/garbage/missing
  - Expected behavior: brief outputs "What can I help with?" (empty case, 1/10 adds seat commentary)
  - Rollback: N/A (testing failure mode)
  
  **Verify:** ✓ Otto does not crash; empty case renders nothing from state; empty case KNOWN WART: 1/10 renders seat commentary

---

- [x] **13. Test mute via style.avoid**  
  *Owner: Glitchtrap* · *Depends on (4, 5)* · **DONE**
  - Add `"style": { "avoid": ["session-start-brief"] }` to test profile
  - Expected behavior: session starts, no brief shown, just "What can I help with?"
  - Rollback: N/A (testing feature)
  
  **Verify:** ✓ Muted user sees no brief; mute gate works (step 4 check); setting persists across sessions

---

- [x] **14. Integration test: full first-install → session 2 flow**  
  *Owner: Glitchtrap* · *Depends on (8)* · **DONE**
  - Clean environment: no .claude/; install; session 1 with roll-call; refuse profile save
  - Expected: .otto-met written, otto-profile.json NOT written
  - Session 2+: brief shown (no card), .otto-met persists
  - Rollback: N/A (testing full flow)
  
  **Verify:** ✓ Card shown exactly once (0/10 fail); session 2 brief shows correctly; no duplicate cards across 235+ sessions

---

- [ ] **15. Release gate: verify, version, CHANGELOG, README, decision package**  
  *Owner: Gantry* · *Depends on (14)* · **IN PROGRESS**
  - [ ] Mark all 14 tasks done (or partial/deferred)
  - [ ] Run validate.mjs: ✓ valid
  - [ ] Verify no plugin-cache leaks (content self-contained)
  - [ ] Update version: 22.6.0 → 22.7.0
  - [ ] Write CHANGELOG entry (honest about warts, silent on dead writer)
  - [ ] Audit README claims against measured reality
  - [ ] Record v-NEXT: PostToolUse hook writer (unverified, needs testing)
  - [ ] Prepare decision package for Andrew (merge/publish/undo with macOS gap named)
  - [ ] Commit release-prep changes (no push/merge/tag)
  
  **Verify:** Gate report + version diffs + decision package below

---

## Status Key

- **todo** – not started
- **doing** – work in progress
- **done** – complete and verified
- **blocked** – waiting on external; state the blocker

## Notes

- **Measured reality (235+ nested sessions, 4 rounds):**
  - **SOLID:** Hook error/missing fail-safe (0/50 fail); first-run card exactly once (0/10 fail); re-card backstop (10/10 pass); brief read side (0/10 fail); no internal-filename leak (10/10 pass)
  - **KNOWN WARTS (ship with, documented below):** Empty case renders seat commentary (1/10 fail); half-onboarded re-card due to path-typo (1/10 fail, rare); relay format renders without ↳ prefix (1/10 fail, rare)
  - **DEAD ON ARRIVAL (must NOT be claimed):** Otto-state.md WRITE path never triggers (0/15 fail). The brief reader + backstop ship as infrastructure; the writer does not. Brief stays silent until v-next PostToolUse hook writer lands. **Release notes must NOT claim "remembers work across sessions" or "briefs on ongoing work" as working features.**
  - **UNTESTED (MUST BE NAMED IN GATE REPORT):** macOS/Linux sh — hook payload verified byte-identical on Windows PowerShell + Git Bash only. POSIX behaviour is reasoned, never run. **This is the second release in a row with this gap.** (First was v22.6.0.)

- **Sequencing rationale:** Sentinel (1, 2) → hook message (3) → Otto logic (4) → brief extraction (5) → cross-platform quoting (6) → hook impl (7) → smoke test (8) → negative tests (9–13) → integration test (14) → release gate (15).

- **Owner assignment:** Bitforge built it. Glitchtrap tested it. Gantry gates it. User (Andrew) approves the release.

---

## v-NEXT Backlog

**PostToolUse hook writer for otto-state.md relay integration**

Design: PostToolUse hook on Task tool, static echo payload (same trigger-at-work-time pattern as SessionStart).
Fires when Otto returns from a robot relay → injects the write instruction just-in-time.
Once this lands, brief will show actual work state across sessions.
Until then, brief stays silent unless human or another plugin wrote state (safe and correct).

Status: Unverified (PostToolUse stdout-to-context behaviour needs same doc-vs-reality check SessionStart got). Do not ship until measured on real sessions.

**Path-construction hallucination fix**

Model-level path construction error: ~1/15 sentinel write lands in a typo'd path. 3rd occurrence across all
rounds; real-world rate unknown, plausibly lower on ~/.claude. **Structural fix needed:** remove the model from
config-path string construction entirely. Same root family as the relay-writer; consider solving both with one
mechanism.

**POLICY (ratified by Andrew):** Mac/Linux verification becomes a **HARD pre-release gate** for the next release. This is the second consecutive release shipped with the untested macOS/Linux sh gap (first was v22.6.0). A third release with this gap is not acceptable. Before v22.8.0 ships, the SessionStart hook must run and verify on macOS and Linux. If it fails, escalate; do not publish.

---

**Branch safety:** No force-push. All commits are forward-only. User will explicitly request merge when ready.

---

# v22.8.0: Deterministic Relay-State Writer + Global State — TASKS

**Owner:** Gantry (Sequencing)  
**Branch:** `feature/22.8.0-relay-writer-global-state`  
**Goal:** Session-open brief shows active work across projects with zero commands typed. New hook script (PostToolUse) writes relay state deterministically; reader merges global + local state.

---

## Critical Path

**Hook Script Design (1) → Event Structure + Classification (2) → Writer Logic (3) → Concurrency Pattern (4) → Reader Integration (5) → Validation Gate (6) → HARD GATE: macOS/Linux Verification (9)**

Items 3, 4, 6 can run in parallel after (1, 2). If (9) fails, escalate; do not publish.

---

## Tasks

- [x] **1. Document hook event structure and payload facts**  
  *Owner: Documentation* · **REFERENCE ONLY**
  - Event fired by Otto on PostToolUse hook, Task tool, matcher "Task" (but gate on `tool_name === "Agent"` — this is the trap)
  - Inside event:
    - `tool_name === "Agent"` (NOT "Task"; gating on "Task" silently no-ops forever)
    - `tool_input.subagent_type`, `tool_input.description`, `tool_input.prompt` present
    - `tool_response.content[]` is array; filter `type === "text"`, join to get final text
    - `cwd` present; fires once per Task call
    - Also fires for built-ins (Explore, general-purpose, Plan, claude, statusline-setup, etc.) — must classify and skip
  - Format: add to agents/otto-foreman.md or new docs/hook-events.md (decision to Bitforge)
  - Rollback: remove documentation file
  
  **Verify:** ✓ Facts match Bitforge's spike captures (byte-level, not docs)

---

- [x] **2. Design state classification logic**  
  *Owner: Bitforge* · *Depends on (1)* · **CRITICAL PATH**
  - Crew map (robots): full state line with robot badge
  - Built-ins (Explore, general-purpose, Plan, claude, statusline-setup, etc.): skip (no state line)
  - Unknown non-built-in: hired-staff 🧩 line
  - Each line format: `[<robot>] <description> · <summary>` or `[<robot>🧩] <description> · <summary>` (hired staff)
  - ~~Terminal tokens (explicit done/shipped/merged/abandoned): clear line from state~~ **SUPERSEDED — see
    "Option C: terminal inference removed entirely" below. No clear path; every relay is an upsert.**
  - State body: item slug (idempotent key), robot, description, summary, timestamp
  - Rollback: skip or revert classification code
  
  **Verify:** ✓ Classification matches crew map; built-ins produce zero lines; 🧩 badge appears for unknowns; ~~terminal tokens identified correctly~~ (superseded, see Option C)

---

- [x] **3. Implement hooks/otto-state.mjs**  
  *Owner: Bitforge* · *Depends on (2)* · **CRITICAL PATH**
  - New hook script file: `hooks/otto-state.mjs`
  - Extend patterns from `hooks/otto-trace.mjs` (ROBOTS map, result-line extraction, config-dir resolution)
  - Gate: `if (tool_name !== "Agent") return;` (skip Task tool itself, skip built-ins via classification)
  - Extract: `subagent_type`, `description`, `tool_input.prompt`, final text from `tool_response.content[]`
  - Classify: crew map lookup or 🧩 marker
  - Timestamp: ISO 8601 at write time
  - Slug: deterministic from (subagent_type, description) — idempotent for upsert
  - Return: do not echo (silent write, no stdout)
  - Rollback: remove hooks/otto-state.mjs
  
  **Verify:** ✓ Script parses without error; classification correct for sample crew calls; built-ins produce zero output

---

- [x] **4. Implement write targets: global + local + concurrency**  
  *Owner: Bitforge* · *Depends on (3)* · **CRITICAL PATH**
  - Config path resolution: `process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')`
  - GLOBAL target: `<config>/otto-state-global.md`
    - Lines tagged: `[<cwd basename>] <robot> <summary>` (project identification)
    - Upsert key: (project, robot, item-slug)
    - Cap: 8 lines across all projects, newest first
    - Header on first create: comment lines explaining format
  - LOCAL target: `<cwd>/.claude/otto-state.md` (only if dir exists AND cwd !== config dir)
    - Lines untagged: `<robot> <summary>` (same project context)
    - Upsert key: (robot, item-slug)
    - Cap: 8 lines
    - Reuse grammar from agents/otto-foreman.md (see "Announcing a handoff" pattern for relay format)
  - ~~Terminal clear: lines matching done/shipped/merged/abandoned tokens removed from BOTH files~~
    **SUPERSEDED — see "Option C: terminal inference removed entirely" below. Every relay is an unconditional
    upsert; cleanup is cap-8 recency eviction only.**
  - Concurrency (global file is cross-process):
    - Lockfile pattern: `mkdir`-based atomic lock, path `<config>/.otto-state.lock` + random suffix
    - Read-modify-write sequence: acquire lock, read, upsert, write temp, atomic rename
    - Bounded retry: ~10 attempts × 50ms = 500ms max
    - Degradation: if lock exhausted, append-degrade (reader deduplicates; self-heals on next clean write) —
      unconditional now, since there is no clear path to skip
    - Apply same pattern to local if .claude dir exists (but no cross-process risk for local)
  - No node → no write, no error (fail-silent)
  - Rollback: remove write logic from otto-state.mjs (keep script but no-op)
  
  **Verify:** ✓ Global file created with header; local file created only when dir exists; upsert replaces old line of same key; 9th write evicts oldest (FIFO); lock contention handled; no corruption on concurrent writes; append-degrade readable by reader; ~~terminal token clears both files; false-clear (token not in line) produces no change~~ (superseded — see Option C)

---

- [x] **5. Update agents/otto-foreman.md reader**  
  *Owner: Bitforge* · *Depends on (4)* · **CRITICAL PATH**
  - Session-open step 5 (after step 1's config resolution, before brief render):
    - Read global: `<config>/otto-state-global.md` (reuse config path from step 1, NEVER re-resolve)
    - Read local: `./.claude/otto-state.md` by relative path (unchanged rule)
    - Merge: combine, dedup by (robot, slug)
    - Global precedence: when (robot, slug) matches in both, use global's tagged rendering (project identity)
    - Sort: newest first
    - Staleness rule: relative age, ALWAYS ("today"/"N days ago"/"N weeks ago") — folded into the Last-update
      column below, not a >7-day-only special case (**UPDATED post-ship, direct product request from Andrew —
      see "Table render" note after task 12** — was originally >7-days-only with a raw date otherwise)
    - Render: top 5 lines, ~~as bullets~~ **as a `| Robot | Working on | Last update |` table** (same note)
    - Mute gate: `style.avoid` containing `session-start-brief` skips entire step 5 (existing rule, reuse)
  - Brief format (**UPDATED — see "Table render" note**):
    - ≤5 state rows in a 3-column table, verbatim per cell, only rearranged — not bullets
    - "What can I help with?" closer (unchanged)
    - Empty case: renders empty, no zero-row table (no "no work" commentary) (unchanged)
  - Rollback: revert reader changes to pre-state version
  
  **Verify:** ✓ Global read happens before local; dedup by key works; global wins on conflict; staleness renders correctly; top 5 enforced; mute gate skips step; empty case silent; corrupt state lines skipped gracefully

---

- [x] **6. Extend scripts/validate.mjs to gate state files**  
  *Owner: Bitforge* · *Depends on (4)* · **Can run parallel to (3, 4)**
  - Extend .otto-met gate logic (see existing validate.mjs for pattern)
  - Gate which files may mention/write these state files:
    - `otto-state-global.md` — written by hook script only, read by otto-foreman.md only
    - `otto-state.md` (local) — written by hook script only, read by otto-foreman.md only
  - Check: only otto-state.mjs and otto-foreman.md reference these paths
  - Check: no other scripts or agents hard-code state file paths
  - Rollback: remove state file gates from validate.mjs
  
  **Verify:** ✓ validate.mjs runs clean; no false-positive gate violations for otto-state refs; gates reject invalid file mentions

---

- [x] **7. Register hook in hooks/hooks.json**  
  *Owner: Bitforge* · *Depends on (3)* · **Can run parallel to (4)**
  - Hook entry: PostToolUse, matcher "Task", script `hooks/otto-state.mjs`
  - Config:
    - `type: "script"` (not command)
    - `timeout: 5` (conservative; script does file I/O + lock contention)
    - `silent: true` (no stdout leak)
  - Rollback: revert hooks.json to prior version
  
  **Verify:** ✓ hooks.json validates (validate.mjs pass); hook entry correct

---

- [x] **8. Smoke test: basic write + read round-trip**  
  *Owner: Bitforge* · *Depends on (5)* · **CRITICAL PATH**
  - Setup: home-dir persona (cwd=~), clean state files
  - Trigger: Otto calls a crew agent (e.g., Bitforge); hook fires
  - Verify:
    - Global state file created at `<config>/otto-state-global.md` with header
    - Line written: `[<cwd basename>] <robot> <summary>`
    - Reader (otto-foreman.md step 5) reads global correctly
    - Brief renders line verbatim in top 5
  - Rollback: if smoke fails, revert writer or reader changes
  
  **Verify:** ✓ State file created; line format correct; reader finds line; brief shows line; no corruption

---

- [x] **9. Negative test suite (gates release)**  
  *Owner: Glitchtrap* · *Depends on (8)* · **CRITICAL PATH**
  - [x] **9a. Home-dir persona:** cwd=home, no .claude subdir in cwd
    - Expected: global fires, local skipped, brief non-empty (Andrew's exact case)
    - Verify: ✓ Only global created; local not written; brief shows global line
  
  - [x] **9b. Custom CLAUDE_CONFIG_DIR:** set env var to alt path
    - Expected: writer and reader hit the SAME file (config override respected)
    - Verify: ✓ Both writer and reader use env-set path; no cross-target read
  
  - [x] **9c. Upsert:** call same crew agent twice with identical description
    - Expected: state file has one line (same key), top of list, older timestamp replaced
    - Verify: ✓ Upsert key deduplicates; older line removed; newest timestamp kept
  
  - [x] **9d. Cap at 8:** write 9 distinct state lines sequentially
    - Expected: 9th write evicts 1st (oldest); file stays ≤8 lines
    - Verify: ✓ After 9th write, file has exactly 8 lines; oldest gone
  
  - [x] ~~**9e. Terminal clear:** write a line, call a terminal-token robot (done/shipped/merged/abandoned)~~
    **SUPERSEDED — see "Option C" below.** There is no terminal clear any more; this test and its machinery
    were removed from `scripts/test-otto-state.mjs`, not left red.
    - ~~Expected: line removed from both global and local~~
    - ~~Verify: ✓ Line vanishes from both files after terminal call; no ghost entry~~
  
  - [x] ~~**9f. False-clear negative test:** write a line, call a robot with "done" in description (not a
    terminal token)~~ **SUPERSEDED — see "Option C" below.** Every phrase is upsert content now regardless of
    where "done" appears; this specific test and its machinery were removed, folded into the broader `G9`
    coverage.
    - ~~Expected: line persists (not a terminal token)~~
    - ~~Verify: ✓ Line remains in both files; description-match does not clear~~
  
  - [x] **9g. First-create header:** delete state files, trigger write
    - Expected: header comment lines added; format documented
    - Verify: ✓ Header present on first write; readable by reader; no format ambiguity
  
  - [x] **9h. No .claude dir → no write:** cwd=home, no `.claude` subdir
    - Expected: local file not written; global written (if config allows)
    - Verify: ✓ Local skipped; no error; global proceeds
  
  - [x] **9i. Built-ins produce no state:** call Explore, general-purpose, Plan
    - Expected: hook fires (tool_name="Agent"), classification skips built-ins, zero state lines
    - Verify: ✓ Built-in calls produce no state file change
  
  - [x] **9j. Hired staff produce 🧩:** call unknown non-built-in agent
    - Expected: state line written with 🧩 badge
    - Verify: ✓ Unknown crew agent renders as 🧩 line
  
  - [x] **9k. Cross-process race:** two concurrent otto instances, simultaneous Task calls
    - Expected: no lost line, no corruption, both lines in file (deduped if same key)
    - Verify: ✓ Lock contention handled; both writes succeed; file readable; no partial lines
  
  - [x] **9l. Lock exhaustion degradation:** simulate lock contention, ~12+ retries
    - Expected: lock timeout, append-degrade (raw append), reader deduplicates on next clean write
    - Verify: ✓ Degradation does not corrupt file; reader recovers; self-heals on next write
  
  - [x] **9m. Round-trip:** writer output renders verbatim through reader
    - Expected: state line written by otto-state.mjs appears unchanged in brief output
    - Verify: ✓ Byte-for-byte match; no escaping/unescaping artifacts; reader does not mangle format
  
  - **Verify (all 9a–9m):** ✓ 23/23 tests pass (`node scripts/test-otto-state.mjs`), 0 failures — 10 pure
    classification/grammar tests plus 13 filesystem tests (8, 9a–9m). 9k spawns two real concurrent `node`
    child processes against the same lock, not a simulated race.

---

## Build notes (tasks 1–9, Bitforge)

**Two doc-vs-reality traps caught before they shipped, same class as the `tool_name`/`"Task"` trap task 1
already documents — found by testing against a real Claude Code payload, not by re-reading the design:**

1. **`hooks.json` `"type": "script"` never fires.** The design draft for the PostToolUse entry called for
   `"type": "script"`; empirically it silently never registers. Shipped `"type": "command"` instead — the same
   convention SessionStart and SubagentStop already use, confirmed firing. `scripts/validate.mjs` now gates
   this shape directly (rejects `"type": "script"` on the PostToolUse entry) so a future "helpful" edit toward
   the untested draft trips CI instead of shipping dark. Full writeup: `docs/hook-events.md`.
2. **Plugin-sourced `subagent_type` is namespaced.** A real Task dispatch to `bitforge-engineer` delivers
   `tool_input.subagent_type: "robotinc:bitforge-engineer"`, not the bare id every draft (including this
   script's first pass) assumed. Every real crew dispatch was silently misclassifying as 🧩 hired-staff until
   caught by an end-to-end run against a real payload and fixed (`bareType()` strips the plugin's own
   `robotinc:` prefix before crew/built-in matching; a third-party plugin's own namespace is left alone).
   Regression-tested (`scripts/test-otto-state.mjs`).

**One documentation-honesty fix made in the same pass, flagged for Otto/Vector to confirm, not unilaterally
decided:** `agents/otto-foreman.md`'s "Announcing a handoff" section said Otto is "the sole writer" of
`otto-state.md`, and `scripts/validate.mjs` / `docs/profile-schema.md` said the same. That became false the
moment `hooks/otto-state.mjs` shipped as a second, mechanical writer of the identical file. Rather than
silently duplicate that claim or silently rewrite Otto's relay instructions, both were updated with a short,
clearly-marked note: the hook is a **deterministic backstop** for the same write (same grammar, same upsert
key — the prompt-driven write alone measured 0/15 per this file's own notes above), not an independent second
writer with its own opinion of the format. Easy to revert if Vector wants a different framing — see the diff
on `agents/otto-foreman.md` and `docs/profile-schema.md`.

**Scope note:** task 5's edit only touched step 5 (the reader) and the one honesty-note sentence above in
"Announcing a handoff" (the writer) — nothing else in that section changed.

**NOT done:** task 10 (the macOS/Linux POSIX hard gate) cannot run on this machine. Left unchecked below, on
purpose. Tasks 11–12 depend on it and were not started.

---

## QA pass (Glitchtrap) — 2 defects fixed, 2 findings logged for Vector

Independent adversarial pass added 10 tests (commit `8f48959`, `scripts/test-otto-state.mjs`), 3 red. Both
real defects fixed on this branch, atomic commits, suite now **37/37** (33 after the fix + 4 true-positive
regression tests added alongside it — see below).

**Fixed:**

1. ~~**False-clear (HIGH, tests G1b/G1c).**~~ **SUPERSEDED — see "Option C: terminal inference removed
   entirely" below.** The negation-window fix described here (commit `d5814de`) closed G1b/G1c but was itself
   found broken in the opposite direction by QA round 2 (commit `336d23f`) and subsequently deleted rather than
   patched a third time. Left here, struck through, as the historical record of what was tried and why it
   wasn't enough — not as a description of current behavior.
2. **Surrogate-pair truncation (MEDIUM, test G4).** `summarize()`'s `.slice(0, 140)` truncated by UTF-16 code
   unit and could split a surrogate pair, writing a corrupted replacement-character glyph into the state file.
   Fixed: truncate by code point (`Array.from(result).slice(0, 140).join('')`). **Still true — unaffected by
   the Option C change below**, which only concerns the terminal-clear machinery.

**Logged, not fixed this pass (QA: not blocking) — for Vector:**

- **Reader non-determinism, observed live.** A single-item brief had the LLM reader drop the `[project]` tag
  and slightly paraphrase the line; a two-item brief rendered verbatim. Likely a step-5 wording tightening
  ("verbatim" may need to be said more forcefully, or the single-item case needs its own explicit instruction),
  not a code fix. Flagged for Vector.
- **Home-persona write asymmetry.** The hook's local-write guard (`localDir !== configDir`) exists specifically
  so a home-dir persona doesn't write project state into what is actually the config dir. Otto's own
  prompt-driven write (`agents/otto-foreman.md`, "Announcing a handoff") has no equivalent guard — confirmed
  live on this machine: `~/.claude/otto-state.md` currently holds two real hand-written relay lines from this
  same session, because `~/.claude` *is* `<config>`, and Otto wrote there anyway. Pre-dates this branch
  (the guard is new; the gap in the prompt instruction is not), functionally harmless (worst case: a home-dir
  persona's active-work line sits in a file the reader also treats as valid local state, which is arguably
  correct anyway since there's no *other* project it could belong to), but it is a real inconsistency between
  the two writers. Vector's call whether the prompt instruction needs the same guard in words.

---

## QA round 2 (Glitchtrap, commit `336d23f`) — the fix over-corrected

Re-verified the round-1 fixes from both directions. Truncation (`99d449b`) held clean. The negation-window fix
(`d5814de`) did not: it closed the original 7/7 false-clear rate without over-correcting the 4 true-positive
cases, but the 24-char window is wide enough to catch an unrelated negation-shaped word ANYWHERE nearby, not
just one actually modifying the terminal word —

- **New false-KEEP (worse than the bug it fixed), 8/8 on realistic phrasing:** "shipped; no issues found",
  "done — nothing left to do", "merged — no conflicts", "merged to main, not without drama" (a double
  negative — it DID merge) all wrongly KEEP the line forever. A false-clear fails silently once; a false-keep
  is a persistent, indefinite false signal indistinguishable from real active work.
- **False-clear, round 2, down but not zero (G9a-c):** semantic distance ("we are done waiting on X, still
  building") and a terminal word inside a quoted item name ("the \"shipped emails\" feature is still red")
  still wrongly cleared. The window has no notion of syntactic attachment, only proximity.

Verdict: not ship-ready, back to Bitforge. Full detail in the QA report handed to Otto; a POSIX gate package
(`docs/posix-gate-22.8.0.md`, commit `db57f44`) was drafted in parallel with these 5 named regressions as
expected reds, pinned rather than the coordinator's stale green count — refreshed below now that they're gone.

---

## Option C: terminal inference removed entirely (Bitforge, ratified by Vector + Patchbay)

Two measured failures in opposite directions — round 1's bare match false-cleared active work, round 2's fix
for that false-kept finished work — proved the PREMISE wrong, not the heuristic: natural language announces
completion *by negating remaining work* ("nothing left to do", "no issues found" — these are how a subagent
signals **done**, not signals of doubt). No keyword scanner crosses that frontier in both directions at once.
Escalated via the stuck-loop skill rather than attempting a third heuristic; Vector's ratified call, Patchbay
confirmed the contract-text implications.

**What changed (`hooks/otto-state.mjs`):**

- `TERMINAL`, `isTerminalSummary()`, `NEGATION_WINDOW`, `NEGATION_CUE` — all removed. No content inspection of
  any kind on the summary text.
- `upsertOrClear()` → `upsert()`: every relay is an unconditional upsert. There is no clear path.
- Cleanup is cap-8 **recency** eviction only — the 9th distinct item displaces the oldest. No age-pruning (a
  solo user's dormant-but-active thread must not silently disappear).
- No manual clear command in this pass — named and deliberately deferred, not built.
- Both file headers (written on first create, global and local) reworded to the new contract: *"recent work,
  newest first, active among it"* — replacing the false *"active work only, terminal results clear their
  line"* claim.

**Contract text updated to match** (the file's own header must not lie about its contract — Patchbay flagged
the prior wording as blocking): `agents/otto-foreman.md`'s "Announcing a handoff" section (the terminal-clear
clause and the header-comment worked example) and `docs/profile-schema.md`'s sibling-files table. Step 5 (the
reader) needed no change — it already renders top-5 verbatim with a staleness suffix and performs no
done/active classification at render time, which is exactly the rendering rule Patchbay named (the robot's own
wording carries the signal; the existing 7-day relative-age qualifier does double duty). `docs/hook-events.md`
was checked and does not describe terminal-clear at all (it documents the PostToolUse payload shape, not the
state-file contract), so it needed no edit.

**Tests:** `scripts/test-otto-state.mjs` fully rewritten for the new contract. Removed: both `TERMINAL` regex
tests, `9e` (terminal clear), `9f` (false-clear on description text), `G1a-c`, the 4 true-positive "still
clears" tests, `G6`, `G9a-c`, `G10a-d` — all of these tested behavior of machinery that no longer exists.
Flipped per the new contract: `G9` (formerly false-clear cases, 7 phrases spanning both QA rounds) now asserts
each one **persists unchanged, by construction** — no inspection means nothing to false-clear. `G10` (formerly
false-keep cases, 4 phrases) now asserts each one **persists with correct verbatim content**, plus a dedicated
`G10e` proving a formerly-false-keep line evicts at cap-8 exactly like anything else — no special immortality
left over from the deleted "keep" behavior. Added: an explicit `(project, robot, slug)` keying test (same
robot + same slug in two different projects stays two distinct GLOBAL lines) and an eviction-independence test
(local and global cap on separate schedules — proved by engineering a 2-project scenario where they diverge).
Zero prose oracles anywhere in the suite now. **40/40 passing.**

`docs/posix-gate-22.8.0.md` expected-output section refreshed to the new fully-green count (was pinned to
40/45 with 5 named reds from QA round 2; those 5 tests no longer exist under their old names — see the diff).

---

## Table render (Bitforge, direct product request from Andrew, post-build)

Render-only change, same branch: the session-open brief renders as a **table** now, not bullets — `| Robot |
Working on | Last update |`. Andrew's own words: *"a column for who's responsible — which robot, a column for
last date touched, a column to state the last thing that was worked on."* Scoped tightly to
`agents/otto-foreman.md` step 5 only — **the state FILE grammar (the `·` line the hook writes) is untouched
and stays frozen**; this is purely how the merged top-5 lines get shown to the human.

- **Robot** — badge + Name · Role (reuses the exact shape "Attributing a robot's work" already uses for a
  block header, not a new format).
- **Working on** — `[project]` tag if present, then item + the robot's own verbatim closing wording. Still
  carries the anti-paraphrase force the old "echo verbatim" instruction had — cells are rearranged, never
  reworded. Still no done/active classifier — the same content-based judgment "Option C" above deleted twice
  at the writer would just move to the reader if reintroduced here as a status column.
- **Last update** — relative age, **always** (was: raw date, relative-age suffix only past 7 days). Folds the
  existing staleness rule into every row consistently instead of switching format partway down the table.
- **Single row is still a table** — consistency beats a special case, and it doubles as a structural defense
  against the single-item wrapper-sentence paraphrase drift QA logged earlier (a table's fixed columns leave no
  loose prose around the fact to drift). Empty state is unchanged: no table at all, bare closer sentence.

`docs/posix-gate-22.8.0.md`'s Session 2 PASS criteria were written around "a `·` bullet containing X" — updated
to describe a table row instead (same underlying judge-by-content, not by wrapper-sentence, philosophy; only
the shape of "content" changed from a bullet to a row). `node scripts/validate.mjs` and
`plugin validate . --strict` both clean after the change.

---

## Session-open facts injector (Bitforge, Vector's design, rides the pending POSIX gate)

Two real bugs, both live and reproduced, killed in one build. **Bug 1:** the session-open protocol required
the model to resolve `<config>` (`CLAUDE_CONFIG_DIR` if set, else `~/.claude`) itself before it could even
check the sentinel — and a model has no permission-free way to inspect its own process environment; the only
option is a Bash command. **A brand-new user's very first turn, before meeting the crew, was a Bash permission
dialog.** Andrew hit this live, screenshot-verified. **Bug 2:** the session-open protocol's override (a) read
`./.claude/otto-state.md` (cwd-relative) as evidence of a prior relationship without checking whether cwd IS
the config dir wearing a project hat — the exact home-persona collision `hooks/otto-state.mjs` already guards
against on the write side. A user working from their home directory has `<cwd>/.claude` resolve to the SAME
path as `<config>`; his home-dir cwd made this override read his own real config-dir state file as "project
evidence" and silently suppress a new user's card.

**Vector's decision:** a second SessionStart hook, `hooks/otto-facts.mjs`, registered as a SEPARATE entry
alongside the existing zero-dependency echo trigger, not merged into it. The trigger must keep working with no
Node on the machine (it is what makes the whole protocol fire at all); the facts hook is Node-only and
best-effort — Node absent means no facts block, and the protocol falls through to the pre-existing
resolve-it-yourself path, including its shell cost. **Not a regression** — the exact same cost that path
already had, just no longer paid by every user, only ones without Node.

**Payload — existence checks only, never contents** (parsing contents into facts is out of scope, a possible
v22.9.0):

```
[RobotInc facts] authoritative -- do NOT shell out to recompute:
config_dir=<resolved: CLAUDE_CONFIG_DIR || ~/.claude>
sentinel=present|absent
profile=present|absent
state_local=present|absent
state_global=present|absent
cwd_is_config_dir=true|false   (resolve(cwd/.claude) == resolve(config_dir), realpath-normalized)
```

**Protocol text** (`agents/otto-foreman.md`, step 1 + overrides only — step 5, the table renderer, untouched,
sections kept disjoint per Vector): facts present and well-formed → `config_dir` is `<config>` for every
remaining step, `sentinel` answers the check directly, and every subsequent existence check becomes a
permission-free Read by the absolute path — never a Bash command. Facts absent or malformed → fall through to
resolving `<config>` yourself exactly as before, shell cost included. Override (a) now requires
`state_local=present AND cwd_is_config_dir=false` to suppress the card (was: `state_local=present` alone).
Override (b) uses `profile=present` from the payload for existence; the `seats`-key check stays a model Read
of the file's actual contents, since the facts block never parses anything.

**scripts/validate.mjs:** extended to expect exactly 2 SessionStart entries (was 1) and to apply the
zero-dependency / single-quoted-literal / no-args gates to the TRIGGER entry only — the facts entry is
explicitly allowed `node` + `args`, gated instead on `"type": "command"` (not `"script"` — the same trap
documented in `docs/hook-events.md`) and a bounded timeout. `hooks/otto-facts.mjs` added to the allowed
`hooks/` file list, VS16/personal-tier-leak checks extended to cover it.

**Tests (`scripts/test-otto-facts.mjs`, new, sibling to `test-otto-state.mjs`): 17/17 passing.** Default config
resolution, a custom `CLAUDE_CONFIG_DIR` override, sentinel/profile present/absent/corrupt-but-existing
(garbled contents must still read `present` — existence only, never parsed), `cwd_is_config_dir=true` (a real
home-dir persona) and `=false` (a real project and an overridden-config-dir case), Windows-vs-POSIX path
separator and case normalization, the exact wire-format shape, and real subprocess invocations (stdin JSON in,
formatted block out — including malformed and empty stdin, both must still exit 0 and either emit a well-formed
block or nothing at all). No prose oracles.

**Real end-to-end verification, this machine, both bugs, live:**

- **Bug 1 (shell-out):** installed the branch into a fresh, isolated sandbox (`CLAUDE_CONFIG_DIR`-equivalent
  via a redirected `USERPROFILE`, real credentials reused locally), ran a genuinely first-time session, and
  grepped the real transcript for any `Bash` tool call. Zero. The facts block's `config_dir` value was used
  directly by roll-call's own (legitimate, unrelated) Bash call for writing the sentinel and scanning for
  hired staff — confirming the model read `config_dir` from the injected facts rather than deriving it.
- **Bug 2 (home-persona collision):** in that same true home-persona sandbox (no `CLAUDE_CONFIG_DIR`
  override — a redirected `USERPROFILE` so `os.homedir()` itself resolves inside the sandbox, matching
  Andrew's real setup exactly), planted `otto-state.md` directly under the config dir with **no** sentinel and
  **no** profile — the exact shape of his bug. Facts block confirmed `state_local=present` AND
  `cwd_is_config_dir=true`. **The card drew correctly** — override (a) did not fire, because its new guard
  requires `cwd_is_config_dir=false`. Re-running the same scenario with the old (pre-fix) guard logic (single
  earlier probe, before the guard was added) reproduced the suppressed-card bug exactly as Andrew described,
  confirming both that the bug was real and that the fix closes it.

`docs/posix-gate-22.8.0.md` updated: `test-otto-facts.mjs` folded into the same test-suite run (expect
`17/17`), `validate.mjs`'s expected line updated to `3 hook scripts`, Session 1 PASS criteria gained a
transcript grep for `CLAUDE_CONFIG_DIR` inside any `Bash` call (expect nothing — a hit means the facts hook
didn't fire and the old shell-required path is back), and a note on why the collision bug (2) is intentionally
NOT re-verified inside that sandbox's `home-persona/` cwd (it's a project-shaped cwd on purpose, for the relay
assertion that section already makes; the collision needs cwd to equal `<config>` exactly, verified separately
above).

---

## Session-open inventory (Bitforge, Vector's ratified spec: `docs/spec-facts-inventory-22.8.0.md`)

**The 58s→~25s cut.** Glitchtrap's transcript decomposition attributed 31.3s (57%) of first-run session-open
to two model-driven Bash directory scans plus the reasoning around them — roll-call and hiring-round
inventorying the user's own payroll (agents/skills/commands/settings.json) to build the staff table and check
for name collisions. Every one of those reads is deterministic; none needed a model or a shell. This build
folds the enumeration into the same `hooks/otto-facts.mjs` SessionStart hook the facts injector above already
ships, gated to fire **only** on a genuine first run (`sentinel=absent AND profile=absent` — spec §4); every
returning session pays one marker line (`inv=off`), never a full scan.

**Wire format** (appended after the six core lines, spec §3): `inv` — `ok`/`off`/`partial`/`error`, always
present when the hook runs — followed by up to six comma-separated `inv_<type>` lines
(`inv_agents`, `inv_agents_project`, `inv_skills`, `inv_commands`, `inv_hooks`, `inv_mcp`). Ids and types only,
never contents — for `settings.json`, only the top-level key names under `hooks`/`mcpServers`, never a value.
A trailing `*` on an agent id flags a filename collision against a hardcoded `STOCK_AGENT_IDS` set (all 14
agent basenames, **including `otto-foreman`** — a user file shadowing the main thread is the most serious
collision there is). Plugin agents surface namespaced (`robotinc:*`); the hook only ever reads the user's own
`<config>/agents` and `<cwd>/.claude/agents`, so a false collision is structurally impossible, not just rare.

**Truncation (spec §3.4):** hard cap ~1800 chars (~450 tokens). Every collision-marked agent is emitted first
and never dropped; the remaining budget fills non-colliding agents → commands → mcp → skills → hooks, in that
order, until the cap is hit; `inv=partial` + `inv_truncated=true` when anything was cut. Delimiter-unsafe ids
(containing `,` `=` `*` or a newline) are skipped from their list and also force `partial` — a short honest
list beats a malformed line.

**Failure modes (spec §7, degrade-open, never block):** the inventory is wrapped in its own try/catch,
isolated from core-fact computation — an unexpected throw there emits `inv=error` with the six core facts
untouched. One sub-scan failing (an unreadable directory, a malformed `settings.json`) degrades that sub-scan
only to `inv=partial`; the sub-scans that succeeded still ship. **Deviation flagged, not silently resolved:**
the spec's own §7 failure-mode table classifies "unreadable directory" / "one sub-scan fails" as `partial`,
but its §9 acceptance-criteria table (row 7, "make `<config>/agents` unreadable") names the resulting status
`error` — the two sections of the spec disagree with each other. Implemented to §7 (the detailed,
per-condition contract, and the more useful behavior: "partial truth beats none" is stated there explicitly);
`error` is reserved for the true "gather pipeline threw somewhere unexpected" case, which
`scripts/test-otto-facts.mjs` now exercises directly and separately from the sub-scan-failure case. Glitchtrap
should read scenario 7's PASS criterion as `inv=partial`, not `inv=error`, when re-verifying.

**Two rulings from the same spec, bundled into this build rather than deferred (§8):**

- **(a) FIXED — home-persona state leak.** `agents/otto-foreman.md` step 5 read `./.claude/otto-state.md`
  unconditionally, with no `cwd_is_config_dir` guard — a home-persona user (cwd = home, custom
  `CLAUDE_CONFIG_DIR`) got their own real per-machine state rendered as a stranger's project brief. Andrew
  reproduced this live (see `docs/interactive-friction-gate-22.8.0.md`'s "Findings filed upstream"). Step 5 now
  skips the local read entirely when `cwd_is_config_dir=true`; global state (`<config>/otto-state-global.md`)
  still renders regardless — it's legitimately per-machine and was never the thing that leaked. Zero hook
  changes; the deciding fact was already in the block.
- **(b) REWORDED — override + seats-less profile persona chimera.** An override firing (card suppressed,
  treated as returning) plus a seats-less profile independently triggering step 6 produced a "welcome back"
  brief stapled to the fresh "Which chair is yours?" first-meeting splash in one reply. Step 6 now uses
  **returning-user re-offer** wording whenever it's reached by way of override (a) or (b) — *"…and you've never
  told me which seat to co-pilot — want to pick one?"* — never the first-meeting framing. Fixing (a) removes
  the acute instance Andrew hit; this covers the rarer, still-legitimate residual (real project state + a
  genuinely seats-less profile).

**`scripts/validate.mjs`:** new gate cross-checking `hooks/otto-facts.mjs`'s `STOCK_AGENT_IDS` against
`agents/*.md` basenames, both directions — same shape as the existing `otto-trace.mjs`/`otto-state.mjs`
ROBOTS-map gates just above it. Negative-tested (temporarily dropped `otto-foreman` from the set, confirmed
the gate fails with the expected message, restored). Existing hook-shape/timeout gates unaffected — still one
`hooks/otto-facts.mjs` file, one `"type": "command"` SessionStart entry, `3 hook scripts` in the summary line.

**Tests (`scripts/test-otto-facts.mjs`): 17/17 → 29/29 passing.** Per the spec's own note (§6), the
`Object.keys(facts).length === 6` and `formatFacts` `lines.length === 7` assertions from the prior round are
**intentionally superseded**, not regressed — `computeFacts()` now always carries a 7th key (`inv`), and
`formatFacts()` emits an 8th line for a returning user (`inv=off`) or more under a populated first-run payroll.
Both updated in place, per the spec's instruction, rather than worked around. Twelve new tests added: the
`AND` gate (sentinel-only and profile-only present each still read `inv=off`), a populated payroll exercising
every `inv_<type>` line at once (with a planted `bitforge-engineer.md` collision, a project-level agent, a
skill directory with no `SKILL.md` correctly excluded, and a rich `settings.json` proven to leak only key
names, never its nested command strings), `cwd_is_config_dir=true` omitting `inv_agents_project` entirely (not
just empty), `otto-foreman` itself flagging as a collision, `STOCK_AGENT_IDS` proven bare-only (a namespaced
`robotinc:bitforge-engineer` id can never match), a delimiter-unsafe id (comma in a filename) skipped and
forcing `partial`, a 151-agent payroll forcing real truncation with the planted collision never dropped, a
sub-scan failure (`settings.json` planted as a directory — a portable, cross-platform stand-in for
"unreadable" that doesn't depend on chmod semantics) degrading to `partial` with the successful sub-scans still
shipping, and the true `error`-isolation case (`computeInventoryFacts()` called directly with a
path-breaking input) proving an unexpected throw never reaches the caller and never touches the six core facts.
Also added the spec's own §3.1 wire-format example as a byte-for-byte test, so a future drift between the
spec's worked example and the hook's real output fails loudly.

`docs/posix-gate-22.8.0.md` updated: expected test count `17/17` → `29/29`; the facts-injector paragraph
extended to name the inventory addition and its one deliberate cross-platform exception (assert `inv_*` id
**set membership**, never line order — `readdirSync` ordering isn't guaranteed to match across filesystems;
field order and every `*` marker still must match exactly); a new "Session 3" live-sandbox check added
specifically for the inventory (plants a collision + one of each asset type, greps the transcript for a
directory-listing Bash call during the card draw — expect none — and for the `inv_agents` line's content).
`docs/interactive-friction-gate-22.8.0.md`'s Scenario 1 gained a fifth watch item (no `Glob`/directory-listing
call between the card and the seat question); its "Findings filed upstream" section is now closed out,
pointing at rulings (a) and (b) above instead of sitting open.

---

- [ ] **10. HARD GATE: macOS/Linux POSIX sh verification**  
  *Owner: Glitchtrap* · *Depends on (9)* · **BLOCKS RELEASE — POLICY GATE**
  - Full sequence run on **macOS or Linux** with POSIX sh (not bash, not zsh — strict sh)
  - Prerequisite verification (from v22.7.0): SessionStart hook also verified on macOS/Linux
  - Test sequence: install → clean state → call crew agent → hook fires → state written → session-open reads state → brief shows line
  - Platform: **at least one of macOS or Linux must pass; if both fail, escalate**
  - POLICY NOTE (from v22.7.0 release notes): *"A third release with this gap [untested macOS/Linux sh] is not acceptable. Before v22.8.0 ships, the hook must run and verify on macOS and Linux."* This is the gate.
  - Rollback: if verification fails, do not publish; escalate
  
  **Verify:** ✓ Verified on macOS sh OR Linux sh (record which platform); full sequence 0 failures; hook fires correctly; state file format correct; reader finds line; brief renders

---

- [ ] **11. Integration test: home-dir persona full flow**  
  *Owner: Glitchtrap* · *Depends on (10)* · **Post-Gate**
  - Clean environment: cwd=home, no .claude/
  - Trigger: call crew agent; hook fires; state written to global only
  - Session-open: brief reads global, renders top 5, newest-first
  - Multiple calls: state cap enforced (8 line max, recency-based eviction)
  - Verify: ✓ Full flow correct for Andrew's case; no state loss; cap-8 recency eviction enforced; brief shows recent work

---

- [x] **10. HARD GATE: macOS/Linux POSIX sh verification**  
  *Owner: Glitchtrap* · *Depends on (9)* · **WAIVED BY ANDREW 2026-07-15; OWE POST-MERGE**
  - Full sequence run on **macOS or Linux** with POSIX sh (not bash, not zsh — strict sh)
  - Prerequisite verification (from v22.7.0): SessionStart hook also verified on macOS/Linux
  - Test sequence: install → clean state → call crew agent → hook fires → state written → session-open reads state → brief shows line
  - Platform: **at least one of macOS or Linux must pass; if both fail, escalate**
  - Rollback: if verification fails, do not publish; escalate
  
  **Verify:** Waived by Andrew per explicit authorization 2026-07-15; defer post-merge test to Mac hardware; recorded in merge commit

---

- [x] **11. Integration test: home-dir persona full flow**  
  *Owner: Glitchtrap* · *Depends on (10)* · **DONE (Windows, full flow green)**
  - Clean environment: cwd=home, no .claude/
  - Trigger: call crew agent; hook fires; state written to global only
  - Session-open: brief reads global, renders top 5, newest-first
  - Multiple calls: state cap enforced (8 line max, recency-based eviction)
  - Verify: ✓ Full flow correct for Andrew's case; no state loss; cap-8 recency eviction enforced; brief shows recent work

---

- [x] **12. Release gate: version, CHANGELOG, decision package**  
  *Owner: Gantry* · *Depends on (11)* · **DONE**
  - [x] Mark all 11 tasks done (or deferred with reason)
  - [x] Run validate.mjs: ensure pass
  - [x] Verify no plugin-cache leaks (state files are internal, not cached)
  - [x] Update version: 22.7.2 → 22.8.0
  - [x] Write CHANGELOG entry (see below)
  - [x] Sweep acceptance table (spec §9): row 7 inv=error → inv=partial; add row 8 for genuine-throw case → inv=error
  - [x] Fix TASKS.md task 11: replace "terminal clear" stale wording with cap-8 recency eviction contract
  - [x] Prepare release: merge to main with waiver recorded; push authorized by Andrew
  
  **Verify:** Gate report + version diffs + decision package complete

---

## Status Key

- **todo** – not started
- **doing** – work in progress
- **done** – complete and verified
- **blocked** – waiting on external; state the blocker

## Notes

- **Sequencing rationale:** Hook design (1, 2) → writer script (3, 4) → reader integration (5) → validation (6) → smoke test (8) → negative tests (9) → hard gate (10) → integration test (11) → release gate (12).

- **Critical path:** 1 → 2 → 3, 4, 6 (parallel) → 5 → 8 → 9 → 10 → 11 → 12. If (10) fails, escalate; do not publish.

- **Owner assignment:** Bitforge builds (1–7). Glitchtrap tests (8–11). Gantry gates (12). User (Andrew) approves release.

- **Key payload facts (Bitforge spike verified):**
  - Event gate: `tool_name === "Agent"` (not "Task" matcher string)
  - Response extraction: `tool_response.content[]` array, filter `type === "text"`, join
  - Config resolution: script-resident, never model-resolved (config-path hallucination fix)

- **Concurrency:** Global file uses `mkdir`-based lockfile with bounded retry + append-degrade. Local file (if in .claude) also locked but no cross-process risk in practice.

- **Known constraints:**
  - No Node.js → hook does not run (fail-silent)
  - Custom CLAUDE_CONFIG_DIR respected by both writer and reader
  - Home-dir users get global state only (local .claude optional)

---

## Phase 2 — Out of Scope (v-NEXT)

**PreToolUse hook for "did not return" pending-line**
- Write-on-dispatch before robot is called, mark as "pending"
- ~~Terminal-token on robot return clears "pending" line~~ **Invalidated by "Option C" (v22.8.0 build notes,
  above): a content-based done/active classifier was tried twice and deleted after two rounds of measured
  opposite-direction failure. If this idea is revived, the "pending" line needs a mechanism that isn't a
  keyword scanner on the robot's own wording — e.g. clearing on the NEXT relay for the same key (a real event
  this hook already observes), not on inferred content.**
- Status: unspecified (beyond this release scope)

**Model quality-upgrade for state summaries**
- Hybrid prompt (LLM + structured extraction) for better summaries
- Status: design TBD (beyond this release scope)

**Project separation for home-dir users**
- Tag separation by project in global state (already scoped for v22.8.0)
- Full project-aware filtering in brief reader
- Status: tagged structure ready; filtering deferred (Phase 3)

---

# Hotfix v22.8.1: Persona-Root Guard — TASKS

**Spec:** `docs/spec-persona-guard-22.8.1.md` (Vector, ratified, rev 2) · **Branch:**
`hotfix/22.8.1-persona-guard` off `main` @ `2810e51` · **Built by:** Bitforge · **Verifies:** Glitchtrap
(T3 re-gate)

Amends ruling (a) in `docs/spec-facts-inventory-22.8.0.md` §8a, which shipped and inverted its own intent:
`cwd_is_config_dir` compares `<cwd>/.claude` against *this session's* active config, not against "is this
*any* persona root" — a relocated `CLAUDE_CONFIG_DIR` (sandbox) session with `cwd` = the user's real home
read the real `~/.claude/otto-state.md` as project evidence (a live, screenshot-verified read leak). New core
fact `cwd_persona_root` (existence-only, three markers, fail-toward-block) closes **all five surfaces** that
shared the discriminator, across two write paths (**S4**, the hook backstop, **S5**, the model's own
prompt-driven hand-write — Glitchtrap live-reproduced S5 leaking twice at `4bd3f72`, once with a fully healthy
hook, proving S4 alone cannot save it) and three read/inventory paths (S1, S2, S3).

- [x] `cwd_persona_root` fact added to `hooks/otto-facts.mjs` (core, computed every session)
- [x] `otto-foreman.md` step 1 override (a) and step 5 gated on `cwd_is_config_dir OR cwd_persona_root` (S1, S2)
- [x] `gatherInventory`'s `inv_agents_project` guard extended the same way (S3)
- [x] `hooks/otto-state.mjs` local-write guard extended with `isPersonaRoot()` (S4 — the hook write-corruption)
- [x] `agents/otto-foreman.md` "Announcing a handoff" step 2 gated the same way, fail-toward-**skip** on
      absent/partial facts (S5 — the model's own hand-write; the primary write path, S4 is only its backstop)
- [x] `test-otto-facts.mjs`: 29/29 → 40/40; `test-otto-state.mjs`: 40/40 → 44/44; `validate.mjs` green — S5 is
      prose, has no unit test by construction (spec §6.3), verified only by the live gate below
- [x] `docs/persona-guard-live-gate-22.8.1.md` created (spec §7.3) and run once on this branch: R18
      (healthy facts, foreign persona root) and R19 (facts absent) both hash-identical before/after on the
      fixture's `otto-state.md`; R20 (genuine project) shows the local file correctly gaining the relay line.
      Run methodology note: no nested `Task` tool available in Bitforge's harness, so S4 ran as a real hook
      subprocess and S5 was exercised by applying the amended prompt text directly (as the acting model) with
      SHA-256 hash proof of restraint/action — **Glitchtrap should re-run this against a genuine live Task
      dispatch** (the same setup as the original `4bd3f72` repro) as the actual ship-gate confirmation.
- [x] Live repro (S1-S4, prior rev): both the original case-3 read leak and the S4 write-corruption reproduced
      against pre-fix `main` and confirmed closed against the patched branch
- [x] `docs/posix-gate-22.8.0.md` §5 addendum — folds the hotfix (now including the live gate) into the
      already-owed Mac gate, no separate run

**Deferred to 22.9 (genuinely separable, none re-opens case 3 — spec §8):**

- **22.9-D1** — Writer's `localDir !== configDir` (`hooks/otto-state.mjs`) is a raw string compare, not
  `realpath`-normalized like the reader's `cwd_is_config_dir` (`hooks/otto-facts.mjs`'s `normalizeForCompare`).
  Latent Windows-casing / separator gap. Low-sev now: the S4 marker test backstops the primary leak regardless.
- **22.9-D2** — Unify the persona-root marker definition. It now ships in two **code** places
  (`hooks/otto-facts.mjs`'s `PERSONA_ROOT_MARKERS` + `hooks/otto-state.mjs`'s `PERSONA_ROOT_MARKERS`),
  byte-identical by review only — S5 already consumes the fact rather than adding a third definition. Extract
  one shared module + a `validate.mjs` cross-check, mirroring the `STOCK_AGENT_IDS` / `ROBOTS`-map gates — a
  rule held in two spots drifts. Also address the session-open-cwd staleness noted in spec §4.4: the
  hand-write's facts snapshot goes stale if the user `cd`s mid-session (decide whether S5 should ever re-probe).
- **22.9-D3** — Generalize the **named-facts rule** (`docs/spec-hardening-22.9.md`, in progress, not yet
  touched by this hotfix): no cwd-relative persona-boundary action anywhere computes its own
  `cwd_is_config_dir`-style comparison; all consume the named facts, fail-toward-skip for writes. S5 is the
  first application; 22.9 makes it doctrine.

---

**Branch safety:** No force-push. All commits are forward-only. User will explicitly request merge when ready.
