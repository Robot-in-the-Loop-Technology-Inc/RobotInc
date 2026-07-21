# Memory Cap Build (v22.10.0) — Feature Branch: feature/memory-cap

**Branch:** `feature/memory-cap` (created off main @ 9f81ac8)  
**Owner:** Bitforge (implementation + positive tests); Glitchtrap (negative-test verification)  
**Gating:** validate.mjs drift gate before commit; version bump required before merge  
**Baseline:** docs/spec-memory-cap.md §7 (files touched), §5.1 (seven-case table), §6 (test cases)

---

## Implementation Tasks

### 1. [done] hooks/otto-facts.mjs — add PROFILE_CHAR_CAP constant
- Add `const PROFILE_CHAR_CAP = 2000;` near the top of the file, alongside existing `INV_CHAR_CAP`
- Single source of truth for profile character budget
- **Verifiable:** constant defined, value is 2000, visible in codebase

### 2. [done] hooks/otto-facts.mjs — extend computeFacts() to measure profile size
- Inside `computeFacts()`, after detecting `otto-profile.json` exists, wrap in try/catch:
  - `const profileSize = readFileSync(profilePath, 'utf8').length;` — measure size BEFORE any parse
  - Store `profileSize` for use in emission logic
  - Read error (`readFileSync` throws) → degrade to `profile_over_budget = 'unknown'`, stop processing, omit remaining logic
- **Load-bearing:** size measurement must happen BEFORE `JSON.parse` is attempted (per spec §5.1)
- **Verifiable:** test can verify the size equals independent measurement; file remains byte-identical after

### 3. [done] hooks/otto-facts.mjs — implement JSON.parse with parse-failure handling
- After size measurement, attempt `JSON.parse(profileString)` with try/catch:
  - Success → proceed to entries manifest computation
  - Failure → set `profileValid = false`, omit `profileEntries`, preserve `profileSize` and `profileOverBudget` already computed
- **Load-bearing:** parse failure must NOT erase `profileSize` or `profileOverBudget` from earlier step
- **Verifiable:** test case 3 (corrupt AND large) asserts `profile_over_budget=true` even with parse failure

### 4. [done] hooks/otto-facts.mjs — compute profile_entries manifest from parsed JSON
- On successful parse, iterate the JSON object and build manifest of key names + array entry counts:
  - For each key in the profile object:
    - If key is an array (`Array.isArray(obj[key])`), emit `key(count)` 
    - Otherwise emit `key` (no count)
  - Manifest format: comma-separated, e.g. `seats(2),tier,verbosity,scale,style.prefers(5),style.avoid(3),style.declined(6),org.prefer(4),org.shadowed(1),workspace.neverTouch(8),lastTuneup`
- Only emitted when parse succeeds AND `profileOverBudget === true` (case 2 only, per spec §5.1)
- **Verifiable:** test case 2 (valid, over budget) asserts entries manifest is present and counts match

### 5. [done] hooks/otto-facts.mjs — emit seven-case table per spec §5.1
Implement emission logic for all seven cases (spec §5.1, table rows 1–7):

| Case | Condition | Emitted Lines |
|------|-----------|---|
| 1 | Valid, under budget | `profile_over_budget=false` — one line only |
| 2 | Valid, over budget | `profile_size`, `profile_cap`, `profile_over_budget=true`, `profile_entries=...` |
| 3 | Corrupt AND large | `profile_size`, `profile_cap`, `profile_over_budget=true`, `profile_valid=false` — no entries |
| 4 | Corrupt AND small | `profile_size`, `profile_cap`, `profile_over_budget=false`, `profile_valid=false` |
| 5 | Empty file | `profile_size=0`, `profile_cap`, `profile_over_budget=false`, `profile_valid=false` |
| 6 | Present but unreadable | `profile_over_budget=unknown` |
| 7 | Missing | none (existing `profile=absent` carries it) |

