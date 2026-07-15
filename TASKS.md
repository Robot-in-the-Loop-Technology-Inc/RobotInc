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

- [ ] **1. Document hook event structure and payload facts**  
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

- [ ] **2. Design state classification logic**  
  *Owner: Bitforge* · *Depends on (1)* · **CRITICAL PATH**
  - Crew map (robots): full state line with robot badge
  - Built-ins (Explore, general-purpose, Plan, claude, statusline-setup, etc.): skip (no state line)
  - Unknown non-built-in: hired-staff 🧩 line
  - Each line format: `[<robot>] <description> · <summary>` or `[<robot>🧩] <description> · <summary>` (hired staff)
  - Terminal tokens (explicit done/shipped/merged/abandoned): clear line from state
  - State body: item slug (idempotent key), robot, description, summary, timestamp
  - Rollback: skip or revert classification code
  
  **Verify:** ✓ Classification matches crew map; built-ins produce zero lines; 🧩 badge appears for unknowns; terminal tokens identified correctly

---

- [ ] **3. Implement hooks/otto-state.mjs**  
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

- [ ] **4. Implement write targets: global + local + concurrency**  
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
  - Terminal clear: lines matching done/shipped/merged/abandoned tokens removed from BOTH files
  - Concurrency (global file is cross-process):
    - Lockfile pattern: `mkdir`-based atomic lock, path `<config>/.otto-state.lock` + random suffix
    - Read-modify-write sequence: acquire lock, read, upsert, write temp, atomic rename
    - Bounded retry: ~10 attempts × 50ms = 500ms max
    - Degradation: if lock exhausted, append-degrade (reader deduplicates; self-heals on next clean write)
    - Apply same pattern to local if .claude dir exists (but no cross-process risk for local)
  - No node → no write, no error (fail-silent)
  - Rollback: remove write logic from otto-state.mjs (keep script but no-op)
  
  **Verify:** ✓ Global file created with header; local file created only when dir exists; upsert replaces old line of same key; 9th write evicts oldest (FIFO); lock contention handled; no corruption on concurrent writes; append-degrade readable by reader; terminal token clears both files; false-clear (token not in line) produces no change

---

