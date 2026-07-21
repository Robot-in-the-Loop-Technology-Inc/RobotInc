# Spec — the goal anchor ("goal contract")

**For:** Bitforge (build), sequenced by Gantry · **By:** Patchbay (Product), out of an Otto Reality Check ·
**Owner:** Patchbay through this revision; Gantry sequences into `TASKS.md` from here.
**Baseline:** main @ `336bb4f` (v22.10.0) · **Version:** none pinned — Gantry assigns at release.

**Revision note:** this draft folds in Vector's mechanism ruling on §4 (injection) and §6 (compaction
preservation, audit). Every place that ruling touches this document is rewritten below, not patched around —
§4 and §6.1 are substantially different from the prior draft, §8 Q1/Q2/Q3 are re-resolved, and the files-
touched and test lists in §7 grew to match. Where reconciling the ruling against this repo's shipped hooks
(`otto-state.mjs`, `otto-facts.mjs`, `otto-trace.mjs`) or against the foreman protocol surfaced a contradiction,
duplication, or a dangling edge, it is called out in-line and resolved — see the **Cohesion note** after §8 for
the full list in one place.

---

## 1. Problem statement

Over a long (sometimes multi-hour) session, work drifts off the user's original ask, effort feels
disproportionate to what was asked for, and the final report doesn't tie back to the original request. Three
symptoms, one root cause.

**The root cause is not the subagents. It's Otto.** A subagent only ever knows what its dispatch prompt tells
it — it has no memory of the human's original words. That prompt is composed by Otto, live, from Otto's own
context. Otto's own context is exactly the thing that erodes across a long session and across compaction. So
by hop three or four, the "goal" a subagent receives is already Otto's paraphrase of a paraphrase — drifted
before the subagent ever starts. Fix the subagents and you've fixed nothing; the leak is upstream, at the
point where Otto himself stops holding the original ask with full fidelity.

That reframes all three symptoms as one problem: **the goal needs to live somewhere Otto's own context erosion
cannot touch it** — a file, read fresh at the moment it matters, not recalled from a context window that has
been through several compactions since the human said it.

## 2. Scope

**In:** the anchor's full lifecycle (capture → confirm → pin → inject → resurface → amend → retire); gear-gating
so it only fires on feature/build-scale work; the injection mechanism, now settled architecture pending one
empirical spike (`build-task-1`, §4); compaction preservation, upgraded to a deterministic hook (§4.C); the
amend gesture (human-decided, no classifier); mandatory gear/tier/box on every dispatch plus its deterministic
audit and the audit's reader (§6.1); a best-effort mid-run checkpoint instruction; the negative/positive tests;
files touched.

**Explicitly out, and why:**

