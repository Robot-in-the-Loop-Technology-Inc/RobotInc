# Hook event payloads — verified, not assumed

Every fact on this page was captured byte-level from a real Claude Code session before the code that depends
on it was written, not taken from documentation. Two events are covered because both have already shipped a
doc-vs-reality gap once: **the docs describe what SHOULD happen; this page describes what a real payload
DOES carry.** When they disagree, this page wins, and the disagreement is stated plainly rather than quietly
patched over.

## PostToolUse, matcher `"Task"` — actually fires on `tool_name: "Agent"`

**The trap:** the hooks.json matcher string for this event is `"Task"` — the tool's public, documented name.
The event Claude Code actually delivers to the hook names the tool `"Agent"` — its internal name. A hook
script that gates on `payload.tool_name === "Task"` silently never fires. No error, no warning, anywhere a
human would see it. This was found by registering a throwaway capture hook, dispatching a real Task call, and
reading the raw JSON — not by reading the docs a second time.

Full captured shape (fields present; example values redacted or illustrative):

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "C:\\...\\project",
  "prompt_id": "...",
  "permission_mode": "bypassPermissions",
  "agent_type": "robotinc:otto-foreman",
  "effort": { "level": "high" },
  "hook_event_name": "PostToolUse",
  "tool_name": "Agent",
  "tool_input": {
    "description": "count files",
    "prompt": "<the full task prompt handed to the subagent>",
    "subagent_type": "general-purpose",
    "run_in_background": false
  },
  "tool_response": {
    "status": "completed",
    "prompt": "<same prompt, echoed back>",
    "agentId": "a7566d3cdaa28fa52",
    "agentType": "general-purpose",
    "content": [ { "type": "text", "text": "<the subagent's final message>" } ],
    "resolvedModel": "claude-fable-5",
    "totalDurationMs": 14733,
    "totalTokens": 21816,
    "totalToolUseCount": 1,
    "usage": { "input_tokens": 2, "cache_read_input_tokens": 19067, "...": "..." },
    "toolStats": { "readCount": 0, "bashCount": 0, "otherToolCount": 1, "...": "..." }
  },
  "tool_use_id": "toolu_...",
  "duration_ms": 14735
}
```

### Doc-vs-reality mismatches, plainly

| Assumption | Reality |
|---|---|
| Matcher `"Task"` means `payload.tool_name === "Task"` | **Wrong.** The matcher string and the delivered `tool_name` are different strings. Gate on `tool_name === "Agent"`. |
| `tool_input.description` is the task body | **Wrong.** `description` is a short label (≤60 chars, matches Otto's own dispatch convention). The full task text is `tool_input.prompt`, an undocumented sibling field. |
| `tool_response` is the subagent's final text | **Wrong shape.** `tool_response` is a structured object. The final text is `tool_response.content[]`, an Anthropic-style content-block array (can hold more than one block). Extract with `content.filter(b => b.type === 'text').map(b => b.text).join('')`. |
| Fires only for crew/plugin agents | **Wrong.** Confirmed firing for built-in agent types too (`Explore`, `general-purpose`; `Plan`, `claude`, `statusline-setup` are documented elsewhere but not independently re-verified here) — a hook consuming this event must classify and skip built-ins itself. |
| Fires for every tool call | **Correct as scoped.** Verified with a mixed `Read` + `Task` turn: only the `Task`/`Agent` call produced an event; the `Read` call did not. The matcher genuinely filters, despite the name mismatch above. |
| `cwd` is present | **Correct.** Real project cwd, not the config dir. |
| Fires once per Task call | **Correct.** One event per completed Task tool use, not per subagent-internal tool call. |

### `hooks.json` entry `"type"` — a second trap, same shape

A design draft for the registration entry called for `"type": "script"` instead of the existing convention's
`"type": "command"`. **Tested empirically, not assumed:** a hook registered with `"type": "script"` never
fires — same failure mode as the `tool_name` trap above, silent, no error. `"type": "command"` (identical to
the SessionStart and SubagentStop entries already shipping) fires correctly. `hooks/hooks.json` uses
`"command"`; do not "helpfully" change it to `"script"` on a future edit without re-testing.

## SubagentStop — for comparison, established prior to this page existing

Documented in `hooks/otto-trace.mjs`'s own header comment: exit code and stdout are **not** shown to the user
or injected into the model. Confirmed fields: `session_id`, `transcript_path`, `cwd`, `prompt_id`,
`permission_mode`, `agent_id`, `agent_type`, `effort`, `hook_event_name`, `stop_hook_active`,
`agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons` — nothing else. No
token or duration field on the event itself; `otto-trace.mjs`'s ledger derives those from the subagent's own
transcript file (`agent_transcript_path`), never invents them.

## Who reads this page

`hooks/otto-state.mjs` is the only file that depends on the `PostToolUse`/`Agent` facts above; its own header
comment cross-references this page rather than repeating the payload shape. If a future Claude Code version
changes any of these fields, re-run the same kind of throwaway capture that produced this page — do not
patch the hook script from memory or from updated docs alone.