- Condition for `over_budget`: `profileSize > PROFILE_CHAR_CAP` (use `>`, not `>=`, matching `INV_CHAR_CAP` convention)
- Emit `profile_size` + `profile_cap` whenever any anomaly holds (`over_budget=true` OR `valid=false`)
- Emit `profile_entries` ONLY when parse succeeds AND `over_budget=true` (case 2 only)
- **Verifiable:** each test case asserts correct lines present/absent per table

### 6. [done] hooks/otto-facts.mjs — fail-soft via three nested catches
Implement fail-soft model (spec §5.1):
1. Outer try wraps entire profile logic
2. Inner try/catch on `readFileSync` → on catch, set `profile_over_budget = 'unknown'`, skip rest
3. Inner try/catch on `JSON.parse` → on catch, set `profileValid = false`, omit `profileEntries`, preserve `profileSize`/`profileOverBudget`
4. Outer catch (last resort) → omit new lines entirely

- **Load-bearing:** never crash; never omit a corrupt-and-large signal
- **Verifiable:** test case 6 (unreadable via scratch directory) asserts `profile_over_budget === 'unknown'`; case 3 asserts size/over_budget survive parse failure

### 7. [done] scripts/test-otto-facts.mjs — negative test: valid, over budget (case 2)
- Create scratch `otto-profile.json` with valid JSON, deliberately padded >2000 chars (e.g., `style.declined` with 40+ synthetic entries)
- Call `computeFacts()` against it
- Assert:
  - `profile_over_budget === true`
  - `profile_size` equals independently measured real byte length (via `.length` on readFileSync result)
  - `profile_cap === 2000`
  - `profile_entries` is present and correctly counts each array field
  - `formatFacts()` output contains all three lines: `profile_size=`, `profile_cap=`, `profile_over_budget=true`
  - File on disk is byte-identical before and after (hook reads only, never writes)
- **Verifiable:** test passes when all assertions hold

### 8. [done] scripts/test-otto-facts.mjs — negative test: corrupt AND large (case 3 — THE TARGET CASE)
- Create scratch `otto-profile.json` padded >2000 chars but unparseable (e.g., valid JSON with closing brace stripped)
- Call `computeFacts()` against it
- Assert:
  - `profile_over_budget === true` (NOT `unknown`, NOT `false`, NOT absent) — **the anti-silent tooth**
  - `profile_size` equals independently measured real byte length
  - `profile_cap === 2000`
  - `profile_valid === false`
  - `profile_entries` is **absent** (parse failed; no entries manifest)
  - `formatFacts()` output contains substring `"profile_over_budget="` — proves the over_budget line is rendered
  - File on disk is byte-identical before and after
- **Load-bearing:** this case is why the cap exists — a corrupt-and-enormous file must NOT silently read as under budget
- **Verifiable:** test fails if over_budget is unknown/false/absent or if entries is present

### 9. [done] scripts/test-otto-facts.mjs — negative test: corrupt AND small (case 4) + empty (case 5)
- Create two scratch profiles:
  - Small malformed JSON (e.g., `{invalid}`, <100 chars)
  - Zero-byte file
- For both, call `computeFacts()` and assert:
  - `profile_over_budget === false`
  - `profile_valid === false`
  - `profile_size` correct (measured for first, `0` for empty)
  - `profile_cap === 2000`
  - `profile_entries` absent
- **Verifiable:** both cases handled correctly; no silent omission

### 10. [done] scripts/test-otto-facts.mjs — negative test: unreadable (case 6), via scratch directory
- Create scratch *directory* named `otto-profile.json` (not a file)
- Call `computeFacts()` against it
- Assert:
  - `profile_over_budget === 'unknown'` — read failed, cannot measure size
  - No other new profile facts emitted (no size, no valid, no entries)
- **Mock-free:** deterministic without mocking — `existsSync` reports present, `readFileSync` throws `EISDIR`
- **Verifiable:** test passes when over_budget is exactly `'unknown'`

