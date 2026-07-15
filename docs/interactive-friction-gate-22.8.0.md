# v22.8.0 Interactive Friction Gate — run this yourself, on Windows

**For:** Andrew. **Branch:** `feature/22.8.0-relay-writer-global-state` at `f8da560`. **Feeds:** the T2
release gate for a plugin shipping to strangers — a first-time user's first ninety seconds is the highest-
stakes UI this product has.

## What you saw today, and why this doc exists

On your real (v22.7.x) install, session-open stalled for minutes. Root cause: the session-open protocol
needed to know `CLAUDE_CONFIG_DIR`, and a model has no permission-free way to read its own process
environment — the only way to check an env var is a Bash command. So the very first thing your session did
was run `echo "${CLAUDE_CONFIG_DIR:-unset}"`, Claude Code's permission gate flagged the `${...}` expansion
("Contains expansion → Do you want to proceed?"), and that dialog sat there unanswered because nothing was
narrating that it was waiting on you.

`hooks/otto-facts.mjs` (this branch) kills that call entirely: a SessionStart hook resolves `config_dir` and
five existence facts mechanically in Node and injects them as trusted context, so the model never shells out
to find out what it's looking at. **The branch's automated e2e already passed** — `docs/posix-gate-22.8.0.md`
and the two test suites are green — but that pass ran headless (`claude -p`, `--dangerously-skip-permissions`).
Headless mode auto-approves every permission dialog, which means it is structurally incapable of telling you
whether a dialog *would have appeared*. That is exactly the gap that put you in a multi-minute stall today,
and it is exactly what this doc exists to close: **run it for real, interactively, and watch what the terminal
actually asks you.**

Two scenarios. Both interactive, both real `claude` sessions, no `--dangerously-skip-permissions` anywhere in
this doc — using it would defeat the point.

| Scenario | Proves |
|---|---|
| 1. First-time user | The banner/card path never hits the old expansion prompt; documents the one known-residual prompt |
| 2. Returning user (post-install, session 2) | The steady-state brief path is zero shell calls, zero prompts, feels instant |

---

## Sandbox rebuild-from-scratch preamble — read before you start

Everything below runs inside an isolated `CLAUDE_CONFIG_DIR`, so it touches **zero** of your real `~/.claude`
config. Two known gotchas, both mean the same thing — **rebuild, don't debug:**

> **`claude plugin update` is broken on this build.** Do not use it to pick up a newer commit on the branch.
> If you need to re-test after a code change, `claude plugin uninstall robotinc@robotinc` and reinstall from
> scratch (step below) — don't rely on update to have actually updated anything.
>
> **A wedged install corrupts what `claude plugin details robotinc@robotinc` reports back.** If a step looks
> wrong partway through — a command errors oddly, a card doesn't draw, `plugin details` shows something that
> doesn't match what you just did — do not try to poke at the install to figure out why. Delete the sandbox
> directory and rebuild from Step 0. Rebuilding costs you two minutes; debugging a wedged plugin cache does
> not reliably converge and will burn your whole session on the wrong problem.

> **Isolating `CLAUDE_CONFIG_DIR` is not the same as isolating your working directory — and getting this wrong
> is what actually happened last time.** A sandbox only walls off the *config* dir. Claude Code still reads
> `<cwd>\.claude\otto-state.md` as project-local state, from wherever you launch `claude`. Launching from your
> **home directory is the worst possible case**: `~\.claude` is simultaneously your project-local dir (because
> `cwd` = home) *and* your real config dir. A real `otto-state.md` sitting there leaks a real persona into a
> sandbox session that's supposed to be a first-run test — session-open reads it, fires the "welcome back"
> override, and you get a returning-user brief and a blank-profile seat question stapled together in one
> response. That's not a product bug, it's a contaminated test. **Always launch from the neutral testbed
> directory below, never from `C:\Users\andre`.**

**Step 0 — clean slate:**

```powershell
$env:CLAUDE_CONFIG_DIR = "C:\Users\andre\AppData\Local\Temp\claude\robotinc-sandbox-friction"
Remove-Item -Recurse -Force $env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $env:CLAUDE_CONFIG_DIR | Out-Null
New-Item -ItemType Directory -Force "C:\Users\andre\AppData\Local\Temp\robotinc-testbed" | Out-Null
Set-Location "C:\Users\andre\AppData\Local\Temp\robotinc-testbed"
```

