# TASKS — goal anchor / goal contract feature

**Branch:** eature/goal-anchor off main @ 336bb4f (v22.10.0)  
**Version target:** 22.11.0 (feature)  
**Owner:** Bitforge (build), sequenced by Gantry  
**Spec:** docs/spec-goal-contract.md (Patchbay authored, Vector's mechanism ruling folded in, cohesion note reconciled)

---

## CRITICAL EMPIRICAL GATES — These must run first and branch the plan

### Gate 1 — build-task-1: PreToolUse updatedInput capture spike
**Status:** DEFERRED-pending-spike. Explicit scope decision (Otto/user, this session): do not run it —
it needs an authenticated real Task dispatch the user will enable later. The build proceeds on §4.B
(prompt-discipline + deterministic audit backstop) until this spike runs and either confirms §4.A
feasible or ratifies staying on §4.B.  
**Blocks:** determine which of §4.A (inject hook) or §4.B (fallback) to build  
**Complexity:** real-capture, not automated; requires a live Claude Code session

Spike task per §4, build-task-1. Register a throwaway PreToolUse hook, dispatch a real Task call, and capture what actually happens. Six acceptance criteria all of which must be answered and recorded in docs/hook-events.md:

- **(a)** Sentinel (ANCHOR_SENTINEL) reaches subagent's echoed-back prompt — confirms mutation is real
- **(b)** Actual PreToolUse matcher-string → 	ool_name mapping, recorded
- **(c)** Mutation proven on **2.1.211 background-default dispatch path** (not forced-synchronous only)
- **(d)** SessionStart matcher "compact" stdout re-injection works
- **(e)** Exact emission envelope: does updatedInput alone suffice, or must it pair with permissionDecision: "allow"?
- **(f)** Does PostToolUse see **pre-** or **post-** mutation prompt?

**Outcome decision:**
- **If (a) or (e) fail:** → degrade to §4.B (fallback with hand-composed rule + audit backstop)
- **If (a) and (e) pass:** → proceed with §4.A (deterministic inject hook)
- **Criteria (c), (d), (f) inform:** which paths can run in parallel and how audit checks condition

**Document result:** Update docs/hook-events.md with spike findings, same format as existing PostToolUse/SubagentStop sections.

---

### Gate 2 — cross-hook ES-module import verify
**Status:** DONE — PASSED. Ran a throwaway pair of files (hooks/_gate2_spike_lib.mjs importing from
hooks/_gate2_spike_facts.mjs, which imports back — the exact circular shape otto-goal-lib.mjs <->
otto-facts.mjs needed) invoked via a real `node hooks/_gate2_spike_facts.mjs` child process. Resolved
and executed correctly, no error, correct output. Both throwaway files deleted immediately after.
Path A taken: shared lib built as designed (hooks/otto-goal-lib.mjs), including the genuine circular
import (otto-goal-lib.mjs imports cwdPersonaRoot from otto-facts.mjs; otto-facts.mjs imports
readActiveGoal/countGoalFlags back from otto-goal-lib.mjs) — safe because ES module function
declarations hoist before any import's side effects run, so both sides of the cycle see a live,
initialized binding regardless of evaluation order. Confirmed a second time for real: the full
otto-facts.mjs test suite (49/49) and the new goal suite (18/18) both exercise this exact circular
wiring under real subprocess invocation with zero regressions.  
**Blocks:** otto-goal-lib.mjs design; otto-goal-inject.mjs, otto-goal-compact.mjs, otto-facts.mjs reader all depend on it  
**Complexity:** small; one quick test in real hook execution

Verify that hooks can import from another hook module. This plugin has never had one hook import another (otto-trace.mjs's header documents why duplication was chosen before). The whole shared-lib design (§4.A, §6.1) depends on this working under the real hook invocation model (
ode hooks/X.mjs).

**Test:** Write a tiny test hook that imports from otto-goal-lib.mjs (hypothetically), run it via 
ode hooks/test-import.mjs, confirm import resolves and module executes correctly.

**Outcome decision:**
- **If works:** → shared lib as designed; proceed with otto-goal-lib.mjs + all hooks that depend on it
- **If fails:** → fallback to duplication pattern per cohesion note item 6; inline shared functions per-hook, accept single-source drift-gate in validate.mjs as the guard instead

**Document decision:** Record finding and chosen path in this TASKS.md, re-sequence dependent tasks if needed.

---

## After gates complete: Parallel and sequential paths

**Path A (both gates pass):** Deterministic shared lib + all hooks as spec'd  
**Path B (Gate 1 fails on a/e):** Fallback §4.B hand-composed rule + same hooks otherwise  
**Path C (Gate 2 fails):** Duplication fallback, no cross-hook imports, modified otto-facts.mjs reader

---

## SHARED LIB (gated by Gate 2)

### 3. hooks/otto-goal-lib.mjs — NEW, shared library
**Status:** done. All exports shipped: readActiveGoal, renderAnchorBlock, ANCHOR_SENTINEL,
ANCHOR_CHAR_CAP, goalFlagsPath, countGoalFlags, writeGoalFlag, AUDIT_LOG_CAP. Imports cwdPersonaRoot
from otto-facts.mjs (Gate 2-verified circular import). Covered in scripts/test-otto-goal.mjs.  
**Depends on:** Gate 2 pass  
**Blocks:** inject hook, compact hook, audit hook, otto-facts.mjs reader  
**Complexity:** medium; careful file I/O, robust error handling

Create new file exporting: eadActiveGoal(cwd), enderAnchorBlock(goal), ANCHOR_SENTINEL, ANCHOR_CHAR_CAP, goalFlagsPath(cwd), countGoalFlags(cwd), writeGoalFlag(cwd, flag), AUDIT_LOG_CAP.

Imports cwdPersonaRoot from hooks/otto-facts.mjs (cohesion note item 5 — reuse, don't re-copy).

Key details per §4.A:
- eadActiveGoal(cwd) calls cwdPersonaRoot before reading .claude/otto-goal.md; returns 
ull on absence, non-active status, persona-root, or parse failure; never throws
- ANCHOR_CHAR_CAP = 500, code-point-safe truncation (same technique as otto-state.mjs's summarize(), never split surrogate pair)
- enderAnchorBlock(goal) emits the exact header + confirmed goal + verbatim ask
- Flag helpers: append-only append to .claude/otto-goal-flags.log, capped at AUDIT_LOG_CAP = 20 by recency eviction
- Flag lines scoped to active goal's confirmed: date (no bleed from retired goals)

All errors fail-silent (same footing as otto-state.mjs).

**Verify:** Unit tests isolated in scripts/test-otto-goal.mjs cover this.

---

## INJECTION PATH (gated by Gate 1 outcome)

### 4. hooks/otto-goal-inject.mjs — NEW (if Gate 1 passes on a/e)
**Status:** DEFERRED-pending-spike. Not built this round — explicit scope decision, Gate 1 has not run.
No PreToolUse entry was added to hooks.json. The seam is left clean: scripts/validate.mjs already
carries the single-PreToolUse-updatedInput-emitter gate (dormant, passes vacuously today, zero PreToolUse
entries exist); hooks/otto-goal-lib.mjs's renderAnchorBlock/readActiveGoal are exactly what this hook
will call once built, with no shape change needed.  
**Depends on:** Gate 1 pass, Gate 2 pass (shared lib), otto-goal-lib.mjs built  
**Blocks:** nothing directly; gates the availability of deterministic injection  
**Complexity:** medium; field-presence gating, mutation, idempotency

Create new PreToolUse hook per §4.A. **Only built if Gate 1 disproves feasibility → use fallback 4.B instead** (see next task).

Key details:
- Gate on **field presence**, not 	ool_name: fire when 	ool_input.subagent_type AND 	ool_input.prompt both present
- **Do not skip built-ins** — all subagents, named or built-in, get the goal anchor
- **Complete-replacement emission** (pending build-task-1 criterion e): spread whole 	ool_input, never a whitelist; augment prompt only; never touch description
- **Idempotency guard:** if 	ool_input.prompt already contains ANCHOR_SENTINEL, no-op
- Reads via eadActiveGoal and enderAnchorBlock from shared lib
- No-op when goal file absent, status not ctive, or <cwd>/.claude is a foreign persona root
- Fail-silent on all errors

**Verify:** Unit tests in scripts/test-otto-goal.mjs cover deterministic cases; live verification by Gate 1 confirms real dispatch behavior.

---

### 4B. Fallback §4.B rule (if Gate 1 fails on a/e)
**Status:** done — built now per the explicit scope decision (Gate 1 deferred, build on §4.B until it
runs). agents/otto-foreman.md's new "### The goal anchor" subsection carries the hand-compose rule
verbatim, gated to feature/build dispatches only, no exception. hooks/otto-goal-audit.mjs's check-set
includes the ANCHOR_SENTINEL branch under this path, clearly commented as the §4.A seam to delete once
the inject hook lands.  
**Depends on:** Gate 1 fail decision  
**Blocks:** nothing; fallback is independent  
**Complexity:** small; documentation + prompt-discipline rule in foreman

If Gate 1 disproves feasibility (sentinel never reaches subagent, or no working updatedInput envelope exists):
- **Skip otto-goal-inject.mjs** — do not build the deterministic hook
- **Add to agents/otto-foreman.md:** new hard rule in dispatch paragraph: whenever .claude/otto-goal.md has status: active, Otto composes the anchor block by hand (via enderAnchorBlock spec, byte-for-byte agreement) and prepends it to every Task prompt, every dispatch, no exception
- **Audit adapts:** otto-goal-audit.mjs's check-set changes to also check for ANCHOR_SENTINEL presence in tool_input.prompt (detection of misses, not prevention)
- **Cap is aspirational:** under 4.B, Otto's hand-composition is prompt-discipline; 500-char cap is a goal, not a guarantee

**Document plainly** in TASKS.md which path was taken and why.

---

## COMPACTION PRESERVATION (independent of Gate 1 outcome)

### 5. hooks/otto-goal-compact.mjs — NEW
**Status:** done. New SessionStart entry, matcher "compact". Reads via readActiveGoal, echoes
renderAnchorBlock plus goal_flags=N when flags exist. Covered in scripts/test-otto-goal.mjs, including
a real subprocess invocation.  
**Depends on:** Gate 2 pass, otto-goal-lib.mjs built  
**Runs in parallel with:** inject hook (if building 4.A) or fallback rule (if 4.B)  
**Blocks:** nothing directly; gates compaction re-injection  
**Complexity:** small; straightforward SessionStart/compact handler

Create new SessionStart hook with matcher: "compact" per §4.C. **Built regardless of Gate 1 outcome** — this is independent.

Key details:
- Reads goal via eadActiveGoal(cwd) from shared lib — same function §4.A's inject uses
- If active, echoes enderAnchorBlock(goal) to stdout (same proven re-injection channel otto-facts.mjs uses)
- If there are unresolved audit flags (countGoalFlags(cwd) > 0), also emit goal_flags=N on its own line, via shared lib's countGoalFlags helper
- No-op when goal absent, not active, or project is persona root
- **Parent-session-only:** sufficient because subagents never span compaction
- Emit nothing if no active goal

**Verify:** Unit tests in scripts/test-otto-goal.mjs verify re-injection output is byte-identical to what inject hook would produce.

---

## AUDIT + READER (writer and reader land together)

### 6. hooks/otto-goal-audit.mjs — NEW
**Status:** done. Second entry in the existing PostToolUse "Task" hooks array. Gates
tool_name==='Agent', gates on active-goal-status, check-set is the §4.B set (anchor + gear/tier/box),
own lock directory, cap-20 recency via the shared lib's writeGoalFlag. Never blocks. Covered in
scripts/test-otto-goal.mjs, including a real subprocess invocation.  
**Depends on:** Gate 2 pass, otto-goal-lib.mjs built  
**Runs in parallel with:** compact hook, inject hook  
**Must ship with:** otto-facts.mjs reader (task 7) — writer without reader = dead code, this was cohesion hole 2  
**Complexity:** medium; conditional check-set per §4 outcome, file locking

Create new PostToolUse hook, appended as **second entry** in the existing "Task" matcher's hooks array in hooks.json.

Key details per §6.1:
- Gate payload.tool_name === 'Agent' (not "Task" — avoid otto-state.mjs's trap)
- Only runs when .claude/otto-goal.md has status: active (via eadActiveGoal(cwd)) — no false-flags on small work in mixed-gear projects
- **Check-set is conditional on §4 outcome:**
  - **Under 4.A** (inject confirmed working): check for gear=, 	ier=, ox= substrings only; **deliberately drop** anchor-presence check (inject hook guarantees it deterministically; PostToolUse may see pre-mutation prompt per criterion f anyway)
  - **Under 4.B** (fallback): also check for ANCHOR_SENTINEL presence (detection backstop; no inject hook to guarantee it)
- Pure string-presence, no semantic validation, no model, never a permission decision
- Append flagged line to .claude/otto-goal-flags.log (cap-20 recency eviction): YYYY-MM-DD subagent_type description: missing=gear,box
- Own lock directory (.claude/.otto-goal.lock), distinct from otto-state.mjs's .otto-state.lock, so hooks never contend
- Fail-silent on all errors

**Verify:** Unit tests in scripts/test-otto-goal.mjs verify flag writes; audit reader tests (task 7) verify writer/reader agreement.

---

### 7. hooks/otto-facts.mjs — add reader
**Status:** done. Additive edit: imports readActiveGoal/countGoalFlags from otto-goal-lib.mjs (first
cross-hook import, Gate 2-verified, and circular — see Gate 2 above), appends goal_flags=N to the wire
format only when N > 0. Landed in the same commit-worth of work as task 6, per the spec's "writer and
reader ship together" rule. Regression: existing 49/49 test-otto-facts.mjs assertions unaffected;
new goal_flags assertions added to scripts/test-otto-goal.mjs.  
**Depends on:** Gate 2 pass, otto-goal-lib.mjs built  
**Must land with:** otto-goal-audit.mjs (task 6) — reader without writer = never called  
**Complexity:** small; additive edit to existing hook

Additive edit to existing SessionStart/startup hook:
- Import eadActiveGoal and countGoalFlags from otto-goal-lib.mjs (cohesion note item 6 — this is the first cross-hook-file import in this plugin; Gate 2 verifies feasibility)
- Append goal_flags=N to the wire format **only when N > 0** — zero-cost-when-clean, same philosophy as everything in this spec
- Zero cost for projects with no active goal or zero flags

Both SessionStart hooks (startup + compact, task 5) emit goal_flags=N from the same countGoalFlags(cwd) call — never independently computed numbers that happen to agree today.

**Verify:** Unit test in scripts/test-otto-goal.mjs asserts startup and compact readers both render identical count via same shared lib call.

---

## HOOKS CONFIGURATION

### 8. hooks/hooks.json — add three new entries
**Status:** done, PARTIAL BY DESIGN. Two of the three entries added (SessionStart "compact" entry;
PostToolUse second entry under "Task"). The PreToolUse entry is NOT added — Gate 1 deferred, §4.A not
built this round. All entries use "type": "command", node, timeout: 5, per the proven convention.
**Depends on:** otto-goal-inject.mjs (or fallback decision if 4.B), otto-goal-compact.mjs, otto-goal-audit.mjs built  
**Blocks:** hooks can't fire without registration  
**Complexity:** small; JSON structure

Add three entries:
1. **PreToolUse entry** (only if Gate 1 passes — skip if 4.B fallback):
   \\\json
   "PreToolUse": {
     "type": "command",
     "script": "\/hooks/otto-goal-inject.mjs",
     "matcher": "Task",
     "node": true,
     "timeout": 5
   }
   \\\

2. **New SessionStart entry for compact** (always — independent of Gate 1):
   \\\json
   {
     "type": "command",
     "script": "\/hooks/otto-goal-compact.mjs",
     "matcher": "compact",
     "node": true,
     "timeout": 5
   }
   \\\

3. **PostToolUse second entry** in existing "Task" array (always — independent of Gate 1):
   \\\json
   {
     "type": "command",
     "script": "\/hooks/otto-goal-audit.mjs",
     "matcher": "Task",
     "node": true,
     "timeout": 5
   }
   \\\

**Never use "type": "script"** — proven silent no-op per docs/hook-events.md.

**Verify:** Structure check only; functional verification in task 12 (test suite).

---

## FOREMAN + AGENT PROTOCOL

### 9. agents/otto-foreman.md — capture/confirm/amend/retire + dispatch contract
**Status:** todo  
**Depends on:** otto-goal-lib.mjs built (know the spec'd text verbatim)  
**Blocks:** nothing directly; documents the protocol  
**Complexity:** high; largest single-file change; careful prose  
**Load-bearing file:** Flag this clearly for human review

**Status:** done. New "### The goal anchor" subsection added under "## Doctrine", between "### Rigor
tiers" and "### When the work is stuck" (preserves existing numbered cross-references — grepped and
verified, same discipline the memory-cap build used). Covers capture/confirm/pin, the §4.B hand-compose
inject rule, the mandatory dispatch-contract line, surfacing goal_flags, the amend gesture, and the
retire gesture. "Announcing a handoff" gets a short pointer + example showing the anchor block and
contract line's placement in the prompt. scripts/validate.mjs's existing otto-foreman.md gates (roster
table, doctrine tripwire, config-dir hardcode check, state-file mention restrictions) all still pass.

Add/modify five major sections:

1. **Capturing the goal anchor** (new subsection in session-open protocol):
   - When Otto sorts a feature/build-scale ask, before first dispatch, Otto states restated understanding: *"Here's what I understand you want: <restatement>. That right?"*
   - Confirm step: human says yes (or corrects and loops back, never half-confirmed)
   - Pin step: Otto writes .claude/otto-goal.md verbatim from confirmed exchange (no double-consent)
   - Reuse exact artifact format from spec-goal-contract.md §3

2. **Inject rule** (in dispatch paragraph):
   - **Under 4.A** (if spike passes): the PreToolUse hook does this deterministically; Otto's job is capture/confirm
   - **Under 4.B** (if spike fails): Otto composes anchor block by hand per enderAnchorBlock spec (byte-for-byte), prepends to every Task prompt for this project, every dispatch, no exception — this is a hard rule with high visibility
   - Either way: injected anchor is the confirmed text from .claude/otto-goal.md, never a paraphrase

3. **Mandatory dispatch contract line** (in dispatch paragraph, always):
   - Every Task prompt for feature/build-scale work must contain verbatim:
     \\\
     [Dispatch contract] gear=<answer|small-change|feature|build> tier=<WORKSHOP|T1|T2|T3> box="<one pass, then report — or scoped equivalent>"
     \\\
   - This is prompt-discipline (Otto's live judgment per dispatch, not static content a hook pre-fills)
   - otto-goal-audit.mjs detects and counts misses

4. **Surfacing goal flags** (at checkpoint/session-open/final summary):
   - If facts block includes goal_flags=N (from otto-facts.mjs or otto-goal-compact.mjs), surface at next checkpoint or session-open brief in plain language, never mechanism name
   - Example: *"heads up, three dispatches on this build went out without the full gear/tier/box line — want me to look at which?"*
   - Audit only detects; Otto reads with judgment

5. **Amend gesture** (new subsection, mid-session):
   - Two paths surface the question — neither one silently updates or ignores:
     - **(a) Human-initiated:** Human says something mid-session that sounds like a new direction. Otto asks plainly: *"That sounds like it might be a change from the goal we confirmed ('<old confirmed line>'). Want me to update the anchor to this, or is this an addition alongside it?"*
     - **(b) Otto-noticed:** Reviewing returned work against the anchor, looks like drift. Otto surfaces: *"This looks like it drifted from the confirmed goal ('<old confirmed line>') — the last couple of hops were about <Y>. Still on track and I should pull it back, or has the goal actually moved?"*
   - Only explicit human yes writes amendment: old line → ## Amendment history with date, new line becomes confirmed goal
   - Next dispatch carries new text (via whichever mechanism §4 resolved to)

6. **Retire gesture** (new subsection, at final summary):
   - At final summary, name the effort and ask explicitly: *"Shall I retire this goal ('<confirmed line>'), or is this work ongoing?"*
   - If retiring: flip status: active to status: retired
   - If new effort starts in same project: ask *"That sounds like a new goal — should I retire the old one ('<old confirmed line>'), or is this in service of it?"* — same human-decides gate, not silent overwrite

**Add dispatch-contract line example to "Announcing a handoff"** section (if not there already), showing exact format and its placement in the prompt.

**Verify:** No automated check; prose-level review for accuracy and clarity against spec §3 and §5.

---

## ARTIFACT SPECIFICATION

### 10. .claude/otto-goal.md artifact format (spec only)
**Status:** done — documentation only, as scoped. The format is already fully specified,
byte-for-byte, in docs/spec-goal-contract.md §3, and agents/otto-foreman.md's new "### The goal
anchor" subsection now also carries the exact template Otto writes at capture/pin time. No runtime
file is shipped — none should be.  
**Depends on:** none; documents runtime structure  
**Blocks:** nothing directly; captured by otto-foreman.md protocol  
**Complexity:** trivial; reference documentation

This task is documentation only — the artifact is created at runtime during capture, not shipped. Record the spec'd format in this TASKS.md or a reference doc.

---

## TEST SUITE

### 11. scripts/test-otto-goal.mjs — NEW, comprehensive test suite
**Status:** done — 18/18 passing. All §7 negative/positive/boundary cases covered against the §4.B
code path (build-task-1 itself is out of scope for automation, per the spec's own stated boundary).  
**Depends on:** otto-goal-lib.mjs, all hooks (inject/compact/audit), otto-facts.mjs built  
**Blocks:** nothing directly; gates release  
**Complexity:** high; many test cases per §7

Create new test file covering all §7 negative and positive cases. Use real filesystem scratch (no mocking), same convention as 	est-otto-facts.mjs / 	est-otto-state.mjs.

**Negative tests (small-ask never fires, auto-classification never happens, etc.):**
- Small-ask never fires, answer gear never fires, ambiguous gear, no auto-classification, retirement never inferred, audit never blocks, idempotency guard holds, single-mutator invariant, stale-goal flags don't leak

**Positive tests (feature/build fires end-to-end, amend works, compaction re-injects, etc.):**
- Feature/build ask fires, amend on explicit yes, compaction hook re-injects, audit reader agrees with writer

**Boundary tests:**
- ANCHOR_CHAR_CAP = 500, AUDIT_LOG_CAP = 20

**Verify:** All tests pass before release (task 13).

---

## VALIDATION + RELEASE

### 12. scripts/validate.mjs — add drift gates
**Status:** done. ANCHOR_SENTINEL/ANCHOR_CHAR_CAP single-source gate added (same shape as
PROFILE_CHAR_CAP). Single-PreToolUse-updatedInput-emitter invariant gate added as a no-op-until-
PreToolUse-exists check — it iterates hooks.json's PreToolUse entries generically (currently zero,
passes vacuously) so it starts doing real work the day §4.A adds an entry, with no further edit
required. Also updated three pre-existing gates this build's file additions would otherwise have
broken: the hooks/ extra-files allowlist, the SessionStart entry-count/matcher check (now 3 entries,
the "compact" matcher recognized), and the PostToolUse "Task" hooks-array check (now tolerates a
second, differently-named script instead of requiring every entry reference otto-state.mjs).  
**Depends on:** otto-goal-lib.mjs, all hooks built  
**Blocks:** release (task 13 runs this)  
**Complexity:** small; two new string-matching checks

Add two new gates: Single-PreToolUse-updatedInput-emitter invariant, ANCHOR_SENTINEL/ANCHOR_CHAR_CAP single-source gate.

---

### 13. docs/hook-events.md — record Gate 1 spike findings
**Status:** BLOCKED — depends on Gate 1, which is deferred this round. Not touched. Do not record
findings that were never captured; wait for the real spike.  
**Depends on:** Gate 1 complete  
**Blocks:** nothing directly; documents empirical findings  
**Complexity:** small; record findings in existing format

Record Gate 1's six-criterion capture in docs/hook-events.md.

---

### 14. Version bump — .claude-plugin/plugin.json + RobotInc.md
**Status:** done. Bumped .claude-plugin/plugin.json version: 22.10.0 → 22.11.0. Bumped RobotInc.md frontmatter version: 22.10.0 → 22.11.0. Validator enforces match (both now read 22.11.0).  
**Depends on:** all feature tasks complete (tasks 3–12)  
**Blocks:** release (task 15)  
**Complexity:** small; two-file bump

Bump version from **22.10.0** to **22.11.0** (feature tier).

---

### 15. CHANGELOG + release notes
**Status:** done. Added v22.11.0 entry to CHANGELOG.md (top of file, before 22.10.0). Entry describes goal anchor feature, §4.B shipped (capture protocol, deterministic compaction re-anchor, PostToolUse audits, goal_flags reader, validation gates), and §4.A deferred-pending-spike (PreToolUse inject hook). Matches style of 22.10.0/22.9.0 entries.  
**Depends on:** feature tasks complete, version bump (task 14)  
**Blocks:** release (task 16)  
**Complexity:** small; summary paragraph

Add v22.11.0 entry to CHANGELOG.

---

### 16. Full test run + release gate
**Status:** PARTIAL — done for everything in Bitforge's scope this round; version bump (14) and
CHANGELOG (15) still pending Gantry/Otto before an actual release. All of the following are GREEN,
run 2026-07-21:

    node scripts/validate.mjs        # valid: 13 robots + otto-foreman, 38 skills, 3 commands, 6 hook scripts
    node scripts/test-otto-goal.mjs  # 18/18 passed  (NEW)
    node scripts/test-otto-facts.mjs # 49/49 passed  (regression — otto-facts.mjs touched)
    node scripts/test-otto-state.mjs # 51/51 passed  (regression — untouched, re-run for safety)
    node scripts/test-otto-trace.mjs # 23/23 passed  (regression — untouched, re-run for safety)

  There is no package.json / npm test in this repo (TASKS.md's original wording assumed one); each
  suite is a standalone node script, run individually above.
**Depends on:** version bump (task 14), CHANGELOG (task 15), validate.mjs gate (task 12)  
**Blocks:** merge  
**Complexity:** small; run suite, confirm all green

\\\ash
node scripts/validate.mjs       # All gates pass
node scripts/test-otto-goal.mjs # All §7 tests pass
npm test                        # Full suite green
\\\

---

## DOWNSTREAM HANDOFFS (after merge)

- **Glitchtrap** (QA/integration): Verify whole-system cohesion
- **Otto** (release management): Publish v22.11.0

---

## Plan decision record

**Gate 1 outcome:** DEFERRED — not run this round, by explicit scope decision (needs an authenticated
real Task dispatch the user will enable later). Build proceeds on §4.B (path B) until it runs.

**Gate 2 outcome:** PASSED. Cross-hook ES-module import — including the genuine circular reference
between otto-goal-lib.mjs and otto-facts.mjs — resolves and executes correctly under the real
`node hooks/<file>.mjs` invocation shape. Path A (shared lib) built as designed.

**Path taken:** B for injection (§4.B, hand-compose + audit backstop), A for the shared lib (Gate 2
passed) — a genuine mix, exactly as TASKS.md's own "Path B" and "Path A" descriptions anticipated could
happen independently, since Gate 1 and Gate 2 gate different things.

---

## Summary for this session

- **Branch:** eature/goal-anchor (created, clean, ready)
- **Baseline:** main @ 336bb4f (v22.10.0), clean
- **Version target:** 22.11.0 (feature)
- **Critical path:** Gate 1 → Gate 2 → shared lib → conditional paths (4.A or 4.B) + parallel (compact, audit) → integration (hooks.json, foreman) → test/validate → release
- **Load-bearing task:** Task 9 (agents/otto-foreman.md) — largest single change, high visibility
- **Dead-code blocker:** Task 6 (audit writer) and Task 7 (reader) must land together
- **Empirical gates:** Both must complete and both outcomes recorded before proceeding

Ready for Bitforge to build; results feed back to Gantry for task sequencing updates and Glitchtrap for cohesion verification.
