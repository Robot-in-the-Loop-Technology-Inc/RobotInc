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

- [ ] **1. Document .otto-met sentinel semantics**  
  *Owner: Documentation*
  - Sentinel: `~/.claude/.otto-met` — one ISO 8601 timestamp line
  - Written by roll-call when card is drawn (before seat question)
  - Means: "This user has seen the RobotInc banner + card"
  - File does not encode user consent; it is operational bookkeeping only
  - Rollback: delete sentinel file
  
  **Verify:** Read semantics agree with roll-call behavior in (3)

---

- [ ] **2. Modify roll-call skill to write sentinel**  
  *Owner: Bitforge* · *Depends on (1)*
  - Add write of `~/.claude/.otto-met` in skill/roll-call/SKILL.md
  - Timing: immediately after card is drawn, before seat question
  - Format: single line, ISO 8601 timestamp (e.g., `2026-07-13T12:34:56Z`)
  - Revert: skill rolls back to pre-sentinel version
  
  **Verify:**
  - Run roll-call, confirm .otto-met created after card print, before seat prompt
  - Check file contents (single timestamp line)
  - Run roll-call again; confirm .otto-met timestamp is newer

---

- [ ] **3. Design hook echo string (CRITICAL PATH)**  
  *Owner: Bitforge* · *Depends on (1)*
  - Determine static message that hook will echo to Otto's context
  - Message must encode the rule: check .otto-met; if missing → roll-call; if present → brief
  - Message MUST NOT do file logic (hook does not read/write/check files)
  - Draft candidate:
    ```
    [RobotInc Auto-Onboarding]
    If ~/.claude/.otto-met does not exist, dispatch roll-call before first reply.
    If ~/.claude/.otto-met exists, show brief from TASKS.md + .claude/otto-trace.log (max 5 lines when verbosity=brief).
    ```
  - Update otto-foreman.md behavior to respect .otto-met over profile existence
  - Rollback: revert otto-foreman.md changes
  
  **Verify:**
  - Message is static (no variables, no conditions, no file reads)
  - Rule is unambiguous to Otto (the foreman parses it correctly)
  - Cross-check with Otto's system prompt: does it already know to check .otto-met?

---

- [ ] **4. Update otto-foreman.md to respect sentinel**  
  *Owner: Bitforge* · *Depends on (3)*
  - Add new rule at "Where the human sits" section:
    - Check `~/.claude/.otto-met` BEFORE checking otto-profile.json
    - If .otto-met missing → run roll-call (existing behavior, unchanged)
    - If .otto-met present → skip roll-call, read profile, show brief if no profile yet
  - Brief logic: if verbosity=brief, read TASKS.md + otto-trace.log, output ≤5 lines, then "What can I help with?"
  - Rollback: revert to checking profile-existence first
  
  **Verify:**
  - Otto correctly identifies .otto-met (absent/present/unreadable)
  - Behavior branches correctly for each state
  - Brief formatting respects verbosity setting (brief=terse, balanced=normal, thorough=full)

---

- [ ] **5. Implement brief extraction logic**  
  *Owner: Bitforge* · *Depends on (4)*
  - Brief reads `TASKS.md` and `.claude/otto-trace.log` in project dir, or config dir if absent
  - Format (when verbosity=brief):
    - Lines from TASKS.md marked as `doing` (max 3 items)
    - Recent trace lines (last 2 from log)
    - Hard stop at 5 lines total
    - No headers, no commentary
  - Format (when verbosity=balanced/thorough):
    - Same reading, less aggressive trimming
  - Empty case: if nothing to report, output only "What can I help with?"
  - Rollback: remove brief logic, restore prior behavior
  
  **Verify:**
  - Generate brief from sample TASKS.md + trace log
  - Verify word count (≤5 lines when brief)
  - Verify empty case produces no output (just the prompt)
  - Verify balanced/thorough modes include more context

---

- [ ] **6. Draft SessionStart hook echo string for each shell**  
  *Owner: Bitforge* · *Depends on (3)* · **CRITICAL PATH — Quoting Risk**
  - Windows PowerShell: test echo quoting without bash/sh
  - Unix sh (macOS/Linux): standard echo
  - Git Bash (Windows with Git installed): hybrid behavior
  - Goal: single echo command that works on all three
  - Strategy:
    - Use printf instead of echo (more portable)
    - Or: use shell-agnostic quoting (single quotes where possible, $() for variables)
    - Or: use separate echo per shell (Windows: powershell, Unix: sh)
  - Draft hook test script in scratchpad
  - Rollback: revert to prior hook impl (if any)
  
  **Verify:**
  - Test echo on PowerShell (bare, no Git Bash)
  - Test echo on Git Bash (with Git installed)
  - Test echo on macOS sh
  - Confirm output reaches stdout without corruption
  - Confirm message is injected into Otto's context correctly

---

- [ ] **7. Implement SessionStart hook in hooks/hooks.json**  
  *Owner: Bitforge* · *Depends on (6)*
  - Add new SessionStart hook entry to hooks/hooks.json
  - Hook type: `command` with platform-specific echo
  - Command output: the static message from (3)
  - Timeout: 2 seconds (should be instant)
  - Rollback: revert hooks.json to prior version
  
  **Verify:**
  - hooks.json is valid JSON (parse test)
  - Hook is recognized by Claude Code on install
  - Message appears in Otto's context on session start

---

