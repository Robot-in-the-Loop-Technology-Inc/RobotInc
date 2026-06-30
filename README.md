# 🤖 RobotInc

**A self-bootstrapping seed prompt that turns Claude Code (or Cursor) into a full company of AI agents.**

`RobotInc.md` is a single portable file. Drop it in, and your AI assistant becomes **Otto** — a
crimson-red vacuum-tube engineering foreman who interviews you about your experience level and your
product, pressure-tests the idea, and then **builds real, working infrastructure** for you:
a crew of specialized sub-agents, reusable skills, and slash commands.

It does not *role-play* a company. It writes **real Claude Code primitives to disk** — subagent files
in `.claude/agents/`, skill packages in `.claude/skills/`, and commands in `.claude/commands/`.

## The crew

| Robot | Role | Handles |
|---|---|---|
| **Otto** | CEO 🔴 | Strategy, the Reality Check, routing the rest of the crew |
| **Vector** | Architect 🟣 | Schemas, API maps, architecture diagrams |
| **Bitforge** | Engineer ⚙️ | Clean, modular code on safe feature branches |
| **Glitchtrap** | QA 🔘 | Automated + regression tests |
| **Cipherplate** | Security 🛡️ | Dependency/license audits, secret hygiene |
| **Cathode** | Design 🟢 | Responsive, accessible UI |
| **Holovox** | Sales 🔵 | Landing copy, positioning, SEO |
| **Baudrate** | CFO 🟡 | Pricing/Stripe, unit economics, model-cost discipline |
| **Patchbay** | PM 🟠 | Task tracking, git branch safety, context compaction |

You never have to remember a robot's name — describe the work and Otto routes it.

## Install

**Global (every project on your machine):**
- macOS/Linux: save `RobotInc.md` as `~/.claude/CLAUDE.md`
- Windows: save it as `C:\Users\<you>\.claude\CLAUDE.md`

**Per project (commit it so a team shares the workflow):**
- save `RobotInc.md` as `./CLAUDE.md` in your repo root.

That's it. Your **first** Claude Code session profiles you, builds your global company once, and installs
an `/otto` command. After that every project inherits the crew automatically — established repos stay in
quiet standby, new products get the full diagnostic + build-out.

**Start a build any time:** type `/otto`, or send `System Boot: Initialize Otto`.

## Design principles

- **Build once, apply everywhere.** The crew lives globally and is inherited by every project; you never re-onboard.
- **Deterministic, non-intrusive.** Silent standby in established repos; full onboarding only on a new
  project or explicit `/otto`. Never writes files or runs `/init` without asking.
- **Honest guardrails.** Real enforcement (e.g. a hook that blocks committing `.env`) is offered as real
  files; disciplined practices (model-switching, cost estimates) are never dressed up as systems that don't exist.

---

*By [Robot in the Loop Technology Inc](https://robotintheloop.io).*
