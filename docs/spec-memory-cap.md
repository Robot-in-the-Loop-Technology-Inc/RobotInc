# Spec — memory cap for `otto-profile.json`

**For:** Bitforge · **By:** Patchbay (Product), grounded by Sonar's source-level read of Hermes Agent (Nous
Research, Tier 1 memory) · **Owner:** Patchbay until handoff; Gantry sequences into `TASKS.md`
**Baseline:** main @ `9f81ac8` (v22.9.0, released) · **Version:** none pinned — Gantry assigns at release.

---

## 1. Problem statement

`otto-profile.json` is the one file that carries who the human is across every session (`docs/profile-schema.md`
§1). Otto reads it on the first turn of every session, and — unlike the state files — nothing bounds it. It has
exactly one write gate today: **show the human the change and get a yes** (`docs/profile-schema.md` line 7,
`agents/otto-foreman.md` line 697). Consent is checked on every write. *Size* is checked on none.

Five writers touch it (`commands/otto.md`, `skills/roll-call`, `skills/hiring-round`, `skills/workspace-hygiene`,
`skills/claude-code-tuneup`), each appending to arrays that only ever grow: `style.prefers` / `avoid` /
`declined`, `org.prefer` / `shadowed`, `workspace.neverTouch`. None of them evict. A profile six months into
real use is not the ~620-char example in the schema doc — it is that example plus a year of accumulated
`declined` offers and `neverTouch` globs, with no floor under it. It grows silently, is paid for on every turn
forever, and nothing ever tells the human it happened.

**The borrowed pattern.** Hermes Agent (Sonar, source-verified) solves the identical problem for its own
Tier-1 memory: `USER.md` capped at 1,375 chars, `MEMORY.md` at 2,200 — a hard character ceiling, not tokens,
not summarization, not eviction, enforced synchronously at write time inside a deterministic tool. An
over-budget write returns an error string listing current entries and forces the model to consolidate and
retry in the same turn. No model sits inside the enforcement path; the model decides *what* to cut, the check
itself is pure string length.

`otto-profile.json` is RobotInc's exact analog of `USER.md` — same content (identity, preferences, org
config), same session-start injection, same "paid for on every turn." It is the one growing surface with no
cap.

## 2. Scope

**In:** `otto-profile.json` only.

**Explicitly out, and why:**

| Surface | Why it's already bounded |
|---|---|
| `otto-state.md` / `otto-state-global.md` | Already cap-8 by recency eviction (`hooks/otto-state.mjs`) — a 9th item displaces the oldest, unconditionally. Re-capping an already-capped surface is churn, not a fix. |
| The SessionStart facts block | Regenerated fresh every session from existence checks and (first-run-only) an inventory scan — it does not accumulate across sessions; there is nothing here for a cap to catch. |
| `otto-trace.log` / `otto-ledger.log` | Append-only history logs, not always-on context — never read at session start, only on `/standup` or a Baudrate spend query. Out of the always-on budget entirely. |

`otto-profile.json` is the only file in this list with no eviction, no regeneration, and always-on injection.
That combination is the whole problem; capping the others would be solving a problem they don't have.

## 3. The fork, resolved: hybrid — prompt-side prevention, deterministic backstop

Hermes enforces inside a deterministic tool because every `USER.md` write goes through one. RobotInc has no
such tool: `otto-profile.json` is written by Otto (the model, main thread) via ordinary Read/Edit calls, after
conversational consent. Pure write-time deterministic enforcement doesn't map across — there is no chokepoint
to put a synchronous check inside.

Two candidates, and why neither wins alone:

- **(A) Session-start read-time enforcement** — extend `hooks/otto-facts.mjs` (same family as
  `hooks/otto-state.mjs`, `hooks/otto-trace.mjs`: deterministic, no model, fail-silent) to measure the profile's
  on-disk size and inject a loud over-budget fact if it's past cap. Deterministic and un-rottable — but it is a
  **backstop**, not a gate: bloat can land mid-session and isn't caught until the *next* session opens.
