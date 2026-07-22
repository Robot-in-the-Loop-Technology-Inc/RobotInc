#!/usr/bin/env node
// Otto activity trace — SubagentStop hook.
//
// HONEST SCOPE: per the Claude Code hooks docs, for SubagentStop "exit code and
// stdout are not shown to the user or injected to the model." This hook is a
// SIDE EFFECT ONLY. It does not and cannot draw the inline trace.
//
// What renders the trace the user sees:
//   1. Claude Code's native Task UI (agent name + result), for free, once the
//      robots are actually invoked.
//   2. Otto reprinting a "↳ Robot — result" line, as instructed by his own
//      system prompt (agents/otto-foreman.md, pinned via settings.json `agent`).
// What THIS hook adds: a durable, greppable log that survives compaction, so
// Otto can reconstruct who ran and when by reading a file.
//
// This hook is BEST-EFFORT and must stay that way. It is the only part of the
// plugin that needs `node`, which Claude Code's native installer does not
// provide. If node is missing the log is never written and nothing else breaks.
// Never move load-bearing behaviour (the persona, the roster, routing) in here.
//
// Also writes otto-ledger.log, same directory, same best-effort footing: a
// finance feature (Baudrate's spend audit), never a safety one. No Node, no
// ledger, silently — that is an accepted, documented gap, not a bug.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

// Badge + name per robot. The badge is the crew's identity in the trace; the
// matching `color:` in each agent's frontmatter tints the native subagent UI.
//
// Every badge MUST be a single codepoint with no U+FE0F variation selector.
// A VS16 sequence (e.g. U+2699 U+FE0F, U+1F6E1 U+FE0F) promotes a narrow text
// glyph to a wide emoji, and terminals routinely miscount the width — the cursor
// desyncs and the surrounding text is overwritten. Badges never go in a Task
// `description` for the same reason; see agents/otto-foreman.md.
// This file must contain no U+FE0F; scripts/validate.mjs enforces it.
// [badge, name, company role]. Otto 🧰 is the main thread and never appears here.
//
// This map MUST hold every delegate robot in agents/, with the same badge and
// role as Otto's roster table. It fell out of sync once: Gantry shipped and was
// never added here, so every one of his runs logged as an anonymous 🤍 outsider
// — and /standup reads this log, so the crew's own morning brief misreported
// him. scripts/validate.mjs now cross-checks this map against agents/ and
// against Otto's roster, so the next hire cannot be forgotten in silence.
const ROBOTS = {
  // core — always active
  'switchboard-chief-of-staff': ['🤖', 'Switchboard', 'Chief of Staff'],
  'patchbay-pm': ['📋', 'Patchbay', 'Product'],
  'gantry-delivery': ['📦', 'Gantry', 'Project'],
  'holovox-sales': ['🔵', 'Holovox', 'Sales & Marketing'],
  'baudrate-cfo': ['💰', 'Baudrate', 'CFO'],
  'dialtone-support': ['📞', 'Dialtone', 'Support'],
  'sonar-research': ['🔷', 'Sonar', 'Research'],
  // opt-in departments — retired via permissions.deny unless the seat needs them
  'vector-architect': ['🟣', 'Vector', 'Architect'],
  'bitforge-engineer': ['🔩', 'Bitforge', 'Engineer'],
  'glitchtrap-qa': ['🔘', 'Glitchtrap', 'QA'],
  'cipherplate-security': ['🔒', 'Cipherplate', 'Security'],
  'cathode-design': ['🟢', 'Cathode', 'Design'],
  'docket-legal': ['📜', 'Docket', 'Legal'],
};

