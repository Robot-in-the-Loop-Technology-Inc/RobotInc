# Build Task List — spend-report feature

**Branch:** `feature/spend-report` (off main @ d09ab4b, v22.12.0)  
**Version:** 22.12.0 → **22.13.0** (shipped files: hooks, viewers, agents, docs, scripts — version bump required in `.claude-plugin/plugin.json` AND `RobotInc.md`)  
**Owner:** Bitforge (build + spike), Cathode (viewer revision), Glitchtrap (verify + harmony)  
**Spec:** `docs/spec-spend-report.md` (finalized, zero open questions)

---

## CRITICAL GATE — Build-Task-1 (TIER-CAPTURE SPIKE)

**Status:** DONE — PASS  
**Result:** Criterion 1 confirmed against Bitforge's OWN live dispatch transcript for this exact task
(`agent-a030b0c6785b51cd9.jsonl`) — the serialized first user message (7,326 chars) contained the full
`[Dispatch contract] gear=build tier=T2 box=... verify=...` line byte-identical, untruncated. Criterion 4
confirmed on the same real data: `/tier=(\S+)/` extracted `T2` as the FIRST match despite 13 later
occurrences of the literal substring "tier=" elsewhere in the same prompt (prose discussing the mechanism
itself) — proving quote-collision safety on a real specimen, not just a synthetic fixture. Criteria 2/3
confirmed via `hooks/otto-trace.mjs`'s existing SubagentStop wiring (same transcript file already read for
tokens) and `scripts/test-otto-trace.mjs`'s null-degradation tests. Mechanism (a) built; mechanism (b) not
needed.  
**Blocker for:** all downstream ledger/flag/report tasks  
**Owned by:** Bitforge (with Vector oversight if needed)

**Purpose:** Verify that the dispatch [Dispatch contract] line including `tier=<value>` is fully captured (not truncated or summarized) in the subagent's first user-message, confirming mechanism (a) viability (parse tier from transcript in hooks/otto-trace.mjs).

**How to run:**
1. On the installed RobotInc v2.1.211 binary, compose a real `gear=build` or `gear=feature` dispatch to any project.
2. Let the dispatch complete. Find the subagent transcript: `~/.claude/projects/<slug>/subagents/agent-<agent_id>.jsonl`
3. Read the first `message.role === 'user'` entry. Serialize `message.content` to text.
4. Check the result against these four criteria:

**Criterion 1 — THE GATE (Pass/Fail):**  
The serialized first user message contains the FULL `[Dispatch contract]` line with `tier=<value>` byte-identical, not truncated or summarized.  
- **PASS →** Proceed with mechanism (a): parse tier from transcript in `hooks/otto-trace.mjs` (§10). Build continues as planned below.  
- **FAIL (truncated/absent) →** Implement fallback mechanism (b) (audit-hook sidecar + agent_id join per §10), re-spike to verify, then proceed.

**Criterion 2:** SubagentStop reads the tier correctly on the background-default path (no manual intervention).

**Criterion 3:** `tier=` absent from a transcript degrades gracefully to `tier: null` — no throw, no literal `tier=null` string.

**Criterion 4:** The regex `/tier=(\S+)/` captures all four dispatch-contract values (`WORKSHOP|T1|T2|T3`), stops at whitespace, and is safe against quote-collision.

**Expected outcome:** Gate PASS, mechanism (a) green, ready to build hooks/otto-trace.mjs tier-capture logic.

---

## DEPENDENT BUILD SEQUENCE (gates on build-task-1 PASS)

### Phase 1 — Ledger & API Layer

#### Task 2: hooks/otto-trace.mjs — tier-capture mechanism (a)
**Status:** DONE  
**Dependency:** build-task-1 PASS  
**Sequence:** runs before any report rendering

`computeLedgerEntry` gains a second pass over the in-memory transcript JSONL list (same list already read for tokens):
- Locate first `message.role === 'user'` entry
- Serialize `message.content` to text (string as-is, or `join('')` the `.text` of `type: 'text'` blocks)
- Run `/tier=(\S+)/`, capture group 1 → `{WORKSHOP|T1|T2|T3}`
- Return `{tokens, durationMs, tier}` where `tier` is `null` unless captured

Ledger line gains optional trailing ` tier=<T>` **only when captured** — omitted entirely when null, never `tier=` empty, never `tier=null`.

Tier is computed **after** tokens/duration in its own guard — malformed content yields `tier: null`, never takes down the token write.

**Acceptance:** tier-capture logic is in place, tier extraction tests pass (task 9).

---

#### Task 3: viewer/server.mjs — ledger parser & /spend endpoint
**Status:** DONE  
**Dependency:** task 2  
**Sequence:** enables report rendering