### 11. [done] scripts/test-otto-facts.mjs — positive test: valid, under budget (case 1)
- Create scratch `otto-profile.json` at fully-populated schema-example size (~620 chars), valid JSON
- Call `computeFacts()` against it
- Assert:
  - `profile_over_budget === false`
  - No `profile_entries` line in rendered output
  - No `profile_valid` line in rendered output
  - Rest of facts block (`config_dir`, `sentinel`, …) is unchanged from today's shape — **one boolean's worth of behavior change on happy path: nothing**
- **Silent on happy path:** this build must not pollute normal sessions
- **Verifiable:** only `profile_over_budget=false` emitted, all else unchanged

### 12. [done] scripts/test-otto-facts.mjs — boundary test: exactly 2000 chars
- Create scratch `otto-profile.json` with exactly 2000 characters, valid JSON
- Call `computeFacts()` against it
- Assert:
  - `profile_over_budget === false` — NOT over budget (use `>`, not `>=`)
  - File is NOT flagged as over-budget
- **Load-bearing:** fencepost correctness — 2000 chars is the cap, not the threshold
- **Verifiable:** exactly-2000 profile does not trip over_budget flag

---

## Documentation Tasks

### 13. [done] agents/otto-foreman.md — add session-open profile-over-budget step
- In session-open protocol (before anything else happens):
  - Check if `profile_over_budget=true` from facts
  - If true, say in plain language (no jargon): *"Your saved profile has grown past its size limit — mostly [arrays from `profile_entries`]. Want to go through them and cut what's stale, or merge duplicates?"*
  - If `profile_entries` is present (parse succeeded, case 2), list counts directly from entries manifest
  - If `profile_entries` is absent (parse failed, case 3), offer to read the file to see what's in each block
  - Human chooses what to drop/merge per-item
  - Otto edits file, shows diff, gets consent via existing gate (same gate all profile writes use)
  - After consolidation completes, proceed with normal session
- **Scope:** ONLY session-open step; NO new pre-write hard rule near consent gate (mechanism B is deferred per spec §3)
- **Verifiable:** session opening with over-budget profile triggers consolidation conversation before other business

### 14. [done] docs/profile-schema.md — add memory cap section
- Add new section (after schema definition, before examples) stating:
  - Cap: 2,000 characters, measured via `.length` on the on-disk JSON string
  - Rationale one-liner: e.g., "~3x the fully-populated baseline, catching silent annual `declined` / `neverTouch` bloat without false positives"
  - Enforcement: "Enforced at session open via `hooks/otto-facts.mjs`; if exceeded, triggers consolidation conversation"
- **Single source of truth:** this doc + `PROFILE_CHAR_CAP` in code, cross-checked by validate.mjs (task 15)
- **Verifiable:** cap is stated, rationale is clear, enforcement is named

### 15. [done] scripts/validate.mjs — add PROFILE_CHAR_CAP drift gate
- After existing drift checks (e.g., `ROBOTS` maps), add new check:
  - Read `hooks/otto-facts.mjs`, extract `PROFILE_CHAR_CAP = <number>` value
  - Read `docs/profile-schema.md`, search for prose reference to cap number (e.g., "2,000 characters" or "2000")
  - Assert they match; if not, fail with clear error message naming both files and the mismatch
- **Drift prevention:** same convention as existing `ROBOTS` checks — two places that state a truth, validated to stay in sync
- **Verifiable:** validation passes when both values match; fails when they diverge

---

## Release Gate Tasks

### 16. [done] Run scripts/validate.mjs as gate before commit
- Execute `node scripts/validate.mjs` on feature branch
- Assert all gates pass (including new `PROFILE_CHAR_CAP` drift check from task 15)
- If any gate fails, fix the failing check (e.g., reconcile cap values) before proceeding to version bump
- **Critical:** this is the last check before commit; it must be green
- **Verifiable:** `validate.mjs` runs without error

### 17. [done] Bump version: .claude-plugin/plugin.json → 22.10.0
- Change `"version": "22.9.0"` to `"version": "22.10.0"`
- **Single source of truth rule:** must match RobotInc.md frontmatter version (task 18); validator enforces this
- **Verifiable:** file shows new version

