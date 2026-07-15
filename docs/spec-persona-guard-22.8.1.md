# Spec — Persona-root guard for local-state reads and writes (hotfix v22.8.1)

**Owner:** Vector (Architect) · **Builds:** Bitforge · **Verifies:** Glitchtrap
**Repo:** `C:\development\RobotInc` · **Base:** `main` @ `2810e51` (v22.8.0, released) · **Status:** working-tree spec, not committed
**Track:** hotfix-ASAP (Andrew-approved) · **Rigor:** T3 — consent / persona-boundary property, no shortcuts; scope stays hotfix-sized.
**Amends:** ruling (a) in `docs/spec-facts-inventory-22.8.0.md` §8a, which shipped and inverted its own intent.
**Rev:** adds S5 (model-driven hand-write) after Glitchtrap live-reproduced a fifth surface at `4bd3f72`.

---

## 1. The defect, precisely

Ruling (a) shipped as: read local state only when `cwd_is_config_dir=false`, where the hook computes

```
cwd_is_config_dir  =  realpath(<cwd>/.claude) === realpath(<active configDir>)
```

That boolean compares `<cwd>/.claude` against **this session's** config dir. The threat it is standing in for is
"`<cwd>/.claude` is a persona root" — **any** machine's real Otto identity, not only the active one. The two are
not the same set, and the gap is a live data leak:

| # | cwd_is_config_dir | Real-world layout | Old behavior | Correct |
|---|---|---|---|---|
| 1 | **true** | default user at home; `<cwd>/.claude` == active config | blocked (same file both ways) | block |
| 2 | false | genuine project dir | permitted | permit |
| 3 | **false** | `CLAUDE_CONFIG_DIR` relocated (sandbox); `cwd`=home, so `<cwd>/.claude` is the user's **real** `~/.claude` | **permitted — the leak** | **block** |

Case 3 is the original morning repro: a relocated-config sandbox session rendered Andrew's real
`~\.claude\otto-state.md` work table verbatim, "welcome back" and all. `cwd_is_config_dir` compares against the
*sandbox* config, so a foreign persona root reads `false` and passes the gate. The boolean structurally cannot
separate case 2 from case 3.

**Affected population:** anyone launching from a directory whose `.claude` holds someone's real identity while
`CLAUDE_CONFIG_DIR` points elsewhere — multi-profile users, CI/eval harnesses, and RobotInc's own documented
sandbox-testing recipe (self-triggering).

### 1.1 The defect is a discriminator, not a call site — it has five surfaces

The same "compare against the active config dir" logic guards the persona boundary in **five** places. The
observed repro ("welcome back **and** the table") already lit up two of them at once. A hotfix that patches only
step 5 leaves the persona boundary open through the other four — including **two** that **write** to the real
file, one of which (S5) is a model-driven prose write the S4 hook cannot backstop when the model writes directly:

| # | Surface | File | Op | What leaks in case 3 | Severity |
|---|---|---|---|---|---|
| S1 | Step 1, override (a) — card suppression | `agents/otto-foreman.md` | read | reads foreign `otto-state.md` as "we've met" → suppresses the fresh card, emits "welcome back" | high |
| S2 | Step 5 — brief render *(the originally-named task)* | `agents/otto-foreman.md` | read | renders the foreign work table verbatim | high |
| S3 | Inventory `inv_agents_project` double-count guard | `hooks/otto-facts.mjs` | read | enumerates the foreign `~/.claude/agents` ids into the session inventory | low (ids only, first-run only) |
| S4 | Local relay write guard (hook backstop) | `hooks/otto-state.mjs` | **write** | **appends a sandbox relay line into the real `~/.claude/otto-state.md` on every Task dispatch — mutates real data** | **high (one-way door)** |
| S5 | "Announcing a handoff" step 2 — Otto's **own prompt-driven** upsert (the *primary* write; S4 is only its backstop) | `agents/otto-foreman.md` | **write** | **model Read+Edit hand-writes a relay line into the foreign persona's real `otto-state.md`, bypassing the S4 guard entirely — live-reproduced twice at `4bd3f72`, the second time with a HEALTHY hook** | **high (one-way door)** |