- **(B) Write-time prevention in `agents/otto-foreman.md`** — a hard rule: before any profile write, measure
  the projected size; if it would exceed cap, refuse and consolidate first. Catches bloat before it lands — but
  it is a **prompt rule**, model-enforced, and this crew's own doctrine says a rule held only by discipline
  will rot silently (`docs/doctrine.md`; also the exact failure this plugin already lived through once: the
  prompt-driven relay-state write in `agents/otto-foreman.md` measured **0/15** on its own, which is the
  reason `hooks/otto-state.mjs` exists as its mechanical backstop today).

**Decision: hybrid, mirroring the relay-writer precedent exactly.** Otto gets the write-time rule (B) so bloat
is prevented in the common case. `hooks/otto-facts.mjs` gets the deterministic backstop (A) so the cap holds
**even if B is ignored, forgotten, or silently edited out of the prompt later** — the same shape as
`agents/otto-foreman.md` hand-writing a relay line *and* `hooks/otto-state.mjs` deterministically backstopping
the same write. Structure-beats-wording: the backstop is the thing that actually enforces the cap; the prompt
rule only reduces how often the backstop has to fire. If Andrew wants to ship one first, **A is the one that
cannot be deferred** — it is the only piece that survives a prompt regression.

**Build scope, resolved: A only.** The design above stays hybrid — this is still the right shape for the
problem — but *this build ships mechanism A alone*. Mechanism B (§5.2's write-time prevention, and its open
question on the per-write estimate, §8 Q2) is **deferred** to a possible fast-follow, taken up only if A proves
to fire too often in practice. Reasoning: profile bloat accumulates over months, not within a session — a
profile that crosses the cap mid-session is simply caught at the next session open, which costs nothing real
(no data loss, no leaked spend, one session's delay before the human hears about it). B is also, by its own
nature, a prompt rule and not unit-testable (§6 flags this directly), while A is fully unit-testable end to
end — the seven-case table in §5.1 is a complete deterministic spec with no live-reproduction QA gate needed.
Shipping the testable, unrottable half now and holding the prompt-rule half for evidence of real need is the
cheaper sequencing; B can be added later without touching anything A does.

## 4. The budget: 2,000 characters, measured via `.length`

**Unit:** character count via `.length` on the string returned from `readFileSync(path, 'utf8')` — the same
convention `hooks/otto-facts.mjs` already uses for `INV_CHAR_CAP` (1,800 chars). Deliberately not "on-disk file
size" or "raw UTF-8 byte length" — nobody should reach for `Buffer.byteLength` here and move the fence; `.length`
counts UTF-16 code units on the in-memory string, which is what `INV_CHAR_CAP` already measures, and this cap
must stay pinned to the same unit or the two will silently drift apart. Characters, never tokens: a Node hook
has no tokenizer and Hermes deliberately avoids needing one for the same reason. No code-point-safe
(surrogate-pair) handling is needed here, unlike `otto-state.mjs`'s `summarize()` — that function *truncates*
text and must not split a glyph; this check only *measures and refuses*, it never cuts a string, so a plain
`.length` is exact and sufficient.

**Reasoning for 2,000:**

- The fully-populated schema example (`docs/profile-schema.md`'s own `jsonc` block, every optional key
  present: `style`, `org`, `workspace`, `lastTuneup`) is **~620 chars pretty-printed, ~436 minified** —
  measured directly from the doc. That is what a *complete, realistic* profile looks like today.
- Hermes' closest analog, `USER.md`, caps at 1,375 chars. RobotInc's schema carries more structural surface
  than Hermes' free-prose file (an `org` block and a `workspace` block Hermes has no equivalent of), so pricing
  strictly at Hermes' number would cap out a legitimately full profile with almost no room for the arrays that
  are the actual growth vectors (`style.prefers/avoid/declined`, `org.prefer/shadowed`, `workspace.neverTouch`).
- 2,000 chars gives roughly **3x the fully-populated baseline** — enough headroom that a normal profile never
  trips it, but a profile that has quietly accumulated a year of `declined` entries will.
- Against the platform reality: the whole always-on RobotInc footprint measures **~2,933 tokens**
  (`claude plugin details`, v22.6.0, agent + skill descriptions). 2,000 chars is roughly 400–500 tokens at
  typical JSON density — a bounded ~15–17% of that footprint, never the majority of it, which is the "small,
  bounded fraction" this constraint asks for.
- Round and statable in one sentence to a Visionary: *"about two thousand characters — a page, not a
  chapter."*

**Single source of truth.** The number lives in exactly one place — a named constant,
`PROFILE_CHAR_CAP = 2000`, in `hooks/otto-facts.mjs` — and `docs/profile-schema.md` states it in prose,
cross-checked by `scripts/validate.mjs` (§7) so the two can never quietly disagree, the same discipline already
applied to the `ROBOTS` maps in `otto-state.mjs`/`otto-trace.mjs`.

## 5. The over-budget UX

### 5.1 What the hook emits (deterministic, §3's mechanism A)

`hooks/otto-facts.mjs`'s `computeFacts()` already reads `otto-profile.json`'s existence for the `profile` fact.
Extend it with **two orthogonal facts**, per Vector's ruling on the corrupt-profile fail mode (§8 Q1, RESOLVED):

- **SIZE** — measured from the raw string returned by `readFileSync(path, 'utf8')`, via `.length`, with **no
  parsing involved at all**. Drives `profile_size` and `profile_over_budget` (`size > PROFILE_CHAR_CAP`).
- **VALIDITY** — a separate axis: attempt `JSON.parse` on that same string. Success computes the
  `profile_entries` manifest; failure emits `profile_valid=false`.

**Load-bearing ordering: measure size BEFORE attempting the parse.** A parse failure must never erase the size
signal — the exact case this cap exists to catch (a profile that is both corrupt *and* enormous) depends on
`profile_over_budget` firing from the size check no matter what the parse does afterward.

`profile_over_budget` is **three-state**: `true | false | unknown`. `unknown` means ONLY "couldn't read the
bytes" — `existsSync` found the file but `readFileSync` threw (`EISDIR`, `EACCES`, a delete race). `unknown`
never means corrupt; a corrupt-but-readable file still has a real byte length and gets a real `true`/`false`
from that length alone.

**Emission table — seven cases, implement verbatim:**

| # | Case | Emitted lines |
|---|---|---|
| 1 | Valid, under budget (happy path) | `profile_over_budget=false` — one line only |
| 2 | Valid, over budget | `profile_size`, `profile_cap`, `profile_over_budget=true`, `profile_entries=...` |
| 3 | **Corrupt AND large (the target case)** | `profile_size`, `profile_cap`, `profile_over_budget=true`, `profile_valid=false` — **no** `profile_entries` (parse failed; over-budget already fired loud from size alone) |
| 4 | Corrupt AND small | `profile_size`, `profile_cap`, `profile_over_budget=false`, `profile_valid=false` |
| 5 | Empty file | `profile_size=0`, `profile_cap`, `profile_over_budget=false`, `profile_valid=false` — degenerate case of 4, no special-casing |
| 6 | Present but unreadable (`readFileSync` throws) | `profile_over_budget=unknown` |
| 7 | Missing | none — the existing `profile=absent` line already carries it |

**Emission rules:**
- Emit `profile_size` + `profile_cap` together whenever any anomaly holds (`over_budget=true` OR `valid=false`).
- Emit `profile_valid=false` whenever the parse fails, at any size.
- Emit `profile_entries` ONLY when the parse succeeds **and** `over_budget=true` (case 2, and only case 2).

Example, case 2 (valid, over budget):

```
profile_size=2143
profile_cap=2000
profile_over_budget=true
profile_entries=seats(2),tier,verbosity,scale,style.prefers(5),style.avoid(3),style.declined(6),org.prefer(4),org.shadowed(1),workspace.neverTouch(8),lastTuneup
```

Example, case 3 (corrupt and large — no entries, size fired anyway):

```
profile_size=2143
profile_cap=2000
profile_over_budget=true
profile_valid=false
```

Under cap and valid (case 1): `profile_over_budget=false` only — silent, matching every other fact in this
block. `profile_entries` is a **key + count-of-array-entries** manifest, never the values themselves — enough
for Otto to say *"your `declined` list has 6 entries, `neverTouch` has 8"* without the hook doing any judgment
about which one is safe to drop. That judgment is Otto's and the human's, never the hook's.

**Fail-soft: three nested catches, in this order.**

1. `readFileSync` try/catch → catch degrades to `profile_over_budget=unknown` (case 6). Nothing else is
   computed; there is no string yet to measure.
2. `JSON.parse` try/catch → catch degrades to `profile_valid=false`, `profile_entries` omitted. `profile_size`
   and `profile_over_budget` were already computed **before** this parse ran (the load-bearing ordering above)
   and are left untouched by this catch — this is what makes case 3 possible.
3. Outer catch — last resort for a genuinely unexpected throw elsewhere in the computation → omit the new lines
   entirely, same fail-soft footing as the rest of this file.

The corrupt cases (3 and 4) never reach the outer catch; they are fully handled by catch 2, with size already
locked in from before catch 2 ever ran.

### 5.2 What Otto says (model-driven, reacting to mechanism A's fact)

New rule in `agents/otto-foreman.md`, session-open protocol: if `profile_over_budget=true`, before anything
else, say so in plain language and drive consolidation — never a command, never jargon:

> *"Your saved profile has grown past its size — mostly your `declined` list (6 entries) and `neverTouch`
> globs (8 entries). Want to go through them and cut what's stale, or merge a few together?"*

Otto lists what's in each oversized block (from `profile_entries`, or by reading the file directly — the hook
gave counts, not content, so a values-level conversation still needs a Read), the human says what to drop or
merge, Otto edits the file, shows the diff, gets a yes — the existing consent gate, run one more time, for a
deletion instead of an addition.

