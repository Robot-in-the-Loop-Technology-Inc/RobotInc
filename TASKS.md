# Offboarding Feature (22.9.0) — TASKS

**Owner:** Gantry (Project, sequencing + release gate)  
**Branch:** `feature/offboarding` (65b60ae, spec committed)  
**Spec:** docs/spec-offboarding-22.9.md (authoritative, read before build)  
**Version:** 22.8.4 → 22.9.0 (new user-facing feature, minor bump)  
**Builders:** Bitforge (implementation), Glitchtrap (negative test gate), Gantry (release gate)

---

## Critical Path and Dependencies

**Phase 1 — Docs (independent, can run in parallel):**
- Task 1: README CLI install path
- Task 2: README Uninstall section + marketplace warning
- Task 3: README CI/CD honesty sentence
- Task 4: Cross-link Uninstall from "Staying up to date"

**Phase 2 — Command (sequential, independent of docs):**
- Task 5: Create commands/offboard.md (all four inventory categories, per-category consent, receipt, both exits)
- Task 6: Add free-text routing to agents/otto-foreman.md
- Task 7: Validator run: `node scripts/validate.mjs` (gate, must pass green)
- Task 8: **MANDATORY negative test** (Glitchtrap; gate; clean machine confirms "nothing found", no invented residue)

**Phase 3 — Version and release:**
- Task 9: Version bump 22.8.4 → 22.9.0 (package.json + VERSION files)
- Task 10: Update CHANGELOG.md with 22.9.0 entry
- Task 11: **RELEASE GATE** (Gantry; final sign-off before merge)

**The slip-critical item:** Task 8 (negative test). A failure here blocks tasks 9–11.

---

## Task Descriptions

### 1. README: Add CLI install path

**File:** README.md (`## Install` section)  
**Spec ref:** B, first half  
**Owner:** Bitforge | **Status:** TODO

Add CLI path block directly beneath the existing slash-command install block:
- Syntax: `claude plugin marketplace add Robot-in-the-Loop-Technology-Inc/RobotInc` followed by `claude plugin install robotinc@robotinc --scope user -y`
- Explanation: "`--scope user` installs for you across every project; `-y` skips confirmation for scripted runs."
- Verify: Block visible, syntax exact, no typos
- Rollback: `git checkout README.md`

---

### 2. README: Add Uninstall section

**File:** README.md (new peer section, same level as `## Install`)  
**Spec ref:** B, second half  
**Owner:** Bitforge | **Status:** TODO

Create new `## Uninstall` section with:
- Point to `/robotinc:offboard` as guided path
- List raw commands: `/plugin disable robotinc@robotinc`, `/plugin uninstall robotinc@robotinc`, `claude plugin uninstall robotinc@robotinc`
- Marketplace-remove warning in blockquote: "Do not run `/plugin marketplace remove robotinc` — it removes every plugin from that marketplace, not just this one"
- Verify: Section at header level, warning in blockquote, commands readable
- Rollback: `git checkout README.md`

---

### 3. README: Add CI/CD honesty sentence

**File:** README.md (`## Staying up to date` section, near top)  
**Spec ref:** C, first half  
**Owner:** Bitforge | **Status:** TODO

Add this sentence at the beginning of "Staying up to date":
"Short answer: **CI, not CD.** Every release is gated by our own pipeline before it publishes (validated, version-bumped, or it doesn't ship) — that part is automatic on our side. Getting it onto your machine is still pull, not push: manual command, or an opt-in auto-update toggle you turn on yourself. Nobody's crew changes under them without a signal they asked for."
- Verify: Bolded on "CI, not CD", skimmable, accurate to platform behavior
- Rollback: `git checkout README.md`

---

### 4. README: Cross-link Uninstall from "Staying up to date"

**File:** README.md (bottom of `## Staying up to date` section)  
**Spec ref:** C, second half  
**Owner:** Bitforge | **Status:** TODO | **Depends on:** Task 2