> **The two write surfaces (S4, S5) are why the hotfix cannot stop at a read guard.** Both mutate another
> persona's real file — one-way doors, worse than the read the hotfix is named for. S5 is the *primary* write
> (the model's own hand-write); S4 is its deterministic backstop. Glitchtrap proved they are independent: a
> healthy S4 hook does **not** save S5, because the model writes the file directly, at relay time, before the
> hook fires. Closing S2 alone — or even S1–S4 — would let us announce green while the model keeps hand-writing
> the foreign file. This ruling closes all **five** surfaces of the one defect; §8 carries only
> genuinely-separable follow-ups. If Andrew splits it, **the two write surfaces (S4, S5) are the ones that must
> not be deferred.**

---

## 2. The discriminator (Glitchtrap's candidate — evaluated, adopted with a correction)

Glitchtrap proposed gating on whether `<cwd>/.claude` **is a persona root** instead of whether it equals the
active config dir. Adopted, with one correction: it must be **in addition to**, not instead of,
`cwd_is_config_dir` — neither predicate subsumes the other.

**Definition.** `<cwd>/.claude` is a *persona root* iff it holds any of the three config-dir-exclusive identity
artifacts:

```
cwd_persona_root  =  exists(<cwd>/.claude/otto-profile.json)
                  OR exists(<cwd>/.claude/.otto-met)
                  OR exists(<cwd>/.claude/otto-state-global.md)
```

**Blocking condition (all five surfaces).** Treat `<cwd>/.claude` as *not a plain project* — skip the local
read, skip the local write, omit `inv_agents_project` — when **either**:

```
cwd_is_config_dir === true   OR   cwd_persona_root === true
```

Local state is project evidence only when **both** are false.

**Why OR of two predicates, and why neither alone.**

- `cwd_is_config_dir` catches `<cwd>/.claude` being *this session's active config* — including a **markerless**
  one (a brand-new user at home, session 1, before any profile/sentinel exists, but with a hand-placed
  `otto-state.md`). `cwd_persona_root` is blind to this (no markers yet). This is why case 1 keeps blocking on
  `cwd_is_config_dir`, exactly as Andrew argued: local-in-configDir is never a legitimate hook write target
  (the writer's own `localDir !== configDir` guard guarantees it), so a local read there only ever surfaces
  hand-written or inherited files — block it, and block it *explicitly*, not as an accident of the other guard.
- `cwd_persona_root` catches `<cwd>/.claude` being *any other* machine's persona root (case 3), which
  `cwd_is_config_dir` is blind to because it compares against the wrong (relocated) config.
- The union covers both. Two orthogonal blind spots, one OR.

**Why OR across the three markers (not AND).** The failure is asymmetric: a false negative (missing a persona
root) re-opens the leak; a false positive (mis-flagging a genuine project) costs only a skipped brief render or a
skipped convenience write — cosmetic, self-correcting. Fail toward detection. AND would also miss half-onboarded
persona roots (a migration-gap profile with no `.otto-met`; a `.otto-met` written before seats). Each of the
three markers is **config-dir-exclusive** — none ever legitimately appears in a genuine project's `.claude/`
(they are per-machine identity/global-state, not per-project), so any one present is sufficient and decisive.
`otto-state.md` is deliberately **not** a marker: it is the one file a genuine project legitimately owns, so it
cannot discriminate.

**realpath / edge cases.**

- The persona-root probe is three existence checks, not a path comparison — **no `normalizeForCompare` needed**.
- `existsSync` **follows symlinks**: a `<cwd>/.claude` symlinked to a real config dir reads its markers and is
  correctly flagged a persona root (acceptance R15).
- No `<cwd>/.claude` at all → all three absent → `cwd_persona_root=false`, and there is no `otto-state.md` to
  read/write either — the guard is moot, correctly.
- **Error polarity.** Wrap the whole `cwd_persona_root` computation in a try/catch; on any throw, return
  **`true`** (fail toward block), mirroring the inventory's `inv=error` isolation. Note the one accepted residual:
  `fs.existsSync` never throws — it returns `false` on `EACCES` — so an unstat-able marker reads absent
  (fail-toward-permit). Blast radius is nil for the primary leak: the case-3 markers are the user's *own*
  fully-readable `~/.claude` from their own session. This residual is identical in class to the core facts'
  `existsFlag → 'absent'`-on-error choice already shipped; rule it explicitly, do not add `statSync` gymnastics
  in a hotfix.

---

## 3. Facts-block change (`hooks/otto-facts.mjs`)

### 3.1 New fact key

Add one **core** boolean fact: **`cwd_persona_root`**. It is existence-derived (three `existsSync` checks) — same
class and same privacy footing as `sentinel`/`profile`, never a content read — so it belongs in the core object,
computed **every session** (not gated on first-run), alongside `cwd_is_config_dir`.

Wire position: immediately after `cwd_is_config_dir`, before `inv`. The core block goes from six lines to
**seven**:

```
[RobotInc facts] authoritative -- do NOT shell out to recompute:
config_dir=/Users/x/.claude
sentinel=absent
profile=absent
state_local=absent
state_global=absent
cwd_is_config_dir=false
cwd_persona_root=false      <- NEW (7th core line)
inv=ok
...inv_* lines as before...
```

### 3.2 `cwd_is_config_dir` — KEEP (checked every consumer first)

Do **not** remove it. Consumers verified in this repo:

| Consumer | Uses it for | After this hotfix |
|---|---|---|
| `otto-foreman.md` step 1 override (a) — S1 | card-suppression guard | now `... AND cwd_persona_root=false` |
| `otto-foreman.md` step 5 — S2 | local-read guard | now `... AND cwd_persona_root=false` |
| `otto-foreman.md` "Announcing a handoff" step 2 — S5 | *(was unguarded)* local hand-write | now `... AND cwd_persona_root=false`, fail-toward-skip (§4.4) |
| `otto-facts.mjs` `gatherInventory` — S3 | `inv_agents_project` double-count guard | omit when `cwdIsConfigDir OR cwdPersonaRoot` |

No self-heal / seat-question logic reads `cwd_is_config_dir`; nothing else in `otto-foreman.md` consumes it.
It remains load-bearing as half of the OR (the markerless-active-config case 1) — removing it re-opens case 1.

### 3.3 Inventory guard (S3)

In `gatherInventory(...)`, the `inv_agents_project` scan is currently gated `if (!cwdIsConfigDir)`. Change to
`if (!cwdIsConfigDir && !cwdPersonaRoot)`. Thread `cwd_persona_root` into `gatherInventory` the same way
`cwd_is_config_dir` already is. When omitted, `inv_agents_project` stays entirely absent from the wire format
(the existing `null`-not-`[]` convention), not rendered empty.

---

## 4. Consumer changes — `agents/otto-foreman.md`

Three prose edits (S1, S2, S5) plus the count updates. Exact wording below.

### 4.1 Step 1 — the "six core keys" language (three spots)

Everywhere step 1 says the block carries **six** core `key=value` lines, make it **seven** and add
`cwd_persona_root` to the parenthetical list, e.g.:

> ...followed by seven core `key=value` lines (`config_dir`, `sentinel`, `profile`, `state_local`,
> `state_global`, `cwd_is_config_dir`, `cwd_persona_root`) and, on a genuine first-run session only, an optional
> inventory block...

and "Present and all **seven** core keys parse → this is ground truth...".

### 4.2 Step 1 — override (a) (S1): replace the condition and its rationale

Replace the override-(a) bullet with:

> a. **`./.claude/otto-state.md` (this project, cwd only) exists with at least one line matching the grammar in
>    "Announcing a handoff" above, AND `cwd_is_config_dir` is `false`, AND `cwd_persona_root` is `false`** →
>    overrides the sentinel to present. Both guards exist for one reason: `./.claude/otto-state.md` is *project*
>    evidence only when `./.claude` is a genuine project directory, not a config or persona root wearing a
>    project hat. `cwd_is_config_dir` catches `./.claude` being *this* session's active `<config>` (a home-dir
>    persona, where `<cwd>/.claude` resolves to `<config>` itself). `cwd_persona_root` catches `./.claude` being
>    *any* machine's persona root — it holds an `otto-profile.json`, `.otto-met`, or `otto-state-global.md` —
>    which happens when `CLAUDE_CONFIG_DIR` is relocated elsewhere this session, so the config-dir comparison is
>    against the wrong config and reads `false`. Without the second guard, this override read another persona's
>    real state file as project evidence and suppressed a brand-new (e.g. sandbox) session's card — reproduced
>    live. (Facts absent → neither guard to check; see the fallback note above.)

### 4.3 Step 5 (S2): replace the local-read sentence

Replace the "Local:" sentence with:

> Local: **only when `cwd_is_config_dir` is `false` AND `cwd_persona_root` is `false`**, read
> `./.claude/otto-state.md`, by that literal relative path, in one Read call. **If either is `true`, skip the
> local read entirely.** `cwd_is_config_dir=true` means `./.claude` *is* this session's own `<config>` wearing a
> project hat; `cwd_persona_root=true` means `./.claude` is *some* machine's persona root (it holds an
> `otto-profile.json`, `.otto-met`, or `otto-state-global.md`), reached because `CLAUDE_CONFIG_DIR` was relocated
> elsewhere this session — so `cwd_is_config_dir` compares `false` against the *active* config and misses it. Both
> are the home-persona collision override (a) guards one step up; the second was reproduced live (a
> relocated-config sandbox session rendered another persona's real work table verbatim, "welcome back" and all).
> **Global state still renders in both cases** — it is read from `<config>/otto-state-global.md`, never from
> `./.claude`, and is legitimately per-machine, cross-project.

Override (b) is **not** vulnerable and is unchanged: it reads `<config>/otto-profile.json` (the active config),
never `<cwd>/.claude/otto-profile.json` — asserted, not assumed (R2 sub-assert).

### 4.4 "Announcing a handoff" step 2 (S5): guard the model's own hand-write

**This is the primary write path** — the model Read+Edits `./.claude/otto-state.md` at relay time; the S4 hook is
only its deterministic backstop. Step 2 currently carries **no** persona guard: its sole condition is "if this
project has no `.claude/` directory, skip this step silently." Glitchtrap live-reproduced (twice, `4bd3f72`, the
second run with a *healthy* facts block and a *healthy* S4 hook) the model hand-writing a sandbox relay line into
a foreign persona's real `otto-state.md` — the hook guard never gets the chance, because the model writes first.

