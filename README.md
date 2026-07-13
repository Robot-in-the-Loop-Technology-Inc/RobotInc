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
/reload-plugins
```

Then **restart Claude Code once.** `/reload-plugins` is supposed to be enough on its own, but it does not
currently rebuild the command index — so the restart is what actually makes every robot and skill appear. We
would rather tell you that than have you wonder why the crew looks half-installed.

**That's the whole setup. There is no step two.**

Open Claude Code and Otto is already there. He introduces himself, looks at what you have already built —
your own subagents, skills and commands — and seats them under the right departments without touching a
single one of them. Then he gets to know you in a few questions, asked like a person rather than a form. If
you came in with actual work to do, he does the work first and gets to know you alongside it.

You never have to run a command, learn a name, or read a manual to get the value. *(`/robotinc:otto` exists
if you want to re-run that deliberately, or re-seat yourself later. It is a shortcut — never the price of
admission.)*

Nothing gets generated. The crew, the 38 skills, and the routing already exist on disk, byte for
byte, the moment you install.

### Staying up to date

**Your install is pinned.** Claude Code records the version at install time and does not go looking for a new
one — so nothing about your crew changes underneath you. When you want what we shipped since:

```
/plugin marketplace update robotinc     # refresh the catalog
/plugin update robotinc@robotinc        # pull the new version
/reload-plugins                         # then restart Claude Code
```

**This manual path is the one we vouch for.** Auto-update exists — `/plugin` → **Marketplaces** → **robotinc**
→ **Enable auto-update** — and when it works it does exactly what you'd hope. But it is **off by default for
third-party marketplaces like ours**, and there are open Claude Code issues where it refreshes the catalog
without actually reinstalling the plugin, leaving you on the old build while reporting you're current. Turn it
on if you like; **don't rely on it to have delivered a fix you're waiting for.** Run the three lines above and
you know.

*(We'd rather say that than have you think you have a fix you don't. Every version we publish is a real bump —
CI refuses a release whose content changed without one, because Claude Code uses that version string as its
cache key: ship a fix without bumping it and every existing install silently skips the update.)*

Your `~/.claude/otto-profile.json` — seat, tier, verbosity, what the crew learned about you — is **yours**. It
lives outside the plugin and survives every update untouched.

> **Upgrading from `otto@robotinc`?** The plugin was renamed in 16.2.0, and a rename is the one thing
> auto-update cannot carry across. **Refresh the marketplace first** — your cached catalog still lists the
> old name, so installing the new one matches nothing and fails quietly:
>
> ```
> /plugin marketplace update robotinc
> /plugin uninstall otto@robotinc
> /plugin install robotinc@robotinc
> /reload-plugins
> ```

### Install it for a whole team

Commit this to a repo's `.claude/settings.json`. Everyone who opens the folder and trusts it is prompted to
install the crew — and inherits updates automatically. No commands to remember, no README to follow:

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
`/otto` retires the departments a given seat doesn't need, and one line brings any of them back. Retiring is
not cosmetic: a `permissions.deny` on an agent **removes it from context entirely**, so a retired department
stops costing you its ~61 tokens on every turn. A bookkeeper never meets the architect, and never pays for
him either. (Verified on a real machine — the agent disappears from Claude Code's roster the moment the deny
lands, and returns when it's removed.)

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

RobotInc installs exactly **two** hooks, and neither sends anything anywhere. `hooks/otto-trace.mjs` fires
when a robot finishes and appends one line to `otto-trace.log`. It's the only part of the plugin that
touches `node`, and it's best-effort — without Node on your PATH, the log simply isn't written. Nothing
else breaks: the handoffs still render in Claude Code's native subagent UI, and routing is unaffected,
because routing lives in Otto's system prompt, not in a hook.

A second hook fires once, at session start: a bare shell `echo` of a static string, no script file and no
runtime — it just reminds Otto in-context to check whether he's met you yet. If it fails to fire for any
reason, nothing breaks: the same rule is written in full in Otto's system prompt, so behaviour degrades to
that, never to a crash and never to a repeated first meeting.

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

## Reading the design

`RobotInc.md` is the **specification** — what RobotInc is, why it works the way it does, and the reasoning
behind the decisions, including the ones we got wrong and reversed. `docs/doctrine.md` is what the crew
believes and where it learned it, with every conflict between sources named rather than blended.

Neither is installable, and `RobotInc.md` is **not** a `CLAUDE.md` fallback. It used to be. A hand-maintained
parallel copy of a living product drifts — and it did, falling two versions behind and describing a crew that
no longer existed. Keeping it would have meant shipping two products under one name, which is the exact
failure the plugin exists to prevent. The plugin is the product; there is no second path.

---

*By [Robot in the Loop Technology Inc](https://robotintheloop.io).*
