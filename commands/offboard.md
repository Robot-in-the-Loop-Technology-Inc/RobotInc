---
description: Offboard from RobotInc — safely remove files, review settings, or pause the plugin.
---
> **`<config>` = the Claude config directory: the `CLAUDE_CONFIG_DIR` environment variable if set, otherwise
> `~/.claude`. **Check it; never hardcode the path** — a user who moves their config would otherwise get a crew
> reading a different machine's files.

**Say what this does and does not do, before touching anything.** This command cannot uninstall the plugin
itself — Claude Code does not let a plugin remove itself from the inside, and there is no uninstall-hook in
the plugin spec to hook into. What it does: find everything RobotInc left on this machine, show you all of
it, and remove only what you say yes to. It ends by printing the exact command to finish the job.

## 1. Which outcome do you want?

Ask, in plain language, before running anything below:

- **"Just pause it — I might come back."** → Print `/plugin disable robotinc@robotinc` and explain plainly:
  the plugin stays installed, nothing is touched or deleted, hooks stop firing after `/reload-plugins` or a
  restart, and it's reversible any time with `/plugin enable robotinc@robotinc`. Stop here — no inventory, no
  cleanup, nothing was ever at risk.
- **"I want it gone — help me clean up first."** → Continue to step 2.

## 2. Inventory this machine — read-only, nothing written or deleted yet

Check for each category below and report only what actually exists. Never assume a category is present, and
never invent a path that isn't really there.

| Category | What it actually is | Exact paths | Default |
|---|---|---|---|
| **1. Silent residue** (ours, safe to clear) | Bookkeeping RobotInc's hooks wrote on their own, in the background, while you worked | `<config>/otto-state-global.md`, `<config>/.otto-met`, `<config>/.otto-pending/` (and any stray marker files inside it), `<config>/otto-trace.log`, `<config>/otto-ledger.log`; in the **current project's** `./.claude/`: `otto-state.md`, `otto-trace.log`, `otto-ledger.log`; and, if a session ever crashed mid-write: `.otto-state.lock` and any `otto-state*.tmp-<rand>` files in either location | Recommend **delete** — this is exhaust, not data |
| **2. Your data** (sacred) | The profile the crew built up about you and your org | `<config>/otto-profile.json`, `<config>/otto-org.json` | Recommend **keep** — the README already promises this file is "yours, survives every update"; don't quietly contradict that here. Ask this **separately** from category 1 |
| **3. A few settings we changed** | Small edits `/robotinc:otto` or Switchboard made to your own Claude Code settings — retiring departments, a couple of performance tweaks | Entries in `<config>/settings.json`: `permissions.deny` for retired departments, `permissions` allowlist lines, `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Show the exact reverse of what we added — nothing you set by hand — and ask before applying it |
| **4. Your own work** (never touched) | Anything you asked the crew to build | `TASKS.md`, `DREAM.md`, and any other deliverable you asked for | **Never offered for deletion, ever** — not even under "just delete everything." Listed here only so you can see, in writing, that none of it is on the chopping block |

## 3. What this machine can and can't see

RobotInc writes into every project it works in, and there's no verified list of which ones — only names
mentioned inside category 1's global log, and a name isn't a checked path (a folder can be renamed or moved
since). So be honest about the edges:

- Clean, with full confidence, only `<config>` (one known path) and the **current** project's `./.claude/`
  (checked to actually exist before touching it).
- If that global log names other projects, list them plainly and say: run `/robotinc:offboard` again from
  inside each of those to clean them too — this command can't reach out and do it for you.
- For anyone who'd rather finish the sweep by hand: every file this plugin writes, outside the two sanctioned
  exceptions in category 2, matches the pattern `otto-*` or `.claude/otto-*`. That's the whole rule.

## 4. Ask per category — never one blanket yes

Present the table from step 2 in full. Ask about each category **separately** — a single "yes, clean
everything" does not cover your profile or a settings revert on its own; make the user say what they mean
("clean the residue," "remove my profile too," "revert the settings changes"). If they ask to delete category
4 under any phrasing, refuse and say why in the same breath — that part is never negotiable.

## 5. Execute, then print a receipt

Touch only what was explicitly confirmed. Then print exactly what was removed or reverted, by path — nothing
happens silently, including the parts that were said yes to.

## 6. Always close with both exits

Print this regardless of what was or wasn't cleaned above:

```
Pause only (fully reversible, nothing removed):
  /plugin disable robotinc@robotinc

Finish removing RobotInc:
  /plugin uninstall robotinc@robotinc
  (or from a terminal: claude plugin uninstall robotinc@robotinc)
```

> **Do not run `/plugin marketplace remove robotinc`.** It removes every plugin from that marketplace, not
> just this one — if you ever add another plugin from the same source, that command takes it down too.
> `/plugin uninstall` is the one you want.

If anything suggests this was installed for a whole team (a committed `.claude/settings.json` naming
`extraKnownMarketplaces`), add one more line: *"This doesn't stop your teammates from being prompted again —
that line has to come out of the file itself, by whoever owns that repo's settings."* Skip this line entirely
if nothing points to a team install.

## If the machine turns out to be clean

Say so plainly — *"nothing found here, this machine is clean"* — and stop there. Never invent a file to give
the flow something to do, never propose deleting something that isn't actually present, and still offer both
exits from step 6 regardless.