**Amendment.** Extend the skip condition in step 2. After "never a fallback." and the existing
no-`.claude/`-dir clause (`If this project has no .claude/ directory, skip this step silently; do not create
one.`), add:

> **Also skip this local hand-write entirely — silently, creating and writing nothing — when the session's facts
> block shows `cwd_is_config_dir=true` OR `cwd_persona_root=true`, and equally when the facts block is absent or
> either of those two keys is missing.** `./.claude` is a legitimate local write target only when the facts
> *confirm* it is a genuine project directory — not this session's own `<config>`, and not some other machine's
> persona root (an `otto-profile.json` / `.otto-met` / `otto-state-global.md` holder, reached because
> `CLAUDE_CONFIG_DIR` was relocated this session). Unlike the step-5 *read*, which degrades **open** (it still
> renders on a Node-less machine, an accepted residual), this *write* degrades **closed**: when you cannot
> confirm the target is a plain project, you do not hand-write it. **No relay is lost by skipping** —
> `hooks/otto-state.mjs` still writes global state (`<config>/otto-state-global.md`) unconditionally, and writes
> the project-local file itself, under its own persona-root guard, whenever the target is genuine. You remain the
> sole writer of the local file via this paragraph; the upsert-by-slug, cap-8, no-clear-path semantics are
> untouched — the guard decides only *whether* to write here at all, never *what*.

