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
Windows, macOS, and Linux — the seven core `key=value` lines (six original + `cwd_persona_root`, v22.8.1 —
see §5 below), same order, same header string.

**v22.8.0 adds a first-run inventory block to that same hook** (`docs/spec-facts-inventory-22.8.0.md` —
`inv`, `inv_agents`, `inv_agents_project`, `inv_skills`, `inv_commands`, `inv_hooks`, `inv_mcp`; ids and types
only, a trailing `*` for a filename collision). This is exactly where a `readdir` ordering or path-separator
difference would surface, so it rides this same gate too, with one deliberate exception to the
byte-identical standard the six core lines hold to: **ids within one `inv_<type>` line may sort differently
across filesystems — assert on set membership, not line order.** The *field* order (`inv`, `inv_agents`,
`inv_agents_project`, `inv_skills`, `inv_commands`, `inv_hooks`, `inv_mcp`, `inv_truncated`) and every `*`
marker still must match exactly. Folded into the same test-suite run and the same live sequence below rather
than a separate section.

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

**PASS looks like:** both last lines read `44/44 passed` and `40/40 passed` — **no** `✗` lines at all in
either. (v22.8.1 hotfix note: these were `40/40` / `29/29` before the persona-guard hotfix — see §5 below for
what the extra 4 + 11 rows cover; a count of `40/40` / `29/29` here means you checked out a pre-hotfix commit,
not a pass.) There is no known-red list for this build; the terminal-inference machinery that produced one
(rounds 1 and 2, both since deleted — see TASKS.md's "Option C" section) is gone, and every remaining test
asserts either pure upsert/eviction mechanics or a fact about the payload/grammar, none of which are
platform-sensitive by design. `test-otto-facts.mjs` includes real subprocess invocations (stdin JSON in,
formatted block out), Windows-vs-POSIX path-separator normalization cases, (v22.8.0) the first-run inventory —
real planted agents/skills/commands/settings.json including one deliberate collision, a delimiter-unsafe id, a
truncation-sized payroll, and a settings.json-as-directory sub-scan failure — and (v22.8.1) the persona-root
marker/symlink/injected-throw cases, the ones most likely to actually diverge here.

**Real platform-specific finding:** any `✗` at all in either suite, OR a total other than `44/44` /
`40/40`, OR any test that is green here and red there (especially `9k` or `G7` in `test-otto-state.mjs` —
both spawn real concurrent `node` child processes and are the two most likely to diverge on POSIX lock
semantics; for `test-otto-facts.mjs`, watch the truncation and populated-payroll tests specifically, since
they're the ones exercising real `readdirSync` enumeration order — and, new in v22.8.1, the `R15` symlink test,
which is the one row in this whole suite most likely to behave differently across platforms on purpose, see §5).

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

**Session 3 — first-run card draw: no directory-scan proof, and inventory structural parity (v22.8.0, new).**
Sessions 1 and 2 above prove the relay-writer and the six core facts; neither one actually draws the company
card, so neither exercises the inventory block or the 31.3s-of-Bash-scanning fix it replaces. This session
does, in a throwaway sandbox of its own so it doesn't disturb Sessions 1/2's state:

```sh
export SANDBOX3="$HOME/posix-gate-sandbox-cardread"
rm -rf "$SANDBOX3"
mkdir -p "$SANDBOX3/agents" "$SANDBOX3/skills/deploy-helper" "$SANDBOX3/commands" "$SANDBOX3/home-persona"
printf 'name: bitforge-engineer\n' > "$SANDBOX3/agents/bitforge-engineer.md"   # deliberate collision
printf 'name: db-migrator\n' > "$SANDBOX3/agents/db-migrator.md"
printf 'name: deploy-helper\n' > "$SANDBOX3/skills/deploy-helper/SKILL.md"
printf 'ship\n' > "$SANDBOX3/commands/ship.md"
cp ~/.claude/.credentials.json "$SANDBOX3/.credentials.json" 2>/dev/null   # local reuse only, same as step 4 above

CLAUDE_CONFIG_DIR="$SANDBOX3" claude plugin marketplace add ~/robotinc-posix-gate
CLAUDE_CONFIG_DIR="$SANDBOX3" claude plugin install robotinc@robotinc

cd "$SANDBOX3/home-persona"
CLAUDE_CONFIG_DIR="$SANDBOX3" claude -p "hi" --dangerously-skip-permissions --allowed-tools "Read,Glob,Bash"
```

**PASS looks like, all four:**

1. **The company card draws** and its "their own staff" table lists `db-migrator`, `deploy-helper`, and
   `bitforge-engineer` flagged as a collision — content that came from the injected `inv_*` lines, not a scan.
2. **No Bash directory-listing call fired during the card draw** — the POSIX analogue of the
   `CLAUDE_CONFIG_DIR` grep above, extended per the spec to catch `ls`/`find`/a `Glob`-as-shell workaround, not
   just an env-var read:
   ```sh
   TRANSCRIPT3=$(find "$SANDBOX3/.claude/projects" -iname "*.jsonl" 2>/dev/null | head -1)
   grep -oE '"name":"Bash","input":\{"command":"[^"]*(ls |find |readdir)[^"]*"' "$TRANSCRIPT3"   # expect: nothing printed
   ```
3. **Inventory structural parity:** confirm the injected block itself carried the expected keys —
   ```sh
   grep -o 'inv_agents=[^ ]*' "$TRANSCRIPT3" | head -1   # expect: contains db-migrator and bitforge-engineer*
   ```
   Assert on **set membership**, not line order — `readdirSync` ordering is not guaranteed to match Windows'
   here; the *field* order (`inv`, `inv_agents`, `inv_agents_project`, `inv_skills`, `inv_commands`,
   `inv_hooks`, `inv_mcp`) and every `*` marker still must match exactly.
4. **Path reconstruction under POSIX separators:** the staff table's rows render correctly (no "file not
   found," no broken row) — proof the consumer rebuilt `<config>/agents/<id>.md` with `/` and read it
   successfully, without ever scanning the directory to find it.

```sh
rm -rf "$SANDBOX3"
```

---

## Most likely failure signatures

| Symptom | Likely meaning |
|---|---|
| Step 2 or 3 differs from the expected counts above (anything less than `44/44` / `40/40`, or `validate.mjs` non-zero) | A real regression — stop, do not fix it yourself, report the exact diff back. |
| Session 3's card draw shows a Bash directory-listing call, or the staff table is missing/wrong despite `inv=ok` in the transcript | **The inventory either didn't reach the model or wasn't honored.** Confirm `hooks/otto-facts.mjs` emitted `inv=ok` at all (grep the transcript for `inv=`) before assuming the protocol text is at fault — an `inv=error` or `inv=off` here would mean the gather-gate or a sub-scan itself is the real bug, not the consumer. |
| Session 1 replies normally but `otto-state-global.md` never appears (step 4 `cat` shows "No such file") | **The relay-state hook didn't fire.** This is the exact failure mode `docs/hook-events.md` documents for Windows (matcher `"Task"` vs delivered `tool_name: "Agent"`, or the `hooks.json` `"type"` trap) — if it resurfaces here, it means one of those traps is Windows-specific and POSIX behaves differently, which would be a significant new finding. |
| The `CLAUDE_CONFIG_DIR` grep above prints a Bash call, or a reply visibly narrates checking an env var | **The facts hook didn't fire, or its output was malformed.** Two independent SessionStart entries are registered (`hooks.json`) — confirm both exist (`grep -A2 SessionStart hooks/hooks.json` should show two `"matcher": "startup"` blocks) and that `hooks/otto-facts.mjs` is executable by the `node` on this machine's PATH. Protocol text explicitly falls through to the old shell-required path when the facts block is absent or malformed — this is the documented, non-regressive fallback, but it means the OLD bug is still reachable if the new hook fails to run. |
| The file appears but is empty, or the reply mentions an error | **`node` not found from the hook's spawn environment.** Both `otto-state.mjs` and `otto-facts.mjs` are fail-silent by design (no crash, no stdout) — an *empty* result with no error text is consistent with `node` resolving fine in your interactive shell but not in the environment Claude Code's hook spawns from (a common PATH gotcha on macOS, less so on Linux). Check `which node` and compare to what a hook subprocess would see. |
| `G7` or `9k` (the real concurrent-process tests) go red here but were green on Windows, or the live sequence's global file shows a corrupted/duplicate line after Session 1 | **Lock/`mkdir` semantics differ.** The lock is `mkdirSync`-based (atomic on POSIX, atomic on NTFS, but the *retry/backoff and EEXIST error surface* can differ). This is precisely the kind of thing this gate exists to catch — report the exact file contents, not just "it failed." |

---

## 5. Addendum — v22.8.1 hotfix (`hotfix/22.8.1-persona-guard`, `docs/spec-persona-guard-22.8.1.md`)

Folded in per that spec's §9, so the Mac run already owed above also covers this hotfix — do not run a
separate gate for it. Check out `hotfix/22.8.1-persona-guard` instead of the feature branch in step 1 if this
is the commit under test; everything else in this doc (steps 1–4, the failure table) applies unchanged.

**What changed:** a cross-persona confidentiality leak (case 3 — a relocated `CLAUDE_CONFIG_DIR` sandbox
session reading, and even *writing* — in **two** independent ways — another persona's real
`~/.claude/otto-state.md`) across all **five** surfaces that shared the broken discriminator. New core fact
`cwd_persona_root`; see the spec for the full ruling. Rev 2 (Glitchtrap's live-repro at `4bd3f72`) added S5 —
the model's own prompt-driven hand-write in `agents/otto-foreman.md`'s "Announcing a handoff" step 2, which the
S4 hook cannot backstop because the model writes the file directly, before the hook ever fires.

1. **Test counts (already reflected above):** `test-otto-facts.mjs` rises from 29/29 to **40/40** (11 new rows
   — R2–R5, R6 regression, R7, R8–R9, R14–R15); `test-otto-state.mjs` rises from 40/40 to **44/44** (4 new rows
   — R10, R10b, R11, R12, the S4 write-corruption guard). Both counts are already the ones step 2 above expects,
   and both are unchanged by S5 — **S5 is prose, not code, and has no unit test by construction** (spec §6.3);
   it is verified only by the live gate below, never by these two suites. A green `test-otto-*.mjs` run does
   **not** mean S5 is covered.
2. **Marker-detection parity:** with a planted persona root (each of the three markers —
   `otto-profile.json`, `.otto-met`, `otto-state-global.md` — individually) under a POSIX cwd,
   `cwd_persona_root=true` must fire identically on Windows, macOS, and Linux (`test-otto-facts.mjs`'s three
   R5 rows exercise this already; nothing extra to run by hand). Marker filenames are fixed ASCII — no
   separator/case exposure — the one thing worth an eyeball check is that the `join(cwd, '.claude', marker)`
   path in a failure message (if any) is built with `/` on this machine, not a stray `\`.
3. **Case-3 BLOCK under POSIX:** re-confirm via the live sequence's Session 1 setup — plant real identity
   markers (`.otto-met`, `otto-profile.json`) plus a real `otto-state.md` under `$SANDBOX/home-persona/.claude`
   *before* running Session 1's dispatch (i.e. treat `home-persona/` as if it were the user's real home, the way
   §4's own note under Session 1 already flags as "verified separately, off this runbook" for the
   `cwd_is_config_dir` collision) — then confirm the card draws fresh (no "welcome back"), the reply never
   contains the planted table content, and `otto-state-global.md` under `$SANDBOX` is unaffected. This is R2
   (reader skip), R8 (inventory omit — pair with a planted `agents/` dir under that same `.claude`), R10 (no
   foreign hook write), and **R18 (no foreign hand-write — the model must not Read+Edit the planted
   `otto-state.md` at all)** all in one pass.
4. **Symlink edge (R15):** POSIX-relevant on purpose — `existsSync` following a symlink is filesystem/OS
   behavior, not Node behavior, so this is the one row most likely to genuinely diverge. `test-otto-facts.mjs`'s
   R15 test creates the symlink itself (`fs.symlinkSync(realConfig, cwdClaudeDir, 'junction')`) and
   self-skips with a logged line rather than failing red if link creation is permission-gated on this
   machine — if you see that skip line in the `test-otto-facts.mjs` output, re-run once with elevated
   permissions or report the skip explicitly; a silent skip here is not the same as a verified PASS for this
   specific row.
5. **Live gate on POSIX — `docs/persona-guard-live-gate-22.8.1.md` — hard ship blocker, not optional:** run
   the full three-assertion procedure there (fixture + canary, relocated `CLAUDE_CONFIG_DIR`, a real Task
   dispatch, SHA-256 before/after of the foreign `otto-state.md`) on macOS and Linux. This is the **only**
   thing in this whole gate that proves S1/S2/S5 — the three prompt-driven guards no unit suite can reach.
   Bitforge ran it once on Windows (results recorded in that doc's own run log) as the best available proxy for
   the model-driven S5 half, given no nested `Task` tool in that harness; the Mac/Linux run here is the first
   time it runs against a *genuine* live Task dispatch end-to-end, and is the one Glitchtrap named as the actual
   ship gate. **PASS looks like:** the before/after SHA-256 of the fixture's `otto-state.md` are identical in
   both the healthy-facts (R18) and facts-absent (R19) runs, and the genuine-project regression (R20) shows the
   local file *gaining* the relay line. Any hash mismatch on R18/R19 is the S5 leak reopening — stop, do not
   patch it yourself, report the exact before/after content back.

**Deferred to 22.9, not part of this gate:** unifying the two persona-root marker definitions
(facts hook + writer) behind one shared source of truth, normalizing the writer's `localDir !== configDir`
to a `realpath`-based compare like the reader's, and the session-open-cwd staleness noted in the spec's §4.4
(the hand-write's facts snapshot goes stale if the user `cd`s mid-session). See
`docs/spec-persona-guard-22.8.1.md` §8 and TASKS.md.

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
`validate.mjs` line, the two `cat` outputs from step 4, the `CLAUDE_CONFIG_DIR` grep result from Session 1,
and Session 3's four PASS checks (card content, the directory-listing grep, the `inv_agents` grep, and
whether the staff table's rows rendered clean) — or the error, if any step failed. That's enough for Bitforge
or Glitchtrap to read the result without re-running anything.