// A plugin-sourced subagent_type is delivered NAMESPACED, e.g.
// "robotinc:bitforge-engineer" — not the bare "bitforge-engineer" this map is
// keyed by. CONFIRMED across every line of a real otto-trace.log: the lookup
// below missed on 100% of crew dispatches, so every crew completion logged as
// an anonymous 🤍 "robotinc:whatever" with no role. Same bug, same fix, as
// hooks/otto-state.mjs's bareType() (that file's header tells the story of
// finding it there first) — duplicated rather than imported because hook
// scripts are invoked standalone via `node <file>` per hooks.json and cannot
// import one another. Built-ins (Explore, general-purpose, ...) and a genuine
// third-party plugin's own prefix (e.g. "someplugin:their-agent") are NOT
// "robotinc:"-prefixed, so this strip is a no-op for them and they keep
// rendering exactly as before — only crew robots gain their identity back.
function bareType(subagentType) {
  return subagentType.replace(/^robotinc:/, '');
}

// Last non-empty line of the agent's final message, cleaned up for a one-line
// trace: strip leading markdown decoration and inline emphasis, then collapse
// whitespace so a stray table row or bullet stays on one line. Hyphens are
// preserved on purpose — stripping them mangles agent names and branches
// (feature/rate-limit).
function summarizeResult(lastAssistantMessage) {
  const last = (lastAssistantMessage || '').trim();
  return (
    last
      .split('\n')
      .map((l) =>
        l
          .replace(/^[\s>#|*_-]+/, '') // leading bullet / quote / heading / table pipe
          .replace(/[`*_]/g, '') // inline emphasis + code ticks
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean)
      .pop() || '(no result line)'
  );
}

// Log next to the project when we're in one, else fall back to the config dir.
function resolveLogDir(payload, env, home) {
  const cwd = payload.cwd || process.cwd();
  return existsSync(join(cwd, '.claude'))
    ? join(cwd, '.claude')
    : env.CLAUDE_CONFIG_DIR || join(home, '.claude');
}

// ------------------------------------------------------------ otto-ledger.log
// CHECKED, NOT ASSUMED: the SubagentStop payload itself carries no token or
// duration field — verified against a real capture (session_id, transcript_path,
// cwd, prompt_id, permission_mode, agent_id, agent_type, effort, hook_event_name,
// stop_hook_active, agent_transcript_path, last_assistant_message, background_tasks,
// session_crons; nothing else). What it DOES carry is agent_transcript_path — a
// real path to the subagent's own transcript, which contains genuine per-message
// `usage` objects (input/output/cache tokens) and real ISO timestamps. Tokens and
// duration below are DERIVED from that file, never invented: duration is the gap
// between its first and last timestamp.
//
// WHAT "tokens" MEANS (v22.8.3 fix, replacing a confirmed ~100-1000x inflated
// number): it is the FINAL assistant message's own usage snapshot — input_tokens
// + output_tokens + cache_creation_input_tokens + cache_read_input_tokens of the
// LAST message that carries a `usage` object — never a sum across every message.
// Anthropic's `usage` field describes each API call as the total context that
// call processed (system + full running transcript, mostly served from cache on
// a long agentic run), not a per-turn delta. Under prompt caching that total
// grows monotonically as the conversation grows, so the FINAL message's usage
// already reflects the whole run's accumulated context — which is exactly what
// this number is FOR: "how many tokens did this subagent's run end up costing,"
// not "how many tokens were read across every intermediate turn." Summing every
// message instead (the old code) re-added that same growing context on every
// single turn, and the growth compounds: a real 61-message run on this machine
// summed to 4,900,605 while its own last-message snapshot was 137,202 — a ~36x
// inflation on that one run alone, and the pattern held on every run checked
// (bitforge-engineer 6,724,492 summed vs 123,387 last-snapshot, matching this
// same session's own real ~124k task-completion total almost exactly; sonar-
// research 1,048,769 summed vs 54,913 last-snapshot, matching a real ~50k
// total). This is a blended total, not a cost-tier breakdown — cache-read
// tokens are far cheaper than fresh input, and this number does not distinguish
// them. Baudrate's estimates from this field are approximate for that reason,
// and must say so.
//
// LEDGER LINE FORMAT (v22.8.3, per-project attribution; v22.13.0 adds an
// optional trailing tier):
//   <ISO-timestamp> [<project>] <robot-name> tokens=<N> duration_ms=<M> [tier=<T>]
// `<project>` is basename(cwd) -- the SAME derivation and the SAME `[...]`
// bracket style as hooks/otto-state.mjs's own project tag on
// otto-state-global.md (see that file's GLOBAL_HEADER and its
// `basename(cwd)` call), so the two logs agree on what a project tag is.
// `cwd` is `payload.cwd`, falling back to `process.cwd()` -- identical to
// resolveLogDir()'s own cwd derivation above, just computed again in run()
// since resolveLogDir() does not expose the value it used internally.
// This is an APPEND-ONLY log: lines written before this change
// (`<ts> <name> tokens=N duration_ms=M`, no tag) are never rewritten and stay
// on disk exactly as they were. viewer/server.mjs's parser treats the
// `[project]` segment and the trailing `tier=<T>` segment as optional so
// every historical shape keeps parsing; a line with neither simply renders
// with no project and no tier.
//
// TIER CAPTURE (docs/spec-spend-report.md §10, Vector's ruling, mechanism
// (a) -- CONFIRMED via build-task-1's spike against a real transcript: a
// subagent's own transcript first user-message entry carries the FULL
// dispatch prompt, byte-identical, including the `[Dispatch contract]` line
// and `tier=<value>`, never truncated). `tier=<T>` is written trailing the
// ledger line ONLY when captured -- omitted entirely when null, never
// `tier=` empty, never the literal string `tier=null`. Captured by a SECOND
// pass over the exact same in-memory transcript JSONL list already read for
// tokens (see extractTier() below) -- no new file, no second hook, no join,
// no lock, and tokens+tier can never disagree because they come from one
// read. Rendered surfaces (the viewer, Baudrate's prose, Otto's footer) must
// never print the word "tier" or a raw tier value -- this ledger line and
// this comment are the one place it legitimately lives backstage
// (scripts/validate.mjs's no-jargon scan explicitly excludes both).
//
// Independent try/catch from the block above on purpose: a malformed or missing
// subagent transcript (e.g. --no-session-persistence genuinely never writes one)
// must never take the trace-log write above down with it. No transcript, no
// timestamps, or no usage data anywhere in it => write nothing to the ledger for
// this event; never log a fabricated 0 standing in for "unknown."
// Locates the FIRST `message.role === 'user'` entry in the transcript and
// pulls the tier the dispatch contract declared, per docs/spec-spend-
// report.md §10. Serializes `message.content` to text exactly as the hooks
// docs already prescribe elsewhere in this codebase for `tool_response.
// content`: a string as-is, or `join('')` the `.text` of `type: 'text'`
// blocks. Scanning stops at the FIRST match of `/tier=(\S+)/`, so a subagent
// quoting `tier=` later in its own output (a decoy, or a self-referential
// mention like this very comment's own words) can never corrupt the
// capture — the real dispatch contract line is always first because Otto
// composes it as the opening line of the prompt. Own guard, independent of
// the token/duration logic above: malformed or unexpected content shapes
// degrade to `null`, never a throw, and never take the token write down
// with them.
function extractTier(entries) {
  try {
    for (const e of entries) {
      const msg = e.message;
      if (!msg || msg.role !== 'user') continue;
      const content = msg.content;
      let text;
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        text = content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
      } else {
        return null; // no recognizable text shape on the first user message
      }
      const m = text.match(/tier=(\S+)/);
      return m ? m[1] : null;
    }
    return null; // no role:'user' entry found at all
  } catch {
    return null; // fail-soft, same footing as every other guard in this hook
  }
}

function computeLedgerEntry(agentTranscriptPath) {
  if (!agentTranscriptPath || !existsSync(agentTranscriptPath)) return null;

  const entries = readFileSync(agentTranscriptPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);

  const timestamps = entries.map((e) => e.timestamp).filter(Boolean);
  let lastUsage = null;
  for (const e of entries) {
    const u = e.message && e.message.usage;
    if (u) lastUsage = u; // keep overwriting — we want the LAST message that carried usage, not a sum
  }

  if (!timestamps.length || !lastUsage) return null;

  const first = new Date(timestamps[0]).getTime();
  const last = new Date(timestamps[timestamps.length - 1]).getTime();
  const durationMs = Math.max(0, last - first);
  const tokens =
    (lastUsage.input_tokens || 0) +
    (lastUsage.output_tokens || 0) +
    (lastUsage.cache_creation_input_tokens || 0) +
    (lastUsage.cache_read_input_tokens || 0);

  // Tier is a SECOND pass over this SAME in-memory entries list, computed
  // AFTER tokens/duration and behind its own guard (extractTier's internal
  // try/catch) — a malformed first-user-message shape must never take the
  // token write above down with it (spec §10).
  const tier = extractTier(entries);

  return { tokens, durationMs, tier };
}

// Takes an already-parsed hook payload and performs the writes. Exported for
// direct testing (scripts/test-otto-trace.mjs) — real filesystem I/O against a
// scratch config dir and scratch cwd, no mocking, same convention as
// hooks/otto-state.mjs's exported run(). Fail-soft internally, identically to
// the real hook invocation below: a logging hook must never throw.
export function run(payload, opts = {}) {
  const env = opts.env || process.env;
  const home = opts.home || homedir();

  // Without an agent_type there is nothing meaningful to attribute the line to,
  // and the payload's last message may be arbitrary text. Log nothing rather
  // than pollute the crew's trace.
  const agentType = payload.agent_type || payload.subagent_type;
  if (!agentType) return;

  // Non-crew agents (Explore, general-purpose, custom) still get a line, so the
  // trace stays a truthful record of every subagent that ran. Crew robots are
  // looked up by their BARE id (see bareType() above); unknown types keep
  // rendering under their raw, unstripped agentType exactly as before.
  const crew = ROBOTS[bareType(agentType)];
  const [badge, robot, role] = crew || ['🤍', agentType, null];

  const result = summarizeResult(payload.last_assistant_message).slice(0, 140);

  const dir = resolveLogDir(payload, env, home);
  const stamp = new Date().toISOString();
  const who = role ? `${badge} ${robot} (${role})` : `${badge} ${robot}`;
  const line = `${stamp}  ↳ ${who} — ${result}\n`;

  try {
    appendFileSync(join(dir, 'otto-trace.log'), line, 'utf8');
  } catch {
    // Fail soft, always. A logging hook must never break a run.
  }

  try {
    const entry = computeLedgerEntry(payload.agent_transcript_path);
    if (entry) {
      // Same basename(cwd) derivation as hooks/otto-state.mjs's `[project]`
      // tag -- see the LEDGER LINE FORMAT comment above computeLedgerEntry().
      const cwd = payload.cwd || process.cwd();
      const project = basename(cwd);
      // Trailing tier segment, ONLY when captured -- never `tier=` empty,
      // never the literal string `tier=null` (spec §10).
      const tierSuffix = entry.tier ? ` tier=${entry.tier}` : '';
      const ledgerLine = `${stamp} [${project}] ${robot} tokens=${entry.tokens} duration_ms=${entry.durationMs}${tierSuffix}\n`;
      appendFileSync(join(dir, 'otto-ledger.log'), ledgerLine, 'utf8');
    }
  } catch {
    // Fail soft, identically to the trace-log write above.
  }
}

function readStdin() {
  try {
    // fd 0 read is sync and safe here; hook stdin is small and already closed.
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  try {
    const payload = JSON.parse(readStdin() || '{}');
    run(payload);
  } catch {
    // Fail soft, always. A logging hook must never break a run, and the hook
    // payload shape can shift between Claude Code versions.
  }
  process.exit(0);
}

// Exported for tests only — the hook itself never imports these from outside.
export { bareType, summarizeResult, computeLedgerEntry, resolveLogDir, ROBOTS, extractTier };
