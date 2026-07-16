# Spec — relay-writer fix for background-default subagents (`hotfix/relay-async-background-fix`)

**For:** Bitforge · **By:** Vector (Architect), correlator confirmed by Bitforge · **Date:** 2026-07-15/16
**Tier:** T2 (relay-state is a convenience feature; fail-silent by design; no safety property touched)
**Baseline:** main @ `ff483f7` (post-22.8.1-persona-guard merge)

---

## The regression

Claude Code `2.1.211` runs subagents **in the background by default** (confirmed source-level in
`docs/capture-activity-signals-2026-07-15.md`, Q3). `PostToolUse(Agent)` now fires **at dispatch time** for a
backgrounded Task, with `tool_response.status: "async_launched"` and **no `content` field** — the subagent
hasn't produced a result yet. `hooks/otto-state.mjs`'s `run()` never inspected `tool_response.status`; it went
straight to `extractText(payload.tool_response?.content)`, found nothing on an `async_launched` payload, and
fell through to `summarize()`'s `'(no result)'` default. Confirmed live this session: zero real state lines
produced by four real background Task dispatches; `(no result)` is the residual risk on any dispatch that
doesn't explicitly pass `run_in_background: false` (nothing in `agents/otto-foreman.md` currently does).

## Step 1 — correlator confirmation (blocking gate, CLEARED)

Vector's design depends on: **(a)** `async_launched` `PostToolUse(Agent)` carries an id; **(b)** the matching
`SubagentStop` carries the **same** id in `agent_id`; **(c)** `SubagentStop` does **not** carry `description`.
All three confirmed with real evidence, no session restart, in this order of decreasing directness:

1. **Byte-level, source-extracted, version-matched to the installed `2.1.211` binary** (`C:\Users\andre\.local\bin\claude.exe`), same technique `docs/hook-events.md` and `docs/capture-activity-signals-2026-07-15.md` already used — grepped the binary's own (deobfuscated, minified) JS for the literal `SubagentStop` hookInput construction and its Zod-style schema:
   ```js
   // hookInput construction (payload actually sent to the hook):
   m = o ? { ...$f(e,void 0,i), hook_event_name:"SubagentStop", stop_hook_active:n, agent_id:o,
             agent_transcript_path:ux(o), agent_type:a??"", last_assistant_message:p, ...f }
         : { ...$f(e,void 0,i), hook_event_name:"Stop", stop_hook_active:n, last_assistant_message:p, ...f }

   // schema (field list, confirms no `description` anywhere in the object):
   oZb = be(() => vk().and(E.object({
     hook_event_name: E.literal("SubagentStop"), stop_hook_active: E.boolean(), agent_id: E.string(),
     agent_transcript_path: E.string(), agent_type: E.string(),
     last_assistant_message: E.string().optional(), background_tasks: E.array(xLf()).optional(),
     session_crons: E.array(RLf()).optional(),
   })))

   // ux(id) — the function building agent_transcript_path — confirms `o` IS the same agentId used to name
   // the per-agent transcript file on disk:
   function ux(e){ let t=p6()??cb(dn()), r=kt(), n=oJi.get(e),
     o = n ? Tot.join(t,r,"subagents",n) : Tot.join(t,r,"subagents");
     return Tot.join(o, `agent-${e}...`) }  // → subagents/agent-<id>.jsonl
   ```
   This closes (b) and (c) directly: `agent_id` is a required (non-optional) string field on every
   `SubagentStop` payload; `description` is not in the object at all, anywhere.

2. **Live, this exact session, same real dispatches** — the parent transcript
   (`~/.claude/projects/...\d12bbbf5-....jsonl`) records the real `tool_response` of five background Task
   calls made this session, e.g.:
   ```json
   {"isAsync":true,"status":"async_launched","agentId":"a3ca870d880d69a8f",
    "description":"Chief of Staff: CC surfaces + our hook event stream", "resolvedModel":"..."}
   ```
   confirming (a): `agentId` is present on the dispatch-time payload. And the SAME id persists through the
   CLI's own internal completion notification later in the same transcript:
   ```
   <task-notification><task-id>a3ca870d880d69a8f</task-id> ... <status>completed</status>...
   ```
   — and matches, byte-for-byte, the on-disk subagent transcript filename
   `~/.claude/projects/...\subagents\agent-a3ca870d880d69a8f.jsonl`, which is exactly what `ux(o)` above
   constructs from the SAME `agent_id` value the SubagentStop payload carries. Three independent surfaces
   (dispatch payload, CLI task-notification, transcript filename) agree on one id per subagent, end to end.

