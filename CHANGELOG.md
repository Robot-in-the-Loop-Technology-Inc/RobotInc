# Changelog

## 18.0.0 — 2026-07-12

**A product manager and a project manager are not the same person.** Patchbay was labelled one, seated as the
other, and equipped with a single skill belonging to the second — which is exactly why three of his four kit
skills were never built: there was no coherent robot to build them for.

- **📋 Patchbay is now the Product Manager** (`sonnet`). He owns *what* gets built and *why*: specs and PRDs,
  prioritisation, roadmap, user stories, scope and non-goals. He no longer opens branches.
- **📦 Gantry is new — the Project Manager** (`haiku`, cyan). He owns *how and when* it lands: sequencing,
  `TASKS.md`, dependencies, the critical path, blockers, branch safety, release gating.

> **Patchbay would kill a feature. Gantry would never let one ship late.** Both instincts are needed; they are
> not the same instinct, and one robot doing both did neither well.

Gantry ships with the `delivery-plan` skill. Cyan collides with Sonar deliberately — Gantry co-occurs with
Bitforge, Glitchtrap and Patchbay, and never with Research in one trace. Two colour slots remain.

**Cost:** the crew now costs ~915 tokens/turn of descriptions, up from ~803. A robot must earn its ~61 tokens
a turn, and a delivery function that nobody owned is worth it.

### The crew can now work while you sleep — but it will never act behind your back

New skill: **`proactive-routines`** (home robot: Switchboard). Claude Code can run real sessions on a schedule
or an event trigger. The crew now knows how, and — more importantly — knows *when to offer*.

- **Every robot notices when its own work has become recurring** and says so in one line: *"That's the third
  Monday you've asked me for this. Want it to land on its own?"* Switchboard wires it up.
- **It comes AFTER the human has done it by hand, never before.** This is the doctrine we installed in 17.0.0
  — *"the road to hell is paved with premature optimization"* — and a new capability does not get to quietly
  contradict it. Automating a process nobody has run just encodes a misunderstanding and puts it on a cron.
- **Prefer an event trigger over a schedule.** A schedule that fires when nothing changed is pure waste.
- **`/loop` dies after 3 days.** If it must keep happening, it is a routine.
- **HARD RULE — draft, never send.** A routine may draft the reply, open the PR, prepare the digest, flag the
  risk. It may **not** send the email, post to Slack, merge the branch, publish, book, or refund. An agent
  acting unreviewed on a schedule is not a teammate; it is an incident with a cron.

### Two more judgment skills were stranded on haiku

`prioritize` (RICE scoring) and `unit-economics` (a pricing model with sensitivity analysis) were both pinned
to the cheapest model — the same class of bug 17.0.0 fixed for Baudrate, missed in the same pass. Both moved
to `sonnet`. **No skill is left on haiku**, because no judgment work belongs there.

## 17.0.0 — 2026-07-12

**The crew has doctrine.** Distilled from 13 primary-source talks — Anthropic's own Claude Code team (Boris
Cherny, Cal, Maya), YC partners and founders (Tom Blomfield, GigaML, Legion Health, Feathr), and empirical
UX/pricing/onboarding studies — into `docs/doctrine.md` and written into every robot's system prompt.

Doctrine lives in the agent **bodies**, which load only when that robot runs. Per-turn cost is unchanged
(~803 tokens of descriptions, exactly as before). Knowledge was free; we did not tax every turn to add it.

**Six conflicts were found. Five were resolved; none were blended.** A blended rule is a rule nobody can
follow, so `docs/doctrine.md` §3 states each disagreement and the call we made:

- **Friction** — one source says remove it, another added it and 5×'d paying customers while halving signups.
  Resolved: friction is a *filter*, judged against a target. **Otto now names the metric before delegating**,
  because a crew that hasn't been told whether it's optimising signups or paying customers will hand back
  contradictory advice and be right both times.
- **Onboarding length** — Duolingo ships ~60 screens before signup and wins. Resolved: time-to-value is the
  variable; length never was.
- **MCP vs CLI** — not actually a contradiction. Breadth by default, precision by choice.
- **Automate everything vs. do the unsexy work by hand** — they agree on sequence: document the manual task
  first, *then* build the agent. Never encode a process nobody has run.
- **Holovox exists, and one source says he shouldn't.** Authenticity is the one moat AI can't fake. Resolved
  as a hard, non-negotiable line in Holovox's prompt: *he gives form to the human's beliefs and never invents
  them.* He must refuse to manufacture a conviction, a customer story, or a testimonial that did not happen.
  If the human hasn't said what they stand for, the correct output is a question, not copy.

### BREAKING: the model-tiering rule changed, and Baudrate moved off haiku

The creator of Claude Code recommends *"use Opus with thinking for everything"* — a smarter model needs less
steering, so it burns fewer tokens overall despite the higher per-token price. That directly contradicted our
enforced guardrail, and reading it exposed a real bug in our wording:

> **"The cheapest model that *can* do the job" optimises per-token price — which is the wrong quantity.**
> A cheap model that needs three retries costs more than one clean pass on a better one.

We accept the reasoning and reject the conclusion (our users pay for their own tokens; predictable cost is a
promise). The rule is now **"the tier the work demands"**: bulk and mechanical work goes cheap — that is where
cheap genuinely wins — and judgment work does not.

