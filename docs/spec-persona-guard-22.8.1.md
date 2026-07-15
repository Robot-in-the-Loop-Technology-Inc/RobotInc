# Spec — Persona-root guard for local-state reads and writes (hotfix v22.8.1)

**Owner:** Vector (Architect) · **Builds:** Bitforge · **Verifies:** Glitchtrap
**Repo:** `C:\development\RobotInc` · **Base:** `main` @ `2810e51` (v22.8.0, released) · **Status:** working-tree spec, not committed
**Track:** hotfix-ASAP (Andrew-approved) · **Rigor:** T3 — consent / persona-boundary property, no shortcuts; scope stays hotfix-sized.
**Amends:** ruling (a) in `docs/spec-facts-inventory-22.8.0.md` §8a, which shipped and inverted its own intent.

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

### 1.1 The defect is a discriminator, not a call site — it has four surfaces

The same "compare against the active config dir" logic guards the persona boundary in **four** places. The
observed repro ("welcome back **and** the table") already lit up two of them at once. A hotfix that patches only
step 5 leaves the persona boundary open through the other three — including one that **writes** to the real file:

| # | Surface | File | Op | What leaks in case 3 | Severity |
|---|---|---|---|---|---|
| S1 | Step 1, override (a) — card suppression | `agents/otto-foreman.md` | read | reads foreign `otto-state.md` as "we've met" → suppresses the fresh card, emits "welcome back" | high |
| S2 | Step 5 — brief render *(the named task)* | `agents/otto-foreman.md` | read | renders the foreign work table verbatim | high |
| S3 | Inventory `inv_agents_project` double-count guard | `hooks/otto-facts.mjs` | read | enumerates the foreign `~/.claude/agents` ids into the session inventory | low (ids only, first-run only) |
| S4 | Local relay write guard | `hooks/otto-state.mjs` | **write** | **appends a sandbox relay line into the real `~/.claude/otto-state.md` on every Task dispatch — mutates real data** | **high (one-way door)** |

> **S4 is why the hotfix cannot stop at step 5.** It is a *write* to another persona's real file — a one-way
> door, arguably worse than the read the hotfix is named for. Closing S2 alone would let us announce green while
> the sandbox is still corrupting the real state file. This ruling closes all four surfaces of the one defect;
> the deferral list (§8) carries only genuinely-separable follow-ups. If Andrew wants to split, **S4 is the one
> that must not be the one deferred.**

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

**Blocking condition (all four surfaces).** Treat `<cwd>/.claude` as *not a plain project* — skip the local read,
skip the local write, omit `inv_agents_project` — when **either**:

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
- The union covers both. Two orthogonal blinds spots, one OR.

**Why OR across the three markers (not AND).** The failure is asymmetric: a false negative (missing a persona
root) re-opens the leak; a false positive (mis-flagging a genuine project) costs only a skipped brief render —
cosmetic, self-correcting next session. Fail toward detection. AND would also miss half-onboarded persona roots
(a migration-gap profile with no `.otto-met`; a `.otto-met` written before seats). Each of the three markers is
**config-dir-exclusive** — none ever legitimately appears in a genuine project's `.claude/` (they are per-machine
identity/global-state, not per-project), so any one present is sufficient and decisive. `otto-state.md` is
deliberately **not** a marker: it is the one file a genuine project legitimately owns, so it cannot discriminate.

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
| `otto-foreman.md` step 1 override (a) | card-suppression guard (S1) | now `... AND cwd_persona_root=false` |
| `otto-foreman.md` step 5 | local-read guard (S2) | now `... AND cwd_persona_root=false` |
| `otto-facts.mjs` `gatherInventory` | `inv_agents_project` double-count guard (S3) | omit when `cwdIsConfigDir OR cwdPersonaRoot` |

No self-heal / seat-question logic reads `cwd_is_config_dir`; nothing else in `otto-foreman.md` consumes it.
It remains load-bearing as half of the OR (the markerless-active-config case 1) — removing it re-opens case 1.

### 3.3 Inventory guard (S3)

In `gatherInventory(...)`, the `inv_agents_project` scan is currently gated `if (!cwdIsConfigDir)`. Change to
`if (!cwdIsConfigDir && !cwdPersonaRoot)`. Thread `cwd_persona_root` into `gatherInventory` the same way
`cwd_is_config_dir` already is. When omitted, `inv_agents_project` stays entirely absent from the wire format
(the existing `null`-not-`[]` convention), not rendered empty.

---

## 4. Consumer changes — `agents/otto-foreman.md`

Two prose edits (S1, S2) plus the count updates. Exact wording below.

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

---