### 18. [done] Bump version: RobotInc.md frontmatter → 22.10.0
- Change `version: 22.9.0` to `version: 22.10.0` in YAML frontmatter
- **Single source of truth rule:** must match .claude-plugin/plugin.json (task 17); validator enforces this
- **Verifiable:** frontmatter shows new version

### 19. [done] CHANGELOG entry for v22.10.0
- Add entry under new `## [22.10.0]` heading (after existing 22.9.0 section)
- Summary: "Memory cap for `otto-profile.json` — backstop enforcement at session open"
- Bullet points:
  - "Session-start check detects `otto-profile.json` >2,000 chars and offers consolidation conversation"
  - "Deterministic fallback in `hooks/otto-facts.mjs` — corrupt-and-large files emit `profile_over_budget=true` regardless of parse state"
  - "Soft cap prevents silent bloat from accumulated `declined` / `neverTouch` entries; test suite passes all negative cases"
- **Verifiable:** CHANGELOG is readable and version is dated

---

## Handoff Tasks (Downstream)

### 20. [doing → done] Glitchtrap validates negative-test suite
- Bitforge runs full test suite (all seven cases + boundary)
- Glitchtrap specifically validates against spec §6 negative cases:
  - Case 3 (corrupt AND large) must trigger `profile_over_budget=true`, not omit silently ✓
  - Unreadable-via-directory case (case 6) must emit `profile_over_budget='unknown'` ✓
  - Corrupt-small and empty cases must NOT raise false positives ✓
  - Boundary at exactly 2000 chars stays under budget ✓
- **Critical:** the anti-silent-corruption tooth is case 3; this is the prime verification point
- **Verifiable:** all negative tests pass per spec table

### 21. [todo] Verify no file bloat or regression on main tests
- Full test suite runs on feature branch; all existing tests still pass
- New profile-cap tests are green
- No performance regression in `computeFacts()` (reading + measuring is O(n) on file size, acceptable)
- **Verifiable:** `npm test` all pass

---

## Summary

| Task | File | Change | Owner | Blocker? |
|------|------|--------|-------|----------|
| 1–6 | `hooks/otto-facts.mjs` | Add `PROFILE_CHAR_CAP`, measure size, parse with fail-soft, emit seven cases | Bitforge | none |
| 7–12 | `scripts/test-otto-facts.mjs` | Add 6 deterministic test cases (negative, positive, boundary) | Bitforge + Glitchtrap | none |
| 13 | `agents/otto-foreman.md` | Session-open consolidation for `profile_over_budget=true` | Bitforge | none |
| 14 | `docs/profile-schema.md` | State cap (2000 chars), rationale, enforcement | Bitforge | none |
| 15 | `scripts/validate.mjs` | Add drift gate for `PROFILE_CHAR_CAP` ↔ prose | Bitforge | none |
| 16 | (all) | Run validate.mjs gate; must be green | Bitforge | **GATE BEFORE COMMIT** |
| 17–18 | `plugin.json` + `RobotInc.md` | Bump 22.9.0 → 22.10.0 (both must match) | Gantry | **BOTH REQUIRED** |
| 19 | `CHANGELOG.md` | Entry for v22.10.0 | Gantry | none |
| 20 | (all) | Negative-test validation vs spec §6 | Glitchtrap | **CRITICAL: case 3 anti-silent** |
| 21 | (all) | Full test suite, no regression | Bitforge | none |

---

## Rollback Plan

If corruption case (case 3) fails to fire in the negative test, or if profile-over-budget fires on valid profiles under 2000 chars:
1. Revert all changes to `hooks/otto-facts.mjs` (tasks 1–6)
2. Revert all changes to `scripts/test-otto-facts.mjs` (tasks 7–12)
3. `git reset --hard` to main @ 9f81ac8
4. Branch `feature/memory-cap` remains available for rework; diagnose against test failures

Character of ship: **deterministic, unit-testable, unrottable backstop (mechanism A only)**. Mechanism B (write-time prevention) deferred per spec §3.