3. **`otto-trace.log` timing correlation** — `otto-trace.log:182` shows a real trace line for
   `switchboard-chief-of-staff` at `01:04:58.582Z`, ~2s before the parent's `01:05:00.341Z` task-notification
   for `a3ca870d880d69a8f` — proving the `SubagentStop` hook (already wired to `otto-trace.mjs`) fired
   correctly, with valid `agent_type`/`last_assistant_message`, for a real **background**-dispatched agent
   under this exact version. Not a foreground-only guarantee.

**Verdict: CONFIRMED.** (a), (b), (c) all hold. Proceeding to build.

## Step 2 — the fix

### Write model

| Event | Condition | Action |
|---|---|---|
| `PostToolUse(Agent)` | `status: "completed"` (foreground, has `content`) | Upsert state line — **unchanged path**. |
| `PostToolUse(Agent)` | `status: "async_launched"` (background, no `content`) | Write **nothing** to state. Write `<config>/.otto-pending/<agentId>.json` = `{description, subagent_type, cwd, ts}`. `agentId` sanitized to `[a-zA-Z0-9_-]` before use as a filename (bars path separators and `..` traversal — dots aren't in the allowed set). |
| `SubagentStop` | `.otto-pending/<agent_id>.json` exists | Recover `description`/`subagent_type`/`cwd` from the marker, build `summary` from `last_assistant_message`, upsert the state line (global + local, local guard re-run against the marker's `cwd`), delete the marker. |
| `SubagentStop` | marker absent | No-op — foreground already wrote it via the `completed` path, or a genuine miss. |

Net: **exactly one state write per item, on every path.** `hooks/otto-trace.mjs` is untouched — it keeps
writing its own best-effort trace/ledger line on every `SubagentStop`, independent of the marker.

### Judgment calls (decided by Otto, not re-litigated here)

- No live "working…" line in the durable state file — the marker is a mode-discriminator + a substrate for a
  possible future live window, not a rendered row.
- The marker is written and kept **regardless** of whether `SubagentStop` carries `description` (it doesn't,
  per Step 1) — it is the only source of the original description at completion time.

### Wiring

`hooks/hooks.json` — `SubagentStop` gains a second entry (`node hooks/otto-state.mjs`, `"type":"command"`,
timeout 5) alongside the existing `otto-trace.mjs` entry. `PostToolUse` unchanged.

### Gates

- `scripts/test-otto-state.mjs`: the async_launched regression test (no state line, no `(no result)`
  anywhere), the marker-write test, the full background lifecycle test, the no-marker-no-write test, the
  preserved foreground tests (9c/9m), and 9k/G7/R10–R12 re-pointed at the `SubagentStop` entry path (real
  concurrency and the persona-root write guard both now exercise the path production actually uses by
  default).
- `scripts/validate.mjs`: source-text gates that `otto-state.mjs` references `async_launched`,
  `SubagentStop`/`hook_event_name`, and `.otto-pending`; that `hooks.json`'s `SubagentStop` wires **both**
  `otto-trace.mjs` and `otto-state.mjs`.
- `LOCAL_HEADER`/`GLOBAL_HEADER` prose and `agents/otto-foreman.md`'s "after every completed Task call"
  wording move to "at Task completion — `SubagentStop` for background, `PostToolUse` for foreground,"
  preserving the 9g-gated `recent work` / `no clear path` phrases verbatim.
- `docs/hook-events.md` gains both new payload shapes (`async_launched` dispatch-time `PostToolUse`, and the
  confirmed `SubagentStop` shape from Step 1).

### POSIX-gate note (deferred to the Mac gate, per the release constraint already on file)

- `agentId`-as-filename sanitization round-trip on real Unix (case-sensitive FS, but confirm no surprise).
- macOS case-**insensitive** FS collision check — two different (case-varying) sanitized ids should not be
  able to collide on a case-insensitive volume; today's sanitizer doesn't lowercase, so this is worth an
  explicit negative check on real Unix/macOS hardware, not assumed clean from Windows.
- Concurrency tests (9k/G7/R10–R12) re-pointed at `SubagentStop` — re-run on real POSIX to confirm the
  `mkdir`-lock semantics this hotfix relies on are unchanged off Windows.
