# 🤖 RobotInc

### A full company, seated inside the editor you already have.

An architect. An engineer. A QA inspector. A security auditor. A designer. A sales & marketing lead. A
CFO. A product manager. A project manager. A support rep. A researcher. A lawyer. A chief of staff. And
**Otto**, the crimson-red vacuum-tube foreman who routes every task to whichever one owns it.

That's not a metaphor and it isn't one model doing thirteen impressions. It's **fourteen real Claude Code
agent files** — dispatched by Claude Code itself, each one running as itself, its name tinted in its own
colour while it works. You watch the handoffs happen.

You take **one seat** in the company. The robots fill every other chair, and report back.

## Install

```
/plugin marketplace add Robot-in-the-Loop-Technology-Inc/RobotInc
/plugin install robotinc@robotinc
```

Then run `/otto` once. Four short questions — your seat, your experience level, your product's scale,
which power tools you want — and you're staffed. Nothing gets generated; the crew, the 21 seat-kit
skills, and the routing already exist on disk, byte for byte, the moment you install.

## Watch it work

Ask for something ordinary and cross-functional — *"add rate limiting to the telemetry endpoint"* — and
the handoffs arrive in your session like this:

```
↳ 🟣 Vector (Architect)  — rate-limit schema + middleware boundary drafted
↳ 🔩 Bitforge (Engineer) — middleware + config on feature/rate-limit
↳ 🔘 Glitchtrap (QA)     — 4 tests added, green
```

Three real subagent calls, each one a colour-tinted name in Claude Code's own UI, each followed by a
one-line result. Nothing narrated, nothing role-played. (That's an illustration of the format, not a
transcript — but the shape is exactly what you get.) Every robot that fires also appends its line to
`.claude/otto-trace.log`, so the trail survives after the conversation scrolls away.

If Otto ever answers everything himself and no subagent fires — that's the bug, not the feature.

## One seat. A whole company fills the rest.

This is the actual promise, not a tagline: whatever seat you *don't* sit in, a robot already owns it,
end to end, and just reports the outcome.

| If you're the… | You hold the pen on | The crew runs autopilot on |
|---|---|---|
| **Engineer** | code & architecture calls | design, QA, security, GTM, pricing, PM |
| **Designer** | the UI/UX calls | architecture, code, tests, security, GTM |
| **Founder / solopreneur** | vision & go/no-go | everything below strategy |
| **Consultant** | the actual client work | the contract review, the invoice terms, the pricing |
| **Marketer** | positioning & copy | the schema, the tests, the security audit |

The robot sitting in your seat becomes a **co-pilot** — it proposes two or three options and waits for
your call. Every seat you *didn't* take runs on **autopilot**: it acts on routine work and only
interrupts you for a genuine fork or risk. A bookkeeper reviewing a contract never meets the architect —
`/otto` retires the departments a given seat doesn't need, and one line brings any of them back.

## Not just for people who write code

RobotInc's core seven — chief of staff, PM, sales & marketing, finance, support, research, and Otto
himself — run for everyone. A consultant hands a retainer offer to **Docket** and gets back the clauses
that will actually hurt, in plain English. A founder asks **Baudrate** to structure pricing tiers before
touching Stripe. A marketer asks **Holovox** for landing copy pitched at the audience they named. None of
that touches a line of code, because none of it needs to. The engineering department — architect,
engineer, QA, security, design — is there when you need it and gone from your `/otto` roster when you
don't.

## The crew

**Core — runs for everyone**

| Robot | Role | Handles | Model |
|---|---|---|---|
| 🧰 **Otto** | Foreman / CEO | Routes every task, runs the Reality Check, signs off | *main thread* |
| 🤖 **Switchboard** | Chief of Staff | Inbox, calendar, follow-ups — and your Claude Code setup itself | sonnet |
| 📋 **Patchbay** | Product | Specs & PRDs, prioritisation, roadmap, user stories — *what* to build and *why* | sonnet |
| 📦 **Gantry** | Project | Sequencing, dependencies, blockers, branch safety, release gating — *how and when* it lands | haiku |
| 🔵 **Holovox** | Sales & Marketing | Landing copy, positioning, launches, SEO | sonnet |
| 💰 **Baudrate** | CFO | Pricing tiers, unit economics, Stripe structure | sonnet |
| 📞 **Dialtone** | Support | Triage, replies in your voice, the pattern behind repeat tickets | sonnet |
| 🔷 **Sonar** | Research | Sourced facts — competitor scans, vendor evaluations, "what's current best practice" | sonnet |

