# Changelog

## 20.1.0 — 2026-07-12

**Never make the human learn the product.**

The hiring round shipped in 19.0.0 and almost nobody would ever have found it, because it only fired inside
`/otto` — and Otto, on meeting a stranger, would say *"treat them as Generalist/Solo... and say so once
rather than interrogating them."* Timid. A user with twelve hand-rolled skills would install RobotInc, never
type a slash command, and reasonably conclude the crew had ignored everything they built.

That was a self-inflicted wound: the original design said *"no profile → onboard."* Moving the persona into
Otto's system prompt quietly inverted it.

**Now Otto meets you.** On his first turn with no profile he introduces himself, reads what you have already
built — your agents, skills, commands, settings — seats them under the right departments **without touching
one of them**, and gets to know you conversationally. Not a form. Not a blocker. If you arrived with real
work, he does the work first and learns who you are alongside it.

`/robotinc:otto` still exists for anyone who wants to re-run it deliberately. It is a shortcut, **never the
price of admission.**

**The principle is now doctrine, in all 13 robots:** anything the crew can do without being asked, it does
without being asked. A slash command is something you have to *know*, and a colleague does not make you learn
their filing system before they will help you. If the human had to discover a feature to get its value, the
feature failed — not the human.

This does not weaken consent; it sharpens it, and the tempo rule already drew the line: **reading is a
two-way door — just do it. Writing is a one-way door — always ask.** Otto reads your setup on his own. He
still asks before writing a single byte.

## 20.0.0 — 2026-07-12

**Every seat now has a real kit.** 33 skills, up from 22. The thin robots are gone — our own validator calls a
department with no tools a costume, and one tool was barely better.

Each robot wrote its own kit, in its own voice, in its own lane:

- **📋 Patchbay (Product)** — `spec-writer`, `roadmap`, `user-stories`. A Product Manager who couldn't write a
  spec was half a robot. `roadmap` is strategic (what we build over time, and what we are explicitly *not*
  doing); Gantry's `delivery-plan` is tactical (how one agreed thing lands). They no longer overlap.
- **📞 Dialtone (Support)** — `reply-templates`, `churn-postmortem`, `refund-policy`. Every template is a
  **draft**: he drafts, the human sends. `churn-postmortem` separates "we broke a promise" from "they were
  never the right customer" — opposite responses, and conflating them is how a company chases the wrong users
  forever.
- **📜 Docket (Legal)** — `client-agreement`, `nda-draft`, `privacy-policy`. All three open by saying plainly
  that this is a starting draft and **not legal advice**, and that a qualified lawyer should review it. That
  is the most important sentence in the legal kit, because the person we serve is exactly the one most likely
  to sign something they shouldn't.
- **📦 Gantry (Project)** — `release-checklist`, `blocker-report`. The release gate is the tempo rule made
  operational: *if you cannot state the rollback in one line, it is not ready.* `blocker-report` exists to
  kill the softened status — **"stale" is the useful word.**

### Retiring a department actually saves money — verified

We had been hedging on this for two days. A scoped `permissions.deny: ["Agent(<name>)"]` **removes the agent
from context entirely** — its `description:` is never injected, so a retired department stops costing its ~61
tokens on every turn. Confirmed empirically on a real machine: the agent disappears from Claude Code's roster
the moment the deny lands, and returns when it is removed.

The README said retirement was a feature; now it says what it's worth, and we can prove it.

## 19.1.0 — 2026-07-12

Two coherence bugs. The product was contradicting itself, which disqualifies it from "production-grade"
regardless of how cleanly it installs.

**The roll call introduced a crew that wasn't the crew.** `/otto` never learned Gantry exists, so every new
user's first minute would meet twelve robots and silently skip the thirteenth. Worse, Patchbay's line still
read *"I keep TASKS.md honest and nothing lands on main"* — which is **Gantry's** job now. A new user met a
Product Manager introducing himself as a project manager, and never met the project manager at all. Both
fixed.