## 5. Writer change — `hooks/otto-state.mjs` (S4, the write-corruption)

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
never runs at all when Node is absent, **S4 has no Node-less residual** — the highest-severity surface is fully
closed whenever the hook runs.

> Two definitions of "persona root" now exist (facts hook + writer). That drift risk is real; §8-D2 unifies them
> post-hotfix behind one validate.mjs-gated source of truth. Marker set must be **byte-identical** across both
> in this hotfix.

---

## 6. Test-suite deltas

### 6.1 `scripts/test-otto-facts.mjs` (currently 29/29)

**Assertions that CHANGE (count/shape shifts — expected, not regressions; tell Glitchtrap so):**

| Location | Was | Becomes |
|---|---|---|
| `default config: 7 keys...` line 101 | `Object.keys(facts).length === 7` | `=== 8` (7 core + `inv=off`); add `facts.cwd_persona_root === true` (home persona has markers) |
| `formatFacts: exact block shape` line 240 | `lines.length === 8` | `=== 9` (header + 7 core + inv) |
| same test, line 247 | `lines[7] === 'inv=off'` | add `lines[7] === 'cwd_persona_root=false'`; `inv` moves to `lines[8]` |
| same test fixture, lines 224-232 | facts literal | add `cwd_persona_root: false` |
| `formatFacts: spec's own worked example` lines 253-286 | expected array | insert `cwd_persona_root=false` after `cwd_is_config_dir=false`; **also update `docs/spec-facts-inventory-22.8.0.md` §3.1** so the byte-for-byte example stays in lockstep |
| `real subprocess: ...parseable block` line 301 | `Object.keys(parsed).length === 7` | `=== 8` |
| `cwd_is_config_dir=true omits inv_agents_project` lines 391-407 | covers only the `(true, *)` omit | keep; assert `facts.cwd_persona_root === true` there too |

**Assertions to ADD (the cross-product the original matrix missed — see §7):** at minimum one per new acceptance
row R2–R5, R8–R9, R14–R15 below. Update the final PASS count.

### 6.2 `scripts/test-otto-state.mjs` (writer, S4)

Add: R10 (foreign persona root → real file byte-unchanged after a Task write), R11 (genuine project → local
write still happens), R12 (cwd==configDir → still skipped). Marker-set parity with the facts hook.

### 6.3 `scripts/validate.mjs`

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
| R2 | Relocated `CLAUDE_CONFIG_DIR`, cwd=home persona root, real `otto-state.md` (**original repro**) | (F,T) | **case 3 closed** | no local render; override (a) does **not** fire; no "welcome back"; fresh card shows; override (b) reads `<config>` not cwd |
| R3 | Markerless active config as cwd (new user, session 1, hand-placed `otto-state.md`) | (T,F) | **case 1 blocks even with no markers** | local read skipped |
| R4 | Default onboarded user at home (cwd==config, markers present) | (T,T) | case 1 default | local read skipped |
| R5 | (F,T) achieved with **only** `otto-profile.json`; repeat **only** `.otto-met`; repeat **only** `otto-state-global.md` | (F,T) | OR / each marker sufficient | each → `cwd_persona_root=true` → BLOCK |
| R6 | Cloned repo: committed `.claude/otto-state.md`, **no** markers | (F,F) | accepted-risk boundary **unchanged** | PERMIT — renders committed/stale brief; `.gitignore` remains the real prevention; never a per-machine identity (markers are per-machine, not committed) |
| R7 | Full persona **copied into** a project `.claude/` | (F,T) | fail-safe on pathological copy | BLOCK (skip) — cosmetic loss of a hand-built layout's local brief |
| R8 | First-run active config (sandbox), cwd=foreign persona root | (F,T) | **S3 inventory leak closed** | `inv_agents_project` **omitted** (does not enumerate `~/.claude/agents`) |
| R9 | Genuine project, first-run | (F,F) | S3 fix doesn't break normal inventory | `inv_agents_project` still emitted from the project's own `.claude/agents` |
| R10 | Sandbox session dispatches a Task, cwd=home persona root, configDir=sandbox | (F,T) | **S4 write-corruption closed** | real `~/.claude/otto-state.md` **byte-unchanged**; no line appended |
| R11 | Genuine project dispatches a Task | (F,F) | S4 fix doesn't break normal relay | local `.claude/otto-state.md` **is** written |
| R12 | cwd==configDir dispatches a Task | (T,*) | writer's existing `localDir!==configDir` guard intact | local write skipped |
| R13 | Facts block absent/malformed (Node present, block broken) | — | degrade-open + named residual | reader reverts to pre-fix `cwd_is_config_dir`-only guard (Node-less residual, accepted); session opens; **writer independent** — still guards via its own `isPersonaRoot` |
| R14 | `cwd_persona_root` computation throws (inject) | — | error polarity + isolation | fact returns **`true`** (fail toward block); six core facts intact; session opens |
| R15 | `<cwd>/.claude` is a **symlink** to a real config dir | (F,T) | symlink edge | `existsSync` follows link → `cwd_persona_root=true` → BLOCK |
| R16 | R2 / R8 / R10 re-run on macOS + Linux with `/` separators | (F,T) | platform-invariance | identical BLOCK / omit / no-write |
| R17 | Full regression | — | nothing else moved | `test-otto-facts.mjs` green (new count), `test-otto-state.mjs` green, `validate.mjs` green |

