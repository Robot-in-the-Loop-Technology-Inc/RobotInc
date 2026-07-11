# Changelog

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