- [ ] **5. Update agents/otto-foreman.md reader**  
  *Owner: Bitforge* · *Depends on (4)* · **CRITICAL PATH**
  - Session-open step 5 (after step 1's config resolution, before brief render):
    - Read global: `<config>/otto-state-global.md` (reuse config path from step 1, NEVER re-resolve)
    - Read local: `./.claude/otto-state.md` by relative path (unchanged rule)
    - Merge: combine, dedup by (robot, slug)
    - Global precedence: when (robot, slug) matches in both, use global's tagged rendering (project identity)
    - Sort: newest first
    - Staleness rule: lines >7 days old render with relative age suffix (e.g., "— 3 weeks ago"), never auto-dropped
    - Render: top 5 lines
    - Mute gate: `style.avoid` containing `session-start-brief` skips entire step 5 (existing rule, reuse)
  - Brief format (existing pattern):
    - ≤5 state lines as bullets, verbatim
    - "What can I help with?" closer
    - Empty case: renders empty (no "no work" commentary)
  - Rollback: revert reader changes to pre-state version
  
  **Verify:** ✓ Global read happens before local; dedup by key works; global wins on conflict; staleness renders correctly; top 5 enforced; mute gate skips step; empty case silent; corrupt state lines skipped gracefully

---

- [ ] **6. Extend scripts/validate.mjs to gate state files**  
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

- [ ] **7. Register hook in hooks/hooks.json**  
  *Owner: Bitforge* · *Depends on (3)* · **Can run parallel to (4)**
  - Hook entry: PostToolUse, matcher "Task", script `hooks/otto-state.mjs`
  - Config:
    - `type: "script"` (not command)
    - `timeout: 5` (conservative; script does file I/O + lock contention)
    - `silent: true` (no stdout leak)
  - Rollback: revert hooks.json to prior version
  
  **Verify:** ✓ hooks.json validates (validate.mjs pass); hook entry correct

---

- [ ] **8. Smoke test: basic write + read round-trip**  
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

- [ ] **9. Negative test suite (gates release)**  
  *Owner: Glitchtrap* · *Depends on (8)* · **CRITICAL PATH**
  - [ ] **9a. Home-dir persona:** cwd=home, no .claude subdir in cwd
    - Expected: global fires, local skipped, brief non-empty (Andrew's exact case)
    - Verify: ✓ Only global created; local not written; brief shows global line
  
  - [ ] **9b. Custom CLAUDE_CONFIG_DIR:** set env var to alt path
    - Expected: writer and reader hit the SAME file (config override respected)
    - Verify: ✓ Both writer and reader use env-set path; no cross-target read
  
  - [ ] **9c. Upsert:** call same crew agent twice with identical description
    - Expected: state file has one line (same key), top of list, older timestamp replaced
    - Verify: ✓ Upsert key deduplicates; older line removed; newest timestamp kept
  
  - [ ] **9d. Cap at 8:** write 9 distinct state lines sequentially
    - Expected: 9th write evicts 1st (oldest); file stays ≤8 lines
    - Verify: ✓ After 9th write, file has exactly 8 lines; oldest gone
  
  - [ ] **9e. Terminal clear:** write a line, call a terminal-token robot (done/shipped/merged/abandoned)
    - Expected: line removed from both global and local
    - Verify: ✓ Line vanishes from both files after terminal call; no ghost entry
  
  - [ ] **9f. False-clear negative test:** write a line, call a robot with "done" in description (not a terminal token)
    - Expected: line persists (not a terminal token)
    - Verify: ✓ Line remains in both files; description-match does not clear
  
  - [ ] **9g. First-create header:** delete state files, trigger write
    - Expected: header comment lines added; format documented
    - Verify: ✓ Header present on first write; readable by reader; no format ambiguity
  
  - [ ] **9h. No .claude dir → no write:** cwd=home, no `.claude` subdir
    - Expected: local file not written; global written (if config allows)
    - Verify: ✓ Local skipped; no error; global proceeds
  
  - [ ] **9i. Built-ins produce no state:** call Explore, general-purpose, Plan
    - Expected: hook fires (tool_name="Agent"), classification skips built-ins, zero state lines
    - Verify: ✓ Built-in calls produce no state file change
  
  - [ ] **9j. Hired staff produce 🧩:** call unknown non-built-in agent
    - Expected: state line written with 🧩 badge
    - Verify: ✓ Unknown crew agent renders as 🧩 line
  
  - [ ] **9k. Cross-process race:** two concurrent otto instances, simultaneous Task calls
    - Expected: no lost line, no corruption, both lines in file (deduped if same key)
    - Verify: ✓ Lock contention handled; both writes succeed; file readable; no partial lines
  
  - [ ] **9l. Lock exhaustion degradation:** simulate lock contention, ~12+ retries
    - Expected: lock timeout, append-degrade (raw append), reader deduplicates on next clean write
    - Verify: ✓ Degradation does not corrupt file; reader recovers; self-heals on next write
  
  - [ ] **9m. Round-trip:** writer output renders verbatim through reader
    - Expected: state line written by otto-state.mjs appears unchanged in brief output
    - Verify: ✓ Byte-for-byte match; no escaping/unescaping artifacts; reader does not mangle format
  
  - **Verify (all 9a–9m):** ✓ All 13 negative tests pass (0 failures)

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
  - Session-open: brief reads global, renders top 5
  - Multiple calls: state cap enforced (8 line max)
  - Terminal call: state cleared
  - Verify: ✓ Full flow correct for Andrew's case; no state loss; cap enforced; terminal clear works

---

- [ ] **12. Release gate: version, CHANGELOG, decision package**  
  *Owner: Gantry* · *Depends on (11)* · **IN PROGRESS**
  - [ ] Mark all 11 tasks done (or deferred with reason)
  - [ ] Run validate.mjs: ensure pass
  - [ ] Verify no plugin-cache leaks (state files are internal, not cached)
  - [ ] Update version: 22.7.x → 22.8.0
  - [ ] Write CHANGELOG entry:
    - Headline: "Relay-state persistence + session-open brief integration"
    - Facts: hook writes relay summary to global + local state files; reader merges and renders top 5; home-dir users see active work across projects on session-open
    - Callouts: built-ins are filtered (Explore, Plan, etc. produce no state); hired staff marked with 🧩; staleness rendered for lines >7 days; local state optional (only written if `.claude` dir exists)
    - Caveats: first-release of writer integration; PreToolUse pattern mirrors SessionStart hook; untested on [platform if applicable]
  - [ ] Update README: brief section mentions relay-state integration; link to docs/hook-events.md if created
  - [ ] Record v-NEXT: PreToolUse hook for "did not return" pending-line; model quality upgrade for summaries; project separation for home-dir
  - [ ] Prepare decision package for Andrew:
    - Go/no-go on merge + publish
    - Platform gate status (which OS verified)
    - Known warts (if any)
  - [ ] Commit release-prep changes (no push/merge/tag)
  
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
- Terminal-token on robot return clears "pending" line
- Status: unspecified (beyond this release scope)

**Model quality-upgrade for state summaries**
- Hybrid prompt (LLM + structured extraction) for better summaries
- Status: design TBD (beyond this release scope)

**Project separation for home-dir users**
- Tag separation by project in global state (already scoped for v22.8.0)
- Full project-aware filtering in brief reader
- Status: tagged structure ready; filtering deferred (Phase 3)

---

**Branch safety:** No force-push. All commits are forward-only. User will explicitly request merge when ready.