| Surface | Why it's out |
|---|---|
| Concurrent goals in one project (two parallel build threads) | Real need, not yet observed. One active record keeps the design provable; a scoping key (mirroring `otto-state-global.md`'s `[project]` tag, maybe `[branch]` here) is a clean fast-follow if it comes up. |
| Cross-project / global anchor | A goal is inherently scoped to one build effort in one repo — project-local, same footing as `otto-state.md`, not `otto-state-global.md`. |
| Auto-detecting "done" to retire | Doctrine constraint (§4, §7) — no content classifier decides completion, same ruling that killed the terminal-clear detector twice. |
| Auto-classifying drift vs. pivot | Doctrine constraint, stated explicitly in the dispatch — the human decides, always. |
| A slash command or UI for capture/confirm/amend | Beginner-never-learns-a-command constraint — this is Otto conversation, full stop. |
| A model inside any deterministic enforcement path | Hard constraint — every hook in this spec is pure file I/O and string matching, same footing as `otto-state.mjs`/`otto-facts.mjs`. |
| Classifying whether a flagged dispatch *legitimately* omitted gear/tier/box vs. should have had one | Requires knowing that dispatch's gear — a live per-dispatch judgment, not content any hook can read from a file. Same constraint as the row above: the audit (§6.1) detects and counts; it never adjudicates. Otto reads the count with judgment at the next checkpoint. |

**The gear-gating boundary, precisely.** Otto already sorts every ask into one of four gears (`agents/otto-foreman.md`,
"Scale"): **answer**, **small change**, **feature**, **build**. The anchor fires on the last two only, and
never on the first two — full stop, no exception, no "just to be safe." Concretely:

- **Answer / small change** → the anchor is never mentioned, never captured, no file is touched. Stopping to
  "pin your goal" on a one-line question is the exact over-building failure that ends the relationship
  (`agents/otto-foreman.md`, "Over-building a small ask is the failure that ends the relationship").
- **Feature / build** → capture+confirm runs before the first dispatch.
- **Ambiguous gear** → Otto already takes the lower gear and offers the next in one line. The anchor does
  **not** fire at the lower gear; it fires only if the human accepts the upgrade to feature/build.

## 3. The anchor artifact

**File:** `.claude/otto-goal.md` — project-local, cwd-relative, same directory and same
gitignore-recommendation as `otto-state.md`. Deliberately **not** folded into `otto-profile.json`: the
profile is cross-session identity (who the human is, additive preferences); the anchor is a single,
retirable record scoped to *one build effort in one repo*, with its own consent model (amend and retire are
consequential in a way "add a preference" is not). Different lifecycles, different files — same principle
`otto-state.md` already applies against the profile.

**Not an append-log** (unlike `otto-state.md`'s cap-8 recency list). Exactly one active record at a time —
a build/feature has one goal, not eight.

```markdown
<!-- otto-goal.md — the confirmed goal anchor for the current feature/build-scale effort in this project.
     One active record, not a log. Written only after the human said yes to Otto's restated understanding
     (agents/otto-foreman.md, "Capturing the goal anchor"). Read at every dispatch, every checkpoint, and on
     every post-compaction re-open, so the anchor Otto re-reads is the confirmed original — never a summary
     of a summary. Amending REPLACES the confirmed line and appends to history below; it never edits history
     in place. Retiring flips status only — never deletes — so a resumed session still finds what this was
     for. A dispatch audit's flag log lives alongside this file at otto-goal-flags.log — see
     hooks/otto-goal-audit.mjs. If this project is version-controlled, add .claude/ to .gitignore, same as
     otto-state.md. -->

status: active
confirmed: 2026-07-21
gear: feature

## Confirmed goal
<Otto's restated understanding, 1-3 sentences, that the human said yes to>

## Original ask (verbatim)
<the human's own words, first capture, unparaphrased, capped — see §6 ANCHOR_CHAR_CAP>

## Non-goals
<only if the human stated one during capture; section omitted entirely if none>

## Amendment history
<YYYY-MM-DD> — pivoted from "<old confirmed line>" to "<new confirmed line>" — confirmed by human
```

### Lifecycle

1. **Capture** — at the moment Otto sorts a feature/build-scale ask, *before* the first dispatch, Otto states
   its restated understanding in its own words: *"Here's what I understand you want: <restatement>. That
   right?"* This is the one moment in the whole system where paraphrase is unavoidable — so it happens once,
   at the point of freshest context, and is then frozen. Everything downstream reads the frozen record, never
   Otto's live memory of the conversation.
2. **Confirm** — the human's yes is the write gate. No yes, no file. A correction ("not quite, actually...")
   loops back to restate, never writes a half-confirmed version.
3. **Pin** — Otto writes `.claude/otto-goal.md` verbatim from the confirmed exchange. The confirm step already
   showed the human the exact text being written (showing the restatement *is* showing the change) — no
   second consent prompt for the write itself, same footing as `otto-state.mjs`'s other non-double-gated
   writes.
4. **Inject** — every subagent dispatch for this effort carries the anchor. **Resolved:** deterministic hook
   mutation is the confirmed target design, gated by one empirical spike — see §4. Falls back to
   prompt-discipline + a deterministic audit backstop only if that spike disproves feasibility.
5. **Resurface** — two independent mechanisms, not one, and they must not be conflated:
   - *Compaction-preservation* is now **deterministic** — a `SessionStart`/`compact` hook re-injects the
     anchor mechanically, independent of how §4 resolves. See §4.C.
   - *Checkpoint and final-summary resurfacing* stays **prompt-discipline** — the confirmed goal line is
     re-shown at every checkpoint (each handoff Otto relays to the human) and restated explicitly in the final
     summary, with the delivered work tied back to it in one line: *"Goal: <confirmed line>. Delivered:
     <summary>. Ties back: <one line>."* This is what makes a report answer "did we do the thing that was
     asked" instead of just "here's what happened." See §6.3 for why this one has no deterministic backstop.
6. **Amend** — a legitimate pivot updates the anchor. Human-decided, never inferred — full UX in §5.
7. **Retire** — flips `status: active` to `status: retired`. Never inferred from wording (same "no clear path"
   doctrine as `otto-state.md`'s cap-8 eviction — see that file's header comment for the two build rounds that
   tried and failed to classify "terminal" wording). Retirement is always an **explicit event**:
   - the human confirms the work shipped or is abandoned, in reply to Otto naming it at the final summary, or
   - a new feature/build-scale ask starts in the same project, and Otto's capture step for the *new* ask
     explicitly asks: *"That sounds like a new goal — should I retire the old one ('<old confirmed line>'),
     or is this in service of it?"* — reusing the exact same human-decides gate as the amend gesture, not a
     silent overwrite.

## 4. The injection mechanism — RESOLVED (§4.A confirmed, spike-gated)

**Vector's ruling:** the target design is §4.A, deterministic `PreToolUse` hook mutation. This is settled
architecture, not an open design question — but one build-time spike (`build-task-1`) must run before or
alongside the build to confirm the implementation details a design ruling alone cannot verify (the exact
matcher-to-`tool_name` mapping for `PreToolUse`, the exact emission envelope, and — the criterion most likely
to get skipped — real mutation on the *background-default* dispatch path, not just a forced-synchronous one).
If the spike disproves feasibility, the build degrades to §4.B, which is already fully spec'd and independent
of the spike outcome for Req 6 (compaction, §4.C). **The build does not stall either way — it degrades.**

### Build-task-1 — the real-capture spike that gates the inject hook

Register a throwaway `PreToolUse` hook, dispatch a real Task call, and inspect what actually happens — not
from documentation alone, the same standing rule `docs/hook-events.md` already sets for this codebase.
Six acceptance criteria, all of which must be answered by a real capture and recorded in `docs/hook-events.md`
(same convention as the existing `PostToolUse`/`SubagentStop` sections there):

| # | Criterion | Why it matters |
|---|---|---|
| a | The sentinel (`ANCHOR_SENTINEL`) reaches the subagent's own echoed-back prompt | Confirms the mutation is real, not just accepted and dropped. |
| b | The actual `PreToolUse` matcher-string → `tool_name` mapping, recorded | `PostToolUse`'s matcher `"Task"` delivers `tool_name: "Agent"` (`hooks/otto-state.mjs`'s header) — do not assume `PreToolUse` carries the same mapping; it has never been tested. |
| c | Mutation proven on the **2.1.211 background-default dispatch path**, not only a forced-synchronous one | This is the path most likely to be skipped in a rushed verification, and it's the one this repo has already been burned on once (`hooks/otto-state.mjs`'s own `async_launched` regression, `docs/spec-relay-async-fix.md`). |
| d | `SessionStart` matcher `"compact"` stdout re-injection actually works | Gates §4.C, independently of a–c, e, f. |
| e | Exact emission envelope: does `updatedInput` alone suffice, or must it pair with `permissionDecision: "allow"`? | Determines the literal shape `hooks/otto-goal-inject.mjs` must emit. |
| f | Does `PostToolUse` see the **pre-** or **post-**mutation prompt? | Settles what §6.1's audit can safely check under 4.A — see that section. |

**If the spike disproves (a) or (e)** — the sentinel never reaches the subagent, or `updatedInput` alone is
insufficient and no working envelope exists — **the build falls to §4.B.** Say so plainly to Gantry/Otto when
it happens; this is a degrade, not a stall.

### 4.A — the confirmed target design

New hook, `hooks/otto-goal-inject.mjs`, `PreToolUse`, `hooks.json` matcher `"Task"` (the registration-side
matcher genuinely filters by tool identity regardless of the delivered `tool_name` string — confirmed for
`PostToolUse` at `docs/hook-events.md`'s "Fires for every tool call" row; re-verified independently for
`PreToolUse` by build-task-1 criterion b).

- **Gate on field presence, not `tool_name`.** Fire when `tool_input.subagent_type` AND `tool_input.prompt`
  are both present — never gate on a `tool_name` string. This makes the hook correct regardless of how
  build-task-1 resolves criterion (b): if `PreToolUse` turns out to deliver a different `tool_name` than
  `PostToolUse` does (or none at all), a field-presence gate still fires correctly; a `tool_name` gate copied
  from `otto-state.mjs` could silently never fire, the exact trap that file's own header describes.
- **Do not skip built-in subagents.** `otto-state.mjs`'s `BUILTINS` set (`Explore`, `general-purpose`, `Plan`,
  `claude`, `statusline-setup`) exists there because those never get a *relay-state* line — they aren't crew
  and aren't hired staff. That reasoning does not carry over here: a built-in doing recon (`Explore`,
  `general-purpose`) for a feature/build effort needs the goal anchor exactly as much as a named crew robot
  does — it is still working toward the confirmed goal and can still drift from it. This hook injects into
  **every** qualifying dispatch, built-in or not.