**Deferred: write-time prevention.** §3's mechanism B — firing this same conversation *pre-emptively*, before
any of the five writers appends to the file, so a would-be-over-budget write is refused up front rather than
caught at the next session open — is out of scope for this build (§3, build scope). Nothing above changes if B
ships in a fast-follow: it would run the identical conversation, only triggered earlier.

### 5.3 Consent model for dropping entries

Dropping a saved preference is a one-way door — the same doctrine gate as any other consequential action.
**Never auto-drop, never pick for the human, never silently drop the oldest entry** (that would be the
`otto-state.md` eviction model, and it is wrong here: state lines are disposable work history, profile entries
are *chosen preferences* — losing one is data loss, not tidying). The human sees the full list of what's in the
oversized block(s) and chooses; Otto may recommend (*"these three `declined` entries look like duplicates of
one preference — merge?"*) but the human's yes is what executes it, per-drop or per-merge, never a blanket
"clear the list."

## 6. Negative test and positive test

Both land in `scripts/test-otto-facts.mjs`, same real-filesystem-scratch-dir convention already used there —
no mocking.

- **Negative test — valid, over budget (case 2, must trip loud):** write a scratch `otto-profile.json`,
  valid JSON, deliberately padded past 2,000 chars (e.g. `style.declined` with 40 synthetic entries). Call
  `computeFacts()` against it. Assert: `profile_over_budget === true`, `profile_size` equals the real byte
  length measured independently in the test, `profile_entries` is present and correctly counts each array
  field, and the rendered `formatFacts()` output contains all three new lines. Also assert the file on disk is
  **byte-identical before and after** the hook runs — the hook only reads and measures, it never writes, never
  truncates.
- **Negative test — corrupt AND large (case 3, THE TARGET CASE):** write a scratch profile padded past 2,000
  chars that is also unparseable (e.g. the same padded JSON with its closing brace stripped). Assert
  `profile_over_budget === true` (not `unknown`, not `false`, not absent), `profile_size` equals an independent
  measurement, `profile_valid === false`, `profile_entries` is **absent**, and the rendered `formatFacts()`
  output contains the substring `"profile_over_budget="` — the anti-silent tooth: this is the one case a naive
  "parse failure omits everything" implementation would swallow. Assert the file on disk is byte-identical
  before and after.
- **Negative test — corrupt AND small (case 4) + empty (case 5):** two scratch profiles — one small
  malformed-JSON file, one zero-byte file. For both, assert `profile_over_budget === false`,
  `profile_valid === false`, `profile_size` correct (`0` for the empty case), `profile_entries` absent.
- **Negative test — unreadable (case 6), no mocking required:** create a scratch *directory* named
  `otto-profile.json` (not a file) — `existsSync` reports present, `readFileSync` throws `EISDIR`, a
  deterministic mock-free way to hit the read-error path. Assert `profile_over_budget === 'unknown'`.
- **Positive test (case 1, must stay silent):** write a scratch profile at the fully-populated schema-example
  size (~620 chars), valid JSON. Assert `profile_over_budget === false`, no `profile_entries` or `profile_valid`
  line in the rendered output, and the rest of the facts block (`config_dir`, `sentinel`, …) is unchanged from
  today's shape — this cap adds exactly one boolean's worth of behavior change on the happy path: nothing.
- **Boundary case:** a profile at exactly 2,000 chars is **not** over budget (`>`, not `>=`, matching
  `INV_CHAR_CAP`'s own `<=` convention in `applyTruncation()`) — worth one explicit assertion so the fencepost
  is never left to inference.
- **Out of scope for this build:** §5.2's write-time prevention (mechanism B) is deferred (§3) — no test for it
  lands here. If B ships in a fast-follow it will need a live-reproduction QA check (does Otto actually stop
  and consolidate before writing when the projected size crosses cap?), not a unit test — it is model behavior,
  the same class as the relay-writer's prompt-driven half. The deterministic backstop above (mechanism A) is
  what must never be allowed to depend on that check passing.

## 7. Files touched

| File | Change |
|---|---|
| `hooks/otto-facts.mjs` | Add `PROFILE_CHAR_CAP = 2000` constant; measure `otto-profile.json` size in `computeFacts()` **before** attempting any parse; emit `profile_size` / `profile_cap` / `profile_over_budget` (three-state: true/false/unknown) / `profile_valid` / `profile_entries` per the seven-case table (§5.1). Fail-soft via three nested catches: `readFileSync` throws → `profile_over_budget=unknown`; `JSON.parse` throws → caught locally, `profile_valid=false`, entries omitted, but `profile_size`/`profile_over_budget` were already computed and are left untouched; only a genuinely unexpected throw elsewhere omits the new lines entirely. Never a crash, never a corrupt-and-large file silently reading as under budget. |
| `scripts/test-otto-facts.mjs` | Add the seven-case negative, positive, and boundary tests from §6. |
| `agents/otto-foreman.md` | Session-open protocol: new step — if `profile_over_budget=true`, run the plain-language consolidation conversation (§5.2) before anything else. **That is the only change to this file for this build** — no new pre-write hard rule near the existing consent gate; the write-time prevention mechanism (B) is deferred (§3). |
| `docs/profile-schema.md` | New short section stating the 2,000-char cap in prose, the rationale one-liner, and that it is enforced in `hooks/otto-facts.mjs` — this doc is the schema's one definition (line 1) and must not let the cap live only in code comments. |
| `scripts/validate.mjs` | New gate: `PROFILE_CHAR_CAP` in `hooks/otto-facts.mjs` matches the number stated in `docs/profile-schema.md`'s prose — same drift-prevention convention already applied to the `ROBOTS` maps, so the number can't silently diverge between the two places that state it. |

No change to `commands/otto.md`, `skills/roll-call/SKILL.md`, `skills/hiring-round/SKILL.md`,
`skills/workspace-hygiene/SKILL.md`, or `skills/claude-code-tuneup/SKILL.md` — each already routes its profile
writes through Otto's consent gate, and this build adds no pre-write hook to that gate at all (mechanism B is
deferred, §3), so none of the five writers change.

## 8. Open questions for Vector

1. **Parse-failure semantics — RESOLVED.** Vector's ruling, folded in verbatim in substance:

   Split into two orthogonal facts. SIZE is measured from the raw string (`readFileSync` → `.length`, **no
   parse**) and drives `profile_size` + `profile_over_budget` (`size > cap`). VALIDITY is a separate axis:
   `JSON.parse`; on failure emit `profile_valid=false`; on success compute the `profile_entries` manifest.

   **Load-bearing ordering:** measure size *before* attempting the parse, so a parse failure can never erase
   the size signal.

   `profile_over_budget` is three-state: `true | false | unknown` — where `unknown` means ONLY "couldn't read
   the bytes" (`existsSync` present but `readFileSync` threw: `EISDIR`/`EACCES`/a delete race). `unknown` never
   means corrupt. Corrupt is `profile_valid=false`, orthogonal, at any size.

   The seven-case emission table (§5.1) is implemented verbatim: (1) valid/under budget — one line; (2)
   valid/over budget — full breakdown with entries; (3) corrupt AND large, **the target case** — size, cap,
   `over_budget=true`, `valid=false`, no entries; (4) corrupt AND small — size, cap, `over_budget=false`,
   `valid=false`; (5) empty file — degenerate case of 4, no special-casing; (6) present but unreadable —
   `over_budget=unknown`; (7) missing — nothing new (the existing `profile=absent` line already carries it).

   Emission rules: emit `profile_size` + `profile_cap` together whenever any anomaly holds (`over_budget=true`
   OR `valid=false`); emit `profile_valid=false` whenever parse fails at any size; emit `profile_entries` only
   when parse succeeds *and* `over_budget=true` (case 2 only).

   Fail-soft = three nested catches: (1) `readFileSync` try/catch → `unknown`; (2) `JSON.parse` try/catch →
   `valid=false`, entries omitted, size/`over_budget` already computed and untouched; (3) outer catch = last
   resort for a genuinely unexpected throw → omit. The corrupt case never reaches the omit path.

   This **overrides** the earlier draft of §7's wording ("a read/parse error degrades to omitting the new lines
   entirely") — that was wrong for the parse case and has been rewritten (§7): parse error is caught locally
   (`valid=false`, size preserved, does not omit); read error → `unknown`; only an unexpected throw omits.

   §6 was extended with the corrupt-AND-large, corrupt-small/empty, and unreadable-via-scratch-directory
   negative tests this ruling requires.

2. **Where the per-write estimate (§5.2, mechanism B) actually runs — DEFERRED, out of scope for this build.**
   Moot for now: mechanism B itself is deferred (§3, build scope) until A proves to fire too often in practice.
   If B is picked up in a fast-follow, this question — a one-line shared convention so five skills don't each
   invent their own "current size + planned delta" estimate heuristic — should be answered before that build
   starts, not during it.

---

**Summary for Otto/Gantry:** design = hybrid (§3), but **this build ships mechanism A only** — the
deterministic read-time cap in `hooks/otto-facts.mjs`. Mechanism B (write-time prevention in
`agents/otto-foreman.md`) is deferred to a possible fast-follow, taken up only if A fires too often in
practice; §8 Q2 (its per-write estimate convention) is deferred with it. Budget = 2,000 chars, measured by
`.length`, never a parse. Two orthogonal facts per Vector's ruling on §8 Q1 (RESOLVED): `profile_over_budget`
(three-state — true/false/unknown, driven by size alone, size measured before any parse is attempted) and
`profile_valid` (driven by `JSON.parse`, independent of size) — the seven-case table in §5.1 is authoritative,
and the corrupt-and-large case (case 3) is the one this whole cap exists to catch loud rather than swallow.
Fails loud via those facts plus a plain-language Otto conversation at session open (§5.2), never silent
truncation, never omitted on a corrupt-and-large file. Consent-gated per-drop, same gate the file already
lives under. Five files touched; `agents/otto-foreman.md`'s change is session-open only, no new pre-write rule
this round; none of the five profile-writing skills themselves change.
