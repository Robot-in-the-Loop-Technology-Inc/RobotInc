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