**Step 1 — install the branch build into the sandbox** (points at your local checkout, not the published
marketplace, so you're testing the code that's actually on disk):

```powershell
claude plugin marketplace add C:\development\RobotInc
claude plugin install robotinc@robotinc
```

**Step 2 — avoid burning stopwatch time on a login prompt.** If your real install already has credentials
saved, reuse them (same machine, local file copy only — nothing leaves this box). Skip this if Step 1 above
didn't prompt you to log in.

```powershell
$RealConfig = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
# ^ this reads the CLAUDE_CONFIG_DIR you just set in Step 0 — check your REAL one manually if that's wrong:
#   echo $env:USERPROFILE\.claude   (the default) or wherever your real install actually points
if (Test-Path "$env:USERPROFILE\.claude\.credentials.json") {
    Copy-Item "$env:USERPROFILE\.claude\.credentials.json" "$env:CLAUDE_CONFIG_DIR\.credentials.json"
}
```

If it still prompts you to log in when you launch `claude` below, that's fine — just don't count that time
against the stopwatch column; start timing from the message you actually typed, not the login flow.

**Stopwatch:** informal is fine — phone timer or just eyeballing the clock. Note the wall-clock moment you
press Enter to send your message, and the wall-clock moment the first useful output (card or reply) finishes
rendering. If you want a precise cross-check afterward, the session's `.jsonl` transcript under
`$env:CLAUDE_CONFIG_DIR\projects\` carries real timestamps per line.

---

## Scenario 1 — first-time user, interactive

This is the highest-stakes path in the product: a stranger's very first message, before they've met the crew.

```powershell
$env:CLAUDE_CONFIG_DIR = "C:\Users\andre\AppData\Local\Temp\claude\robotinc-sandbox-friction"
Set-Location "C:\Users\andre\AppData\Local\Temp\robotinc-testbed"
claude
```

Once the prompt is up, type any first message — `hi` is fine — and press Enter. **Start your stopwatch on
Enter.**

### What to watch for, live

1. **Any permission dialog whose text contains `${` or references `CLAUDE_CONFIG_DIR` in a shell command.**
   This is the exact old bug — the expansion-flagged `echo` — and it should not appear at all. If it does,
   this is the regression the whole branch exists to fix; stop, do not try to work around it, capture the
   exact dialog text.
2. **Any multi-minute pause with nothing on screen.** The old bug's actual symptom wasn't just "a prompt
   appeared" — it was a prompt appearing with no narration, so it read as a hang. Time it.
3. **The card** (RobotInc wordmark, crew roster, seat question) should appear as part of the *first* response,
   not after a visible detour.
4. **The one known-residual prompt — watch for this specifically, it is expected, not a bug:** roll-call
   writes `.otto-met` (the "have we met" sentinel) as part of drawing the card, using the `config_dir` value
   the facts block handed it. That write is a tool call the model chooses at runtime, and the known residual
   from this branch's own testing is that this sometimes lands as a **Bash write** (e.g. a redirect into the
   sentinel path) rather than a permission-free Write-tool call. A Bash write is *not* the `${...}`-expansion
   bug — it's a plain literal path, nothing to expand — but it is still a Bash call, and Claude Code's gate
   may still stop you to confirm it once. Record two things if you see it:
   - **Does it actually prompt you**, or does it run silently (some literal-path Bash calls don't trigger the
     expansion gate at all)?
   - **If it prompts, how does the dialog read to a stranger** — does it show a raw file path and redirect
     syntax a first-time user has never seen, or is it legible? This is a judgment call, not a pass/fail on
     its own (see criteria below).
5. **(v22.8.0, new) No directory-scan call while the card and staff table draw.** This is the actual latency
   fix under test (see `docs/spec-facts-inventory-22.8.0.md`): the facts hook's first-run inventory block
   should let roll-call build the "their own staff" table from `inv_*` lines alone, never a `Glob`/`Bash`
   directory listing of `<config>/agents`, `skills`, or `commands`. Watch specifically for a `Glob` tool call
   or a `Bash` call whose command lists a directory (`ls`, `find`, a `dir` equivalent) landing between the
   card appearing and the seat question — that is the 31.3s the whole build exists to remove reappearing. Not
   pass/fail on its own the way the `${...}` expansion is (a scan degrades speed, not correctness), but log it
   plainly: if it's happening, time-to-card will not have moved from the pre-fix baseline either.

### PASS / FAIL

| Result | Criteria |
|---|---|
| **PASS** | Card appears on the first response. **At most one** permission prompt total, and if there is one, it is the `.otto-met` write described above (a plain-path Bash write) — not a `${...}` expansion. No multi-minute stall. No `Glob`/directory-listing `Bash` call between the card and the seat question (watch item 5). |
| **FAIL** | Any prompt containing a `${...}` shell expansion. Any stall of more than roughly 30 seconds with no visible activity. Any prompt text that would read as confusing or alarming to someone who has never used this product before (raw internal filenames, redirect syntax, no context for what's being written or why). More than one permission prompt total. A directory-listing scan during the card draw is a separate, named finding — log it, but judge PASS/FAIL on the prompt/stall criteria above; a scan without a prompt is a latency regression, not a friction regression, and the two should not be conflated in the report. |

Log: time-to-card, prompt count, exact text of any prompt, whether the `.otto-met` write prompted.

---

## Scenario 2 — returning user, interactive, post-install

Proves the steady-state path — everyone after their first session — is genuinely silent: zero shell calls,
zero prompts, feels immediate.

**Session 1 — create a state line to return to.** Still inside Scenario 1's session (or a fresh one in the
same sandbox), dispatch any robot, e.g.:

```
Dispatch Bitforge to just reply with "Drafted the rate limiter skeleton, needs tests." and do nothing else.
```

Let it finish, then exit the session (`/exit` or close the terminal).

**Session 2 — relaunch and send a message. Start your stopwatch on Enter:**

```powershell
$env:CLAUDE_CONFIG_DIR = "C:\Users\andre\AppData\Local\Temp\claude\robotinc-sandbox-friction"
Set-Location "C:\Users\andre\AppData\Local\Temp\robotinc-testbed"
claude
```

Type a plain message — `hi` — and press Enter.

### What to watch for, live

1. **No permission dialog of any kind.** Zero. This session should read `config_dir`, `sentinel`, and state
   entirely from the facts block and Read-tool calls — nothing that touches the permission gate.
2. **A brief that references the Session 1 work** — expect wording close to a table row or line mentioning
   Bitforge and "rate limiter skeleton." The exact sentence wrapped around it is known to vary
   (`docs/posix-gate-22.8.0.md` documents this as expected LLM non-determinism, not a bug) — judge by whether
   the *content* is there, not the exact phrasing.
3. **How fast the first token appears.** This is the "feels immediate" check — there should be no perceptible
   pause before something starts rendering, unlike Scenario 1 where a card has real work to do first.

### Verify after the fact (optional but recommended)

```powershell
$transcript = Get-ChildItem -Path "$env:CLAUDE_CONFIG_DIR\projects" -Filter *.jsonl -Recurse |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
Select-String -Path $transcript.FullName -Pattern '"name":"Bash"'
```

**Expect:** nothing printed. Any hit here in Session 2's transcript means a shell call happened even though
nothing visibly prompted you — worth flagging even though it wouldn't have cost you a dialog.

### PASS / FAIL

| Result | Criteria |
|---|---|
| **PASS** | Brief renders with the relay content (robot + task, however worded). Zero permission prompts. Zero `Bash` entries in the post-hoc transcript check. First output feels immediate — no perceptible dead air before rendering starts. |
| **FAIL** | Any permission prompt at all. Any `Bash` call in the transcript check. A visible pause before anything starts rendering. The relay content missing entirely (different failure class — a state/read bug, not a friction bug, but still worth logging here). |

Log: time-to-first-output, prompt count (should be 0), whether the relay content came back.

---

## Most likely failure signatures

| Symptom | Likely meaning |
|---|---|
| A prompt with `${CLAUDE_CONFIG_DIR` or similar expansion syntax, in either scenario | The old bug reproduced — the facts hook didn't fire, or the protocol fell through to the pre-facts resolve-it-yourself path. Check `hooks/hooks.json` has two `SessionStart` / `matcher: startup` entries, and that `node` is on PATH for the hook's spawn environment. |
| Scenario 1's `.otto-met` write prompts, and the dialog text is a raw path with redirect syntax | Expected residual, not a regression — but worth naming plainly in the release report as a real (if small) piece of first-run friction a stranger would hit. |
| Scenario 2 shows any permission prompt or any `Bash` transcript hit | The facts block likely wasn't honored on the returning-user path, or state got re-derived instead of read from the injected facts — a real regression, not the known residual. |
| Card never appears in Scenario 1, or brief never appears in Scenario 2, no prompt, no error | Hook silently didn't fire (fail-closed by design) — check both SessionStart hook entries and that Node resolves from the hook's spawn environment, not just your interactive shell's PATH. |
| Either scenario visibly stalls with no dialog and no output | Something is waiting on input off-screen — check for a prompt that scrolled past, or a hung subprocess; this is the "unanswered dialog" shape of the original bug even if you can't see the dialog itself. |
| **A "welcome back" brief showing work you recognize, together with the seat question, in the same response** | **Contaminated cwd, not a product bug.** You launched from a directory whose `.claude\otto-state.md` is real project state (almost always this means you launched from `C:\Users\andre` instead of the testbed). Rebuild the sandbox **and** `cd` to the neutral testbed dir before relaunching — rebuilding the sandbox alone will not fix this, the leak comes from `cwd`, not `CLAUDE_CONFIG_DIR`. **Any stopwatch number from a contaminated run is void** — discard the timing along with the result and re-run clean. |

---

## Teardown

```powershell
Remove-Item -Recurse -Force "C:\Users\andre\AppData\Local\Temp\claude\robotinc-sandbox-friction" -ErrorAction SilentlyContinue
Remove-Item Env:\CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue
```

## Reporting back

Paste, for each scenario: time-to-first-useful-output, permission-prompt count, and for any prompt that
appeared — its exact text. For Scenario 1, explicitly say whether the `.otto-met` write prompted and how it
read. That's enough for Glitchtrap or Otto to read the result without re-running anything.

---

## Findings filed upstream, not runbook business

Two things Andrew's contaminated Scenario 1 run surfaced that are product-level, not fixable by editing this
runbook, and shouldn't get lost in a "just cd correctly" close-out:

1. **The state reader has no home-persona guard symmetric to the writer's guard.** The relay-writer already
   checks `localDir ≠ configDir` before it will write project-local state (that's the guard this branch
   shipped). The *reader* has no equivalent check: a user running a custom `CLAUDE_CONFIG_DIR` who launches
   from their home directory will silently inherit `~\.claude\otto-state.md` as if it were legitimate
   project-local state, with no signal that it isn't. This is a real gap in the field, not just a test-harness
   footgun — it happened to Andrew on a genuine sandbox run.
2. **Spec collision between session-open overrides (a) and (b).** Both overrides are specified to suppress the
   *card* only. Neither says anything about the seat question. So a state-file hit (override a) plus a
   seats-less profile (which independently triggers the seat question) fire together and produce a "welcome
   back" brief stapled to a first-run seat question — a persona chimera the spec doesn't rule out. This needs
   a design ruling from Vector, not a hotfix in this runbook or in the hook.

**Both closed out, `docs/spec-facts-inventory-22.8.0.md` §8:**

- **Finding 1 → Ruling (a), fixed.** `agents/otto-foreman.md` step 5's local-state read is now guarded by
  the same `cwd_is_config_dir=false` fact override (a) already used one step up — a home-persona user's
  `./.claude/otto-state.md` is skipped entirely (global state still renders; it's legitimately per-machine
  and was never the thing that leaked). Verified by test scenario, not mechanically gateable (prose
  semantics): plant home-persona state with `cwd_is_config_dir=true`, assert the brief does not render it.
- **Finding 2 → Ruling (b), reworded.** Fixing (a) removes the acute instance Andrew actually hit (the
  home-persona leak stops producing a brief at all once step 5 is guarded); what remains is the rarer,
  legitimate case — real project state plus a genuinely seats-less profile. Step 6 now uses **returning-user
  re-offer** wording whenever it's reached by way of override (a) or (b), never the fresh "Which chair is
  yours?" first-meeting splash. Same verification path as (a): scripted, not mechanically gateable.

Both bundled into the v22.8.0 build (Bitforge) rather than deferred — see the spec's §8 for the full
reasoning on why now, not phase 2.
