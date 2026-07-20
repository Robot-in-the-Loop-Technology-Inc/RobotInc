# Spec: Offboarding, install-path delta, upgrade honesty — v22.9

**Owner:** Patchbay (Product) → hands to Gantry for sequencing → Bitforge builds.
**Status:** WIP, uncommitted. Do not merge or reference from `TASKS.md` until Gantry sequences it.
**Trigger:** Andrew — install is already easy; the gap is safe removal, plus one open question on
upgrades being CI/CD.

## Why this exists

RobotInc's whole pitch is *"you own fourteen files you can open, read, and delete."* That promise is
currently only half true. Install never overwrites a user's existing skills/MCP/settings — verified,
shipped, documented. **Leaving has no equivalent guarantee.** Today: no uninstall story exists anywhere
in README or docs, and a real sweep of every hook found five categories of file that survive
`/plugin uninstall` silently, with no mechanism (the plugin spec has no uninstall-hook) to clean them
automatically. A product that is honest about install and silent about removal is not honest about
removal. This spec closes that gap and, while touching install docs, adds the CLI path and gives a
straight answer to "is this CI/CD."

---

## A. Offboarding — `/robotinc:offboard`

### Decision: a command, not a skill — and why

Two commands exist today (`/robotinc:otto`, `/robotinc:standup`); everything else in the product is a
skill, matched ambiently by description. Offboarding goes in the command bucket, not the skill pile,
for one reason: **skills are matched by a classifier reading free text; a consent-gated, potentially
irreversible-adjacent flow needs a deterministic name, not a best-guess match.** `"clean up my
project"` should not have a chance of triggering account teardown instead of `workspace-hygiene`, and
`"get rid of RobotInc"` should not depend on which description string scores higher that session. A
command is the same flow, every time, by name — which is exactly what a beginner deciding to leave
needs it to be.

**Requirement, not optional:** because a command's frontmatter description is only used for the
command palette (not for free-text routing mid-session), add one routing line to Otto's own system
prompt / `agents/otto-foreman.md` so that free text — *"how do I uninstall this," "turn RobotInc off,"
"I want this gone"* — is pointed at `/robotinc:offboard` rather than left for the user to discover the
command name unprompted. **Never make the human learn the product**: the whole point of this feature
is that someone uncertain or upset reaches it without already knowing our naming. This is a one-line
addition to an already-token-budgeted prompt (crew_limits: ~2,933 tok always-on) — budget it, don't
skip it.

### One command answers all three verbs Andrew used

`uninstall` / `turn off` / `unplug` are the same *intent* at different depths, and a beginner does not
know the taxonomy (`disable` vs `uninstall` vs `marketplace remove`) going in. `/robotinc:offboard`
opens by asking which of two outcomes they want, in plain language, before touching anything:

1. **"Just pause it — I might come back."** → No inventory, no cleanup. Print `/plugin disable
   robotinc@robotinc` and explain: plugin stays installed, nothing is touched or deleted, hooks stop
   firing after `/reload-plugins` or a restart, reversible any time with `/plugin enable
   robotinc@robotinc`. Exit here. This path costs nothing and risks nothing — surface it first so
   someone who only wanted quiet doesn't get walked through a teardown they didn't ask for.
2. **"I want it gone — help me clean up first."** → Runs the full flow below, section by section,
   and ends by printing the real uninstall command. `/plugin uninstall` and `claude plugin uninstall`
   are Claude Code's own commands — nothing this product runs can invoke them from inside a command
   body, and there is no uninstall-hook in the plugin spec to hook into. This flow's job is to make
   what happens **before** that command safe, then hand the user the command itself.

### The flow

**1. Say what this does and does not do, up front.** *"This won't uninstall the plugin — Claude Code
doesn't let a plugin remove itself from the inside. What it does: find everything RobotInc left on
this machine, show you all of it, and only remove what you say yes to. At the end I'll give you the
exact command to finish the job."*

**2. Inventory this machine — read-only, nothing written or deleted yet.** Check for each of the
following and report only what actually exists (never assume a category is present):

