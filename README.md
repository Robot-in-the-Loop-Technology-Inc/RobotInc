# 🤖 RobotInc

**A full company of AI agents for Claude Code, installed as real files — not role-play.**

Meet **Otto**, a crimson-red vacuum-tube engineering foreman. He interviews you about your role, seats you
in an org chart, pressure-tests your idea, and then **routes every task to the specialist robot that owns
it** — the architect, the engineer, the QA inspector, the security auditor, the designer, the copywriter,
the CFO, the PM, and the researcher.

The robots are **real Claude Code subagents**, each pinned to the cheapest model that can do its job, each
invoked automatically as work demands. You watch the handoffs happen.

## Install

```
/plugin marketplace add Robot-in-the-Loop-Technology-Inc/RobotInc
/plugin install robotinc@robotinc
```

That's it. Twelve robots plus Otto himself, nineteen seat-kit skills, the `/otto` and `/standup` commands,
and the routing hooks are copied to disk exactly as authored. **No LLM in the bootstrap path, so nothing
can drift.**

Then run `/otto` once. It asks four short questions (your seat, your experience level, your product's
scale, which power tools you want) and writes `~/.claude/otto-profile.json`. Nothing else about the crew
needs generating — it already exists.

### Staying up to date

Turn on auto-update once and you inherit every improvement we ship, hands-free: run `/plugin`, open the
**Marketplaces** tab, select **robotinc**, and **Enable auto-update**. Claude Code then refreshes the
marketplace, updates the plugin, and prompts you to `/reload-plugins` when a new version lands.

Prefer to update manually? Refresh the marketplace yourself:

```
/plugin marketplace update robotinc
```

Your `otto-profile.json` (seat, tier, verbosity) is yours — it lives in `~/.claude/`, outside the plugin,
and survives every update untouched.

### Install it for a whole team

Commit this to a repo's `.claude/settings.json` and everyone who opens the folder and trusts it gets
prompted to install the crew — and inherits updates automatically. No commands to remember, no README
to follow:

```json
{
  "extraKnownMarketplaces": {
    "robotinc": {
      "source": { "source": "github", "repo": "Robot-in-the-Loop-Technology-Inc/RobotInc" },
      "autoUpdate": true
    }
  }
}
```

Finally, add the compaction guardrail to `~/.claude/settings.json` (a plugin ships hooks, but cannot set
your env vars). `/otto` will offer to merge it:

```json
{ "env": { "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "75" } }
```

## Take a seat in the org

The whole company is always built — you slot into it by role. The robot matching your seat becomes a
**co-pilot** (it proposes, you decide); every other function runs on **autopilot** and just reports.

| If you are a… | You hold the pen on | The crew auto-runs |
|---|---|---|
| **Engineer** | code & architecture | design, QA, security, GTM, PM, finance |
| **Designer** | UI/UX | architecture, code, tests, infra, GTM |
| **Product Manager** | roadmap & priorities | architecture, code, QA, design, GTM |
| **Executive / Founder** | vision, budget, go/no-go | everything below strategy |

Change seats any time — *"put me in the Finance seat too"*. That rewrites one field in
`otto-profile.json`; Otto reads it at the start of each session, and *"re-read my profile"* applies it
mid-session. No files are regenerated.

## The crew

**The core runs for everyone.**

| Robot | Department | Handles | Model |
|---|---|---|---|
| 🧰 **Otto** | CEO & Strategy | The Reality Check, routing, sign-off | *main thread* |
| 🤖 **Switchboard** | Chief of Staff | Your inbox, calendar, follow-ups — **and your Claude Code setup** | sonnet |
| 📋 **Patchbay** | PM | Tasks, delivery, branch safety | haiku |
| 🔵 **Holovox** | Sales & Marketing | Landing copy, positioning, SEO | sonnet |
| 💰 **Baudrate** | Finance | Pricing, unit economics, Stripe | haiku |
| 📞 **Dialtone** | Support | Triage, replies in your voice, the pattern behind the tickets | sonnet |
| 🔷 **Sonar** | Research | Sourced facts, competitor and market scans | sonnet |

**Departments you keep only if you need them** — `/otto` retires the rest, and one line brings any back.

| Robot | Department | Handles | Model |
|---|---|---|---|
| 🟣 **Vector** | Architecture | Schemas, API maps, architecture diagrams | opus |
| 🔩 **Bitforge** | Engineering | Clean, modular code on safe feature branches | sonnet |
| 🔘 **Glitchtrap** | QA | Automated + regression tests | sonnet |
| 🔒 **Cipherplate** | Security | Dependency/licence audits, secret hygiene | sonnet |
| 🟢 **Cathode** | Design | Responsive, accessible UI | sonnet |
| 📜 **Docket** | Legal | Contracts, SOWs, NDAs, ToS — the clauses that actually hurt | sonnet |

You never have to remember a robot's name — describe the work and Otto routes it.

**You always know who's working.** Each robot's name is tinted in its own colour while it runs, and its badge
rides the result line: `↳ 📜 Docket (Legal) — 4 clauses flagged, indemnity uncapped`. Every robot that runs
also appends a line to `.claude/otto-trace.log`.

## How you can tell it's actually working

Ask for something cross-functional (*"add rate limiting to the telemetry endpoint"*) and you should see
Claude Code invoke `vector-architect`, then `bitforge-engineer`, then `glitchtrap-qa` — each as a real
subagent call, each followed by a one-line trace:

```
↳ Vector — rate-limit schema + middleware boundary drafted
↳ Bitforge — middleware + config on feature/rate-limit
↳ Glitchtrap — 4 tests added, green
```

Every robot that runs also appends a line to `.claude/otto-trace.log`.

**If Otto answers everything himself and no subagent ever fires, something is wrong.** That is the bug
the v16 release exists to fix.

## Design principles

- **Deterministic install.** The crew ships as files. Earlier versions asked the model to write the crew
  on first run; it silently dropped the `use PROACTIVELY` trigger from six of them and the routing
  quietly died. Infrastructure is shipped, never generated.
- **Delegate by default.** Routing is the product. Otto writes no production code, no tests, and no copy.
- **Routing that survives compaction.** Installing sets `agent: otto-foreman`, so the crew roster, the badge
  map, and the delegate-by-default rule live in Otto's *system prompt* — present every turn by construction,
  and not something compaction can evict.
- **No runtime dependencies.** Nothing you install needs Node, Python, or a package manager. The plugin is
  markdown and JSON. If you can run Claude Code, you can run RobotInc.
- **Cheap by default, enforced.** Every subagent and skill pins the cheapest model that can do its job via
  real `model:` frontmatter. (Never set `CLAUDE_CODE_SUBAGENT_MODEL` — it *overrides* every pin and
  collapses the tiering rather than flooring it.)
- **Honest guardrails.** Real enforcement (a `model:` field, a hook, an env var) is shipped as real files.
  Anything a prompt can only *encourage* — manual compaction timing, cost estimates, brevity — is never
  dressed up as a system that doesn't exist. The activity trace, for instance, is rendered by Claude
  Code's native subagent UI and by Otto relaying each robot's closing line; no hook draws it, and we say so.

## What this plugin does to your machine (read this)

**It runs local code when a robot finishes.** RobotInc installs exactly one hook:

- `hooks/otto-trace.mjs` runs when a robot finishes, and appends one line to `otto-trace.log`. It sends
  nothing anywhere.

That hook is the only part of RobotInc that needs `node` on your PATH, and it is **best-effort**: without
Node the log file is simply never written. Nothing else changes — the handoffs still appear in Claude Code's
native subagent UI, and routing is unaffected, because routing lives in Otto's system prompt rather than in a
hook. You never have to install anything to use this plugin.

Claude Code shows **no consent dialog, no warning, and no sandbox** for plugin hooks — they execute with the
same privileges as Claude Code itself. That is true of every plugin you will ever install, including this one.
The file is short, dependency-free, and readable in a minute. **Read it before you install.**

`/otto` will also propose changes to your `~/.claude/settings.json` — the compaction threshold, a permissions
allowlist, and `permissions.deny` for the departments you retired. It always shows the diff and waits for a
yes. It never connects an email account or a calendar on your behalf.

**It changes your main thread.** Installing sets `agent: otto-foreman`, so Claude Code speaks as Otto in every
session. Remove the plugin, or override `agent` in your own settings, to undo it.

## Extending RobotInc (contributors & forks)

**This repo is the source of truth.** The files you see — `agents/`, `skills/`, `commands/`, `hooks/` —
are exactly what Claude Code installs, byte for byte. There is no build step and no generator: edit a
file, and that edit *is* the change. (Until 2026-07-11 a script generated this tree from the maintainer's
personal `~/.claude`; that script is gone, and with it the only reason you couldn't contribute.)

The gates live in `scripts/validate.mjs`. CI runs it on every push and PR; run it yourself before
committing:

```bash
node scripts/validate.mjs
```

**To add a robot:** create `agents/<name>.md` with `name:` (kebab-case, matching the filename), `color:`,
`model:`, a `description:` containing the literal phrase `use PROACTIVELY` (this string drives
auto-delegation — without it the robot sits idle forever), and `disallowedTools:` including `Agent`
(robots must not spawn robots; Otto mediates every handoff). Then give it a row in `otto-foreman.md`'s
roster table and at least one skill — the validator rejects a robot with no skills, because a department
without tools is a costume.

**To add a skill:** create `skills/<name>/SKILL.md` with `model:` and a `**Home robot:**` line naming the
crew member that owns it. Every skill answers to a robot, even when the human drives it.

**Never add a hook that the persona depends on.** The one shipped hook (`otto-trace.mjs`) is best-effort
by design, because `node` is not guaranteed on a user's machine. Anything load-bearing belongs in Otto's
system prompt (`agents/otto-foreman.md`), which is enforced by `settings.json → agent` and cannot be
evicted by compaction. The validator rejects new files in `hooks/`.

## Legacy install (single file)

`RobotInc.md` is still here and still works as a plain `~/.claude/CLAUDE.md` seed. It carries the persona,
the interview, and the philosophy — but on this path the crew is generated by the model rather than
installed, which is exactly the drift the plugin exists to eliminate. **Prefer the plugin.**

```bash
mkdir -p ~/.claude && curl -fsSL \
  https://raw.githubusercontent.com/Robot-in-the-Loop-Technology-Inc/RobotInc/main/RobotInc.md \
  -o ~/.claude/CLAUDE.md
```

---

*By [Robot in the Loop Technology Inc](https://robotintheloop.io).*