**Departments — opt in per seat; retire the rest with one line**

| Robot | Role | Handles | Model |
|---|---|---|---|
| 🟣 **Vector** | Architect | Schemas, API route maps, architecture diagrams — before code exists | opus |
| 🔩 **Bitforge** | Engineer | Clean, modular code and fixes, on isolated feature branches | sonnet |
| 🔘 **Glitchtrap** | QA | Automated tests, regression-first on bugs | sonnet |
| 🔒 **Cipherplate** | Security | Dependency/licence audits, secret hygiene, obvious vulnerabilities | sonnet |
| 🟢 **Cathode** | Design | Responsive, accessible UI — multiple layout options, not one guess | sonnet |
| 📜 **Docket** | Legal | Contracts, SOWs, NDAs, ToS — the clauses that actually hurt | sonnet |

Every robot is pinned to **the tier its work actually demands** — real `model:` frontmatter, not a setting
you have to remember to check. Bulk and mechanical work runs cheap, because that is where cheap genuinely
wins. Judgment work does not, because a cheap model that needs three retries costs more than one clean pass.
You never need to know a robot's name; describe the work and Otto routes it.

## Why here, and not somewhere else

RobotInc doesn't ask you to open a new tab, learn a new app, or hand your files to a hosted service. It
runs *inside* the tool you already write code, review contracts, and draft copy in — reading the files
that are actually on your machine. Install it and you own fourteen `.md`/`.json` files you can open, read,
and edit yourself: every robot's prompt is right there in plain text, with nothing hidden from you. (Your
conversations still go to Claude, exactly as they already do — RobotInc adds no service of its own, and
sends nothing anywhere.) And there's nothing new to pay for — it runs on the Claude subscription you
already have.

## What this does to your machine (read this)

RobotInc installs exactly **one** hook: `hooks/otto-trace.mjs`, which fires when a robot finishes and
appends one line to `otto-trace.log`. It sends nothing anywhere. It's the only part of the plugin that
touches `node`, and it's best-effort — without Node on your PATH, the log simply isn't written. Nothing
else breaks: the handoffs still render in Claude Code's native subagent UI, and routing is unaffected,
because routing lives in Otto's system prompt, not in a hook.

Claude Code shows no consent dialog and no sandbox for plugin hooks — true of every plugin you'll ever
install, this one included. The file is short and dependency-free. Read it before you install; that
should take about a minute.

Installing also sets `agent: otto-foreman`, so Claude Code speaks as Otto every session. Remove the
plugin, or override `agent` in your own settings, and you're back to stock. `/otto` will separately
propose changes to your `~/.claude/settings.json` — compaction threshold, a permissions allowlist,
`permissions.deny` for retired departments — and always shows the diff first. It never connects an email
account or a calendar without you saying so.

We say this plainly because we'd rather you trust the parts that are real than take our word for the
parts that aren't. Anywhere this plugin can only *encourage* good behaviour — manual compaction timing,
cost estimates, brevity — we say that too, instead of dressing a habit up as a system.

## Zero runtime dependencies

No Node, no Python, no package manager to install. The plugin is markdown and JSON, copied to disk
exactly as authored — no generation step, no LLM in the bootstrap path, nothing that can drift on the way
in. If you can run Claude Code, you can run RobotInc. Mac or Windows.

## Extending RobotInc

This repo is the source of truth — `agents/`, `skills/`, `commands/`, `hooks/` are exactly what installs,
byte for byte. `node scripts/validate.mjs` runs the same gates CI does: every robot needs the literal
phrase `use PROACTIVELY` in its description (that string drives auto-delegation) and at least one skill (a
department with no tools is a costume); every skill names the robot that owns it. See `CHANGELOG.md` for
what shipped and why.

## Legacy install (single file)

`RobotInc.md` still works as a plain `~/.claude/CLAUDE.md` seed if you can't install plugins — same
persona, same interview. On that path the crew is generated by the model rather than installed, which is
the exact drift the plugin exists to eliminate. Prefer the plugin.

```bash
mkdir -p ~/.claude && curl -fsSL \
  https://raw.githubusercontent.com/Robot-in-the-Loop-Technology-Inc/RobotInc/main/RobotInc.md \
  -o ~/.claude/CLAUDE.md
```

---

*By [Robot in the Loop Technology Inc](https://robotintheloop.io).*