| Category | What | Exact paths | Default disposition |
|---|---|---|---|
| **1. Silent residue** (ours, safe) | Cross-session state Otto's hooks wrote automatically | `<config>/otto-state-global.md`, `<config>/.otto-met`, `<config>/.otto-pending/` (incl. any stray `<agentId>.json` markers inside it), `<config>/otto-trace.log`, `<config>/otto-ledger.log` (config-dir fallback), and per current project (`<cwd>/.claude/`): `otto-state.md`, `otto-trace.log`, `otto-ledger.log`. Also crash residue if present: `.otto-state.lock` and any `otto-state*.tmp-<rand>` files in either location. | Recommend **delete** — this is exhaust, not data. |
| **2. Their data** (sacred) | `<config>/otto-profile.json`, `<config>/otto-org.json` | Recommend **keep** by default — README already calls the profile *"yours, survives every update"*; a teardown flow should not quietly contradict that promise. Ask this one **separately** from category 1's yes. |
| **3. Settings we added** | Entries `/robotinc:otto` or Switchboard wrote into `<config>/settings.json`: `permissions.deny` for retired departments, `permissions` allowlist entries, `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Show the **reverse diff** (remove exactly what we added, touch nothing the user added by hand) and ask before applying. |
| **4. Their work** (never touched) | `TASKS.md`, `DREAM.md`, deliverables, anything requested work product | **Never offered for deletion, ever** — not even under a blanket "delete everything" request. If asked to delete these, refuse and say why in the same breath. List them here only so the user can see, in writing, that nothing of theirs is on the chopping block. |

**3. Be honest about what this machine can't see.** RobotInc writes to every project it works in, and
there is no registry of which projects those are — only `otto-state-global.md`'s `[project]`-tagged
entries, which record a **name**, not a verified path (a folder can be renamed or moved after the
fact). Building a filesystem-wide scanner to chase those names down was considered and rejected: we
have never run one by hand, a wrong guess means acting on directories without real consent, and a
silently-incomplete "we cleaned everything" is worse than an honest partial. Instead:

- Clean, with full confidence, only: `<config>` (always a known, single path) and the **current**
  project (`<cwd>/.claude/`, verified to exist before touching it).
- Read `otto-state-global.md` for other project *names* it mentions and list them plainly: *"Otto also
  has entries for `kubaicle`, `hippastrippa`, `union-terminal`. I can only act on the machine's config
  and the folder you're standing in right now — run `/robotinc:offboard` again from inside each of
  those to clean them too."*
- Document the residue pattern in the command's own output and in README, so a technical user (or
  their own `find`/`Get-ChildItem`) can finish the sweep by hand: **every file this plugin ever writes
  outside `<config>`'s two sanctioned exceptions matches `otto-*` or `.claude/otto-*`.** That sentence
  is the honest fallback when the tool's reach runs out.

**4. Present the full table, ask for consent per category — never one blanket yes.** Category 1 is
low-risk exhaust; categories 2–3 are data and configuration the user should approve individually. A
single *"yes, clean everything"* must not be interpreted as covering the profile or the settings
reversal — require the user to name what they mean (*"clean the residue," "remove my profile too,"
"revert the settings changes"*), same discipline as `workspace-hygiene`'s one rule: propose, show,
get a yes, never assume the yes was bigger than it was.

**5. Execute only what was confirmed, then print a receipt** — exactly what was removed or reverted,
by path, so nothing happens silently even on the way out.

**6. Close with the two real exits, always, regardless of what was cleaned:**

```
Pause only (fully reversible, nothing removed):
  /plugin disable robotinc@robotinc

Finish removing RobotInc:
  /plugin uninstall robotinc@robotinc
  (or from a terminal: claude plugin uninstall robotinc@robotinc)
```

> **Do not run `/plugin marketplace remove robotinc`.** Claude Code's own docs warn that this removes
> **every plugin from that marketplace**, not just this one — if you ever add another plugin from the
> same source, that command takes it down too. `/plugin uninstall` is the one you want.

**7. One-line team-install caveat**, only shown if relevant context suggests team install (skip if
never mentioned): *"If RobotInc was installed org-wide via `extraKnownMarketplaces` in a committed
`.claude/settings.json`, this doesn't stop teammates from being prompted again — that line has to
come out of the file itself, by whoever owns that repo's settings."*

### Non-goals for A

- Does not, and cannot, call `/plugin disable`, `/plugin uninstall`, or `/plugin marketplace` itself —
  no tool surface exists for a command to invoke Claude Code's own plugin lifecycle. It prepares the
  ground and hands over the exact command.
- Does not scan the filesystem for every project RobotInc ever touched — only `<config>` and the
  current working directory, plus a named (unverified-path) list for the rest.
- Never deletes `TASKS.md`, `DREAM.md`, or any requested deliverable, under any phrasing of consent.
- Does not touch other plugins, other marketplaces, or any file that isn't `otto-*` / RobotInc-owned.
- Does not edit a team's committed `extraKnownMarketplaces` config — that's the repo owner's file.

### Done looks like

- Run on a machine with real residue: accurate inventory (matches what's actually on disk) shown
  before anything is touched, nothing removed without a category-scoped yes, work product never
  appears as deletable, and the session ends with the literal `/plugin uninstall` command, the
  `/plugin disable` alternative, and the marketplace-remove warning — every time, regardless of what
  was or wasn't cleaned.
- Run on a clean machine (never onboarded, or already partially cleaned): says so plainly, finds
  nothing invented, exits without ceremony.
- A Visionary-tier user can complete it start to finish without knowing what a hook, a config
  directory, or JSON is — the table above is Bitforge's implementation detail, not the user's
  vocabulary; command copy explains in plain terms throughout.
- Free-text intent ("uninstall," "turn off," "get rid of RobotInc") reaches this command without the
  user needing to already know its name.

---

## B. Install docs delta

Add a CLI path as a documented alternative to the slash-command path, in `## Install`, directly under
the existing three-line block. Andrew's own framing was "maybe" — there's no evidence anyone has asked
for scripted install; the ICP is a solopreneur already inside Claude Code, for whom the slash-command
path is already zero-friction. It earns its place anyway because it costs nothing (pure documentation,
no new code, no maintenance surface) and it directly serves the one audience that does need it:
anyone bootstrapping a dev container, CI runner, or fleet of machines headlessly. Ship it, but don't
read the "maybe" as a strategy signal — it isn't one.