**Part A — Parse tier from ledger:**
- `parseLedgerLine` gains optional `(?:\s+tier=(\S+))?` group (same optional-segment pattern as `[project]`)
- Default `null` for all legacy/no-tier lines (no rewrite of old lines)
- Round-trip: written `tier=WORKSHOP` parses to `{tier: 'WORKSHOP'}`; no `tier=` segment parses to `{tier: null}`

**Part B — New `/spend` endpoint:**
- Read ledger scoped per spec §4 (active goal anchor's confirmed-date + project, fallback whole-project)
- Compute department rollup (by department, sum tokens, compute %)
- Per-robot rows with flag basis computation (spec §8: median of 2+ priors, single prior if 1, null if 0)
- Robot→department display-label normalizer (Engineer→Engineering, etc.)
- Response shape matches viewer/spend.html contract (JSON, ready for HTML templating)

**Acceptance:** /spend endpoint returns correct department rollup, per-robot rows with flag basis, and clean null-handling when ledger is empty.

---

### Phase 2 — Viewer & Report Rendering

#### Task 4: Cathode revision — viewer/spend-report-mockup.html → viewer/spend.html
**Status:** DONE (mechanical revision done by Bitforge per dispatch note; a Cathode visual-polish pass remains OPTIONAL/available)  
**Dependency:** task 3 (/spend endpoint ready)  
**Sequence:** finalizes visual direction before wiring

Promote and revise Cathode's approved mockup per spec §6:
- **Drop** the `hero-estimate` card's `≈ $1.63 illustrative compute…` sentence
- **Drop** "Declared tier" column and all `.tier-pill` / `.tier-workshop` styling
- **Wire to `/spend`** live data endpoint instead of hardcoded sample rows
- **Implement flag column** with plain-language audit callout (spec §8 templates, no tier jargon)
- **Zero-flag calm-negatives:** render correct one ("Spend looked proportionate…" or "Not enough same-scope runs…"), never blank
- **Masthead noun:** "this effort" (active anchor) or "recent activity" (no anchor), never "this build"
- **Existing elements** (hero cards, department bars, measured-vs-estimated footnote) carry over as-is

**Acceptance:** page renders live data, shows correct calm-negative when no flags, zero tier/WORKSHOP/T1-3 jargon in output.

---

#### Task 5: viewer/README.md — document statement view
**Status:** DONE  
**Dependency:** task 4  
**Sequence:** documentation

Add bullet under "What it shows" describing the new `/spend` statement view and its route.

**Acceptance:** new route is documented for end users.

---

### Phase 3 — Agent Behavior

#### Task 6: agents/baudrate-cfo.md — flag logic & on-request wording
**Status:** DONE  
**Dependency:** build-task-1 PASS (tier data available)  
**Sequence:** defines report content & voice

Extend Baudrate's existing on-request spend-vs-tier audit with resolved rules from spec §8:

**Add to prose:**
- **Flag basis:** self-comparison only (this robot vs. its own same-tier, same-department runs)
- **Threshold — all three required together:**
  - (i) Ratio: `actual ≥ 2× basis`
  - (ii) Gap: `actual − basis ≥ 15K tokens`
  - (iii) Floor: `basis ≥ 10K tokens`
- **4th state (two calm-negatives, never blurred):**
  - Clean: `2+ comparable runs existed, none flagged` → "Spend looked proportionate across all {N} runs."
  - No-data: `too few same-scope runs` → "Not enough same-scope runs this effort to compare — no audit finding either way."
- **Phrasing templates (tier-free, `~`-rounded to nearest K):**
  - Full: `"⚠ {Robot}'s {descriptor} cost about {ratio}× its own typical run in {Department} this effort (~{actualK} vs ~{expectedK}) — worth a look."`
  - Terse: `"⚠ {Robot}'s {descriptor} cost as much as a much bigger job (~{actualK} vs its own ~{expectedK}) — worth a look."`

**Maintain (unchanged):**
- Existing honesty paragraph: measured-vs-estimated labeling, on-request ledger read, Otto main-thread never summed into crew totals

**Acceptance:** prose owns flag logic, both templates are in place with no tier jargon, calm-negative distinction is clear.

---

#### Task 7: agents/otto-foreman.md — build-end footer
**Status:** DONE  
**Dependency:** task 6 (Baudrate's wording ready)  
**Sequence:** surfaces report at build completion

Add to the goal-anchor's final-summary moment (existing restate + retire offer):

**Behavior per new `spendReporting` profile field (spec §7):**
- `off`: no proactive mention
- `on-request`: bare pointer, no numbers: `"(spend report available — just ask)."`
- `build-end` (**default**): Option 3 one-line digest (spec §5) with exception-first layout
- `verbose`: full Option 1 expansion (no collapsed footer step)

**Gate:** fires only on `gear=feature` or `gear=build` (same reasoning as goal anchor, never on answer/small-change).

**Composition:** direct from ledger (NOT a Baudrate subagent dispatch — cost optimization).

**Noun (Vector's spec §4 label seam):**
- Active goal anchor → "this effort"
- No active anchor → "recent activity"
- **Never** "this build"

**Acceptance:** footer renders at correct dial setting, never on answer/small-change, noun correct, no tier jargon.

---

### Phase 4 — Schema & Config

#### Task 8: docs/profile-schema.md — add spendReporting field
**Status:** DONE  
**Dependency:** task 7 (otto-foreman.md defines field use)  
**Sequence:** before validation & tests

Add `spendReporting` field to schema:
- **Type:** enum
- **Values:** `off`, `on-request`, `build-end`, `verbose`
- **Default:** `build-end`
- **Description:** one-line summary of behavior (read like `verbosity`)
- **Placement:** whole-file example next to `verbosity`, add this file to the top cross-reference list

**Acceptance:** schema documents the field, default matches otto-foreman.md behavior.

---

### Phase 5 — Validation & Tests

#### Task 9: scripts/validate.mjs — no-jargon scan + spendReporting drift check
**Status:** DONE  
**Dependency:** tasks 2–8 (all generated content exists)  
**Sequence:** before full test run

**Part A — No-jargon scan:**
- New check: user-facing strings in `viewer/spend.html`, `viewer/server.mjs` responses, `agents/otto-foreman.md`, `agents/baudrate-cfo.md` must not contain `tier`, `WORKSHOP`, `T1`, `T2`, `T3` (case-insensitive substring scan)
- **Scan-exclusion seam:** scan MUST exclude `otto-ledger.log` and `hooks/otto-trace.mjs`'s tier-writing literal
- Rendered surfaces only, never backstage ledger or hook

**Part B — Drift check:**
- Cross-check `spendReporting` enum in `agents/otto-foreman.md` against `docs/profile-schema.md`

**Acceptance:** no-jargon scan catches tier jargon in rendered output, excludes ledger/hook correctly, spendReporting enum matches.

---

#### Task 10: scripts/test-otto-trace.mjs — tier-extraction tests
**Status:** DONE  
**Dependency:** task 2 (hooks/otto-trace.mjs tier-capture implemented)  
**Sequence:** validates tier capture + ledger format

Add test suite for tier capture:

**Fixtures:**
- First-user-message with each of four dispatch-contract values (`WORKSHOP`, `T1`, `T2`, `T3`)
- First-user-message with no `tier=` present → `null`
- Quote-collision fixture → still extracts first-user-message value

**Assertions:**
- `extractTier` returns correct value for all four types
- Absent tier → `null`
- Regex is safe against quote-collision
- Ledger round-trip: tier written/parsed, legacy compat

**Acceptance:** tier extraction works on all four values, handles absent/null correctly, regex collision-safe, ledger round-trip append-compatible.

---

#### Task 11: scripts/test-spend-report.mjs (new) — comprehensive report tests
**Status:** DONE  
**Dependency:** tasks 2, 3, 6, 7, 9  
**Sequence:** validates all report logic

New test file following `scripts/test-otto-trace.mjs` convention.

**Positive tests (from spec §11):**
- Known ledger → correct department rollup, per-robot rows
- Crew-measured + Otto-estimate never summed in all four surfaces
- Flagged row message appears verbatim in all four places
- Each of three threshold conditions tested individually and together
- Self-comparison basis: 2+ priors → median, exactly 1 → single, 0 → null
- Two calm-negatives distinguished correctly at each scenario
- Zero flags renders correct calm-negative, never blank
- `spendReporting` settings produce exact behavior per spec §7
- "This effort" / "recent activity" noun, never "this build"
- Missing ledger renders honest empty state, no error

**Negative tests (CRITICAL — from spec §11):**
- Small-change/answer-gear dispatch NEVER emits spend footer, under any `spendReporting` setting
- No user-facing output contains tier jargon with scan-exclusion applied correctly

**Acceptance:** all tests pass, especially negative ones; report logic is solid; no tier jargon leaked.

---

### Phase 6 — Release & QA

#### Task 12: Version bump + CHANGELOG
**Status:** DONE  
**Dependency:** all code tasks (1–11)  
**Sequence:** final commit prep

**Changes:**
- `.claude-plugin/plugin.json`: `version: "22.13.0"`
- `RobotInc.md`: version string updated
- `CHANGELOG.md`: new entry documenting spend-report feature

**Acceptance:** versions match, CHANGELOG documents feature.

---

#### Task 13: Full test run + validation
**Status:** DONE — node scripts/validate.mjs green (13 robots + otto-foreman, 38 skills, 3 commands, 6 hook scripts); all five scripts/test-*.mjs suites green (202/202 tests) re-run after task 12 version bump.  
**Dependency:** task 12 (version bump in place)  
**Sequence:** pre-QA gate

Run:
```
node scripts/validate.mjs
npm test
```

**Acceptance:** all tests green, no validation errors, no tier jargon leaked.

---

#### Task 14: QA — visual verification & harmony check (Glitchtrap-owned)
**Status:** TODO  
**Dependency:** task 13 (build is green)  
**Sequence:** pre-merge gate

**Visual QA:**
- Render Option 1/2/3 terminal reports by hand against known ledger with at least one flagged row
- Verify masthead noun, footer renders at each `spendReporting` dial setting
- Verify footer never appears on answer/small-change gear
- Verify no tier jargon in any output

**Viewer QA:**
- Open `/spend` page, verify live data rendering
- Check department rollup bars, per-robot table, flag column, audit callout
- Verify correct calm-negative when no flags, no tier jargon

**Harmony check (with existing features):**
- Goal anchor's final-summary moment still works with footer added (no collision, no double-footer)
- Activity Window ledger index still handles tier field (or gracefully ignores null)
- Baudrate's on-request spend report unchanged (Option 2 is the new published format)
- No interaction with memory-cap, verbosity, or other profile settings

**Acceptance:** all visuals match spec, no tier jargon, footer gates work, harmony is green.

---

#### Task 15: Merge prep & documentation
**Status:** TODO  
**Dependency:** task 14 (QA green)  
**Sequence:** final handoff

- Clean commit history on feature/spend-report (one logical commit or clear sequence)
- All files touched are SHIPPED files (no internal tools, no debugging code)
- Rebase off main if needed to avoid merge conflicts
- Prepare PR with summary of changes, link to spec, note Bitforge/Cathode/Glitchtrap ownership

**Acceptance:** branch is clean, ready to merge to main.

---

## HANDOFF NOTES

- **Bitforge:** build-task-1 (spike, PASS) · tasks 2–3 (ledger/API) · task 4 (mechanical viewer revision,
  done in place of Cathode per dispatch note) · tasks 5–11 (docs/agents/validation/tests) — all DONE. Task 13
  (full test run) done for the code/tests; re-run once Gantry's task 12 lands. Task 15 (merge prep) waits on
  Glitchtrap's task 14.
- **Cathode:** optional visual-polish pass on `viewer/spend.html` if the render wants more design love — not
  blocking; the §6-mandated cuts and live wiring are already done.
- **Gantry:** task 12 (version bump + CHANGELOG) — next up.
- **Glitchtrap:** task 14 (QA + harmony check — verification-owned), gated on Gantry's task 12.
- **Notes for next session:** build-task-1's spike PASSED (mechanism (a) built, live in `hooks/otto-trace.mjs`)
  — the fallback mechanism (b) was never needed. All code-level acceptance criteria are green; see Bitforge's
  build report for the exact commands and counts.

---

## Status Summary

| Task | Status | Owner |
|------|--------|-------|
| build-task-1: tier-capture spike (GATE) | DONE — PASS | Bitforge |
| task 2: hooks/otto-trace.mjs | DONE | Bitforge |
| task 3: viewer/server.mjs | DONE | Bitforge |
| task 4: viewer/spend.html | DONE (mechanical; Cathode polish pass optional) | Bitforge |
| task 5: viewer/README.md | DONE | Bitforge |
| task 6: agents/baudrate-cfo.md | DONE | Bitforge |
| task 7: agents/otto-foreman.md | DONE | Bitforge |
| task 8: docs/profile-schema.md | DONE | Bitforge |
| task 9: scripts/validate.mjs | DONE | Bitforge |
| task 10: scripts/test-otto-trace.mjs | DONE | Bitforge |
| task 11: scripts/test-spend-report.mjs | DONE | Bitforge |
| task 12: version bump + CHANGELOG | TODO | Gantry |
| task 13: full test run | DONE (202/202 after bump) | Gantry |
| task 14: QA + harmony check | TODO | Glitchtrap |
| task 15: merge prep | TODO | Bitforge |

**Next:** Gantry's task 12 (version bump + CHANGELOG), then Glitchtrap's task 14 (QA + harmony check,
whole-system verify per the dispatch contract). Bitforge's task 15 (merge prep) waits on task 14 green.