The two facts are the same `cwd_is_config_dir` / `cwd_persona_root` that steps 1 and 5 already read from the same
session-open facts block. **S5 introduces no new marker definition** — it *consumes* the fact the hook already
computes, so the marker set still lives in exactly two code places (facts hook, writer hook), not three; the
facts block is the single source of truth for every prose consumer. *(This is the first live application of the
"named-facts rule" the parallel `docs/spec-hardening-22.9.md` pass is drafting — every cwd-relative
persona-boundary action, read or write, hook or prose, must gate on the named facts and fail-toward-skip for
writes. This hotfix applies it to the one prose write that leaked; 22.9 generalizes it. I have not touched that
file.)*

> **Inherent limitation, noted not fixed here:** the facts block reflects **session-open** cwd. If the user
> `cd`s mid-session, the hand-write's `cwd_persona_root` value is stale relative to the write target — the model
> cannot recompute it without shelling out or three extra Reads per relay, which is the whole reason the fact is
> precomputed. Rare, out of hotfix scope; folded into 22.9-D2's unification. The S4 hook is not affected — it
> recomputes from the live `payload.cwd` at Task time.

---

## 5. Writer change — `hooks/otto-state.mjs` (S4, the write-corruption backstop)

The local-write branch currently guards:

```js
const localDir = join(cwd, '.claude');
if (localDir !== configDir && existsSync(localDir)) { ...write local otto-state.md... }
```