```
claude plugin marketplace add Robot-in-the-Loop-Technology-Inc/RobotInc
claude plugin install robotinc@robotinc --scope user -y
```

One line under it: *"`--scope user` installs it for you across every project on this machine (the
same as the slash-command path); `-y` skips the confirmation prompt for unattended/scripted runs."*
No true one-liner exists on this platform today (marketplace-add is a required separate step) — say
that plainly rather than imply one.

Add a new **`## Uninstall`** section, a peer to `## Install` (not a subsection of "Staying up to
date" — leaving deserves the same first-class placement as arriving, which is the whole point of this
spec). Contents: point at `/robotinc:offboard` as the guided path, give the raw commands
(`/plugin disable` / `/plugin uninstall` / `claude plugin uninstall`) for anyone who wants to skip
straight there, and place the marketplace-remove trap warning here verbatim (it currently exists
nowhere in README).

### Non-goals for B

- No new install mechanism — CLI path documents the existing `claude plugin install` command; it does
  not add a script, installer binary, or curl-pipe-bash.

### Done looks like

- README has a CLI install block with `--scope user` and `-y` explained in one line each.
- README has an `## Uninstall` section a reader would find by scanning headers, not by reading
  "Staying up to date" top to bottom.
- The marketplace-remove trap appears at least once in README, next to uninstall guidance, in a
  blockquote a skimmer can't miss.

---

## C. Upgrade story — answering "is this CI/CD"

**Finding worth reporting before speccing new copy: most of this is already shipped.** README's
"Staying up to date" section (current `## Install` subsection) already states the pull model
correctly, already names the auto-update toggle and its off-by-default status for third-party
marketplaces, already discloses the open Claude Code issue where auto-update can silently under-apply,
and **already says "CI"** by name — *"CI refuses a release whose content changed without one."* The
honest-upgrade-story work Otto asked for is mostly done. The gap is narrower than the dispatch assumed:

1. **No literal, skimmable answer to the literal question.** Andrew asked "are upgrades CI/CD at this
   point" in those words; the README answers it but never states it that plainly. Add one direct
   sentence near the top of "Staying up to date": *"Short answer: **CI, not CD.** Every release is
   gated by our own pipeline before it publishes (validated, version-bumped, or it doesn't ship) —
   that part is automatic on our side. Getting it onto your machine is still pull, not push: manual
   command, or an opt-in auto-update toggle you turn on yourself. Nobody's crew changes under them
   without a signal they asked for."*
2. **Cross-link to the new `## Uninstall` section** from the bottom of "Staying up to date," so
   someone reading about updates finds the removal path in the same neighborhood, one click away.

No new promises are needed or warranted — the platform genuinely does not support push-based CD to a
third-party plugin today, and the existing copy already declines to oversell that. Do not add
anything implying otherwise.

### Non-goals for C

- No auto-update-by-default change. Off-by-default for third-party marketplaces is a platform
  behavior, not ours to override, and overriding it would contradict "your install is pinned" — a
  promise this README already makes and should keep.
- No new CI capability — this section documents what CI already enforces; it does not propose new
  gates.

### Done looks like

- A reader skimming only bolded text gets the literal CI-yes/CD-no answer without reading the
  surrounding paragraph.
- "Staying up to date" and the new "Uninstall" section reference each other.

---

## Overall non-goals (all three sections)

- Nothing here changes what data RobotInc collects or sends anywhere — offboarding is about local
  file residue and documentation, not telemetry (there is none to begin with).
- No changes to the crew, skills, or hooks themselves — this spec is docs plus one new command.
- No automated cleanup routine (a hook, a scheduled sweep) — per doctrine, that gets proposed only
  after `/robotinc:offboard` has been run by hand enough times to know it's needed and safe.

## Sequencing note for Gantry

B and C are pure documentation edits with no dependency on A and can ship independently, same PR or
earlier. A is new command logic (inventory + category-scoped consent + receipt) and needs its own
review pass, most importantly a negative test: **run it on a machine with nothing installed and
confirm it says so instead of inventing residue** — an offboarding tool that hallucinates files to
delete is the single worst failure mode this spec can ship.

## The one soft fork for Otto to put to Andrew

Not a genuine strategy fork — flagging for visibility only. The CLI install path (item B, first half)
was Andrew's own "maybe," with no user pull behind it yet. Recommended: ship it anyway, since the cost
is one doc block and it serves headless/scripted installs the moment anyone asks. If Otto or Andrew
would rather hold it until someone actually requests scripted install, cutting it costs nothing —
it's fully decoupled from A and C.
