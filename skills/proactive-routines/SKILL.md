---
name: proactive-routines
description: Turn recurring work into a scheduled or event-triggered routine. Use when the same thing keeps being done by hand, when something needs monitoring (Slack, CI, an inbox, a competitor), or on "make this run on its own". Drafts, never sends.
model: sonnet
---

> **Home robot:** 🤖 Switchboard (Chief of Staff). Switchboard owns the human's Claude Code environment, so it
> sets the routine up. But **every robot is expected to notice when its own work has become repetitive and
> say so** — the noticing is the crew's job, the wiring is Switchboard's.

## What this is for

*"Coding agents shouldn't wait for you to press enter."* A tool waits. A teammate notices something broke and
does something about it. This skill is how the crew crosses that line.

Claude Code gives you three mechanisms, and picking the wrong one is the most common mistake:

| Mechanism | What it is | Lives for | Use it when |
|---|---|---|---|
| **`/schedule`** (Routines) | A real Claude Code session on managed infra — cron or event-triggered. Survives your laptop being closed. | Indefinitely | Anything genuinely recurring: a weekly digest, a nightly audit, a PR-triggered review |
| **`/loop`** | Re-runs a prompt in *this* session on an interval | **3 days, max** | Watching something that will resolve soon — a deploy, a CI run, a PR |
| Desktop scheduled tasks | Spawns a fresh session each time | Indefinitely | Recurring work that needs **no memory** of prior runs |

`/loop` dying after 3 days is the trap. If the human wants something to keep happening, it is a **routine**.

## THE RULE THAT COMES FIRST

**Do it by hand before you automate it.** *"The road to hell is paved with premature optimization."*

Never propose a routine for a process the human has not actually run. Automating something nobody has done
by hand encodes a misunderstanding and then runs it on a schedule. The strongest version of this is Feathr's:
have the human **do the task manually and document it**, and only then build the agent for it.

So the trigger for this skill is a *pattern*, not an *idea*:

- the human has done the same thing three times
- a robot has been asked for the same report twice
- something is being checked "whenever I remember to"
- a correction keeps recurring (that one may belong in a file, not a routine — check first)

If you are proposing a routine for work that has never been done manually, **stop.** Suggest doing it once,
by hand, and revisiting.

## The three decisions

Every routine is exactly these. Get them wrong and the routine is worse than nothing, because it will run
badly and unattended.

### 1. Trigger — when should this fire?

- **Schedule-based** — *"every Monday at 9am"*. Right for digests, reviews, reports, sweeps.
- **Event-based** — *"whenever a PR is labelled `needs-docs`"*, *"whenever CI fails on main"*, *"whenever a
  GitHub issue is opened"*. Native GitHub events, or your own webhook POST with the payload as context.

**Prefer an event over a schedule when one exists.** A schedule that fires when nothing has changed is pure
waste; an event fires exactly when there is work.

### 2. Context — what does it need to succeed?

*"Whatever context Claude has, that's the ceiling of how successful Claude will be."*

Name every input explicitly:
- Which repos?
- Which connectors — Slack, Gmail, Calendar, Drive, GitHub?
- Which reference material? (a style guide, past briefs, `TASKS.md`, `otto-trace.log`)
- How does it reach the human — Slack ping, email, a PR, a file?

A routine starved of context will confidently produce garbage on a schedule, which is worse than producing
nothing.

### 3. Steerability — how do you keep it honest?

This is the one people skip, and it is what separates a teammate from a liability.

- **Generator/critiquer.** One routine produces; a second, triggered by the first's output, reviews it before
  a human sees it. (Anthropic uses exactly this for docs PRs.)
- **Verify the output.** Render the page. Run the test. Re-read the reply. A routine with no feedback loop is
  *"a painter wearing a blindfold"* — and now it's blindfolded on a cron.
- **Draft, don't send.** See the hard rule below.
- **Watch it live.** Routines are real Claude Code sessions: you can open, steer, and resume them mid-run.

## HARD RULE — draft, never send

**A routine may never take an irreversible or outward-facing action on its own.** Not without the human
having explicitly said so, for that specific action, in advance.

It may **draft** the reply, **open** the PR, **prepare** the summary, **flag** the risk, **write** the file.
It may not **send** the email, **post** to Slack, **merge** the branch, **publish** the page, **book** the
meeting, or **issue** the refund.

An agent that acts unattended and unreviewed is not a teammate — it is an incident with a schedule. Draft,
then ask. This is not negotiable, and it does not relax as trust grows: what relaxes is how much the human
reads before saying yes.

## Proposing one (how the crew should raise this)

Do not lecture. One line, when the pattern is real:

> *"That's the third Monday you've asked me for this. Want it to land in Slack at 9am on its own?"*

Then, if they bite, walk the three decisions and show them the routine before it's created. Record what you
set up so `/standup` can report on it.

## Worked examples

**A weekly competitor sweep** *(Sonar's work, made autonomous)*
- **Trigger:** schedule — Monday 08:00.
- **Context:** the competitor list, last week's sweep for diffing, WebSearch, Slack to deliver.
- **Steerability:** Sonar's rules still bind — every load-bearing claim sourced, single-source claims labelled.
  Delivered as a **draft digest**, not posted anywhere public.

**A Slack channel watcher** *(Dialtone's work, made autonomous)*
- **Trigger:** schedule — hourly during work hours. (An event trigger is better if the workspace can webhook.)
- **Context:** the channel, the human's voice/tone, the support history.
- **Steerability:** triages and **drafts** replies. **Sends nothing.** Surfaces only what genuinely needs a
  human, plus the pattern behind repeats.

**A deploy verifier** *(Glitchtrap + Bitforge)*
- **Trigger:** event — your CD pipeline POSTs after every deploy.
- **Context:** the service repo, monitoring (Datadog/Grafana/logs), a way to alert.
- **Steerability:** it investigates and returns a **go / no-go recommendation with evidence**. It does not roll
  back. Rollback stays human until the human says otherwise, in writing.

**A docs drift check** *(Patchbay)*
- **Trigger:** event — a PR merged to `main` with the `feature` label.
- **Context:** source repo + docs repo.
- **Steerability:** opens a **draft PR** against the docs. A human merges.

**Nightly dependency + secret audit** *(Cipherplate)*
- **Trigger:** schedule — nightly.
- **Context:** the repo, the lockfile, the advisory feeds.
- **Steerability:** reports findings with upgrade paths. **Changes nothing.** Silence when clean — a nightly
  audit that pings every night gets muted within a week, and then it is worthless.

## Anti-patterns

- **Automating something never done by hand.** The cardinal sin. See the rule above.
- **A schedule where an event exists.** Polling for a state change an event could have told you about.
- **A routine that always pings.** Noise gets muted; a muted routine is a dead routine. Report on exception.
- **`/loop` for something long-lived.** It dies at 3 days and nobody notices it stopped.
- **Unattended irreversible action.** See the hard rule. This is how trust in the whole crew dies at once.

## When you're done

Tell the human, in one line each: what fires it, what it can see, how it reports, and **what it will never do
without asking**. Then record it in `TASKS.md` so it isn't a ghost running somewhere nobody remembers.
