# Spec — the spend report (honest business report, no jargon)

**For:** Bitforge (build) + Cathode (viewer/terminal render revision) + Vector (tier-capture mechanism) +
Baudrate (flag logic + honesty), sequenced by Gantry · **By:** Patchbay (Product), out of an Otto
Reality-Check-style Q&A + a Cathode design shotgun — the decisions below are already made; this spec turns
them into buildable shape, it does not relitigate them.
**Baseline:** main @ `d09ab4b` (v22.12.0) · **Version:** none pinned — Gantry assigns at release.

---

## 1. Problem statement

RobotInc already logs what every dispatch costs — `hooks/otto-trace.mjs`'s SubagentStop hook writes one line
per subagent completion to `otto-ledger.log` (robot, tokens, duration, project). Nobody sees it unless they
think to ask Baudrate. The data exists; the *report* doesn't. The user asked, plainly: how and when should we
show the spend we already track?

Two things are worth surfacing, and they are different:

1. **What did this cost, honestly** — per robot, per department, with the crew's approximate/blended numbers
   kept visibly separate from Otto's own unmeasured estimate. Not a bill. A business report.
2. **Was the effort proportionate to the work** — the one finding a human actually wants from a spend report:
   not "here are the numbers" but "here's the one that looks wrong." A quick fix that cost as much as a full
   review is worth a look; five runs that all cost what they should is not news.

Both already have a home: Baudrate reads the ledger on request today and already runs a spend-vs-tier audit
(`agents/baudrate-cfo.md`). What's missing is a **report shape** (terminal + viewer), a **surfacing model**
(when it shows up unasked, gated the same way the goal anchor is gated), and — the one hard constraint the
user was explicit about — **it must never teach the human the word "tier."** The dial that computes the flag
stays entirely backstage.

## 2. Scope

**In:**
- Terminal report at three zoom levels, all rendering the *same* underlying data (§5): the full box-drawn
  ledger (Option 1), a terse rules-not-grid inline reply (Option 2), and an exception-first one-line digest
  (Option 3).
- The viewer's statement-style rendered page (§6), reading the live ledger, revised from Cathode's mockup to
  drop the two things the user ruled out.
- The plain-language proportionality flag (§8) — shape, threshold, basis, and wording, per Baudrate's ruling.
- The surfacing model (§7): a build-end one-line footer, user-dialable via a new `otto-profile.json` field,
  gear-gated identically to the goal anchor.
- Files touched, tests, and the two decisions Vector and Baudrate closed this round (§10, §11).

**Explicitly out:**

| Cut | Why |
|---|---|
| Dollar figures anywhere in the report | The ledger's token count is a blended approximation (§4) — it cannot support billing precision. Tokens + the plain-language flag carry the value; a fake-precise `$` figure is a fake invoice. Cathode's mockup has one (`≈ $1.63 illustrative compute`) — it comes out. |
| The words "tier" / "WORKSHOP" / "T1" / "T2" / "T3" in any user-facing surface | Hard constraint, non-negotiable. The tier is captured and consumed **only** internally to compute the flag. Cathode's mockup has a visible "Declared tier" column with tier pills — it comes out, replaced by the plain-language flag column (§6, §8). |
| Otto's own main-thread spend blended into crew totals | Baudrate's existing honesty rule, unchanged and re-affirmed here (§4) — shown separately, labeled, never summed. |
| A new deterministic script that renders the terminal report | Options 1–3 are Baudrate composing prose from real ledger lines, same footing as today's on-request behavior — not a new code path that has to be maintained in lockstep with the prompt. The build-end footer is the one exception (§7) and it's deliberately *not* a Baudrate dispatch, for cost reasons stated there. |
| Billing/Stripe integration, invoicing, per-customer chargeback | Out of scope for this feature entirely — this is an internal activity report, not a monetization surface. |
| A UI/slash command to toggle the new profile field | Same "beginner never learns a command" constraint as every other profile field — it's set the way `verbosity` is: Otto asks, gets a yes, writes it. |

## 3. What exists today (read before building)

- `hooks/otto-trace.mjs` (SubagentStop hook, lines ~111–260) — writes `otto-ledger.log`, one line per
  subagent completion: `<ISO> [<project>] <robot> tokens=<N> duration_ms=<M>`. Tokens are the **final
  message's own usage snapshot** (input+output+cache, blended, not a per-turn sum) — documented in-file as
  approximate, never a cost-tier breakdown. Best-effort, fails silently if Node or the transcript is missing.