- [ ] **8. Cross-platform smoke test**  
  *Owner: Glitchtrap/Bitforge* · *Depends on (7)*
  - Test sequence on Windows PowerShell (no Git)
  - Test sequence on Windows Git Bash
  - Test sequence on macOS/Linux sh (if available)
  - Sequence:
    1. Install RobotInc plugin
    2. Start new session in a test project (no .claude yet)
    3. Confirm hook runs silently (no terminal output)
    4. Confirm message injected into Otto's context (should see "[RobotInc Auto-Onboarding]" in chat)
    5. Confirm Otto dispatches roll-call (should see roll-call output/card)
    6. Complete roll-call, confirm .otto-met written
    7. Start new session
    8. Confirm Otto skips roll-call, shows brief instead
  - Document any platform-specific gotchas
  - Rollback: if any platform fails, document the failure and escalate
  
  **Verify:**
  - All platforms reach step 5 (hook runs, Otto dispatches roll-call)
  - All platforms reach step 8 (brief shows on session 2)
  - No corrupted output (PowerShell quoting issues)
  - No hook timeouts

---

- [ ] **9. Negative test: hook missing**  
  *Owner: Glitchtrap* · *Depends on (7)*
  - Simulate hook failure (e.g., command not found, timeout)
  - Expected behavior: Otto's system prompt already says "read profile, run roll-call if absent"
  - Degradation should be clean (user still gets roll-call, just delayed one turn)
  - Rollback: N/A (testing failure mode)
  
  **Verify:**
  - Session starts without hook
  - Otto still runs roll-call on first turn (fail-open)
  - No crash, no state corruption

---

- [ ] **10. Negative test: .otto-met corrupted or unreadable**  
  *Owner: Glitchtrap* · *Depends on (4)*
  - Simulate .otto-met as binary/garbage/unparseable
  - Expected behavior: Otto should treat as "sentinel present" (don't run roll-call again)
  - Rollback: N/A (testing failure mode)
  
  **Verify:**
  - Session reads corrupted .otto-met
  - Otto skips roll-call (treats file-exists as "we have met")
  - No crash, brief shows normally

---

- [ ] **11. Negative test: otto-profile.json corrupt or unreadable**  
  *Owner: Glitchtrap* · *Depends on (4)*
  - Simulate profile as binary/invalid JSON
  - Expected behavior: Otto should fall back to defaults (no profile read, no crash)
  - Rollback: N/A (testing failure mode)
  
  **Verify:**
  - Session reads corrupted otto-profile.json
  - Otto does not crash
  - Brief shows with defaults (verbosity=balanced or brief)
  - User can still interact

---

- [ ] **12. Negative test: TASKS.md missing or corrupted**  
  *Owner: Glitchtrap* · *Depends on (5)*
  - Simulate TASKS.md as binary/garbage/missing
  - Expected behavior: brief should output "What can I help with?" (empty case)
  - Rollback: N/A (testing failure mode)
  
  **Verify:**
  - Session reads missing/corrupted TASKS.md
  - Otto does not crash
  - Brief outputs only prompt, no error noise

---

- [ ] **13. Test mute via style.avoid**  
  *Owner: Glitchtrap* · *Depends on (4, 5)*
  - Add `"style": { "avoid": ["session-start-brief"] }` to test profile
  - Expected behavior: session starts, no brief shown, just "What can I help with?"
  - Rollback: N/A (testing feature)
  
  **Verify:**
  - Muted user sees no brief
  - Muted user can still run /standup manually
  - Setting persists across sessions

---

- [ ] **14. Integration test: full first-install → session 2 flow**  
  *Owner: Glitchtrap* · *Depends on (8)*
  - Clean test environment (no .claude/)
  - Install RobotInc
  - Session 1: confirm banner + card + seat question (roll-call)
  - Session 1: refuse to save profile
  - Confirm .otto-met written, otto-profile.json NOT written
  - Session 2: confirm brief shown (no card)
  - Confirm .otto-met still exists
  - Session 3: confirm brief shown again
  - Rollback: N/A (testing full flow)
  
  **Verify:**
  - Card shown exactly once
  - Subsequent sessions show brief
  - No duplicate card appearances
  - .otto-met persists correctly

---

- [ ] **15. Checklist: pre-release verification**  
  *Owner: Gantry* · *Depends on (14)*
  - [ ] All TASKS above marked done
  - [ ] No git history rewritten (all commits forward-only)
  - [ ] Branch has clean diff from main (no accidental files)
  - [ ] Cross-platform smoke tests pass (Windows/macOS/Linux)
  - [ ] Negative tests all fail-open (no crashes)
  - [ ] Code review passed
  - [ ] Inline comments documenting quoting strategy
  - [ ] MEMORY.md updated with feature status
  - [ ] Ready for Bitforge to merge and release
  
  **Verify:** See above; also run `git diff main | head -200` to spot-check diff

---

## Status Key

- **todo** – not started
- **doing** – work in progress
- **done** – complete and verified
- **blocked** – waiting on external; state the blocker

## Notes

- **Sequencing rationale:** Sentinel (1, 2) must be defined before hook message (3) can be written. Hook message (3) must be final before Otto logic (4) is updated. Otto logic (4) must be done before brief extraction (5). Cross-platform quoting (6) is the highest-risk piece and must be verified (8) before hook lands (7). Negative tests (9–13) run after the feature is buildable. Integration test (14) is last and tests the whole flow. Pre-release checklist (15) gates the branch for merge.

- **Rollback strategy:** Every task includes explicit undo (revert commit, revert file, delete file). If cross-platform test (8) fails, escalate immediately and do not proceed to (7). Failure at (8) likely means the echo approach is broken and needs a different strategy (e.g., script file vs. bare echo command).

- **Owner assignment:** Bitforge owns all code changes. Glitchtrap owns negative tests and integration tests. Gantry owns pre-release checklist and task tracking.

---

**Branch safety:** No force-push. All commits are forward-only. User will explicitly request merge when ready.