- **Complete-replacement emission**, pending build-task-1 criterion (e) confirming the envelope:
  ```js
  hookSpecificOutput.updatedInput = {
    ...tool_input,
    prompt: `${anchorBlock}\n\n${tool_input.prompt}`,
  };
  ```
  **Spread the whole `tool_input`, never a field whitelist.** A whitelist that drops, say, `run_in_background`
  on some future Claude Code version is silent data loss for every dispatch this hook ever touches — the same
  failure class `hooks/otto-state.mjs`'s own async fix exists to correct (a doc-vs-reality assumption that
  quietly broke real dispatches). Augment `prompt` only; **never touch `description`** — `description` is the
  ASCII-only, ≤60-char label `agents/otto-foreman.md`'s "Announcing a handoff" already governs, and it is
  what renders in the terminal UI; corrupting it risks the exact glyph-desync failure that section's ASCII-only
  rule exists to prevent.
- **Idempotency guard.** If `tool_input.prompt` already contains `ANCHOR_SENTINEL` (from `otto-goal-lib.mjs`),
  no-op — safe against a double-anchor on a retried dispatch and against a residual §4.B rule still active in
  `agents/otto-foreman.md` from a prior session (e.g. the human downgraded Claude Code and the spike's answer
  changed underneath them).
- **Reads via the shared lib**, never its own file logic — see below.
- **No-op, emit nothing, exit 0** when the goal file is absent, `status` is not `active`, or `<cwd>/.claude`
  is a foreign persona root (see PERSONA-ROOT SAFETY below). This is what keeps the cost at genuine zero for
  answer/small-change sessions: no file was ever written for those, so this hook does nothing on every dispatch
  they make.
- **Fail-silent on all errors** (missing file, malformed record, a lock) — same footing as `otto-state.mjs`: a
  goal anchor is a strong convenience, never the thing that breaks a dispatch.

