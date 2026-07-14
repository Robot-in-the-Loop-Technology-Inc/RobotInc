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
import { join } from 'node:path';
import { homedir } from 'node:os';

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

function readStdin() {
  try {
    // fd 0 read is sync and safe here; hook stdin is small and already closed.
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

try {
  const payload = JSON.parse(readStdin() || '{}');

  // Without an agent_type there is nothing meaningful to attribute the line to,
  // and the payload's last message may be arbitrary text. Log nothing rather
  // than pollute the crew's trace.
  const agentType = payload.agent_type || payload.subagent_type;
  if (!agentType) process.exit(0);

  // Non-crew agents (Explore, general-purpose, custom) still get a line, so the
  // trace stays a truthful record of every subagent that ran.
  const [badge, robot, role] = ROBOTS[agentType] || ['🤍', agentType, null];

  // Agents are instructed to end with ONE terse line; take the last non-empty
  // line of their final message as the trace result. Strip leading markdown
  // decoration and inline emphasis, then collapse whitespace so a stray table
  // row or bullet stays on one line. Hyphens are preserved on purpose —
  // stripping them mangles agent names and branches (feature/rate-limit).
  const last = (payload.last_assistant_message || '').trim();
  const result =
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
      .pop() || '(no result line)';

  // Log next to the project when we're in one, else fall back to the config dir.
  const cwd = payload.cwd || process.cwd();
  const dir = existsSync(join(cwd, '.claude'))
    ? join(cwd, '.claude')
    : process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

  const stamp = new Date().toISOString();
  const who = role ? `${badge} ${robot} (${role})` : `${badge} ${robot}`;
  const line = `${stamp}  ↳ ${who} — ${result.slice(0, 140)}\n`;

  appendFileSync(join(dir, 'otto-trace.log'), line, 'utf8');

  // ------------------------------------------------------------ otto-ledger.log
  // CHECKED, NOT ASSUMED: the SubagentStop payload itself carries no token or
  // duration field — verified against a real capture (session_id, transcript_path,
  // cwd, prompt_id, permission_mode, agent_id, agent_type, effort, hook_event_name,
  // stop_hook_active, agent_transcript_path, last_assistant_message, background_tasks,
  // session_crons; nothing else). What it DOES carry is agent_transcript_path — a
  // real path to the subagent's own transcript, which contains genuine per-message
  // `usage` objects (input/output/cache tokens) and real ISO timestamps. Tokens and
  // duration below are DERIVED from that file, never invented: duration is the gap
  // between its first and last timestamp; tokens is the sum of every usage field
  // across its assistant messages. This is a blended, whole-conversation total, not
  // a cost-tier breakdown — cache-read tokens are far cheaper than fresh input, and
  // this number does not distinguish them. Baudrate's estimates from this field are
  // approximate for that reason, and must say so.
  //
  // Independent try/catch from the block above on purpose: a malformed or missing
  // subagent transcript (e.g. --no-session-persistence genuinely never writes one)
  // must never take the trace-log write above down with it. No transcript, no
  // timestamps, or no usage data anywhere in it => write nothing to the ledger for
  // this event; never log a fabricated 0 standing in for "unknown."
  try {
    const agentTranscriptPath = payload.agent_transcript_path;
    if (agentTranscriptPath && existsSync(agentTranscriptPath)) {
      const entries = readFileSync(agentTranscriptPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try { return JSON.parse(l); } catch { return null; }
        })
        .filter(Boolean);

      const timestamps = entries.map((e) => e.timestamp).filter(Boolean);
      let tokens = 0;
      let sawUsage = false;
      for (const e of entries) {
        const u = e.message && e.message.usage;
        if (!u) continue;
        sawUsage = true;
        tokens += (u.input_tokens || 0) + (u.output_tokens || 0)
          + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      }

      if (timestamps.length && sawUsage) {
        const first = new Date(timestamps[0]).getTime();
        const last = new Date(timestamps[timestamps.length - 1]).getTime();
        const durationMs = Math.max(0, last - first);
        const ledgerLine = `${stamp} ${robot} tokens=${tokens} duration_ms=${durationMs}\n`;
        appendFileSync(join(dir, 'otto-ledger.log'), ledgerLine, 'utf8');
      }
    }
  } catch {
    // Fail soft, identically to the trace-log write above.
  }
} catch {
  // Fail soft, always. A logging hook must never break a run, and the hook
  // payload shape can shift between Claude Code versions.
}

process.exit(0);