- `agents/baudrate-cfo.md` — reads the ledger **on request**, reports per-robot spend, runs a spend-vs-tier
  audit today, and is already required to label numbers as estimates and never blend Otto's main-thread spend
  into crew totals. This spec extends, not replaces, that paragraph.
- `viewer/server.mjs` + `viewer/README.md` — the local Activity Window already reads `otto-trace.log` and
  `otto-ledger.log` on every poll and joins them by timestamp (`buildLedgerIndex()`). No pixel art yet — this
  is Cathode's pass.
- `viewer/spend-report-mockup.html` — Cathode's approved visual direction (paper-statement feel, hero cards,
  department bar rows, a per-robot table, an audit callout). Two things in it are explicitly overruled by the
  user and must be revised, not just left as "future polish": the `$` estimate line, and the "Declared tier"
  column with `tier-pill` styling.
- `agents/otto-foreman.md`, "Rigor tiers" — WORKSHOP / T1 / T2 / T3, and the `[Dispatch contract]
  gear=… tier=… box=… verify=…` line every feature/build dispatch already carries. `hooks/otto-goal-audit.mjs`
  already parses `gear=`/`tier=`/`box=`/`verify=` as substrings off the dispatch prompt (PostToolUse), for
  presence-only, never semantic, auditing.