**Shared lib — `hooks/otto-goal-lib.mjs` (NEW).** Exports `readActiveGoal(cwd)`, `renderAnchorBlock(goal)`,
`ANCHOR_SENTINEL`, `ANCHOR_CHAR_CAP`, plus the flag-sink helpers §6.1 needs (`goalFlagsPath`,
`countGoalFlags`, `writeGoalFlag`, `AUDIT_LOG_CAP`). The inject hook, the compact hook (§4.C), the audit hook,
and `otto-facts.mjs`'s new fact line (§6.1) all key off this **one** source, so the injected anchor, the
post-compaction anchor, and every place that renders or checks for it are byte-identical and cannot drift.
This is explicitly to avoid repeating the `PERSONA_ROOT_MARKERS` duplication scar `otto-state.mjs` and
`otto-facts.mjs` already carry — two independently-hardcoded copies of the same three-item array, a
unification that was planned (`docs/spec-persona-guard-22.8.1.md`'s "22.9-D2") but never actually landed. See
the **Cohesion note** for why importing across hook files is new for this codebase and what it costs.

- `ANCHOR_CHAR_CAP = 500`, code-point-safe (`Array.from().slice().join()`, same technique as `otto-state.mjs`'s
  `summarize()` — never split a surrogate pair). Truncates the **confirmed-goal portion only** — never the
  `[Goal anchor — do not drop this context]` header. Small next to `otto-facts.mjs`'s `PROFILE_CHAR_CAP` (2,000)
  deliberately: this block is paid for on **every dispatch**, not once per session.
- `readActiveGoal(cwd)` internally calls `cwdPersonaRoot` (imported from `hooks/otto-facts.mjs`, not
  re-implemented) before reading anything — see PERSONA-ROOT SAFETY below. Returns `null` on absence,
  non-active status, persona-root, or any parse failure; never throws.

**What this hook does NOT and CANNOT inject: gear, tier, or box.** Those are per-dispatch judgments Otto makes
fresh for each Task call (this dispatch is WORKSHOP, that one is T2; this one gets "one pass" as the box, that
one gets something narrower). A hook reading a static per-project file has no way to know what gear *this*
specific dispatch is before Otto decides it. Do not conflate the two — the goal anchor is a candidate for
deterministic injection because its content is static per active record; gear/tier/box are not, and stay
prompt-discipline regardless of which way §4 resolves. See §6.1.

**Single-mutator invariant.** This is the only `PreToolUse` hook that may ever emit `updatedInput`. Any future
`PreToolUse` hook must be **merged into this file**, never added as a second `updatedInput` emitter — Claude
Code resolves multiple emitters non-deterministically (last-writer-wins), which would make this hook's own
guarantee unverifiable. `scripts/validate.mjs` gets a new check enforcing this: for every `PreToolUse` entry in
`hooks.json`, resolve its script path and grep the source for `updatedInput`; fail if more than one file
matches.

**PERSONA-ROOT SAFETY.** Reuse the already-exported `cwdPersonaRoot` predicate from `hooks/otto-facts.mjs` —
`readActiveGoal(cwd)` calls it before reading `.claude/otto-goal.md`, so the inject hook (and every other
reader of the goal file) no-ops when `<cwd>/.claude` is some other machine's real persona root (the sandbox /
relocated-`CLAUDE_CONFIG_DIR` case `docs/spec-persona-guard-22.8.1.md` documents). The eventual **pin write**
(Otto's own Edit/Write call during capture, not a hook) carries the same guard — Otto checks the session's
facts block (`cwd_persona_root`) before writing, exactly as the "Announcing a handoff" paragraph already does
for `otto-state.md`. **Reuse, don't re-copy** — a third hardcoded `PERSONA_ROOT_MARKERS` array is exactly the
scar this shared lib exists to stop repeating.

### 4.B — fallback (only if build-task-1 disproves feasibility)

Falls back to the exact shape of the relay-writer precedent (`otto-state.mjs`'s own header: the prompt-driven
write measured 0/15 on its own).

- **Injection (prompt-discipline):** new hard rule in `agents/otto-foreman.md`, in the same paragraph that
  already tells Otto to hand the tier/gear to a robot in the Task prompt — whenever `.claude/otto-goal.md` has
  `status: active`, Otto composes the same anchor block by hand (via `renderAnchorBlock`, conceptually — Otto
  cannot literally import the lib, but the block's exact text is specified once, here, so a hand-composed copy
  and the lib's render agree byte-for-byte) and prepends it to every Task `prompt` for this project, every
  dispatch, no exception.
- **Audit (deterministic backstop):** `hooks/otto-goal-audit.mjs` ALSO checks for `ANCHOR_SENTINEL` presence
  in `tool_input.prompt` under this fallback — see §6.1 for the full audit design, which is conditional on
  which way §4 resolved.
- **The 500-character cap is aspirational, not enforced, under 4.B.** Under 4.A the hook truncates
  mechanically; under 4.B, Otto composing the block by hand is prompt-discipline like everything else in this
  path — say so plainly rather than oversell it as guaranteed.

**What degrades under 4.B, named plainly:**

| Requirement | Under 4.A (hook mutates) | Under 4.B (prompt-discipline fallback) |
|---|---|---|
| Durable + deterministically injected | Every dispatch guaranteed to carry it, full stop | Every dispatch *expected* to carry it (Otto's discipline); a miss is *detected*, not *prevented* — the un-anchored subagent still ran un-anchored |
| Compaction-preserved (Req 6) | Unaffected either way — see §4.C, independent of this fork | Unaffected either way |
| 500-char cap | Deterministically enforced | Aspirational prompt-discipline only |

### 4.C — Compaction preservation (Req 6), now deterministic — closes §8-Q2

**This is the biggest change from the prior draft.** The prior version hedged Req 6 as prompt-discipline
pending an open question about whether any post-compaction hook exists at all. It does: `SessionStart` fires
with `matcher: "compact"` (**correction from the prior draft, which speculated `PreCompact`** — there is no
`PreCompact` hook in this codebase's evidence base; the real, usable hook is `SessionStart`/`compact`, and every
mention of `PreCompact` anywhere in this spec is corrected to that).

New hook, `hooks/otto-goal-compact.mjs`, `SessionStart`, a **new, separate** `matcher: "compact"` entry in
`hooks.json` — **not folded into `hooks/otto-facts.mjs`.** Vector's reasoning, and it holds up against the
shipped code: `otto-facts.mjs` is startup-scoped and comparatively heavy (seven core facts, the first-run
inventory gather, the profile-budget computation) — almost none of that is relevant immediately after a
compaction, where the only thing that matters is getting the goal back in front of Otto before his next reply.
This matches a precedent already shipped in this repo: `hooks.json` already runs **two separate `SessionStart`
hooks** on `matcher: "startup"` deliberately (the zero-dependency `echo` trigger and the Node-only facts
injector) — see `otto-facts.mjs`'s own header, "TWO SESSIONSTART HOOKS, DELIBERATELY." A third, narrowly-scoped
`SessionStart` hook on a different matcher is the same pattern, not a new one.

- Reads the goal file via `readActiveGoal(cwd)` from the shared lib — the same function §4.A's inject hook
  uses, so there is exactly one place that decides "is there an active goal, and what does it say."
- If active, echoes `renderAnchorBlock(goal)` to stdout — the same proven re-injection channel
  `otto-facts.mjs`'s `[RobotInc facts]` block already uses for `SessionStart`/`startup`. If there are unresolved
  audit flags for this goal (§6.1), it also emits `goal_flags=N` on its own line, via the same
  `countGoalFlags` helper `otto-facts.mjs` uses (see §6.1's reader spec) — so the two readers can never
  disagree about the count.
- **No-op, emit nothing** when the goal file is absent, not active, or the project is a persona root — same
  guard, same shared lib, same reasoning as §4.A.
- **Parent-session-only, and that is confirmed sufficient.** The root cause this whole spec addresses is
  Otto's own context drift, not a subagent's — subagents never span a compaction (a subagent's context does
  not survive past its own `Task` call), and a post-compaction subagent gets the anchor fresh from the inject
  hook (§4.A) or Otto's own re-composition (§4.B) on its very next dispatch either way. There is no case where
  a *subagent* needs its own compaction-preservation path.
- **Independent of the §4 spike's outcome.** This hook works identically whether §4 lands on 4.A or 4.B — Req 6
  never rode on that fork, and this closes the ambiguity the prior draft's §8-Q2 left open.

## 5. Drift-vs-pivot — human-surfaced, no classifier

**Hard constraint, restated so it cannot be missed during build:** no keyword rule, no heuristic, no
"looks like a pivot if it contains X" ever decides drift vs. pivot. This is the same false-frontier trap that
killed the terminal-clear detector twice (`hooks/otto-state.mjs` header comment) — natural language doesn't
cross that line cleanly in either direction, and a third attempt at a classifier is not this build's job to
make. **The human decides. Always.**

Two paths surface the question — neither one silently updates or silently ignores anything:

**(a) Human-initiated.** The human says something mid-session that sounds like a new or different direction.
Otto does not silently fold it into the current goal (that fights the pull — doctrine explicitly endorses
following it) and does not silently swap the anchor either (that would drop a confirmed goal without consent).
Otto asks, plainly:

> *"That sounds like it might be a change from the goal we confirmed ('<old confirmed line>'). Want me to
> update the anchor to this, or is this an addition alongside it?"*

**(b) Otto-noticed.** Reading a subagent's returned work against the anchor (Otto's own judgment as the
reviewing model — never a deterministic check, never a scored heuristic), the delivered work looks like it
wandered from the confirmed goal. Otto surfaces it rather than accepting or silently course-correcting:

> *"This looks like it drifted from the confirmed goal ('<old confirmed line>') — the last couple of hops were
> about <Y>. Still on track and I should pull it back, or has the goal actually moved?"*

Both paths end at an explicit human answer. Only *"yes, update it"* writes an amendment (§3, step 6): the old
confirmed line moves into `## Amendment history`, dated, and the new line becomes the confirmed goal — from
that point on, every subsequent dispatch (via whichever mechanism §4 resolved to) carries the new text.
*"No, still on track"* or *"no, pull it back"* writes nothing; the file is untouched and Otto redirects the
work.

## 6. Effort-bounding

Reframe first, because it is easy to build this wrong: **the target is proportional and visible, never
minimized.** Long, parallel, adversarial verification is correct behavior on a genuine build — a board that
runs an hour on a payments path is not the failure this fixes. The failure is effort *disproportionate* to the
ask (an hour on a typo) and effort that's *invisible* (silence for hours). Nothing below should read as "make
it faster."

### 6.1 Mandatory gear + tier + box, and its deterministic audit + reader

Today, `agents/otto-foreman.md` tells Otto to hand a robot "the tier, whether co-piloting..., and the lane and
gear" in the Task prompt — but nothing makes it non-optional, and nothing checks that it happened. This build
makes it a hard rule with a checkable shape, so it can be **audited**, not just asked for:

Every Task `prompt` for feature/build-scale work must contain one line, verbatim format:

```
[Dispatch contract] gear=<answer|small-change|feature|build> tier=<WORKSHOP|T1|T2|T3> box="<one pass, then report — or a scoped equivalent>"
```

This is **prompt-discipline by nature and cannot be otherwise** — gear/tier/box are Otto's live per-dispatch
judgment, not a static value any hook could pre-fill (see §4.A's note on why this differs from the goal
anchor).

**The audit: `hooks/otto-goal-audit.mjs`, `PostToolUse`, appended as a SECOND entry in the existing
`"Task"` matcher's `hooks` array in `hooks.json`** (alongside the existing `otto-state.mjs` entry —
`hooks.json` already proves this pattern is additive: `SubagentStop` already carries two hook entries today).
Gates `payload.tool_name === 'Agent'` (not `"Task"` — the same trap `otto-state.mjs`'s header documents; this
hook copies that gate, it does not relearn it). Reads `tool_input.prompt`, which is present on **both**
`"completed"` and `"async_launched"` dispatch shapes — `tool_input` is the caller's own arguments, echoed
back regardless of completion status, and this is not just an inference from `docs/hook-events.md`'s
async-launched capture (which only excerpts `tool_response`'s shape): `hooks/otto-state.mjs`'s own
`writePendingMarker()` already reads `payload.tool_input?.description` and `payload.tool_input?.subagent_type`
off a live `async_launched` payload in shipped, working code today — direct, in-repo confirmation that
`tool_input` (and by the same envelope, `tool_input.prompt`) survives on that shape.

**Firing condition — gates BOTH checks below, and this closes a real hole the prior draft left open.** The
audit only runs its checks when `.claude/otto-goal.md` has `status: active` for this project (via
`readActiveGoal(cwd)`, same shared lib). **No active goal → no-op entirely, no flag line, nothing.** This
matters for a reason the prior draft's prose didn't spell out: without this gate, a project that had *ever*
had a goal, or a mixed-gear project where the human bounces between small asks and a genuine build, would get
flagged on every trivial dispatch that correctly never carried the contract line. Gating on active-goal-status
is a cheap, deterministic proxy for "a feature/build effort is genuinely underway in this project" — imperfect
(a legitimately-small aside dispatched *during* an active build still gets checked and can still false-flag),
but proportionate, and it matches the negative test already in §7 ("if a hook from §4 or §6.1 runs against
this dispatch, it finds no active-status file and no-ops silently").

**Known imprecision, named plainly rather than hidden:** because gear is Otto's live judgment and appears
nowhere in the static goal file, the audit cannot tell "legitimately answer/small-change, contract line
correctly omitted" apart from "should have had one and didn't." Every Task dispatch in a project with an
active goal is checked, full stop — a mixed project accumulates flags for the legitimate omissions too. This
is the same class of imprecision the missing-anchor detection under 4.B already accepts: **detect, never
adjudicate.** Otto reads the flagged count with judgment at the next checkpoint; `N > 0` is a prompt to look,
never an automatic verdict.

**Check-set is conditional on the §4 outcome:**

- **Under 4.A** (inject hook confirmed working) → checks for `gear=`, `tier=`, and `box=` substrings **only**.
  **Deliberately drops the anchor-presence check** the prior draft's audit carried under all conditions, for
  two reasons: the inject hook already guarantees the anchor deterministically, so checking for it is inert;
  and per build-task-1 criterion (f), `PostToolUse` may see the **pre-mutation** prompt — if so, an
  anchor-presence check here would false-flag **every single dispatch**, not just genuine misses, because the
  audit would be reading the prompt before the inject hook ever touched it.
- **Under 4.B** (fallback) → **also** checks for `ANCHOR_SENTINEL` presence, exactly as the prior draft
  specified — there is no deterministic injector to make that check inert, so it still earns its keep.

Pure string-presence, no semantic validation of *which* gear or tier was chosen, no model, **never a
permission decision** — `PostToolUse` cannot block a tool call that already ran.

**The write — flag sink, format, and locking.** One flagged line per dispatch that misses any check, appended
to `.claude/otto-goal-flags.log` (project-local, alongside `otto-goal.md`, same scoping — a goal is
project-scoped, so is its audit). Format:

```
2026-07-21 general-purpose subscription schema: missing=gear,box
```

Date, raw `subagent_type` (deliberately **not** resolved through a `ROBOTS` map — see the Cohesion note for
why this is a deliberate simplification, not an oversight), the dispatch's own `description`, and a
comma-joined list of which checks it missed (`anchor`, `gear`, `tier`, `box`, any subset). Append-only, capped
at `AUDIT_LOG_CAP = 20` lines by recency eviction (the oldest line drops on the 21st write) — same "no clear
path, cap-N recency only" grammar `otto-state.mjs` already uses, scaled up from its `CAP = 8` because this is
a lower-stakes diagnostic log, not a relay record a human reads directly. Locked with the same
mkdir-based lock pattern `otto-state.mjs` already uses, but its **own** lock directory
(`.claude/.otto-goal.lock`) — no shared mutex with `otto-state.mjs`'s own lock, so the two `PostToolUse`
hooks on the same matcher never contend with each other. Fail-silent on all errors, same footing as every
other hook in this plugin.

**Scoped to the current goal, not the file's whole history.** `countGoalFlags(cwd)` (shared lib) only counts
lines dated on or after the active goal's own `confirmed:` date — this closes a real hole found while writing
this section: without it, a brand-new goal in a project that had a *prior*, retired goal with old flags would
inherit that stale count and misreport problems from an effort that already shipped. The goal file's own
`confirmed:` date (bumped on amend, §3 step 6) is already-modeled data; no new field, no extra file format
change.

**LAND THE READER WITH THE WRITER.** The audit was write-only in the prior draft and nobody read the flag —
exactly the kind of hole the mandate for this revision calls out by name: dead code, shipped and forgotten.
**Writer and reader ship together, or neither ships.** The reader: both `SessionStart` hooks —
`hooks/otto-facts.mjs` (startup) **and** `hooks/otto-goal-compact.mjs` (post-compact, §4.C) — emit a one-line
`goal_flags=N` fact, via the shared lib's `countGoalFlags`, so the two can never disagree about the number.
`otto-facts.mjs` gets a small, additive edit: import `readActiveGoal` and `countGoalFlags` from
`hooks/otto-goal-lib.mjs` (see the Cohesion note on why this is the first cross-hook-file import in this
codebase, and why it's deliberate here), and append `goal_flags=N` to the wire format **only when `N > 0`** —
same zero-cost-when-clean philosophy as everything else in this spec; a session with no active goal, or an
active goal with zero flags, gets nothing new. `agents/otto-foreman.md`'s session-open protocol (step 1's
facts-block list) and its checkpoint/final-summary guidance (§3 step 5, §6.3) both get a line: if `goal_flags`
is present, surface it at the next checkpoint or session-open brief in plain language (never the mechanism's
name) — e.g. *"heads up, three dispatches on this build went out without the full gear/tier/box line — want
me to look at which?"*

### 6.2 Mid-run checkpoint / no-vanish — honestly, mostly prompt-discipline

**Deterministically enforceable: none found.** A subagent's own internal tool loop is not something this
plugin's `hooks.json` can interrupt or inspect mid-turn — `PreToolUse`/`PostToolUse` fire on **Otto's own**
Task tool call in the main thread, not on tool calls the subagent makes internally during its own run,
and there is no confirmed hook or timer in this repo's evidence base that fires partway through a subagent's
turn. This is a real capability gap, not a design choice, and it should be said that plainly rather than
implying a check exists.

- **The instruction (prompt-discipline, no backstop):** the dispatch contract's `box=` value, when the work is
  genuinely open-ended, should itself carry a self-checkpoint clause — e.g. `box="if this passes roughly 30
  minutes or a dozen tool calls without resolving, stop and report interim: what's confirmed, what's ruled
  out, what's left — then continue"`. This is a request the subagent honors or doesn't; nothing here can force
  it. **Say it that plainly: this clause has no backstop, deterministic or otherwise.**
- **A post-hoc duration flag stays deferred, for three concrete reasons, not a vague "maybe":**
  1. **Detection, not prevention.** Even a perfect implementation only tells you *after* the silence already
     happened — it cannot stop it.
  2. **The data isn't cheaply there.** `PostToolUse(Agent)` carries `totalDurationMs` only on the
     `"completed"` shape (`docs/hook-events.md`) — the `async_launched` shape (the *default* dispatch path as
     of 2.1.211) carries no duration at all. Getting one would mean deriving it from `SubagentStop` plus the
     subagent's own transcript file, the same derivation `otto-trace.mjs`'s ledger already does for tokens —
     real, working code to copy from, but real surface area to add for a detection-only feature.
  3. **A static threshold false-flags exactly the behavior §6 calls correct.** An hour on an adversarial board
     for a payments path is right, not a violation — a fixed minute threshold cannot tell "long and correct"
     from "long and stuck" apart, and building one anyway would fight this section's own opening reframe.

### 6.3 Resurfacing at checkpoints and the final summary — and the Stop-hook idea, resolved as deferred

Covered in §3, step 5 — pure prompt-discipline (Otto's own reply text). There is no hook on Otto's own
outgoing chat message the way there is on a Task's prompt/response, so this cannot be deterministically
audited the way §4.C's compaction-preservation or §6.1's gear/tier/box-miss can.

**The `Stop`-hook idea from the prior draft is resolved: deferred, not pursued.** `docs/hook-events.md`
confirms a real `Stop` event, sibling to `SubagentStop`, carrying `last_assistant_message` — the field is real
and readable. But a check for "did Otto restate the goal" is a substring match against free-form prose, the
same natural-language frontier that killed the terminal-clear detector **twice** (`hooks/otto-state.mjs`'s own
header comment) — and `Stop` fires on **every turn**, not only the final summary, so a naive implementation
would also need to distinguish "this is the closing summary" from "this is turn six of nine," a second
classification problem stacked on the first. No content-check backstop is built for resurfacing; it stays
prompt-discipline (§3 step 5), full stop.

## 7. Negative and positive tests

Land in `scripts/test-otto-goal.mjs`, same real-filesystem-scratch convention as `test-otto-facts.mjs` /
`test-otto-state.mjs` — no mocking. **One explicit boundary:** this suite covers everything downstream of
build-task-1's answer — both the 4.A and 4.B code paths are independently unit-testable without a live Claude
Code session. Build-task-1 itself is a one-time, live, manual capture (§4) — it is not, and cannot be, a
repeatable automated test, and this suite does not pretend otherwise.

**Negative — the critical one: small-ask never fires.** Drive a scripted session where Otto sorts a
small-change ask ("fix this typo," "swap this button color"). Assert: no capture/confirm exchange occurs, no
`.claude/otto-goal.md` is created, and if a hook from §4 or §6.1 runs against this dispatch, it finds no
active-status file and no-ops silently (no flagged line, because there was never a goal to be missing).

**Negative — answer gear never fires.** Same shape, for a pure question/recommendation ask. Identical
assertions.

**Negative — ambiguous gear, lower-gear-taken, no upgrade accepted.** Otto takes the lower gear and offers the
upgrade in one line; the human doesn't take it. Assert the file is still untouched.

**Negative — no auto-classification exists.** There is no function under test to call "classify drift vs
pivot" — the negative test here is structural: grep the shipped `agents/otto-foreman.md` diff and
`hooks/otto-goal-audit.mjs` for the absence of any keyword-matching, sentiment, or heuristic function deciding
pivot-vs-drift, and assert the only path that ever writes `## Amendment history` requires an explicit
human-confirmation flag passed into the write — same shape as `otto-state.mjs`'s header comment documents for
why it has no "terminal" detector at all.

**Negative — retirement is never inferred.** Feed the audit/write path a subagent result whose wording reads
as finished ("shipped," "done," "no issues found") without an explicit human confirmation. Assert `status`
stays `active` — completion wording alone must never flip it, mirroring `otto-state.mjs`'s own negative test
for the same trap.

**Negative — audit never blocks.** For both `hooks/otto-goal-audit.mjs` checks (missing anchor under 4.B,
missing gear/tier/box under either), assert the dispatch's own tool call is untouched and unblocked — the
audit only ever writes a flag line, never a permission decision.

**Negative — idempotency guard holds.** Feed the inject hook a `tool_input.prompt` that already contains
`ANCHOR_SENTINEL`. Assert `updatedInput` is never emitted (or, if emitted, is byte-identical to the input) —
no double-anchor, ever.

**Negative — single-mutator invariant.** `scripts/validate.mjs`'s new check: assert that resolving every
`PreToolUse` entry in `hooks.json` and grepping each script for `updatedInput` finds it in **at most one**
file.

**Negative — stale-goal flags don't leak forward.** Seed `otto-goal-flags.log` with entries dated before a
*new* goal's `confirmed:` date. Assert `countGoalFlags(cwd)` returns 0 for the new goal — old flags from a
retired effort never inflate the new one's count.

**Positive — feature/build ask fires end to end.** Drive a scripted feature-scale ask. Assert: capture+confirm
happens before the first dispatch; `.claude/otto-goal.md` is written with `status: active` and the confirmed
text; the following dispatch's `tool_input.prompt` carries the anchor block (via whichever mechanism §4
resolved to) and the `gear=`/`tier=`/`box=` line; the checkpoint and final summary both restate the confirmed
goal.

**Positive — amend on explicit yes.** Simulate the human explicitly confirming a pivot. Assert the old
confirmed line moves to `## Amendment history` with a date, the new line becomes the confirmed goal, and the
next dispatch's injected/composed anchor carries the *new* text, not the old.

**Positive — compaction hook re-injects.** Drive a `SessionStart`/`compact` event against an active goal.
Assert stdout carries `renderAnchorBlock`'s exact text, byte-identical to what §4.A's inject hook would have
produced for the same goal file (proves the shared-lib single-source design actually holds). Repeat with no
active goal and assert empty stdout.

**Positive — audit reader agrees with the writer.** Write three flagged dispatches to `otto-goal-flags.log`
(within the active goal's date window). Assert `hooks/otto-facts.mjs`'s `computeFacts()` and
`hooks/otto-goal-compact.mjs`'s stdout both render `goal_flags=3`, via the same `countGoalFlags` call — not two
independently-computed numbers that happen to agree today.

**Boundary — `ANCHOR_CHAR_CAP`.** `ANCHOR_CHAR_CAP = 500` for the rendered anchor block (confirmed goal +
trimmed verbatim ask) — small next to `PROFILE_CHAR_CAP`'s 2,000 deliberately, because this block is paid for
on **every dispatch**, not once per session. Otto's own restatement (1–3 sentences) is expected to stay well
under this by construction; the cap is a defensive backstop for a runaway write, truncated code-point-safe
(same technique as `otto-state.mjs`'s `summarize()`, never split a surrogate pair), enforced wherever the
block is rendered — deterministically under 4.A (the hook truncates), aspirationally under 4.B (Otto's own
composition; say so, don't oversell it). Assert a deliberately oversized record renders truncated, never
crashes, never corrupts the file on disk.

**Boundary — `AUDIT_LOG_CAP`.** Write 25 flagged dispatches. Assert the file holds exactly the most recent 20,
oldest five evicted, no crash, no corruption — same recency-only cleanup rule `otto-state.mjs`'s `CAP = 8`
already uses, at this file's own scale.

## 8. Resolution of the open questions

**Q1 — the load-bearing mechanism question. Status: open, pending one empirical spike, not a design
question any more.** Vector's ruling confirms §4.A as the target architecture — this is settled, not
re-litigated here. What remains open is purely empirical: build-task-1's six-criterion capture (§4) must run
against a real Claude Code session before `hooks/otto-goal-inject.mjs` ships, because a design ruling cannot
by itself confirm a `PreToolUse` contract detail (the exact `updatedInput` envelope, the real matcher-to-
`tool_name` mapping, mutation on the background-default dispatch path) that has never been tested in this
codebase. Owner: Bitforge, guided by the six criteria in §4 — this is a build-time verification task, not a
question for Vector to re-answer.

**Q2 — compaction-preservation. RESOLVED.** A real, usable hook exists: `SessionStart` with `matcher:
"compact"` — **not** `PreCompact`, which does not exist in this codebase's evidence base (correction folded
throughout §4.C and everywhere else this spec previously said `PreCompact`). `hooks/otto-goal-compact.mjs`
forces a deterministic re-read of `.claude/otto-goal.md` and re-injects the anchor via the same proven
stdout channel `otto-facts.mjs` already uses, independent of how §4's spike resolves. This closes the question
the prior draft left open in this section.

**Q3 — the `Stop`-hook idea for resurfacing. RESOLVED AS DEFERRED.** The field
(`last_assistant_message`) is real and readable on `Stop`, confirmed in `docs/hook-events.md`. But a check for
"did Otto restate the goal" is the same natural-language-frontier classifier that killed the terminal-clear
detector twice, and `Stop` fires every turn, not only the final summary — a second classification problem
stacked on the first. No content-check backstop is built; resurfacing stays prompt-discipline (§3 step 5,
§6.3), by deliberate choice, not by omission.

---

## Cohesion note — what was reconciled, and how

The mandate for this revision was zero holes, zero contradictions, zero dead code, zero duplicated constants,
and harmony with the three shipped hooks, the foreman protocol, and the just-shipped memory-cap feature.
Here is everything found while folding Vector's ruling in, and how each was closed:

1. **`PreCompact` never existed — six mentions corrected.** The prior draft speculated a `PreCompact` hook in
   §4.B's closing note and in §8-Q2. There is no such hook in this codebase's evidence base; the real
   mechanism is `SessionStart`/`matcher: "compact"`. Every mention is now that, not the old guess (§4.C, §8-Q2,
   and the Revision note above).

2. **Write-only audit was dead code waiting to happen.** The prior draft's `otto-goal-audit.mjs` wrote a flag
   line nobody ever read — exactly the hole the mandate calls out by name. Fixed by specifying the reader in
   the same breath as the writer (§6.1): both `SessionStart` hooks emit `goal_flags=N` from the same shared
   `countGoalFlags` helper, and `agents/otto-foreman.md` gets the instruction to surface it. Writer and reader
   now ship as one unit — §7 has a dedicated positive test asserting the two readers agree with each other and
   with the writer, not just that each works in isolation.

3. **The gear/tier/box audit had no firing gate — a silent false-positive machine.** Vector's ruling described
   the check-set (conditional on §4's outcome) but not *when* the audit should run at all. Un-gated, it would
   flag every legitimately-small dispatch in any project that ever had a goal file, forever. Closed by gating
   the entire audit (both checks) on `.claude/otto-goal.md` having `status: active` for this project — a
   proxy that's cheap and deterministic, imperfect on mixed-gear projects, and the imprecision is now named
   explicitly rather than silently accepted (§6.1, and a new non-goal row in §2).

4. **Stale flags from a retired goal would leak into a new goal's count.** The flag log is append-only with no
   mention of resetting on retire/amend — a brand-new goal in a project with old, unrelated flags would
   inherit their count. Closed by scoping `countGoalFlags` to the active goal's own `confirmed:` date, reusing
   a field the artifact already carries rather than adding a new one (§6.1, with a dedicated negative test in
   §7).

5. **The `PERSONA_ROOT_MARKERS` duplication scar was about to get a third copy.** `otto-state.mjs` and
   `otto-facts.mjs` already carry two independently-hardcoded copies of the same three-item array — a planned
   unification (`docs/spec-persona-guard-22.8.1.md`'s "22.9-D2") that never actually shipped, confirmed by
   reading both files: the comment says "unified in 22.9-D2," the constant is still duplicated in both, today.
   **This spec does not fix that pre-existing debt** (out of scope for a goal-contract spec), but it does stop
   the bleeding going forward: `otto-goal-lib.mjs` imports `cwdPersonaRoot` from `hooks/otto-facts.mjs` rather
   than hardcoding a third array. Flagging the pre-existing duplication to Gantry/Otto as a small, separate
   fast-follow is worth doing but is not this spec's job.

6. **Cross-hook-file imports are new for this codebase, and that's a real, deliberate departure worth
   naming, not quietly doing.** `hooks/otto-trace.mjs`'s own header explains its `bareType()` is "duplicated
   rather than imported because hook scripts are invoked standalone via `node <file>` per hooks.json and
   cannot import one another" — read narrowly, that's about avoiding one *hook* importing another *hook's*
   entry point, not a hard technical wall against a shared, non-hook module: each hook is still invoked as
   `node hooks/whatever.mjs`, and a relative `import ... from './otto-goal-lib.mjs'` resolves fine regardless
   of how the entry script was launched (`import.meta.url` resolves off the actual invoked path, which
   `hooks.json` already passes as an absolute `${CLAUDE_PLUGIN_ROOT}` path). This spec relies on that reading
   twice — `otto-goal-lib.mjs` importing `cwdPersonaRoot` from `otto-facts.mjs` (item 5), and `otto-facts.mjs`
   importing `readActiveGoal`/`countGoalFlags` from `otto-goal-lib.mjs` (§6.1) — both are new patterns for this
   plugin. **Flagged as a build-time verify item for Bitforge**, not assumed: confirm the import resolves
   correctly under the real `hooks.json` invocation shape before relying on it, and if it doesn't for some
   Claude-Code-specific reason, the fallback is the old duplication pattern, not a stalled build.

7. **A fourth `ROBOTS` map was avoided on purpose.** `otto-state.mjs` and `otto-trace.mjs` each carry their own
   hand-synced copy of the crew roster, and that duplication is already a known, accepted, validate.mjs-gated
   cost in this codebase. `otto-goal-audit.mjs` does not add a third copy: its flag lines record the raw
   `subagent_type` string verbatim, no badge/name resolution, because a diagnostic flag line has no need for a
   pretty badge the way a human-facing relay line does (§6.1). One fewer place a future hire can go missing
   from.

8. **Lock-file contention between the two `PostToolUse`/`"Task"` hooks was checked, not assumed away.** With
   `otto-goal-audit.mjs` now a second entry in the same matcher array as `otto-state.mjs`, both are pure
   side-effect writers with no shared mutable state; `otto-goal-audit.mjs` gets its own lock directory
   (`.claude/.otto-goal.lock`), distinct from `otto-state.mjs`'s `.otto-state.lock`, so the two never contend
   (§6.1).

9. **`validate.mjs` gets two new drift gates, matching its existing convention rather than inventing a new
   one.** The single-`updatedInput`-emitter check (§4.A) and a single-source check that `ANCHOR_SENTINEL` /
   `ANCHOR_CHAR_CAP` are defined exactly once, in `otto-goal-lib.mjs`, and nowhere else — same shape as the
   existing `PROFILE_CHAR_CAP` cross-check between `otto-facts.mjs` and `docs/profile-schema.md`.

**Confirmation:** §2 through §8 and this note now carry no contradiction against each other, against the
shipped hooks (`otto-state.mjs`, `otto-facts.mjs`, `otto-trace.mjs`), or against `agents/otto-foreman.md`'s
session-open protocol, "Announcing a handoff," and "Compaction" sections. Every `PreCompact` reference is
corrected to `SessionStart`/`compact`. The audit has a named reader. The files-touched table below and the
test list in §7 cover every file this document now describes. Ready for Gantry to sequence.

---

## Files touched

| File | What changes |
|---|---|
| `hooks/otto-goal-lib.mjs` | **NEW.** Shared: `readActiveGoal`, `renderAnchorBlock`, `ANCHOR_SENTINEL`, `ANCHOR_CHAR_CAP`, `goalFlagsPath`, `countGoalFlags`, `writeGoalFlag`, `AUDIT_LOG_CAP`. Imports `cwdPersonaRoot` from `otto-facts.mjs`. |
| `hooks/otto-goal-inject.mjs` | **NEW, conditional on §4's spike confirming feasibility.** `PreToolUse`. |
| `hooks/otto-goal-compact.mjs` | **NEW.** `SessionStart`/`compact`. Built regardless of §4's outcome. |
| `hooks/otto-goal-audit.mjs` | **NEW.** `PostToolUse`, second entry under the existing `"Task"` matcher. Built regardless of §4's outcome; check-set conditional on it. |
| `hooks/hooks.json` | + `PreToolUse` `"Task"` section (conditional); + `SessionStart` `matcher: "compact"` entry; + second hook in the existing `PostToolUse`/`"Task"` array. All `"type": "command"`, `node`, `timeout: 5` — never `"type": "script"` (proven silent no-op, `docs/hook-events.md`). |
| `hooks/otto-facts.mjs` | + `goal_flags=N` fact line (only when `N > 0`), via `otto-goal-lib.mjs`'s `readActiveGoal`/`countGoalFlags`. First cross-hook-file import in this plugin — see Cohesion note item 6. |
| `docs/hook-events.md` | + build-task-1's six-criterion capture, recorded the same way the existing `PostToolUse`/`SubagentStop` sections are — real payload, not documentation. |
| `agents/otto-foreman.md` | + capture/confirm/pin/resurface/amend/retire prompt-discipline (lifecycle §3); + the `[Dispatch contract]` line requirement (§6.1); + §4.B's hand-composed anchor rule, conditional on the spike; + surfacing `goal_flags=N` at checkpoint/session-open. |
| `.claude/otto-goal.md` | The artifact itself — runtime-created, not shipped. Gitignore-recommended, same as `otto-state.md`. |
| `.claude/otto-goal-flags.log` | The audit's flag sink — runtime-created, not shipped. Same gitignore recommendation. |
| `scripts/test-otto-goal.mjs` | **NEW.** Full suite, §7. |
| `scripts/validate.mjs` | + single-`PreToolUse`-`updatedInput`-emitter gate; + `ANCHOR_SENTINEL`/`ANCHOR_CHAR_CAP` single-source gate (same convention as the existing `PROFILE_CHAR_CAP` cross-check). |
| `docs/spec-goal-contract.md` | This document. |

## Summary for Otto/Gantry

Capture → confirm → pin → inject → resurface → amend → retire, one active record per project at
`.claude/otto-goal.md`, human-confirmed at write and at every amend/retire — never inferred. Fires only on
feature/build gears, never on answer/small-change. **Injection is settled architecture** — §4.A, deterministic
`PreToolUse` mutation — gated by one real-capture spike (`build-task-1`) that confirms implementation details a
design ruling can't verify alone; degrades cleanly to prompt-discipline + audit (§4.B) if that spike disproves
feasibility, and the build does not stall either way. **Compaction preservation is now fully deterministic**
(§4.C, `SessionStart`/`compact`), independent of the injection fork — this was the biggest upgrade from the
prior draft. The gear/tier/box mandate stays prompt-discipline by nature (a live per-dispatch judgment, not
static file content), but its audit is deterministic, gated on active-goal-status to avoid false-flagging
small work, and — the fix that mattered most in this revision — **now has a reader**: both `SessionStart`
hooks surface `goal_flags=N` so a write-only, silently-dead check never ships. Drift vs. pivot is always
surfaced to the human, never classified (§5). Mid-run checkpointing has no deterministic backstop, named
plainly with three concrete reasons why (§6.2). The `Stop`-hook resurfacing idea is resolved as deliberately
deferred (§6.3, §8-Q3) — same natural-language-frontier trap as the terminal-clear detector, twice already.

Files: see the table above. Ready for Gantry to sequence into `TASKS.md`.
