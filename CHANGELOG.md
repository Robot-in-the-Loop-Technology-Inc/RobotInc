# Changelog

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
across it. Uninstall the old one and install the new:

```
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