**Row count: 17** (4 cross-product cells fully covered + 13 scenario/edge/regression rows), across 4 code surfaces.

---

## 8. Scope discipline — what is in this hotfix, what defers to 22.9

**In (closes the one defect across all four surfaces):** S1 override (a), S2 step 5, S3 inventory guard, S4 writer
guard, the `cwd_persona_root` fact, and the tests above.

**Deferred to a named 22.9 list (genuinely separable, none re-opens case 3):**

- **22.9-D1** — Writer's `localDir !== configDir` is a **raw string compare**, not `realpath`-normalized like the
  reader's `cwd_is_config_dir`. Latent Windows-casing / separator gap (a home persona on Windows could slip the
  equality). Low-sev now: the S4 marker test backstops the primary leak regardless of the string compare.
  Normalize it in 22.9.
- **22.9-D2** — **Unify** the persona-root definition. It now lives in two places (facts hook + writer); doctrine
  says a rule held in two spots drifts. Extract one shared source of truth (a marker constant + `isPersonaRoot`)
  and add a `validate.mjs` cross-check that both consumers use it, mirroring the `STOCK_AGENT_IDS` /
  `ROBOTS`-map gates. *This is the "correction made twice is a bug in the system" fix — do it before the marker
  set ever needs to change.*
- **22.9-D3** — Consider whether `cwd_persona_root` should be re-used to harden other cwd-relative reads if any
  are added later; document the predicate as the single approved persona-boundary test so new call sites don't
  reinvent `cwd_is_config_dir`-style comparisons.

---

## 9. POSIX additions (fold into `docs/posix-gate-22.8.0.md` as a 22.8.1 addendum)

1. **Test counts:** `test-otto-facts.mjs` PASS line rises to the new §6.1 total; `test-otto-state.mjs` gains the
   three S4 rows (R10–R12). Update both PASS lines.
2. **Marker-detection parity:** with a planted persona root (each marker) under a POSIX cwd, assert
   `cwd_persona_root=true` identically on Windows, macOS, Linux. Marker filenames are fixed ASCII — no
   separator/case exposure — but assert the `join(cwd, '.claude', marker)` path is built with `/` on POSIX.
3. **Case-3 BLOCK under POSIX:** R2 (reader skip), R8 (inventory omit), R10 (no foreign write) all re-run with a
   relocated `CLAUDE_CONFIG_DIR` and `/` separators.
4. **Symlink edge (R15):** POSIX-relevant — assert `existsSync` follows the link to the real config dir on
   macOS/Linux and flags the persona root.

---

## 10. The 2–3 riskiest calls

1. **Expanding the named scope from step-5-only to all four surfaces.** The task named S2; I ruled S1+S2+S3+S4.
   The tradeoff is a wider hotfix diff. Chosen because the defect *is* the discriminator, not one call site, and
   S4 **writes to a real file** — the partial-matrix mistake that let (a) ship is exactly "fix the case you were
   looking at, miss the sibling." If Andrew wants the minimal patch, S4 must still land (data corruption), so the
   floor is S2+S4, not S2 alone.
2. **OR of three markers, fail-toward-block.** A genuine project experiencing a filesystem stat error on a
   `.claude` marker would falsely skip its brief. Chosen deliberately: a skipped brief is cosmetic and
   self-corrects; a missed persona root is the leak. The asymmetry sets the polarity. Accepted residual:
   `existsSync`-EACCES reads absent — identical in class to the shipped `existsFlag` choice, nil blast radius on
   the primary (fully-readable) leak.
3. **Two definitions of "persona root" ship in this hotfix (facts hook + writer), unified only in 22.9-D2.**
   The tradeoff is a one-release drift window. Chosen because unifying now would pull `validate.mjs` and a shared
   module into a hotfix; the marker set is three lines, byte-identical by review, and D2 closes the window before
   it can matter.