Add reference line: "For removal guidance, see `## Uninstall`."
- Verify: Link clear, Uninstall section exists
- Rollback: `git checkout README.md`

---

### 5. Create commands/offboard.md

**File:** commands/offboard.md (new)  
**Spec ref:** A (full section)  
**Owner:** Bitforge | **Status:** TODO

Build the command with:

**Frontmatter:**
```
---
description: Offboard from RobotInc — safely remove files, review settings, or pause the plugin.
---
```

**Structure:**
1. Preamble: Won't uninstall itself, will find residue, show it all, ask per category, hand over command. Define `<config>` as "CLAUDE_CONFIG_DIR if set, else ~/.claude"

2. Two-path entry: Ask which outcome they want
   - "Just pause it" → print `/plugin disable robotinc@robotinc`, explain reversible, exit
   - "I want it gone" → proceed to inventory

3. Inventory (read-only): Check and report only what exists:
   - **Category 1: Silent residue** (ours, recommend delete): otto-state-global.md, .otto-met, .otto-pending/, otto-trace.log, otto-ledger.log, per-project .claude/ files (otto-state.md, otto-trace.log, otto-ledger.log, .otto-state.lock, temp files)
   - **Category 2: Their data** (recommend keep): otto-profile.json, otto-org.json
   - **Category 3: Settings we added** (show reverse diff, ask before revert): permissions.deny, permissions allowlist, CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
   - **Category 4: Their work** (NEVER offered for deletion): TASKS.md, DREAM.md, deliverables — list to reassure, refuse deletion requests

4. Machine-wide honesty: Can clean `<config>` and current `<cwd>/.claude/` with full confidence. Read otto-state-global.md for other project names and list them, directing user to run offboard in each.

5. Per-category consent: Present full table, ask separately for each category, require user to name what they mean (never blanket yes)

6. Execute and receipt: Only touch what was confirmed, print exact paths removed/reverted

7. Close with exits (always):
   - Pause only (reversible): `/plugin disable robotinc@robotinc`
   - Finish removing: `/plugin uninstall robotinc@robotinc` (or `claude plugin uninstall robotinc@robotinc` from terminal)
   - Marketplace-remove warning verbatim

8. Optional team-install caveat (if relevant): "If installed org-wide via `extraKnownMarketplaces` in a committed `.claude/settings.json`, this doesn't stop teammates from being prompted again — that line has to come out of the file itself."

**Verify:** Frontmatter valid, no hardcoded paths (use `<config>`), no doctrine violations, covers all four categories, refuses work deletion, ends with both exits always, Visionary-tier user can complete without knowing hooks/JSON
- Rollback: `git rm commands/offboard.md`

---

### 6. Add free-text routing to agents/otto-foreman.md

**File:** agents/otto-foreman.md  
**Spec ref:** A, "Requirement, not optional"  
**Owner:** Bitforge | **Status:** TODO | **Depends on:** Task 5

Add one routing line to Otto's system prompt: Route "how do I uninstall this," "turn RobotInc off," "I want this gone" → `/robotinc:offboard`
- Keep it one short line (budget ~2,933 tok always-on already allocated)
- Verify: One line, no bloat, clear routing, validator still passes
- Rollback: `git diff agents/otto-foreman.md` and revert the line

---

### 7. Run validator

**Command:** `node scripts/validate.mjs` (must pass green)  
**Spec ref:** A, sequencing note  
**Owner:** Bitforge | **Status:** TODO | **Depends on:** Tasks 5–6

Run validator, must pass with zero errors (checks command structure, doctrine gates, crew roster, no hardcoded paths, etc.)
- Verify: Zero errors, all checks passed
- Rollback: Fix tasks 5–6 and re-run; do not proceed to task 8 until green

---

### 8. MANDATORY NEGATIVE TEST

**Spec ref:** A, "Sequencing note"  
**Owner:** Glitchtrap | **Status:** TODO | **Depends on:** Task 7 | **GATE:** HARD