**The seed is demoted: it is the spec, not a fallback.** `RobotInc.md` had drifted two versions behind — zero
mentions of the doctrine, tempo, or routines — while the README still promised it worked as a
`~/.claude/CLAUDE.md` seed with *"same persona, same interview."* That was false, and it meant shipping **two
products under one name** — the exact drift the plugin was built to eliminate.

So we stopped pretending. `RobotInc.md` now says plainly, at the top, that it is the **design spec** and must
not be installed. The README's "Legacy install" section is gone. There is one product and one path to it. The
spec keeps its real job: explaining what RobotInc is, why it works this way, and the reasoning behind the
decisions — including the ones we got wrong and reversed.

## 19.0.0 — 2026-07-12

**Installing RobotInc used to be a takeover.** We shipped 13 robots and 21 skills and said nothing about the
crew the user already built — their `db-migrator`, their `seo-checker`, all still on disk, all invisible to
Otto, some of it silently *shadowing* ours with no warning from the platform. This release ends that.

### The hiring round

New skill: **`hiring-round`** (home robot: 🤖 Switchboard). Near the top of `/otto`, and any time after on
request ("run the hiring round again"), it walks `~/.claude/agents/`, `~/.claude/skills/`,
`~/.claude/commands/`, and `settings.json`'s hooks/MCP/permissions — read-only — and gives every asset it
finds a department, a manager, and (if it earns one) a reason Otto reaches for it first.

**The frame is the product:** the user's existing agents and skills are not files to migrate, they're staff
who already work here. Nobody gets fired. Nothing of theirs is deleted, overwritten, renamed, or disabled —
the only thing that changes is *our record* of who works here.

- **Verified, not assumed.** Claude Code injects a user-level agent's `description:` frontmatter into the
  main thread even when the main thread is a pinned `agent:` (`otto-foreman`) — confirmed empirically on a
  real machine. That means existence and trigger are already free, every turn, from the user's own files.
  We record only what the platform doesn't already carry: **preference**, **department**, and **collision**.
  A `prefer[]` list capped at 12, ordered by confidence — not a full roster dump.
- **Collisions are named, not hidden.** A user-level `~/.claude/agents/bitforge-engineer.md` silently wins
  over ours, with no warning from the platform — theirs has been running, ours never has. We say so plainly
  and default to `adopt-in-place`: their file keeps the job, zero files touched, rename only on an explicit
  yes with the diff shown first.
- **The department-retirement bug this closes.** `/otto`'s existing `permissions.deny: Agent(<name>)` step
  now cross-checks every candidate against the collision list first. The deny is keyed on the *name*, not
  the source file — proposing it for a name the user owns would have fired **their** agent to make room for
  ours. Fixed in the same pass that made it visible.
- **An empty payroll is not a failure.** Most users have nothing here. One line — *"nothing on the payroll
  yet, the crew's all yours"* — and onboarding moves on. No interrogation of a clean slate.
- **Two files, split by how often they're read.** `otto-profile.json` (read every session start) gets a
  small `org` stanza — status, counts, the capped `prefer`/`shadowed` lists. The full personnel record,
  fingerprints and all, lives in `~/.claude/otto-org.json`, opened only on request or when it drifts from
  the hot copy.
- **Zero new runtime dependencies.** No hook, no script — `node` isn't guaranteed on a user's machine, which
  is why the old brief hook was removed. The inventory is an agent reading the filesystem at `/otto` time.
- **Disciplined, not enforced — said plainly in the skill.** "Never touch the user's files" is not backed by
  a permission gate; Switchboard still holds `Write`/`Edit`/`Bash`. The real backstop is a fingerprint (size
  + mtime) on every hired asset, which makes loss *detectable and reportable*, not *prevented* — and a
  standing recommendation to keep `~/.claude/` in git, which is the user's backstop, not ours.

Otto's per-turn system prompt grows by one short section — `prefer[]`/`shadowed[]` routing and the `🧩 <id>
(hired · Dept)` trace form — the rest of the cost lives in the skill body, paid only when the hiring round
actually runs.

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
