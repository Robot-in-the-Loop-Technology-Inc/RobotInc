# `otto-profile.json` — the one definition

`~/.claude/otto-profile.json` is the only file that carries **who the human is** across sessions. Otto reads
it on the first turn of every session, so **every byte here is paid for on every turn, forever.** Keep it
small; put detail in the files it points at.

**Nothing in this file is written without showing the human the change and getting a yes.** No exceptions.

Five files read or write this. They must all agree with *this page*, and none of them may restate the schema:
`agents/otto-foreman.md` (reads) · `commands/otto.md` (writes) · `commands/standup.md` (reads `lastTuneup`) ·
`skills/roll-call/SKILL.md` (writes at first meeting) · `skills/hiring-round/SKILL.md` (writes `org`) ·
`skills/workspace-hygiene/SKILL.md` (writes `workspace`) · `skills/claude-code-tuneup/SKILL.md`
(writes `lastTuneup`).

## Sibling files — not this schema, and not consent-gated

Four files sit beside `otto-profile.json` at session open. **None of them are `otto-profile.json`, none of
them require a yes before writing, and each answers exactly one question.** A robot reading the wrong one for
a given question is the drift this table exists to prevent.

| File | Answers | Consent | Written by |
|---|---|---|---|
| `<config>/.otto-met` | Have we met this user at all? | Not gated — operational bookkeeping | `roll-call`, the instant the card is drawn |
| `./.claude/otto-state.md` (this project, cwd only — never `<config>`) | What has each robot recently worked on — active work among it? Upsert only, no clear path; cap-8 recency eviction, not a done/active classifier (tried twice, failed in opposite directions both times) | Not gated — same footing as the trace log | `agents/otto-foreman.md` (prompt-driven, at relay time), **and** `hooks/otto-state.mjs` (mechanical backstop, at Task completion — `SubagentStop` for background, `PostToolUse` for foreground) — same grammar, same upsert key; the hook exists because the prompt-driven write alone measured 0/15 |
| `<config>/otto-state-global.md` | Same question, across ALL projects on this machine, tagged `[project]` | Not gated — same footing as the trace log | `hooks/otto-state.mjs` only |
| `./.claude/otto-trace.log` (or `<config>/otto-trace.log` if there is no project) | What did the crew do, historically? | Not gated | `hooks/otto-trace.mjs`, best-effort |
| `./.claude/otto-ledger.log` (same directory as the trace log) | What did each robot's work cost — tokens, duration? | Not gated — same footing as the trace log; a finance feature, not a safety one | `hooks/otto-trace.mjs`, best-effort; read by 💰 Baudrate on request |

**One file, one question, always:**

- The session-open brief reads `otto-state.md` and `otto-state-global.md` **only** — never `TASKS.md`, never
  the trace log directly.
- `TASKS.md` is the task list, Gantry's to keep; nothing in the brief's read path touches it.
- `otto-trace.log` is full history, and `/standup` is the thing that reads it. The brief is not a compressed
  standup and must not quietly grow into one by reading the same source.
- `otto-ledger.log` is spend, and Baudrate is the thing that reads it — one line per subagent completion,
  tokens derived from that subagent's own transcript, never fabricated. It sees subagents only; Otto's own
  main-thread spend is not in this file and stays an estimate, presented as one.

Getting this wrong reads exactly as it sounds: two files disagreeing about the same fact, silently, because
two different pieces of prose each believed they owned the answer.

---

## The whole file

```jsonc
{
  // ── Who they are ───────────────────────────────────────────────────────────
  "seats":     ["Engineering", "Strategy / Leadership"],  // the canonical list, below
  "tier":      "Operator",                                // Visionary | Operator | Hacker
  "verbosity": "balanced",                                // brief | balanced | thorough
  "scale":     "business",                                // utility | prototype | business

  // ── How they like to be spoken to (learned over time, never inferred) ──────
  "style": {
    "prefers":  ["tables", "no-preamble"],
    "avoid":    ["headers-on-short-answers"],
    "declined": ["workspace-cleanup"]   // offers they have turned down more than once
  },

  // ── Their own staff (written by hiring-round; full record in otto-org.json) ─
  "org": { "status": "hired", "schema": "org/1", "revision": 2, "prefer": [], "shadowed": [] },

  // ── How they file things (written by workspace-hygiene, obeyed thereafter) ─
  "workspace": {
    "specs":      "docs/specs/",
    "drafts":     "drafts/ — disposable",
    "neverTouch": ["vendor/", "*.local.*"]
  },

  // ── Housekeeping ───────────────────────────────────────────────────────────
  "lastTuneup": "2026-07-12"
}
```

**Absent keys are not errors.** A profile with no `org`, no `workspace`, no `style` is a normal profile —
those blocks appear only when there was something true to record. Never write an empty block to look complete.

---

## `seats` — the canonical list, and the only one