`localDir !== configDir` is the exact same broken discriminator as the reader's `cwd_is_config_dir`: in case 3
`localDir = ~/.claude`, `configDir = sandbox`, so the guard passes and the hook **writes a sandbox relay line
into the real `~/.claude/otto-state.md`**.

**Change:** add a persona-root test with the **same three markers**:

```
isPersonaRoot(dir) = existsSync(join(dir, 'otto-profile.json'))
                  || existsSync(join(dir, '.otto-met'))
                  || existsSync(join(dir, 'otto-state-global.md'))

if (localDir !== configDir && !isPersonaRoot(localDir) && existsSync(localDir)) { ...write... }
```

The writer computes this itself (it is already a Node hook; no dependency on the facts block). Because the writer
never runs at all when Node is absent, **S4 has no Node-less residual** — the highest-severity hook surface is
fully closed whenever the hook runs.

> Two code definitions of "persona root" now exist (facts hook + writer hook — **not** three; S5 reads the fact,
> §4.4). That drift risk is real; §8-D2 unifies them post-hotfix behind one validate.mjs-gated source of truth.
> Marker set must be **byte-identical** across both in this hotfix.

---

## 6. Test-suite deltas

### 6.1 `scripts/test-otto-facts.mjs` (currently 29/29)

**Assertions that CHANGE (count/shape shifts — expected, not regressions; tell Glitchtrap so):**