Run `/robotinc:offboard` on a clean sandbox (fresh empty CLAUDE_CONFIG_DIR, zero prior RobotInc state):
- Command must report "No residue found" or "This machine is clean" plainly
- Must NOT list files to delete, invent phantom paths, or suggest cleaning when nothing exists
- Failure: Command reports non-existent files, proposes deletion, crashes, or exits unclear → abort and escalate to Gantry
- Verify: Output confirms clean, no false positives, both exit paths available
- Rollback: If fails, fix task 5 and re-run task 8; do NOT proceed to task 9

---

### 9. Version bump: 22.8.4 → 22.9.0

**Files:** package.json, VERSION file (or equivalent)  
**Owner:** Bitforge | **Status:** TODO | **Depends on:** Task 8

Bump all version-source files from 22.8.4 to 22.9.0 (new user-facing feature, minor bump per semver)
- Verify: Consistent across all files, format matches existing entries, no accidents
- Rollback: `git checkout package.json [VERSION files]`

---

### 10. Update CHANGELOG.md

**File:** CHANGELOG.md (add entry at top, above 22.8.4)  
**Owner:** Bitforge | **Status:** TODO | **Depends on:** Task 9

Add new 22.9.0 entry covering:
- `/robotinc:offboard` command: consent-gated teardown, four categories, inventory, per-category consent, receipt, never deletes work
- Install path: CLI documented with `--scope user` and `-y`
- Uninstall section: `/robotinc:offboard` path, raw commands, marketplace warning
- CI/CD honesty: "CI yes, CD no" answer
- Free-text routing: Otto routes uninstall intent to offboard command

Format like existing 22.8.x entries.
- Verify: Entry at top, format matches, no typos
- Rollback: `git checkout CHANGELOG.md`

---

### 11. RELEASE GATE

**Owner:** Gantry (final sign-off)  
**Status:** TODO | **Depends on:** Tasks 1–10

Verify:
- Tasks 1–4 complete (README has CLI path, Uninstall, CI/CD sentence, cross-link)
- Task 5 complete (offboard.md valid, covers all categories, refuses work deletion, ends with exits)
- Task 6 complete (one routing line added)
- Task 7 passes (validator green)
- Task 8 passes (negative test on clean machine)
- Task 9 complete (version bumped to 22.9.0)
- Task 10 complete (CHANGELOG entry at top)
- Branch clean, commits atomic, spec authoritative

Output: **READY TO MERGE** (hand to Otto) OR **BLOCKED** (name task and blocker, return to Bitforge)

---

## Status tracker

| Task | Description | Status | Owner | Deps |
|------|-------------|--------|-------|------|
| 1 | README CLI path | TODO | Bitforge | — |
| 2 | README Uninstall section | TODO | Bitforge | — |
| 3 | README CI/CD sentence | TODO | Bitforge | — |
| 4 | README cross-link | TODO | Bitforge | 2 |
| 5 | commands/offboard.md | TODO | Bitforge | — |
| 6 | otto-foreman routing | TODO | Bitforge | 5 |
| 7 | validator run | TODO | Bitforge | 5, 6 |
| 8 | negative test | TODO | Glitchtrap | 7 |
| 9 | version bump | TODO | Bitforge | 8 |
| 10 | CHANGELOG | TODO | Bitforge | 9 |
| 11 | release gate | TODO | Gantry | 1-10 |

---

## Notes

**Bitforge:** Docs (1–4) can run in parallel. Command (5–6) sequential. Validator (7) gates; if fails, fix 5–6 and re-run. Version (9) and CHANGELOG (10) wait for negative test (8) to pass green.

**Glitchtrap:** Task 8 is the critical gate. Do not skip, do not assume, do not move on if it fails. Offboard must report "nothing found" on clean machine, never invent residue.

**Branch:** feature/offboarding (65b60ae, spec committed, ready to build).

**Spec:** docs/spec-offboarding-22.9.md — authoritative, code follows spec.

**Release:** No merge, no push until Gantry's gate clears. Then hand to Otto for release flow.