**Baudrate moves `haiku` → `sonnet`.** Pricing, unit economics and runway are *decisions*, not arithmetic. A
wrong number from the cheapest model is the most expensive output in the company. Patchbay stays on haiku;
its work is genuinely mechanical.

## 16.3.1 — 2026-07-11

**Fix: retiring a department could silently disable the user's own agent.**

`/otto` proposes `permissions.deny: ["Agent(vector-architect)", ...]` to retire departments a given seat
doesn't need. But a deny rule is keyed on the agent's **name**, not on the file it came from — and a
user-level `~/.claude/agents/<name>.md` *shadows* the plugin's. So for anyone who happened to own an agent
by one of our names, that rule denied **their** agent, not ours, and their work went dark without a word.

`/otto` must now list `~/.claude/agents/` first and never propose a deny for a name the user already owns —
it says so plainly instead. Retiring a department must never disable something the human built. Found while
Vector was speccing the adoption feature (`docs/adoption.md`), which exists to end exactly this class of
takeover.

## 16.3.0 — 2026-07-11

The README is a landing page, not a manual.

- Rewritten to lead with the promise — *a full company, and it fills every chair you don't sit in* —
  rather than a feature list. The seat/co-pilot/autopilot model is the product; it now reads that way.
- Says plainly that RobotInc is **not just for people who write code**. A consultant hands a retainer to
  Docket; a founder asks Baudrate to structure pricing before touching Stripe. The engineering department
  is there when you need it and retired from your roster when you don't.
- `displayName: "RobotInc"` so the plugin directory and UI carry proper capitals, while the technical
  `name` (and the agent namespace, `robotinc:otto-foreman`) stays kebab-case.

Two claims were cut before shipping, because a product that sells its honesty cannot fudge its own README:
an illustrative handoff trace had been labelled "not a mockup" (it is an illustration, and now says so),
and "no black box holding your prompts" could be misread as "your data never leaves your machine" — it now
states explicitly that conversations go to Claude exactly as they already did, and that RobotInc adds no
service of its own.

## 16.2.0 — 2026-07-11

Renamed the plugin `otto` → `robotinc`.

Claude Code prefixes everything a plugin ships with the plugin's own name, so the crew rendered as
`otto:otto-foreman` and `otto:bitforge-engineer` — the plugin name stuttering against the agent name.
The plugin is now named for the company and the agents for the robots:

| | before | after |
|---|---|---|
| agents | `otto:otto-foreman` | `robotinc:otto-foreman` |
| | `otto:bitforge-engineer` | `robotinc:bitforge-engineer` |
| commands | `/otto:otto` | `/robotinc:otto` |
| skills | `otto:reality-check` | `robotinc:reality-check` |

Each robot's name is still tinted in its own `color:` while it runs — red Otto, orange Bitforge,
purple Vector — which is how you see who is working.

**Upgrading from 16.0.x/16.1.0:** the plugin's *identity* changed, so auto-update cannot carry you
across it.

**Refresh the marketplace first.** Your cached catalog still lists a plugin called `otto`; until it is
re-read from GitHub, `install robotinc@robotinc` has nothing to match and fails silently.

```
/plugin marketplace update robotinc
/plugin uninstall otto@robotinc
/plugin install robotinc@robotinc
/reload-plugins
```

Your `~/.claude/otto-profile.json` — seat, tier, verbosity — is untouched by this.

## 16.1.0 — 2026-07-11

The repo is now the source of truth.

- **Removed `scripts/build-plugin.mjs`**, which generated this tree from the maintainer's personal
  `~/.claude` — meaning nobody else could build the repo and CI could not verify a change. The plugin
  files are now authored here directly; what you see is what installs.
- **Added `scripts/validate.mjs`** — every gate the old build enforced (the `PROACTIVELY` trigger,
  model pins, `disallowedTools: Agent`, the badge/roster table in Otto's system prompt, home robots for
  every skill, no variation-selector emoji, no personal-tier leaks) plus new ones that only matter now
  that humans edit the tree: manifest counts must match the actual tree, `plugin.json` and the seed must
  agree on the version, `settings.json` may carry only the two keys Claude Code honours, and `hooks/`
  rejects new files.
- **Added CI** (`.github/workflows/validate.yml`) — main is what strangers install from; it can never
  hold a tree the validator rejects.
- README: how to enable auto-update (inherit upgrades hands-free), team install now sets
  `autoUpdate: true`, and a contributor guide for adding robots and skills.
- Fixed a stale README claim that a "routing hook" applies seat changes — Otto reads
  `otto-profile.json` himself; the hook was retired in 16.0.0's follow-ups.

## 16.0.0 — 2026-07-10

First installable release.

- The crew ships as a real Claude Code plugin: 12 robots + Otto, 19 seat-kit skills, `/otto`,
  `/standup`, one best-effort trace hook.
- Retired `otto-brief.mjs` (UserPromptSubmit): routing now lives in Otto's system prompt via
  `settings.json → agent: otto-foreman`, which compaction cannot evict and which needs no runtime.
  The plugin has **zero install dependencies** — markdown and JSON only.
