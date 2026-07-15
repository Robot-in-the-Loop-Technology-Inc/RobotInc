# v22.8.0 POSIX Gate — run this on macOS or Linux

**For:** Andrew, on a Mac. **Branch:** `feature/22.8.0-relay-writer-global-state`. **Task:** TASKS.md #10.
**Assumes:** Claude Code, `node`, and `git` are installed. Nothing else.

## Why this blocks the release

Everything in this branch has only ever run on Windows. Two prior releases shipped with this exact gap —
POSIX sh reasoned-about, never run — and the v22.7.0 release notes said plainly: *"A third release with this
gap is not acceptable. Before v22.8.0 ships, the hook must run and verify on macOS and Linux."* This is that
run. It proves three things Windows cannot: the `mkdir`-based lock behaves the same under POSIX filesystem
semantics, `node` resolves the same way from a hook spawn, and path resolution (`homedir()`, `CLAUDE_CONFIG_DIR`,
tilde expansion) doesn't diverge.

**This gate is about portability, not correctness.** An earlier round of this branch had known, disclosed
correctness bugs in a done/active content classifier (negation-window false-clear/false-keep — see TASKS.md's
QA round 2). That classifier has since been **deleted entirely** (see TASKS.md's "Option C" section) rather
than fixed a third time — every relay is now an unconditional upsert, cleanup is cap-8 recency eviction only,
and there is no clear path for any test to false-positive or false-negative on. The suite below is expected
**fully green**; any red is real and platform-specific, full stop.

**A second, unrelated hook rides this same gate:** `hooks/otto-facts.mjs`, the session-open facts injector
(TASKS.md's "Session-open facts injector" section) that kills a live, screenshot-verified bug — a fresh user's
first turn was a Bash permission dialog, because the model had no permission-free way to resolve
`CLAUDE_CONFIG_DIR`. This gate is exactly where a payload-shape difference across shells would show up (same
reasoning as the relay-state hook): the facts block it emits should be byte-identical in structure across
Windows, macOS, and Linux — the six `key=value` lines, same order, same header string. Folded into the same
test-suite run and the same live sequence below rather than a separate section.

---

## 1. Clone and check out the branch

```sh
cd ~
git clone https://github.com/Robot-in-the-Loop-Technology-Inc/RobotInc.git robotinc-posix-gate
cd robotinc-posix-gate
git checkout feature/22.8.0-relay-writer-global-state
git log --oneline -1
```

## 2. Run the test suites

```sh
node scripts/test-otto-state.mjs
node scripts/test-otto-facts.mjs
```

**PASS looks like:** both last lines read `40/40 passed` and `17/17 passed` — **no** `✗` lines at all in
either. There is no known-red list for this build; the terminal-inference machinery that produced one (rounds
1 and 2, both since deleted — see TASKS.md's "Option C" section) is gone, and every remaining test asserts
either pure upsert/eviction mechanics or a fact about the payload/grammar, none of which are platform-sensitive
by design. `test-otto-facts.mjs` includes real subprocess invocations (stdin JSON in, formatted block out) and
Windows-vs-POSIX path-separator normalization cases specifically — the ones most likely to actually diverge
here.

**Real platform-specific finding:** any `✗` at all in either suite, OR a total other than `40/40` /
`17/17`, OR any test that is green here and red there (especially `9k` or `G7` in `test-otto-state.mjs` —
both spawn real concurrent `node` child processes and are the two most likely to diverge on POSIX lock
semantics).

## 3. Run the validation gate

```sh
node scripts/validate.mjs
```

**PASS looks like:** one line, exit code 0 —
`valid: 13 robots + otto-foreman, 38 skills, 2 commands, 3 hook scripts`

## 4. Live sequence — a sandboxed, brand-new user, on this Mac

Everything below runs inside an isolated `CLAUDE_CONFIG_DIR` so it touches **zero** of your real `~/.claude`.

```sh
export SANDBOX="$HOME/posix-gate-sandbox"
rm -rf "$SANDBOX"
mkdir -p "$SANDBOX/home-persona"

# Point a fresh sandbox marketplace at THIS branch's local checkout (not the published plugin) so the
# live run exercises the code you just cloned, not whatever's on the marketplace.
CLAUDE_CONFIG_DIR="$SANDBOX" claude plugin marketplace add ~/robotinc-posix-gate
CLAUDE_CONFIG_DIR="$SANDBOX" claude plugin install robotinc@robotinc

# If the sandbox isn't logged in yet, reuse your real credentials (same machine, local reuse only --
# nothing leaves this Mac). Skip this if the install step above didn't prompt you to log in.
cp ~/.claude/.credentials.json "$SANDBOX/.credentials.json"
```

**Session 1 — dispatch a real robot from a home-like cwd (no project `.claude/`):**

```sh
cd "$SANDBOX/home-persona"
CLAUDE_CONFIG_DIR="$SANDBOX" claude -p "Use the Task tool to dispatch subagent_type 'bitforge-engineer' with description 'POSIX gate: e2e relay test' and a prompt telling it to just reply with the single sentence 'Drafted the rate limiter skeleton, needs tests.' and do nothing else (no file edits, no tool calls). Then stop." \
  --dangerously-skip-permissions --allowed-tools "Task"
```

**PASS looks like:** the reply mentions a `↳ 🔩 Bitforge (Engineer)` relay line, and:

```sh
cat "$SANDBOX/otto-state-global.md"
```

shows a header comment plus one line matching:
`· [home-persona] 🔩 Bitforge (Engineer) — POSIX gate: e2e relay test: Drafted the rate limiter skeleton, needs tests.  (YYYY-MM-DD)`

Also confirm no local file was created (there's no project `.claude/` here):

```sh
find "$SANDBOX/home-persona" -iname "*.claude*"   # expect: nothing printed
```

**New for the facts injector — no shell permission prompt appeared.** `--dangerously-skip-permissions` above
auto-approves everything including a Bash call, so a real prompt would not be visible in this scripted run —
check the transcript directly for the tell instead: any Bash call whose command references
`CLAUDE_CONFIG_DIR`, which is exactly what the OLD (pre-facts-injector) behavior looked like.

```sh
TRANSCRIPT=$(find "$SANDBOX/.claude/projects" -iname "*.jsonl" 2>/dev/null | head -1)
grep -o '"name":"Bash","input":{"command":"[^"]*CLAUDE_CONFIG_DIR[^"]*"' "$TRANSCRIPT"   # expect: nothing printed
```

If this prints anything, the model shelled out to resolve `<config>` despite the facts block — either the
facts hook didn't fire (see the failure table below) or the protocol text isn't being honored. **Not covered
by this sandbox's `home-persona/` cwd:** the second bug the facts injector kills (`cwd_is_config_dir` —
override (a) reading a home-dir persona's own state file as false evidence of a prior meeting) needs cwd to
equal `<config>` exactly, which `$SANDBOX/home-persona` deliberately is not (it is a project-shaped cwd, on
purpose, for the relay test above). That collision was verified separately, off this runbook, by planting
`otto-state.md` directly under a redirected home directory's own `.claude/` and confirming the card still
draws — real result recorded in TASKS.md, not re-run here to keep this sandbox's cwd unambiguous for the
relay assertion it already exists to make.

**Session 2 — plant a sentinel so this reads as a returning user, then confirm the brief renders it:**

```sh
date -u +%Y-%m-%d > "$SANDBOX/.otto-met"
cat > "$SANDBOX/otto-profile.json" <<'JSON'
{"seats": ["Generalist / Solo"], "tier": "Level 2 - Operator", "verbosity": "balanced"}
JSON

cd "$SANDBOX/home-persona"
CLAUDE_CONFIG_DIR="$SANDBOX" claude -p "hi" --dangerously-skip-permissions
```

**PASS looks like:** a `| Robot | Working on | Last update |` table with one row containing `Bitforge` and
`rate limiter skeleton` appears somewhere in the reply — i.e., the line written in Session 1 comes back
through the reader (`agents/otto-foreman.md` step 5), not just the writer, now rendered as a table row instead
of a bullet (product-requested render change, post-QA — the state file's own `·` line grammar this row is
built from is unchanged). **The wrapper sentence around that table will vary and that's expected, not a
failure:** the reader is an LLM prompt, not code, and re-running this same step three times on the
pre-table-render build produced *"Welcome back. One thing on the board since last time:"*, *"One thing on the
board from recent work:"*, and once, *"Two things on the board"* (a miscounted preamble with only one item
under it) — all three showed the correct content. **Judge PASS by the table row's content, never by the exact
sentence around it, and don't treat an occasional wrong count in that sentence as a POSIX-specific finding** —
it reproduces on Windows too and is already known, disclosed reader non-determinism, not something this gate
is checking for. The table format itself is a partial mitigation for this exact drift (fixed columns leave
less room for a single-item brief to paraphrase), so also worth a plain look: does the row's Robot/Working
on/Last update content match Session 1's dispatch, regardless of the sentence wrapped around it.

---

## Most likely failure signatures

| Symptom | Likely meaning |
|---|---|
| Step 2 or 3 differs from the expected counts above (anything less than `40/40` / `17/17`, or `validate.mjs` non-zero) | A real regression — stop, do not fix it yourself, report the exact diff back. |
| Session 1 replies normally but `otto-state-global.md` never appears (step 4 `cat` shows "No such file") | **The relay-state hook didn't fire.** This is the exact failure mode `docs/hook-events.md` documents for Windows (matcher `"Task"` vs delivered `tool_name: "Agent"`, or the `hooks.json` `"type"` trap) — if it resurfaces here, it means one of those traps is Windows-specific and POSIX behaves differently, which would be a significant new finding. |
| The `CLAUDE_CONFIG_DIR` grep above prints a Bash call, or a reply visibly narrates checking an env var | **The facts hook didn't fire, or its output was malformed.** Two independent SessionStart entries are registered (`hooks.json`) — confirm both exist (`grep -A2 SessionStart hooks/hooks.json` should show two `"matcher": "startup"` blocks) and that `hooks/otto-facts.mjs` is executable by the `node` on this machine's PATH. Protocol text explicitly falls through to the old shell-required path when the facts block is absent or malformed — this is the documented, non-regressive fallback, but it means the OLD bug is still reachable if the new hook fails to run. |
| The file appears but is empty, or the reply mentions an error | **`node` not found from the hook's spawn environment.** Both `otto-state.mjs` and `otto-facts.mjs` are fail-silent by design (no crash, no stdout) — an *empty* result with no error text is consistent with `node` resolving fine in your interactive shell but not in the environment Claude Code's hook spawns from (a common PATH gotcha on macOS, less so on Linux). Check `which node` and compare to what a hook subprocess would see. |
| `G7` or `9k` (the real concurrent-process tests) go red here but were green on Windows, or the live sequence's global file shows a corrupted/duplicate line after Session 1 | **Lock/`mkdir` semantics differ.** The lock is `mkdirSync`-based (atomic on POSIX, atomic on NTFS, but the *retry/backoff and EEXIST error surface* can differ). This is precisely the kind of thing this gate exists to catch — report the exact file contents, not just "it failed." |

---

## Cleanup

```sh
rm -rf "$SANDBOX"
rm -f "$SANDBOX/.credentials.json"   # no-op if already removed above; safety net
cd ~
rm -rf ~/robotinc-posix-gate
```

## Reporting back

Whatever happens, paste: the `test-otto-state.mjs` last line, the `test-otto-facts.mjs` last line, the
`validate.mjs` line, the two `cat` outputs from step 4, and the `CLAUDE_CONFIG_DIR` grep result from Session 1
(or the error, if any step failed). That's enough for Bitforge or Glitchtrap to read the result without
re-running anything.
