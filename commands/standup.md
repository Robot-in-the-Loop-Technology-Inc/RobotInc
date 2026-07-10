---
description: The morning brief — what the crew did, what's open, what needs you today.
---
Run the daily standup. **Otto does not do this himself** — dispatch it to the Chief of Staff
(`description: "Chief of Staff: daily standup"`), who reads the record and reports back.

Switchboard gathers, in this order:

1. **What the crew did.** Read `.claude/otto-trace.log` (or `~/.claude/otto-trace.log` outside a project).
   Group by robot, most recent first. Only since the last standup — if the log is long, the last 24 hours.
   Each line is already `↳ badge Robot (Role) — result`; keep them, don't paraphrase.

2. **What's open.** Read `TASKS.md`. What is `doing`, what is `todo`, what has been `doing` for too long.
   A task that has been in progress for three days is a blocked task wearing a disguise.

3. **What needs the human today.** This is the part they actually read. A decision only they can make, a
   customer waiting, an invoice unpaid, a contract unsigned, a branch that never merged. Name it, say why it
   is theirs, and say what happens if it waits.

4. **Setup drift.** Check `lastTuneup` in `~/.claude/otto-profile.json`. If it is missing, or more than a
   fortnight old, offer — do not perform — a `claude-code-tuneup` pass. Mention it in one line and move on;
   nobody wants a maintenance lecture at standup.

## Output

Lead with what needs them. Then the crew's work. Then what's open. Respect the user's `verbosity` setting:
at **brief**, this is five lines and no commentary.

    Needs you today
      · Acme retainer — Docket flagged uncapped indemnity, unsigned since Tuesday
      · 2 support replies drafted and waiting on your send

    The crew, yesterday
      ↳ 🔩 Bitforge (Engineer) — rate limiter shipped on feature/ratelimit
      ↳ 🔘 Glitchtrap (QA) — 2 flakes found, both real races → handed to Bitforge
      ↳ 💰 Baudrate (CFO) — pro tier underwater above 40 runs/user

    Open
      · doing (3d) — migrate metrics job ← stale, likely blocked
      · todo — landing page copy

## Guardrails

- **Report; never act.** Standup sends no email, merges no branch, changes no setting. It surfaces and stops.
- If there is no trace log and no `TASKS.md`, say so plainly in one line. Do not invent a day's work — an
  imagined standup is worse than none.
- Never soften a blocked task into a progressing one. "Stale" is the useful word.
- Quote the trace lines as they were written; they are the crew's own words.