| Location | Was | Becomes |
|---|---|---|
| `default config: 7 keys...` line 101 | `Object.keys(facts).length === 7` | `=== 8` (7 core + `inv=off`); add `facts.cwd_persona_root === false` — **cwd is a genuine project** here: the fixture writes the identity markers into `configDir` and only `otto-state.md` into `projectDir/.claude`, so this row is the **(F,F)** fixture, not a persona root. *(Glitchtrap adjudication: the earlier annotation read `=== true` / "home persona has markers" and mis-described its own fixture — Bitforge's assertion that flagged it was correct. Table now says so.)* |
| `formatFacts: exact block shape` line 240 | `lines.length === 8` | `=== 9` (header + 7 core + inv) |
| same test, line 247 | `lines[7] === 'inv=off'` | add `lines[7] === 'cwd_persona_root=false'`; `inv` moves to `lines[8]` |
| same test fixture, lines 224-232 | facts literal | add `cwd_persona_root: false` |
| `formatFacts: spec's own worked example` lines 253-286 | expected array | insert `cwd_persona_root=false` after `cwd_is_config_dir=false`; **also update `docs/spec-facts-inventory-22.8.0.md` §3.1** so the byte-for-byte example stays in lockstep |
| `real subprocess: ...parseable block` line 301 | `Object.keys(parsed).length === 7` | `=== 8` |
| `cwd_is_config_dir=true omits inv_agents_project` lines 391-407 | covers only the `(true, *)` omit | keep; assert `facts.cwd_persona_root === true` there too (home persona *does* have markers) |

**Assertions to ADD (the cross-product the original matrix missed — see §7):** at minimum one per new acceptance
row R2–R5, R8–R9, R14–R15 below. Update the final PASS count.

### 6.2 `scripts/test-otto-state.mjs` (writer, S4)

Add: R10 (foreign persona root → real file byte-unchanged after a Task write), R11 (genuine project → local
write still happens), R12 (cwd==configDir → still skipped). Marker-set parity with the facts hook.

### 6.3 S5 is prose — not unit-testable

The hand-write (S5) lives in `otto-foreman.md`, executed by the model, not by code. It has **no unit test**; it is
verified by the live gate in §7.3. Do not let a green `test-otto-*.mjs` suite read as "S5 covered" — it is not,
by construction. This is exactly the class of gap that let the original defect ship.

### 6.4 `scripts/validate.mjs`

No shape change required for the hotfix (hook stays one `type: command` entry, same timeout). §8-D2's shared
persona-root source-of-truth cross-check is the *deferred* addition, not part of this hotfix.

---

## 7. Acceptance matrix (Glitchtrap)

The original defect survived because the matrix covered **two of three** cases. This time the full
`cwd_is_config_dir × cwd_persona_root` cross-product is enumerated; every scenario row names the cell it proves.

### 7.1 The 2×2 cross-product (each cell must have ≥1 row)

| `cwd_is_config_dir` \ `cwd_persona_root` | **false** | **true** |
|---|---|---|
| **false** | **(F,F)** genuine project → **PERMIT** read/write | **(F,T)** foreign persona root, relocated config (**case 3, the leak**) → **BLOCK** |
| **true** | **(T,F)** markerless active config (new user, hand-placed state) → **BLOCK** (via `cwd_is_config_dir`) | **(T,T)** default onboarded home persona (**case 1**) → **BLOCK** |

### 7.2 Scenario rows

| R | Scenario | Cell | Proves | Pass |
|---|---|---|---|---|
| R1 | Genuine project, `otto-state.md` present, no markers | (F,F) | case 2 not broken | step 5 renders local table; override (a) may fire on real evidence |
| R2 | Relocated `CLAUDE_CONFIG_DIR`, cwd=home persona root, real `otto-state.md` (**original repro**) | (F,T) | **case 3 closed (reads)** | no local render; override (a) does **not** fire; no "welcome back"; fresh card shows; override (b) reads `<config>` not cwd |
| R3 | Markerless active config as cwd (new user, session 1, hand-placed `otto-state.md`) | (T,F) | **case 1 blocks even with no markers** | local read skipped |
| R4 | Default onboarded user at home (cwd==config, markers present) | (T,T) | case 1 default | local read skipped |
| R5 | (F,T) with **only** `otto-profile.json`; repeat **only** `.otto-met`; repeat **only** `otto-state-global.md` | (F,T) | OR / each marker sufficient | each → `cwd_persona_root=true` → BLOCK |
| R6 | Cloned repo: committed `.claude/otto-state.md`, **no** markers | (F,F) | accepted-risk boundary **unchanged** | PERMIT — renders committed/stale brief; `.gitignore` remains the real prevention; never a per-machine identity (markers are per-machine, not committed) |
| R7 | Full persona **copied into** a project `.claude/` | (F,T) | fail-safe on pathological copy | BLOCK (skip) — cosmetic loss of a hand-built layout's local brief |
| R8 | First-run active config (sandbox), cwd=foreign persona root | (F,T) | **S3 inventory leak closed** | `inv_agents_project` **omitted** (does not enumerate `~/.claude/agents`) |
| R9 | Genuine project, first-run | (F,F) | S3 fix doesn't break normal inventory | `inv_agents_project` still emitted from the project's own `.claude/agents` |
| R10 | Sandbox session dispatches a Task, cwd=home persona root, configDir=sandbox | (F,T) | **S4 write-corruption closed** | real `~/.claude/otto-state.md` **byte-unchanged**; no line appended |
| R11 | Genuine project dispatches a Task | (F,F) | S4 fix doesn't break normal relay | local `.claude/otto-state.md` **is** written |
| R12 | cwd==configDir dispatches a Task | (T,*) | writer's existing `localDir!==configDir` guard intact | local write skipped |
| R13 | Facts block absent/malformed | — | **mixed degrade — honest split** | **Reads (S1/S2) degrade OPEN:** revert to pre-fix `cwd_is_config_dir`-only guard (accepted Node-less read residual). **S4 hook write is independent:** guards via its own `isPersonaRoot`, no facts needed. **S5 hand-write degrades CLOSED:** keys missing → model must **skip** the local hand-write (R19). *Correction: the earlier "writer independent — still guards" line was true for S4 only and false for S5 — Glitchtrap's second repro had a healthy hook and still leaked via the hand-write. That is not an R13 residual; it is the S5 gap this rev closes.* |
| R14 | `cwd_persona_root` computation throws (inject) | — | error polarity + isolation | fact returns **`true`** (fail toward block); six core facts intact; session opens |
| R15 | `<cwd>/.claude` is a **symlink** to a real config dir | (F,T) | symlink edge | `existsSync` follows link → `cwd_persona_root=true` → BLOCK |
| R16 | R2 / R8 / R10 / R18 re-run on macOS + Linux with `/` separators | (F,T) | platform-invariance | identical BLOCK / omit / no-write / no-hand-write |
| R17 | Full regression | — | nothing else moved | `test-otto-facts.mjs` green (new count), `test-otto-state.mjs` green, `validate.mjs` green |
| **R18** | **S5, HEALTHY facts:** foreign persona root (F,T), real Task relay, unique canary line already in the foreign `otto-state.md` | (F,T) | **S5 closed with a healthy hook** | model does **not** hand-write; foreign file **hash-identical** before vs after the whole relay (§7.3); S4 hook also skips it |
| **R19** | **S5, facts absent OR `cwd_persona_root`/`cwd_is_config_dir` key missing**, foreign persona root, real Task relay | — | **write degrades CLOSED** | model **skips** the local hand-write (fail-toward-skip); no foreign write; global still recorded by the S4 hook when Node is present — no relay lost |
| **R20** | **S5, genuine project (F,F)**, healthy facts, real Task relay | (F,F) | S5 fix doesn't break normal relay | model **does** hand-write the local line; welds with the S4 hook write into one line, as today |

**Row count: 20** (4 cross-product cells fully covered + 16 scenario/edge/regression rows), across **5 guard
surfaces (S1–S5)** in 3 files (`otto-foreman.md`, `otto-facts.mjs`, `otto-state.mjs`).

### 7.3 Live gate for the prose guards (S1, S2, S5) — named, repeatable, blocks the ship

S1/S2/S5 are model-executed prose; §6's unit tests cannot reach them. They get a **manual live gate** — the
procedure Glitchtrap already ran by hand, written down so it is repeatable and re-run on every future change to
these guards. **This gate is a hard ship blocker for 22.8.1; a green unit suite does not substitute for it.**

**Home:** a new doc, **`docs/persona-guard-live-gate-22.8.1.md`**, referenced by the POSIX addendum (§9) for its
macOS/Linux runs. A distinct gate is warranted: this is a consent-property leak check, not a latency or
platform-parity check, and it will be re-run whenever S1/S2/S5 change. The friction/POSIX gate docs point at it
rather than absorbing it.

**Procedure (one gate, three assertions):**

1. **Fixture.** Create a throwaway "home" dir with a full persona root inside `<home>/.claude/`: all three
   markers (`otto-profile.json` with a `seats` key, `.otto-met`, `otto-state-global.md`) **and** an
   `otto-state.md` containing a **unique canary** line, e.g.
   `· 🟣 Vector (Architect) — CANARY-<uuid>: do-not-leak  (2026-07-15)`.
2. **Relocate config.** Set `CLAUDE_CONFIG_DIR` to a fresh, empty sandbox dir (sentinel/profile absent there).
   Launch a session with **cwd = the fixture home**. Confirm the injected facts block reads
   `cwd_is_config_dir=false` and `cwd_persona_root=true` (the healthy-facts run). For the R19 variant, run again
   with the facts hook disabled / the two keys stripped.
3. **Drive a real Task dispatch** (any robot), so both the S5 hand-write path and the S4 hook path execute.
4. **Assert — reads (S1/S2):** the session-open reply renders **no** row derived from the `CANARY-<uuid>` line
   and shows a **fresh card / no "welcome back"**.
5. **Assert — writes (S4/S5):** **SHA-256 hash the fixture's `<home>/.claude/otto-state.md` before step 2 and
   after step 3; they must be identical.** A changed hash = a foreign write leaked (the exact failure
   live-reproduced at `4bd3f72`).
6. **Regression counterpart:** repeat with cwd = a genuine project dir (markers absent) and assert the brief
   **does** render and the local file **does** gain the relay line (R1/R11/R20) — the guard must not have
   over-fired into blocking legitimate projects.

---

## 8. Scope discipline — what is in this hotfix, what defers to 22.9

**In (closes the one defect across all five surfaces):** S1 override (a), S2 step 5, **S5 step-2 hand-write**,
S3 inventory guard, S4 writer guard, the `cwd_persona_root` fact, the tests in §6, and the live gate in §7.3.

**Deferred to a named 22.9 list (genuinely separable, none re-opens case 3):**

- **22.9-D1** — Writer's `localDir !== configDir` is a **raw string compare**, not `realpath`-normalized like the
  reader's `cwd_is_config_dir`. Latent Windows-casing / separator gap. Low-sev now: the S4 marker test backstops
  the primary leak regardless of the string compare. Normalize it in 22.9.
- **22.9-D2** — **Unify** the persona-root definition. It lives in two code places (facts hook + writer hook);
  the prose consumers (S1/S2/S5) already read the single fact, which is the right shape — extend that: one shared
  `isPersonaRoot` + marker constant, a `validate.mjs` cross-check that both hooks use it (mirroring the
  `STOCK_AGENT_IDS` / `ROBOTS`-map gates), **and** address the session-open-cwd staleness noted in §4.4 (decide
  whether the hand-write should ever re-probe when cwd is known to have changed). *This is the "correction made
  twice is a bug in the system" fix — do it before the marker set ever needs to change.*
- **22.9-D3** — Generalize the **named-facts rule** with `docs/spec-hardening-22.9.md`: no cwd-relative
  persona-boundary action anywhere may compute its own `cwd_is_config_dir`-style comparison; all consume the
  named facts and fail-toward-skip for writes. S5 is the first application; 22.9 makes it doctrine.

---

## 9. POSIX additions (fold into `docs/posix-gate-22.8.0.md` as a 22.8.1 addendum)

1. **Test counts:** `test-otto-facts.mjs` PASS line rises to the new §6.1 total; `test-otto-state.mjs` gains the
   three S4 rows (R10–R12). Update both PASS lines.
2. **Marker-detection parity:** with a planted persona root (each marker) under a POSIX cwd, assert
   `cwd_persona_root=true` identically on Windows, macOS, Linux. Marker filenames are fixed ASCII — no
   separator/case exposure — but assert the `join(cwd, '.claude', marker)` path is built with `/` on POSIX.
3. **Case-3 BLOCK under POSIX:** R2 (reader skip), R8 (inventory omit), R10 (no foreign hook write), **R18 (no
   foreign hand-write)** all re-run with a relocated `CLAUDE_CONFIG_DIR` and `/` separators.
4. **Symlink edge (R15):** POSIX-relevant — assert `existsSync` follows the link to the real config dir on
   macOS/Linux and flags the persona root.
5. **Live gate on POSIX:** run `docs/persona-guard-live-gate-22.8.1.md` (§7.3) on macOS and Linux — the
   SHA-256 before/after hash-compare of the fixture `otto-state.md` is the platform-invariant proof that neither
   the hook write (S4) nor the model hand-write (S5) mutates a foreign persona file.

---

## 10. The 2–3 riskiest calls

1. **Expanding the named scope from step-5-only to five surfaces.** The task named S2; Glitchtrap's find added
   S5. I ruled S1–S5. The tradeoff is a wider hotfix diff. Chosen because the defect *is* the discriminator, not
   one call site, and **two surfaces (S4, S5) write to a real file** — the partial-matrix mistake that let (a)
   ship is exactly "fix the case you were looking at, miss the sibling." If Andrew wants the minimal patch, both
   writes must still land; the floor is S2+S4+S5, not S2 alone.
2. **Reads degrade OPEN, writes degrade CLOSED — a deliberate asymmetry.** On a missing facts block, S1/S2 keep
   rendering (accepting the Node-less read residual) while S5 skips the hand-write. The tradeoff is two different
   degrade polarities in one feature, which is a comprehension cost. Chosen because a lost convenience-write is
   recoverable (the file is explicitly best-effort bookkeeping; global still records it) while a foreign write is
   a one-way door — the polarity follows the reversibility, not a uniform rule. Stated out loud in R13 so it is
   not read as an inconsistency.
3. **Two code definitions of "persona root" ship in this hotfix (facts hook + writer hook), unified only in
   22.9-D2.** The tradeoff is a one-release drift window. Chosen because unifying now would pull `validate.mjs`
   and a shared module into a hotfix; the marker set is three lines, byte-identical by review, and S5 already
   consumes the fact rather than adding a third definition, so the surface that drift could touch is smaller than
   it looks. D2 closes the window before it can matter.