- `agents/otto-foreman.md`, "The goal anchor" — the existing final-summary moment (restate confirmed goal +
  how it was verified + offer to retire) is the surface this feature's build-end footer rides, on purpose
  (see §7's cohesion note).

## 4. Data source, and the honest measured-vs-estimated split

One source of truth: `otto-ledger.log` (or `<config>/otto-ledger.log` if there's no project). Every rendering
in this spec — terminal Options 1/2/3, the viewer statement — reads the **same** lines, never a second copy of
the arithmetic.

**Scoping to "this effort."** A report needs a boundary or it's just "spend since forever." The natural,
already-existing boundary is the active goal anchor: when `.claude/otto-goal.md` reads `status: active`, scope
the report to ledger lines where `project == basename(cwd)` **and** `timestamp >= <the anchor's `confirmed:`
date>`. No active anchor (viewer opened cold, or a project that never captured one) → the report falls back to
the whole ledger for that project, same as Baudrate's on-request behavior today. This reuses infrastructure
that already exists rather than inventing a new "effort" concept — flag it to Gantry/Bitforge as an assumption
if a cleaner boundary turns up during build, but it is not one of the two decisions Vector and Baudrate closed
in §10.

**The honest split, non-negotiable, carried over from Baudrate's existing doctrine and re-affirmed here:**

| Figure | Label | Never |
|---|---|---|
| Crew subagent tokens (sum of the scoped ledger lines' final-message snapshots) | **"Crew-measured (approx.)"** | Presented as billing-grade, or as a precise dollar cost |
| Otto's own main-thread spend | **"Otto · main thread (estimate)"**, derived from context length + turn count | Summed into the crew figure, in this report or any other, ever |

Both figures render, always, side by side, never combined into one number. This is the one rule every
rendering below must satisfy — it's the honesty test in §9.

**No ledger line is ever summed twice (Vector, §4 label seam).** Every rendering reads the same scoped window
of ledger lines and reads each one once. The footer re-appearing at the end of a *second* build under the same
un-retired goal anchor is not double-counting — it is the same running window, re-read, still scoped to one
`confirmed:` timestamp. This is why the report is labeled **"this effort," never "this build":** the goal
anchor bounds the *effort* (everything since the human confirmed this goal), not any one build inside it. Two
sequential builds under one anchor correctly show the *same growing total* in both footers — that is the
effort accumulating, not a line counted twice. **No active anchor** (viewer opened cold, or a project that
never captured one) degrades the label one step further, past "this effort," to **"recent activity"** — never
the false "this build," and never an invented effort boundary from session start (see §5 and §7 for where this
degrade shows up).

## 5. Terminal report — three zoom levels, one dataset

Same underlying report (department rollup + per-robot rows + the flag, §8), rendered at three levels of
detail. All are Baudrate's own composed prose reading real ledger lines — not a new deterministic script (see
§2's cut list) — so the box-drawing/format below is a **visual contract** Baudrate's prompt must follow, not
new code.

**Option 1 — full expansion.** On request, or reached by expanding the build-end footer. Per-robot token
bar-chart, department rollup table, the flag — using Baudrate's **full flagged template** (§8):

```
┌─ Spend report — this effort ─────────────────────────────────────────────┐
│ 6 subagent runs · ~20m30s measured · crew-measured 544.7K tok (approx.)  │
│ Otto (main thread, estimate) ~64.0K tok — separate, never summed above   │
├───────────────────────────────────────────────────────────────────────┤
│ By department                                                            │
│ Research      ████████████████████████████████████  187.3K   34%        │
│ Architecture  ███████████████████████████████        138.4K   25%        │
│ Engineering   ███████████████████████████████        138.0K   25%        │
│ QA            ██████████████                          58.9K   11%        │
│ Product       █████                                    22.1K    4%        │
├───────────────────────────────────────────────────────────────────────┤
│ Per robot                                                                │
│ 🔷 Sonar       Research      187.3K   6m50s                              │
│ 🟣 Vector      Architecture  138.4K   5m40s                              │
│ 🔩 Bitforge    Engineering    96.2K   3m05s   ⚠ see below                │
│ 🔘 Glitchtrap  QA             58.9K   2m20s                              │
│ 🔩 Bitforge    Engineering    41.8K   1m40s                              │
│ 📋 Patchbay    Product        22.1K   0m55s                              │
├───────────────────────────────────────────────────────────────────────┤
│ ⚠ Bitforge's quick fix cost about 2.3× its own typical run in           │
│   Engineering this effort (~96K vs ~42K) — worth a look.                 │
└───────────────────────────────────────────────────────────────────────┘
```

No active goal anchor → the box header reads `Spend report — recent activity` instead (§4, §7's no-anchor
degrade) — everything else renders the same.

**Option 2 — Baudrate's inline reply** (terse, rules-not-grid; when asked directly in chat). No box-drawing,
no table — three lines, in the same rhythm as Baudrate's existing house style. Third line uses Baudrate's
**terse flagged template** (§8):

```
Spend this effort: 544.7K tok crew (approx.) + ~64.0K Otto (est., separate — never summed).
By department: Research 187.3K · Architecture 138.4K · Engineering 138.0K · QA 58.9K · Product 22.1K.
⚠ Bitforge's quick fix cost as much as a much bigger job (~96K vs its own ~42K) — worth a look.
```

Zero flags is never silence, and it is never one calm negative — it's one of Baudrate's **two honest
calm-negatives** (§8's 4th state), and the report must say which:

- **Clean** (2+ comparable runs existed to check against, none flagged): `Spend looked proportionate across
  all 6 runs.`
- **No-data** (too few same-scope runs this effort to compare anything against): `Not enough same-scope runs
  this effort to compare — no audit finding either way.`

**Option 3 — exception-first digest** (the build-end footer, §7). One line. Leads with the exception if there
is one; otherwise a neutral total, never both, never more than one line. Uses the same terse flagged template
as Option 2, and the same two calm-negatives when there's nothing to flag:

```
💰 ~545K tok this effort (approx.) — Bitforge's quick fix cost as much as a much bigger job (~96K vs its own ~42K) — worth a look. Say "spend report" for the full breakdown.
```

or, no flag, clean:

```
💰 ~545K tok this effort (approx., + ~64K Otto est.) — spend looked proportionate across all 6 runs. Say "spend report" for the breakdown.
```

or, no flag, no-data:

```
💰 ~545K tok this effort (approx., + ~64K Otto est.) — not enough same-scope runs this effort to compare. Say "spend report" for the breakdown.
```

No active goal anchor degrades every one of the above from "this effort" to "recent activity" (§4, §7) — the
numbers and the flag/calm-negative logic are unaffected, only the noun changes.

## 6. Viewer report — the statement view

`viewer/spend-report-mockup.html` is the approved visual direction (paper-statement feel, hero cards,
department bars, per-robot table, audit callout) — **wired to the live ledger and revised per §2's cuts.**

- **Promote** the mockup to a real page (`viewer/spend.html`, served by `viewer/server.mjs` alongside the
  existing `index.html` route) rendering live data from a new `/spend` endpoint (§9) instead of the hardcoded
  sample rows currently in the file.
- **Drop** the `hero-estimate` card's `≈ $1.63 illustrative compute…` sentence entirely (§2). The card keeps
  the Otto-estimate token figure and its "never summed" note — just no dollar conversion.
- **Drop** the "Declared tier" column and every `.tier-pill` / `.tier-workshop` element from the per-robot
  table. Replace it with the plain-language flag (§8): the existing `Flag` column's `⚠`/`·` icon stays, and
  the flagged row's plain-language sentence renders in the audit callout below the table exactly as it does
  today structurally — just with Baudrate's revised, tier-free wording, using the **full flagged template**
  (§8, same one Option 1's callout uses) — e.g. "⚠ Bitforge's quick fix cost about 2.3× its own typical run in
  Engineering this effort (~96K vs ~42K) — worth a look." The mockup's current audit text says "declared
  `WORKSHOP`" and "`T2` targeted-board runs" — both are jargon and must not survive into the real page, and
  `scripts/validate.mjs`'s no-jargon scan (§9) covers this exact file to catch it.
- **Zero flags** renders one of Baudrate's two calm-negatives (§8's 4th state) in the audit callout, never a
  blank callout: "Spend looked proportionate across all N runs" (clean) or "Not enough same-scope runs this
  effort to compare — no audit finding either way" (no-data) — same distinction, same wording, as Option 2/3.
- **Masthead noun follows §4's degrade:** "this effort" when an active goal anchor scopes the page, "recent
  activity" when there isn't one — never "this build." Everything else in the mockup (hero cards, department
  bar rows, the measured-vs-estimated footnote) carries over as-is — it already satisfies the honesty split in
  §4.
- `viewer/README.md` gets a new bullet under "What it shows" describing the statement view and its route.

## 7. Surfacing model

**Default: a one-line footer at the end of a feature/build effort**, riding the *same* final-summary moment
the goal anchor already uses to restate the confirmed goal and offer to retire it (`agents/otto-foreman.md`,
"The goal anchor") — same message, one more line, not a second summary. This is deliberate cohesion, not
economy: the human already reads that message once; a second unsolicited message would be the thing that gets
muted.

**Gear-gated, identically to the goal anchor, no exception:** fires only when `gear=feature` or
`gear=build` for the effort just completed. **Never** on an answer or a small change — over-reporting spend on
a one-line question is the same relationship-ender the goal anchor's own gate exists to prevent, and it uses
the same reasoning, not a new one.

**The footer's noun (Vector's §4 label seam):** the footer says **"this effort,"** not "this build" — the goal
anchor bounds the whole effort, and a second build under the same un-retired goal correctly re-shows the same
growing effort total, not a double-count (§4). If there's no active anchor to bound anything, the footer
degrades one step further to **"recent activity"** (or, at `on-request`, the bare pointer with no noun at
all) — never a fabricated build boundary invented from session start.

**Cost note, worth stating plainly:** the default footer is composed **directly by Otto** from the ledger
lines he already has to read for the scoping in §4 — it is *not* a Baudrate subagent dispatch. A spend report
that costs a subagent dispatch to produce is the report undermining its own point. Baudrate is dispatched only
when the human actually asks for more (Option 1/2 on request) or when `spendReporting: verbose` asks for the
full expansion every time — in both cases a human decision justified the extra tokens.

**User-dialable via a new `otto-profile.json` field**, read the same way `verbosity` is (§9 for the schema
change):

| `spendReporting` | Behavior |
|---|---|
| `off` | No proactive mention, ever. Ledger stays readable if the human asks Baudrate directly — that capability isn't gated by this dial. |
| `on-request` | Same silence as `off`, plus the final summary adds a bare pointer with no numbers: *"(spend report available — just ask)."* |
| `build-end` **(default)** | The Option 3 one-line digest (§5) rides the final summary. |
| `verbose` | The full Option 1 expansion (§5) prints at the final summary — no collapsed footer step. |

On-request spend reporting (asking Baudrate directly, any time) is unaffected by this dial at every setting —
it already exists today and stays exactly as it is.

## 8. The plain-language proportionality flag (Baudrate's ruling — RESOLVED)

**Basis: self-comparison, not a crew-wide band.** The comparison is a robot against *itself*: this robot's
OTHER same-tier, same-department runs this effort. No blend against a crew-wide band in v1 — a band across
different robots/departments would be fabricated precision, not a real signal. If 2 or more prior comparable
runs exist, the basis is their **median**; if exactly 1 exists, that single prior run *is* the basis; if none
exist, there is no basis (§8's 4th state, below).

**Threshold — all three conditions required, together (this is the false-alarm protection):**

| Condition | Rule | Why |
|---|---|---|
| (i) Ratio | actual ≥ 2× basis | Below 2× is inside ordinary run-to-run noise |
| (ii) Absolute gap | actual − basis ≥ 15K tokens | Kills ratio explosions off tiny numbers (e.g. 3K vs 1K is "3×" and means nothing) |
| (iii) Basis floor | basis ≥ 10K tokens | Below this, "expected" isn't a stable enough anchor to measure against |

A flag fires only when all three hold. Any one failing means no flag — not a softer flag, no flag at all.

**The 4th state (Baudrate's honesty catch).** "Checked and found clean" and "had nothing to check" are
different findings, and collapsing them into one calm-negative would eventually claim a clean audit on a build
that was never actually auditable. Two distinct calm-negatives, never blurred:

- **Clean** — 2 or more comparable runs existed this effort, all checked, none flagged: *"Spend looked
  proportionate across all {N} runs."*
- **No-data** — too few same-scope runs this effort to compare (every run is a singleton in its
  robot/department/tier bucket, or there's only one run total): *"Not enough same-scope runs this effort to
  compare — no audit finding either way."*

A flag can still fire off a single prior run (the threshold's three conditions are the false-alarm guard, not a
minimum sample size) — the N≥2 requirement is specifically for asserting the *calm* "all clean" finding with
confidence, not for permitting a flag. Bitforge: if a report has a mix of evaluable and singleton rows and none
flag, treat it as clean whenever at least one row had a real basis to check against; flag the exact edge case
to Gantry during build if it reads differently once real ledger data is in hand — same footing as §4's existing
flagged assumption.

**Shape** (fixes the data contract and where it renders):

```
flag = {
  robot: string,                 // e.g. "Bitforge"
  department: string,            // e.g. "Engineering"
  tokensActual: number,          // this run's ledger tokens
  tokensExpected: number|null,   // the self-comparison basis (median of priors, or the single prior) — null if priorRunCount is 0
  priorRunCount: number,         // count of this robot's other same-tier, same-department runs this effort used to form the basis
  ratio: number|null,            // tokensActual / tokensExpected, rounded for the template — null when tokensExpected is null
  flagged: boolean,              // true only when all three threshold conditions hold
  comparisonBasis: string,       // "median-of-priors" | "single-prior" | "none" — internal only, never rendered
  message: string|null,          // Baudrate-authored, plain language, names the OUTCOME never the DIAL; null when flagged is false (the calm-negative is a report-level string, not per-row)
}
```

`comparisonBasis`, `priorRunCount`, `ratio`, and every internal tier value are **never rendered** — only
`message` (when `flagged`) or the report-level calm-negative string (when not) reaches a human, in any of the
three terminal zoom levels or the viewer's audit callout.

**Phrasing templates — tier-free, `~`-rounded to the nearest K, never `$`.** `{descriptor}` is drawn fallback-only from "this pass" or "this run", deliberately NOT extracting a task word from free text — consistent with the codebase's avoidance of free-text classification. **Never a dial name**, never "tier"/"WORKSHOP"/"T1-3":

- **Flagged, full** (§5 Option 1's callout, §6's viewer audit callout): *"⚠ {Robot}'s {descriptor} cost about
  {ratio}× its own typical run in {Department} this effort (~{actualK} vs ~{expectedK}) — worth a look."*
- **Flagged, terse** (§5 Option 2's third line, Option 3's headline): *"⚠ {Robot}'s {descriptor} cost as much
  as a much bigger job (~{actualK} vs its own ~{expectedK}) — worth a look."*

**This spec fixes the shape, the threshold, the basis, the 4th state, and the templates** — the placement was
already fixed (§5 Option 1's ⚠ row + callout, Option 2's third line, Option 3's headline, §6's Flag column +
audit callout) and stays as designed. This is an **extension of Baudrate's existing on-request spend-vs-tier
audit** (`agents/baudrate-cfo.md`), not a new posture, and the terse template matches Baudrate's existing house
voice (§9).

## 9. Files touched

| File | Change |
|---|---|
| `hooks/otto-trace.mjs` | **Tier-capture mechanism, Vector's ruling, RESOLVED (§10, mechanism (a)).** `computeLedgerEntry` gains a second pass over the *same* in-memory transcript JSONL list it already reads for tokens: locate the first `message.role === 'user'` entry, serialize its `message.content` to text, run `/tier=(\S+)/`, capture group 1. Returns `{tokens, durationMs, tier}` — `tier` is `null` unless captured, computed in its own guard *after* tokens/duration so malformed content never takes down the token write. The ledger line gains a trailing ` tier=<T>` **only when captured** — omitted entirely when null, never `tier=` empty, never `tier=null`. No new file, no second hook, no join, no lock. |
| `viewer/server.mjs` | `parseLedgerLine` gains an optional trailing `(?:\s+tier=(\S+))?` group, default `null` — same optional-segment pattern already used for `[project]`; all legacy/no-tier lines parse to `tier: null`, never rewritten. New `/spend` endpoint: reads the ledger scoped per §4, computes department rollup + per-robot rows, groups this robot's other same-tier/same-department runs to compute the flag basis (§8) or renders the correct calm-negative when `priorRunCount` is 0 report-wide. Add a robot→department display-label normalizer (the existing `role` field is already department-shaped for most robots — Engineer→Engineering, Architect→Architecture — this is a small mechanical mapping, not a new identity table). |
| `viewer/spend-report-mockup.html` → `viewer/spend.html` | Promote + revise per §6: drop `$` line, drop tier column/pills, wire to `/spend`, use Baudrate's full flagged template + the two calm-negatives (§8). |
| `viewer/README.md` | Document the new statement view. |
| `agents/baudrate-cfo.md` | Add: owns flag threshold/basis/4th-state/wording (§8, now resolved, no longer a placeholder); Option 2's terse inline format (§5) as the shape an on-request reply takes; existing honesty paragraph (measured-vs-estimated, on-request ledger read) stays, unchanged. |
| `agents/otto-foreman.md` | Add: build-end footer (§7) riding the goal anchor's existing final-summary moment; gear-gating (feature/build only, same reasoning as the anchor); reads `spendReporting` off `otto-profile.json`; footer noun is "this effort" (or "recent activity" with no active anchor), never "this build" (§4, §7). |
| `docs/profile-schema.md` | Add `spendReporting` field: enum, default, one-line description, in the "whole file" example next to `verbosity`; add this file to the "five/six files" cross-reference list at the top. |
| `scripts/validate.mjs` | New check: no user-facing string literal in `viewer/spend.html`, `viewer/server.mjs`'s response strings, or `agents/otto-foreman.md`'s/`agents/baudrate-cfo.md`'s report-composing prose contains `tier`, `WORKSHOP`, `T1`, `T2`, or `T3` (case-insensitive substring scan, same footing as the existing VS16 scan). **Scan-exclusion seam (Vector, folded into §9 and §11):** the scan MUST exclude `otto-ledger.log` and `hooks/otto-trace.mjs`'s tier-writing literal — the ledger legitimately stores `tier=WORKSHOP` backstage and the hook is the capture mechanism itself; the scan covers rendered surfaces only, never the backstage ledger or the hook that writes it. Cross-check `spendReporting`'s enum in `agents/otto-foreman.md` against `docs/profile-schema.md`'s stated enum (same pattern as the existing `PROFILE_CHAR_CAP` drift check). |
| `scripts/test-otto-trace.mjs` | Add: `extractTier` over first-user-message fixtures (all 4 dispatch-contract values + absent-tier → null + a quote-collision fixture); ledger-line serialization carries `tier=` when present and omits it entirely when null; `parseLedgerLine` round-trips tier and maps legacy no-tier lines to `tier: null`. |
| `scripts/test-spend-report.mjs` (new) | Real-filesystem tests, same convention as `scripts/test-otto-trace.mjs`: department rollup math, flag shape + threshold (all three conditions, individually and together), self-comparison basis (median of 2+, single of 1, none of 0), the two-calm-negative distinction (§11), gear-gating (§11 negative test), no-jargon scan incl. the scan-exclusion seam (§11 negative test), measured-vs-estimated separation never blended. |
| `docs/spec-spend-report.md` | This file. |

## 10. Decisions closed this round (formerly open questions — both halves RESOLVED)

### Vector's ruling — how the ledger captures the declared tier (RESOLVED)

The ledger line has no tier field today (`<ISO> [<project>] <robot> tokens=<N> duration_ms=<M>`). `tier=`
lives only in the dispatch prompt, which the ledger writer never sees. Of the candidate mechanisms raised —
**(a)** parse the tier out of the subagent transcript's first user message inside the existing SubagentStop
hook, or **(b)** have `hooks/otto-goal-audit.mjs`'s PostToolUse hook write a sidecar keyed for a later join —
**mechanism (a) is chosen, (b) is rejected.** `hooks/otto-trace.mjs`'s SubagentStop hook already opens
`agent_transcript_path` for tokens; tier is a second pass over the *same* in-memory JSONL list inside
`computeLedgerEntry` — no new file, no second hook, no join, no lock, and tokens+tier come from one read so
they can never disagree. (`hooks/otto-goal-audit.mjs` is *not* a tier-capture site — it stays exactly as it is
today, presence-only parsing of `gear=`/`tier=`/`box=`/`verify=` off the dispatch prompt, unrelated to this
mechanism.)

**The parse:** `computeLedgerEntry` returns `{tokens, durationMs, tier}` (`tier` null unless captured). Locate
the **first** `message.role === 'user'` entry in the transcript; serialize `message.content` to text (string
as-is, or `join('')` the `.text` of `type: 'text'` blocks — the same technique the hooks docs already
prescribe for `tool_response.content`); run `/tier=(\S+)/`, capture group 1 = `WORKSHOP|T1|T2|T3`, raw value,
no normalization. Scanning is scoped to the *first* user message only, so a subagent quoting `tier=` in its own
later output can't corrupt the capture. Tier is computed **after** tokens/duration, in its own guard — malformed
content yields `tier: null`, and never takes down the token write.

**Ledger format — append-compatible, trailing:** `<ISO> [<project>] <robot> tokens=<N> duration_ms=<M>` gains
an optional ` tier=<T>` **written only when captured** — omitted entirely when null, never `tier=` empty, never
`tier=null`. `parseLedgerLine` gains `(?:\s+tier=(\S+))?`, default null — the same optional-segment pattern it
already uses for `[project]`. All legacy/no-tier lines parse to `tier: null`; old lines are never rewritten.

**Scan-exclusion seam (folds into §9 + §11):** the new `validate.mjs` no-jargon scan (forbidding
"tier"/"WORKSHOP"/"T1-3" in user-facing output) **must exclude `otto-ledger.log` and
`hooks/otto-trace.mjs`'s tier-writing literal** — the ledger legitimately stores `tier=WORKSHOP` backstage and
the hook is the capture mechanism itself. The scan covers rendered surfaces (`viewer/spend.html`,
`server.mjs`'s response strings, `otto-foreman.md`'s/`baudrate-cfo.md`'s report prose), never the backstage
ledger or the hook that writes it — without this exclusion the scan false-positives on its own mechanism.

**Spike = build-task-1** (Bitforge runs, gates the rest of the build): capture a real `gear=build`/`feature`
dispatch on 2.1.211 where Otto composed a `[Dispatch contract]` with `tier=`, and read the raw subagent
transcript.

- **Criterion 1 (THE GATE):** the first `role: user` entry, serialized to text, contains the FULL `[Dispatch
  contract]` line + `tier=<value>`, byte-identical, not truncated or summarized. **Pass →** build mechanism
  (a). **Truncated or absent →** stop, fall back to mechanism (b) (sidecar + join), and re-spike before
  proceeding.
- **Criterion 2:** SubagentStop reads it correctly on the background-default path.
- **Criterion 3:** `tier=` absent from a transcript degrades gracefully to `tier: null` — the row still renders
  tokens/duration/department, the flag is simply absent, no throw, and never a literal `tier=null` string
  anywhere.
- **Criterion 4:** the regex captures all four dispatch-contract values, stops at whitespace, and is safe
  against quote-collision in the surrounding prompt text.

**Degradation if tier can't be reliably captured:** the report still ships regardless of which mechanism wins
the spike. Tokens, duration, robot, and department are real regardless — only §8's flag depends on tier, since
"was this proportionate to what was declared" needs the declaration. Missing tier on a row: the flag field
(§8) is simply `null`/absent on that row, and every rendering (§5, §6) already has to handle zero flags
gracefully — a missing flag on one row degrades the same way, not a new failure mode.

### Baudrate's ruling — the flag logic and its honesty (RESOLVED)

Fully specified now in §8: self-comparison basis (median of 2+ priors, the single prior if only 1, no basis if
0), the three-condition threshold (ratio ≥2×, gap ≥15K, basis floor ≥10K — all three required), the 4th state
(clean vs. no-data, never blurred), and both phrasing templates (full and terse), all tier-free and
`~`-rounded. This is confirmed as an **extension** of Baudrate's existing on-request spend-vs-tier audit
(`agents/baudrate-cfo.md`), not a new posture. The measured-vs-estimated honesty labeling stays exactly as
documented in `agents/baudrate-cfo.md` today — this spec doesn't reopen it, just re-affirms it applies to
every new surface (§4).

## 11. Tests

**Positive:**
- A ledger with known token/duration values renders the correct department rollup percentages and per-robot
  bar widths in the viewer's `/spend` response and in a hand-checked Option 1 rendering.
- Crew-measured and Otto-estimate figures render side by side, separately labeled, in all four surfaces
  (Option 1, 2, 3, viewer) — never summed into one number anywhere.
- A flagged row's `message` appears verbatim in Option 1's callout, Option 2's third line, Option 3's headline
  (when it's the reason for the digest), and the viewer's audit callout — same text, four places.
- **Tier extraction (Vector):** `extractTier` over first-user-message fixtures covering all four dispatch-
  contract values (`WORKSHOP`/`T1`/`T2`/`T3`), a fixture with no `tier=` present → `null`, and a
  quote-collision fixture (surrounding prompt text containing a stray `tier=` outside the dispatch contract,
  or quoted inside a later message) → still extracts the correct first-user-message value, never the decoy.
- **Ledger round-trip (Vector):** a written line carries `tier=<T>` when captured and omits the segment
  entirely when null (never `tier=` empty, never `tier=null`); `parseLedgerLine` round-trips both, and legacy
  lines with no `tier=` segment at all parse to `tier: null`.
- **Threshold math (Baudrate):** each of the three conditions (ratio ≥2×, gap ≥15K, basis floor ≥10K) is
  tested individually — failing any single one alone must suppress the flag even when the other two would
  pass — and together on a case built to pass all three.
- **Self-comparison basis (Baudrate):** 2+ priors → basis is their median; exactly 1 prior → basis is that
  single run; 0 priors → `tokensExpected: null`, `flagged: false`, contributes to the no-data finding.
- **The two calm-negatives are distinguished, never blurred (Baudrate's 4th state):** a report with 2+
  comparable runs and no flags renders "Spend looked proportionate across all N runs"; a report where every
  run is a singleton in its robot/department/tier bucket (or there's only one run total) renders "Not enough
  same-scope runs this effort to compare — no audit finding either way" — same fixture set must produce the
  *correct one*, not either one, at each scenario.
- Zero flags renders the correct one of the two documented calm-negative lines in every surface (§5, §6) —
  never blank, never silent, never the wrong one of the two.
- `spendReporting: off` / `on-request` / `build-end` / `verbose` each produce the exact behavior in §7's table
  against the same completed build.
- **The "this effort" / "recent activity" label (Vector's §4 seam):** an active goal anchor scopes the report
  and every rendering's noun reads "this effort"; no active anchor degrades every rendering's noun to "recent
  activity" — never "this build," and a second build under the same un-retired anchor re-shows the same
  growing total without asserting it was summed twice.
- Missing/unreadable ledger (fresh machine, nothing has run) renders an honest empty state, not an error, on
  every surface — same fail-soft posture as the rest of this hook family.

**Negative — the critical two:**
- **A small-change or answer-gear dispatch must NEVER emit a spend footer, under any `spendReporting`
  setting.** Simulate a completed answer/small-change effort and assert no footer line appears in the final
  summary, at all four dial settings.
- **No user-facing output, on any surface, may ever contain the substrings "tier", "WORKSHOP", "T1", "T2", or
  "T3" (case-insensitive) — with the scan-exclusion seam applied correctly.** Scan Option 1/2/3 sample
  renderings, the viewer's `/spend` HTML output, and every string literal `scripts/validate.mjs`'s new check
  covers (§9), while confirming the scan explicitly **excludes** `otto-ledger.log` and
  `hooks/otto-trace.mjs`'s tier-writing literal (Vector's scan-exclusion seam) — the test must assert both
  that rendered surfaces are caught AND that the ledger/hook are not false-flagged. This must catch the
  mockup's own current violations (`tier-pill`, "declared `WORKSHOP`", "`T2` targeted-board runs") before they
  ship, not just future regressions.

## 12. Done

- Terminal Options 1/2/3 render from the same live ledger data, in Baudrate's voice, gear-gated per §7, labeled
  "this effort" (or "recent activity" with no active anchor) everywhere — never "this build."
- The viewer's `/spend.html` reads live data, matches §6's revised design (no `$`, no tier column), and renders
  the correct one of Baudrate's two calm-negatives when there's nothing to flag.
- `otto-profile.json` carries `spendReporting`, documented in `docs/profile-schema.md`, defaulting to
  `build-end`, consistent everywhere with `agents/otto-foreman.md`'s read of it.
- **Vector's tier-capture spike (build-task-1) has run and passed its gate** (§10, Criterion 1) — mechanism (a)
  is live in `hooks/otto-trace.mjs`, or the fallback to mechanism (b) was triggered and re-spiked before the
  rest of the build proceeded.
- **Baudrate's flag logic is fully implemented per §8**: three-condition threshold, self-comparison basis,
  the 4th state's two distinct calm-negatives, both phrasing templates — none of it a placeholder anymore.
- The flag ships `null`/degraded on any row where tier truly can't be captured, per §10's documented fallback —
  never silently blocking the rest of the report.
- Every test in §11 passes, especially the two negative ones and the tier-extraction / scan-exclusion /
  two-calm-negative additions.
