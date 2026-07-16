# Activity Window — v0

Local viewer for the crew's live event feed. Ugly-but-real: shows who's
working, what they're doing, what they finished, and what it cost — pulled
straight from the same files Otto's hooks already write. No pixel art yet
(Cathode's next pass); this build proves feed → server → screen.

## Run it

```
node viewer/server.mjs
```

Then open **http://localhost:4173**

That's it — no build step, no npm install, no config. It reads your real
`~/.claude/.otto-pending/`, `otto-trace.log`, and `otto-ledger.log` (or
`$CLAUDE_CONFIG_DIR` if you've set that) on every poll, so what you see is
whatever the crew is doing on this machine right now.

Optional: `PORT=5000 node viewer/server.mjs` to use a different port.

## What it shows

- **Working now** — one card per robot currently mid-task (a live
  `.otto-pending/*.json` marker), with badge, colored name, role, what it
  was told to do, and how long it's been running. Clears the instant the
  robot finishes.
- **Recently finished** — the last 8 completions from `otto-trace.log`,
  joined against `otto-ledger.log` for token/duration cost where available.

Polls `/state` every 500ms. Stop it with Ctrl+C.
