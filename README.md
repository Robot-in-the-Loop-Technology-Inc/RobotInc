# 🤖 RobotInc

**A self-bootstrapping seed prompt that turns Claude Code (or Cursor) into a full company of AI agents.**

`RobotInc.md` is a single portable file. Drop it in, and your AI assistant becomes **Otto** — a
crimson-red vacuum-tube engineering foreman who interviews you about your **role**, your experience level,
and your product, **seats you in the org chart**, pressure-tests the idea, and then **builds real, working
infrastructure** for you: a crew of specialized sub-agents, reusable skills, and slash commands.

It does not *role-play* a company. It writes **real Claude Code primitives to disk** — subagent files
in `.claude/agents/`, skill packages in `.claude/skills/`, commands in `.claude/commands/`, and a
`settings.json` that **enforces** cheap-model defaults and early context compaction.

## Take a seat in the org

The whole company is always built — but you slot into it by your role. The robot matching your seat becomes
a **co-pilot** (it proposes, you decide); every other function runs on **autopilot** and just reports.
Engineers pair with the engineer; designers with the designer; PMs with the project manager; executives sit
beside the CEO and delegate. Non-technical? The interview is plain-English and adapts to you.

| If you are a… | You hold the pen on | The crew auto-runs |
|---|---|---|
| **Engineer** | code & architecture | design, QA, security, GTM, PM, finance |
| **Designer** | UI/UX | architecture, code, tests, infra, GTM |
| **Product Manager** | roadmap & priorities | architecture, code, QA, design, GTM |
| **Executive / Founder** | vision, budget, go/no-go | everything below strategy |

## Quick start

```bash
# Global — Otto loads in every project on your machine (macOS/Linux):
mkdir -p ~/.claude && curl -fsSL \
  https://raw.githubusercontent.com/Robot-in-the-Loop-Technology-Inc/RobotInc/main/RobotInc.md \
  -o ~/.claude/CLAUDE.md
```

On Windows, save `RobotInc.md` as `C:\Users\<you>\.claude\CLAUDE.md`. Then open Claude Code and say
**`System Boot: Initialize Otto`** — your first session profiles you and builds your company once.

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
- **Role-aware.** Onboarding asks your role and capability separately, seats you in the org chart, and tunes
  the crew's autonomy and Otto's verbosity to match. Change seats any time.
- **Role power tools.** Setup also asks which role-specific skills would help and builds them — a spec-writer
  and prioritizer for PMs, a design-token system for designers, a board-update and unit-economics model for
  execs, a scaffold/review/debug kit for engineers — each wired to route the rest of the work through the crew.
- **Cheap by default, enforced.** Every generated sub-agent and skill pins the cheapest model that can do its
  job (haiku for reads/tests/boilerplate, sonnet for features, opus only for strategy/architecture) via real
  `model:` frontmatter and `settings.json` — not a suggestion Otto might forget.
- **Compacts early, on purpose.** `settings.json` lowers the auto-compaction trigger (default ~55%) so the
  working context stays sharp, with hooks that preserve and re-inject what matters across the squeeze.
- **Honest guardrails.** Real enforcement (a hook that blocks committing `.env`, a `model:` field, a
  compaction env var) is written as real files; anything a prompt can only *encourage* (manual compaction
  timing, cost estimates, brevity) is never dressed up as a system that doesn't exist.

---

*By [Robot in the Loop Technology Inc](https://robotintheloop.io).*
