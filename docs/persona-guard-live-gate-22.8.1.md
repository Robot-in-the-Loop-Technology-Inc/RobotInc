# Persona-Root Live Gate — v22.8.1 (S1, S2, S5)

**For:** Glitchtrap (ship-gate re-verify), Andrew (POSIX run). **Branch:** `hotfix/22.8.1-persona-guard`.
**Spec:** `docs/spec-persona-guard-22.8.1.md` §7.3. **Status: hard ship blocker for 22.8.1 — a green
`test-otto-facts.mjs` / `test-otto-state.mjs` run does NOT substitute for this.**

## Why this gate exists, and why unit tests can't replace it

Three of the five guard surfaces this hotfix closes are **prompt-driven, not code**:

- **S1** — `agents/otto-foreman.md` step 1, override (a) (card-suppression read)
- **S2** — `agents/otto-foreman.md` step 5 (local brief-render read)
- **S5** — `agents/otto-foreman.md` "Announcing a handoff" step 2 (the model's own hand-write)

`scripts/test-otto-facts.mjs` and `scripts/test-otto-state.mjs` can only reach the two **code** surfaces (S3,
S4). S5 in particular is the one that shipped broken *twice* in the same live-repro session at `4bd3f72`:
Glitchtrap dispatched a real Task from a relocated-`CLAUDE_CONFIG_DIR` sandbox session whose `cwd` was a
synthetic foreign persona root, and the model Read+Edit'd a relay line straight into that foreign persona's
real `otto-state.md` — the second time with a **fully healthy** facts block (`cwd_persona_root=true` present
and correct) and a **fully healthy** S4 hook already patched. The hook guard never got the chance: the model
writes the file directly, at relay time, before the hook ever fires. **A green hook test suite proves nothing
about S5** — this is exactly the class of gap that let ruling (a) ship broken in the first place, and it is
why this gate is a hard blocker, not an optional nice-to-have.

## Procedure (one gate, three assertions, per spec §7.3)

### 1. Build the fixture

Create a throwaway "home" dir with a **full persona root** inside `<home>/.claude/`: all three markers
(`otto-profile.json` with a `seats` key, `.otto-met`, `otto-state-global.md`) **and** an `otto-state.md`
containing a **unique canary** line so a leak is unambiguous, not a coincidence:

```sh
export GATE_HOME="$HOME/persona-gate-home"
export GATE_SANDBOX="$HOME/persona-gate-sandbox"
rm -rf "$GATE_HOME" "$GATE_SANDBOX"
mkdir -p "$GATE_HOME/.claude" "$GATE_SANDBOX"

export CANARY="CANARY-$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
echo "$CANARY"   # keep this — you grep for it in step 4

date -u +%Y-%m-%d > "$GATE_HOME/.claude/.otto-met"
cat > "$GATE_HOME/.claude/otto-profile.json" <<JSON
{"seats": ["Generalist / Solo"], "tier": "Level 2 - Operator"}
JSON
cat > "$GATE_HOME/.claude/otto-state-global.md" <<'MD'
<!-- otto-state-global.md -- fixture -->

· 🟣 Vector (Architect) — some other project: fixture line  (2026-07-01)
MD
cat > "$GATE_HOME/.claude/otto-state.md" <<MD
<!-- otto-state.md -- real per-machine work table -->

· 🟣 Vector (Architect) — $CANARY: do-not-leak  (2026-07-15)
MD
```

### 2. Relocate config, confirm healthy facts (R18 run)

```sh
cp ~/.claude/.credentials.json "$GATE_SANDBOX/.credentials.json"   # local reuse only, same as the POSIX gate
cd "$GATE_HOME"
CLAUDE_CONFIG_DIR="$GATE_SANDBOX" claude -p "hi" --dangerously-skip-permissions --allowed-tools "Read,Bash" &
```

Before driving anything, confirm the injected facts block (grep the session transcript, or a `--print`
dry run of the facts hook directly) reads:

```sh
printf '{"cwd":"%s"}' "$GATE_HOME" | CLAUDE_CONFIG_DIR="$GATE_SANDBOX" node hooks/otto-facts.mjs
```

**PASS looks like:** `cwd_is_config_dir=false` and `cwd_persona_root=true` — the (F,T) cell, case 3, healthy
facts. If this doesn't read exactly that, fix the fixture before continuing; a wrong starting condition
invalidates the whole run.

### 3. Hash before, drive a real Task dispatch

```sh
BEFORE=$(shasum -a 256 "$GATE_HOME/.claude/otto-state.md" | cut -d' ' -f1)   # sha256sum on Linux
echo "BEFORE=$BEFORE"

cd "$GATE_HOME"
CLAUDE_CONFIG_DIR="$GATE_SANDBOX" claude -p "Use the Task tool to dispatch subagent_type 'bitforge-engineer' with description 'live gate: R18 relay' and a prompt telling it to reply with exactly one sentence, 'Drafted the rate limiter skeleton, needs tests.', and do nothing else. Then stop." \
  --dangerously-skip-permissions --allowed-tools "Task"
```

This is the step that exercises **both** write surfaces in the same breath — S5 (the model's own hand-write
in "Announcing a handoff" step 2) fires first, at relay time; S4 (`hooks/otto-state.mjs`, PostToolUse) fires
after, mechanically. Both must independently decline to touch the fixture.

### 4. Assert — reads (S1, S2)

```sh
TRANSCRIPT=$(find "$GATE_HOME/.claude/projects" -iname "*.jsonl" 2>/dev/null | head -1)
grep -c "$CANARY" "$TRANSCRIPT" 2>/dev/null   # expect: 0, or grep exits nonzero (no match)
```

**PASS looks like:** the reply shows a **fresh card** (no "welcome back," no suppressed banner) and the
`$CANARY` string never appears anywhere in the session transcript or reply — the foreign work table was never
rendered, and override (a) never fired on it.

### 5. Assert — writes (S4, S5) — the SHA-256 proof

```sh
AFTER=$(shasum -a 256 "$GATE_HOME/.claude/otto-state.md" | cut -d' ' -f1)
echo "BEFORE=$BEFORE"
echo "AFTER=$AFTER"
[ "$BEFORE" = "$AFTER" ] && echo "PASS: fixture byte-unchanged" || echo "FAIL: fixture was written to"
```

**PASS looks like:** `BEFORE` and `AFTER` are identical. **A mismatch means a foreign write leaked** — the
exact failure Glitchtrap live-reproduced twice at `4bd3f72`. Stop; do not patch it yourself; report the full
before/after file content, not just "it failed."

Also confirm the sandbox's own state was **not** starved by the skip — global recording is independent of the
local-write guard, so "no relay lost" should hold even though the fixture was correctly left alone:

```sh
cat "$GATE_SANDBOX/otto-state-global.md"   # expect: one line for this relay, tagged [persona-gate-home]
```

### 6. R19 variant — facts absent or malformed

Repeat steps 1–5 with the facts hook disabled (rename `hooks/otto-facts.mjs` aside, or strip
`cwd_is_config_dir` / `cwd_persona_root` from a captured block before feeding it back in a scripted
reproduction) so the model has **no** reliable read on either key this session. **PASS looks like:** the same
hash-match as R18 — S5 must **fail-toward-skip** on missing facts, not fail open. The S4 hook is unaffected
either way (it computes `isPersonaRoot` itself, independent of the facts block) and should still be the thing
that shows up in `otto-state-global.md`.

### 7. R20 — regression counterpart, genuine project

Repeat with `cwd` = a **genuine** project dir (a plain `.claude/` with no markers, no `CLAUDE_CONFIG_DIR`
relocation):

```sh
export GATE_PROJECT="$HOME/persona-gate-project"
export GATE_CONFIG="$HOME/persona-gate-config"
rm -rf "$GATE_PROJECT" "$GATE_CONFIG"
mkdir -p "$GATE_PROJECT/.claude" "$GATE_CONFIG"
cd "$GATE_PROJECT"
CLAUDE_CONFIG_DIR="$GATE_CONFIG" claude -p "Use the Task tool to dispatch subagent_type 'bitforge-engineer' with description 'live gate: R20 relay' and a prompt telling it to reply with exactly one sentence, 'Drafted the rate limiter skeleton, needs tests.', and do nothing else. Then stop." \
  --dangerously-skip-permissions --allowed-tools "Task"
cat "$GATE_PROJECT/.claude/otto-state.md"
```

**PASS looks like:** the local file now exists and contains **one** line for the dispatched item (the model's
own hand-write and the S4 hook's write weld into the same line via upsert, exactly as before this hotfix — the
guard must not have over-fired into blocking a legitimate project). The session-open brief on a follow-up
session should also render this line (R1/R11's existing coverage, re-confirmed here in the S5 context).

### 8. Cleanup

```sh
rm -rf "$GATE_HOME" "$GATE_SANDBOX" "$GATE_PROJECT" "$GATE_CONFIG"
```

## Reporting back

Paste: the fixture's facts-block output from step 2, `BEFORE`/`AFTER` hashes from steps 5 and 6 (R18, R19),
the `otto-state-global.md` contents confirming no relay was lost, and R20's local-file contents. That is
enough for Glitchtrap to sign off without re-running anything, or to pinpoint exactly which assertion failed.

---

## Run log — Bitforge, Windows, `hotfix/22.8.1-persona-guard` @ `4bd3f72`

**Methodology note, read before trusting this run as equivalent to the procedure above:** Bitforge's harness
has no nested `Task` tool — there is no way to make a real Claude Code session dispatch a real subagent from
inside this environment. The gate was still run, honestly, against the actual code and the actual amended
prompt text, via the closest available proxy:

- **S4** (the hook) ran for real — `hooks/otto-state.mjs` invoked as a real subprocess against the fixture,
  exactly as a PostToolUse hook would fire.
- **S5** (the model hand-write) was exercised by Bitforge — itself an instance of Claude — reading the real,
  amended `agents/otto-foreman.md` "Announcing a handoff" step 2 text, being handed the *real* facts block
  captured from a real `hooks/otto-facts.mjs` run (not a hand-typed stand-in), and applying the instruction
  exactly as written: deciding whether to issue a `Read`/`Edit` against the fixture, with those tools
  genuinely available and genuinely unused when the rule said skip. Restraint (and, for R20, action) is proven
  by SHA-256, not by narration.

**This is a real test of whether the prompt text produces correct behavior in an LLM reading it — but it is
not the same as Glitchtrap's original `4bd3f72` repro, which drove an actual nested Task dispatch inside a
real session.** Glitchtrap should re-run the canonical procedure above (steps 1–8, with a real `Task` dispatch)
as the actual ship-gate confirmation; this run log is a strong prior, not a substitute.

### R18 — healthy facts, foreign persona root (F,T)

```
facts:  cwd_is_config_dir=false   cwd_persona_root=true
BEFORE: fd55c574569a4c5521cf64a0d64ea3118dbe704af778513bfadbdfea0ac42832
  (S4 hook ran for real -- global write proceeded, local write skipped by isPersonaRoot())
AFTER-S4-ONLY: fd55c574569a4c5521cf64a0d64ea3118dbe704af778513bfadbdfea0ac42832   (unchanged)
  (S5 decision applied against the real facts block above: cwd_persona_root=true -> SKIP,
   no Read/Edit issued against the fixture)
AFTER-FULL-RELAY: fd55c574569a4c5521cf64a0d64ea3118dbe704af778513bfadbdfea0ac42832
```

**Result: PASS.** `BEFORE === AFTER-FULL-RELAY`. Sandbox's own `otto-state-global.md` was written
(`otto-state-global.md` present, one entry) — no relay lost.

### R19 — facts absent, foreign persona root

```
facts: simulated absent (no block available to check either key)
BEFORE: d94050c4098381f244bd813b7f62b4647c88413b712c9165f23541b85333dd82
  (S4 hook ran for real -- global write proceeded, local write skipped; S4 never reads the
   facts block at all, so its behavior here is identical to R18 by construction)
  (S5 decision: facts absent -> per the amended rule's second clause -> SKIP, no Read/Edit issued)
AFTER-FULL-RELAY: d94050c4098381f244bd813b7f62b4647c88413b712c9165f23541b85333dd82
```

**Result: PASS.** `BEFORE === AFTER-FULL-RELAY`, confirming fail-toward-skip holds even with zero facts to
consult, not just when the facts are healthy and say block.

### R20 — genuine project (F,F), healthy facts, regression counterpart

```
facts: cwd_is_config_dir=false   cwd_persona_root=false
S5 decision: neither guard true -> facts CONFIRM a genuine project -> proceed with hand-write
```

Bitforge composed and wrote the line via a real `Write` call (first-create, header included per the prompt's
own instruction), then ran the real S4 hook on top:

```
local file after S5 hand-write + S4 hook weld (ONE line, not two):
  · 🔩 Bitforge (Engineer) — R20 live gate dispatch: rate limiter skeleton drafted, needs tests  (2026-07-15)

global file:
  · [r20-project] 🔩 Bitforge (Engineer) — R20 live gate dispatch: rate limiter skeleton drafted, needs tests  (2026-07-15)
```

**Result: PASS.** The hand-write happened, and the S4 hook's own write upserted onto the *same* key rather
than duplicating it — the weld behavior is intact, the guard does not over-fire on a genuine project.

### Reads (S1, S2) — not independently re-run this pass

The read-side guards (S1 override-(a) suppression, S2 local brief render) were live-repro'd against this same
class of fixture in the prior rev of this hotfix (see the commit `4bd3f72` message and this doc's git history)
and are unchanged by this rev's S5 addition — both still gate on the identical `cwd_is_config_dir OR
cwd_persona_root` condition. Not re-run here to avoid re-litigating S1–S4, which Otto's dispatch for this rev
named as already confirmed solid; Glitchtrap's re-verify should still spot-check R2 (reads) alongside R18–R20
(writes) in one pass, since the canonical procedure above drives both from the same session.