A seat is a **function the human personally drives**. The robot who owns that seat becomes their **co-pilot**
(it proposes, they decide). Every seat they do *not* take runs on **autopilot** and reports.

| Seat | Co-pilot | The function they co-drive |
|---|---|---|
| **Strategy / Leadership** | 🧰 Otto | vision, prioritisation, go/no-go, sign-off |
| **Ops / Admin** | 🤖 Switchboard | inbox, calendar, documents, files, follow-ups, their Claude Code setup |
| **Product Management** | 📋 Patchbay | specs, priorities, roadmap — *what* to build and why |
| **Project Management** | 📦 Gantry | sequencing, `TASKS.md`, blockers, releases — *how and when* it lands |
| **Sales** | 🔵 Holovox | pipeline, outreach, positioning |
| **Marketing** | 🔵 Holovox | brand, content, SEO, launches |
| **Finance** | 💰 Baudrate | pricing, unit economics, runway |
| **Customer Support** | 📞 Dialtone | tickets, replies, the pattern behind them |
| **Research** | 🔷 Sonar | market scans, sourced facts, vendor evaluation |
| **Architecture** | 🟣 Vector | schemas, system design, boundaries |
| **Engineering** | 🔩 Bitforge | writing and refactoring the code |
| **QA / Test** | 🔘 Glitchtrap | coverage, regressions |
| **Security / Compliance** | 🔒 Cipherplate | audits, secret hygiene, licences |
| **Design / UX** | 🟢 Cathode | UI, layout, accessibility |
| **Legal / Contracts** | 📜 Docket | contracts, SOWs, NDAs, ToS, privacy |
| **Generalist / Solo** | *rotates* | seat me wherever the work is; infer the hat |

**Two seats are not departments** — Strategy/Leadership is Otto's own, and Ops/Admin is Switchboard's.
Every other seat maps 1:1 to a robot on the crew roster. Holovox holds two seats; nobody else does.

**One human, many seats.** A solo founder is easily Strategy + Engineering + Finance. **Generalist / Solo**
is a first-class answer, not a fallback — it means *rotate the co-pilot to whatever hat I am wearing*, and
Otto infers the hat rather than asking each time.

**Never invent a seat name.** If the human says something that is not on this list, map it to the closest
seat and say which. *"I run a consultancy"* → **Strategy / Leadership + Ops / Admin.** *"I do the books"* →
**Finance.** *"I do the UI"* → **Design / UX.**

---

## `tier` — how technical they are

Independent of seat. **A non-technical founder and a staff engineer can share the Strategy seat and need
completely different explanations.**

| Tier | Means |
|---|---|
| **Visionary** | Physical metaphors, every command written out, third-party signups walked through click by click. |
| **Operator** | Standard terms, architectural tradeoffs, quick conceptual checks. |
| **Hacker** | No metaphors, no hand-holding, direct execution inside approved boundaries. |

*(Older profiles may carry `"tier": "Level 2 — Operator"`. Read the last word; write the bare form.)*

---

## `verbosity` — how much they want back

**Their setting, never our inference.** A Visionary may want the full reasoning *because* they are learning;
a Hacker often wants three words. **Never derive verbosity from tier.**

| Value | Means |
|---|---|
| **brief** | The answer in one to three sentences. Trace lines for handoffs, nothing else. |
| **balanced** | The answer, then only the reasoning that would change what they do next. *(default)* |
| **thorough** | The answer, the reasoning, the options rejected, the tradeoff taken. Never padding. |

Changing it is a one-field edit — *"be brief from now on"* is never a rebuild.

---

## `style` — what the crew learned about them

Written only from **observed behaviour**, and only with a yes. Otto says in one line what he learned:
a colleague who changes without telling you is unsettling, not helpful.

- **`prefers` / `avoid`** — they skip the reasoning every time → `brief`. They ask *"just the table"* twice →
  lead with the table.
- **`declined`** — an offer they have turned down **in more than one session**. A no is permanent for the
  session by default; a no repeated across sessions is a preference, and it belongs in a file. **A colleague
  who suggests the same thing every Monday is nagging, and a nag gets muted.**

---

## `org` — their own staff

Written by the `hiring-round` skill. Records **only** what the platform does not already give us for free:
**preference, department, and collision.** Existence and trigger are free from their own frontmatter — never
duplicate them here. Full personnel record lives in `~/.claude/otto-org.json`, which is *not* read at session
start. Schema: see `skills/hiring-round/SKILL.md`.

## `workspace` — how they file things

Written by the `workspace-hygiene` skill, and **obeyed thereafter.** If they keep specs in a folder called
`stuff/`, specs live in `stuff/`. **A crew that keeps reorganising someone's desk to its own taste is not
helping; it is a second job.**

## `lastTuneup`

The date Switchboard last audited the Claude Code setup. Missing or older than a fortnight → *offer* a
`claude-code-tuneup` pass in one line, then move on. **Offer; never perform unasked**, and never turn a
standup into a maintenance lecture.
