#!/usr/bin/env node
// Activity window — v0. A tiny local HTTP server that reads Otto's live feed
// (pending-work markers, the completion trace, the spend ledger) and exposes
// it as JSON for viewer/index.html to poll. Node built-ins only, no deps.
//
// This is the first visible layer of the "activity window": prove the loop
// (feed → server → screen) and put real crew identity + cost on screen.
// No pixel art here — that is Cathode's next pass on top of this data.

import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const PENDING_DIR = join(CONFIG_DIR, '.otto-pending');
const TRACE_LOG = join(CONFIG_DIR, 'otto-trace.log');
const LEDGER_LOG = join(CONFIG_DIR, 'otto-ledger.log');
const PORT = Number(process.env.PORT) || 4173;
const RECENT_COUNT = 8;
const FALLBACK_COLOR = '#9ca3af'; // neutral grey for anything unresolved

// ---------------------------------------------------------------- identity
// Badge + name + role lifted verbatim from hooks/otto-state.mjs's ROBOTS map
// (same table also lives in hooks/otto-trace.mjs — the two must stay in
// sync; see that file's header comment). Color hex is NOT in either map —
// it is derived here from each agent's frontmatter `color:` name
// (agents/*.md), translated to a hex swatch since frontmatter only carries
// a named color, not a hex value.
const ROBOTS = {
  'switchboard-chief-of-staff': { badge: '🤖', name: 'Switchboard', role: 'Chief of Staff', color: '#a855f7' },
  'patchbay-pm': { badge: '📋', name: 'Patchbay', role: 'Product', color: '#eab308' },
  'gantry-delivery': { badge: '📦', name: 'Gantry', role: 'Project', color: '#06b6d4' },
  'holovox-sales': { badge: '🔵', name: 'Holovox', role: 'Sales & Marketing', color: '#3b82f6' },
  'baudrate-cfo': { badge: '💰', name: 'Baudrate', role: 'CFO', color: '#f97316' },
  'dialtone-support': { badge: '📞', name: 'Dialtone', role: 'Support', color: '#ec4899' },
  'sonar-research': { badge: '🔷', name: 'Sonar', role: 'Research', color: '#06b6d4' },
  'vector-architect': { badge: '🟣', name: 'Vector', role: 'Architect', color: '#a855f7' },
  'bitforge-engineer': { badge: '🔩', name: 'Bitforge', role: 'Engineer', color: '#f97316' },
  'glitchtrap-qa': { badge: '🔘', name: 'Glitchtrap', role: 'QA', color: '#ec4899' },
  'cipherplate-security': { badge: '🔒', name: 'Cipherplate', role: 'Security', color: '#ef4444' },
  'cathode-design': { badge: '🟢', name: 'Cathode', role: 'Design', color: '#22c55e' },
  'docket-legal': { badge: '📜', name: 'Docket', role: 'Legal', color: '#22c55e' },
};
const NAME_TO_ID = Object.fromEntries(Object.entries(ROBOTS).map(([id, r]) => [r.name, id]));

// A plugin-sourced subagent_type arrives NAMESPACED, e.g.
// "robotinc:bitforge-engineer" (see hooks/otto-state.mjs's own comment on
// this). Strip only the plugin's own "robotinc:" prefix — a third-party
// namespace (e.g. "someplugin:their-agent") is real information and must
// survive untouched.
function bareType(subagentType) {
  return String(subagentType).replace(/^robotinc:/, '');
}

function resolveBySubagentType(subagentType) {
  const bare = bareType(subagentType);
  const crew = ROBOTS[bare];
  if (crew) return { ...crew };
  return { badge: '🧩', name: subagentType, role: null, color: FALLBACK_COLOR };
}

// ------------------------------------------------------- trace.log gap fix
// CONFIRMED on this machine: otto-trace.mjs looks up ROBOTS[agentType] using
// the RAW, still-prefixed subagent_type ("robotinc:cathode-design"), which
// never matches its own un-prefixed map keys. Every crew line it writes for
// a plugin-sourced robot therefore falls to the "unknown" fallback — 🤍 badge,
// no role, and the raw "robotinc:whatever" string standing in for the name.
// Every line in today's real otto-trace.log exhibits this. otto-trace.mjs is
// NOT touched by this prototype (out of scope, see task); instead the viewer
// re-derives the correct identity itself so the screen is right regardless.
function resolveTraceIdentity(loggedBadge, rest) {
  const m = rest.match(/^(.*) \(([^)]+)\)$/);
  const name = m ? m[1] : rest;
  const role = m ? m[2] : null;

  if (name.startsWith('robotinc:')) {
    // This is the gap: a raw, unresolved subagent_type leaked into the log
    // as if it were a name. Recover it the way the log SHOULD have.
    const bare = bareType(name);
    const crew = ROBOTS[bare];
    if (crew) return { ...crew };
    return { badge: '🧩', name: bare, role: null, color: FALLBACK_COLOR };
  }

  // Line already carries a friendly name (hook resolved it correctly, e.g.
  // a built-in or a future non-namespaced type) — recover the hex color via
  // reverse lookup; keep whatever badge/role the log already had otherwise.
  const id = NAME_TO_ID[name];
  if (id) return { ...ROBOTS[id] };
  return { badge: loggedBadge, name, role, color: FALLBACK_COLOR };
}

function splitBadgeAndRest(who) {
  const idx = who.indexOf(' ');
  if (idx === -1) return { badge: who, rest: '' };
  return { badge: who.slice(0, idx), rest: who.slice(idx + 1) };
}

// --------------------------------------------------------------- log reads
function readLastLines(path, maxLines) {
  try {
    const raw = readFileSync(path, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    // Missing file (nothing has run yet) or unreadable mid-write — empty is
    // a clean, honest answer, not an error.
    return [];
  }
}

const TRACE_SEP = '  ↳ ';

function parseTraceLine(line) {
  const sepIdx = line.indexOf(TRACE_SEP);
  if (sepIdx === -1) return null;
  const ts = line.slice(0, sepIdx);
  const afterArrow = line.slice(sepIdx + TRACE_SEP.length);
  const dashIdx = afterArrow.indexOf(' — ');
  if (dashIdx === -1) return null;
  const who = afterArrow.slice(0, dashIdx);
  const summary = afterArrow.slice(dashIdx + 3);
  const { badge: loggedBadge, rest } = splitBadgeAndRest(who);
  const identity = resolveTraceIdentity(loggedBadge, rest);
  return { ts, summary, ...identity };
}

// Handles BOTH ledger line shapes, old and new (hooks/otto-trace.mjs's
// "LEDGER LINE FORMAT" comment):
//   old (untagged, historical, still on disk -- this log is append-only):
//     <ts> <name> tokens=N duration_ms=M
//   new (v22.8.3, per-project attribution):
//     <ts> [<project>] <name> tokens=N duration_ms=M
// The `[project]` segment is optional in the pattern so a pre-existing line
// keeps parsing exactly as before; group 2 (project) is undefined for it.
const LEDGER_RE = /^(\S+) (?:\[([^\]]+)\] )?(.+) tokens=(\d+) duration_ms=(\d+)$/;

function parseLedgerLine(line) {
  const m = line.match(LEDGER_RE);
  if (!m) return null;
  const [, ts, project, , tokens, durationMs] = m;
  return { ts, project: project || null, tokens: Number(tokens), durationMs: Number(durationMs) };
}

function buildLedgerIndex() {
  const map = new Map();
  // The ledger is keyed by the same `stamp` variable the hook wrote the
  // matching trace line with, in the same run — exact-string timestamp match
  // is a reliable join key. Cap the scan; a huge ledger only needs its tail
  // to cover the handful of "recent" trace lines we're about to render.
  for (const line of readLastLines(LEDGER_LOG, 2000)) {
    const parsed = parseLedgerLine(line);
    if (parsed) map.set(parsed.ts, parsed);
  }
  return map;
}

// ------------------------------------------------------------------ /state
function getWorking() {
  const out = [];
  let files = [];
  try {
    files = readdirSync(PENDING_DIR);
  } catch {
    return out; // no pending dir yet == nobody working, not an error
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(PENDING_DIR, f), 'utf8');
      const data = JSON.parse(raw);
      if (!data.subagent_type) continue;
      const identity = resolveBySubagentType(data.subagent_type);
      const startedMs = data.ts ? new Date(data.ts).getTime() : NaN;
      const secondsWorking = Number.isFinite(startedMs)
        ? Math.max(0, Math.round((Date.now() - startedMs) / 1000))
        : null;
      out.push({
        name: identity.name,
        role: identity.role,
        badge: identity.badge,
        color: identity.color,
        description: data.description || '(no description)',
        secondsWorking,
      });
    } catch {
      // Marker deleted mid-read (SubagentStop raced us) or malformed JSON —
      // skip this one file, keep going. A missing marker is not a crash.
    }
  }
  out.sort((a, b) => (b.secondsWorking ?? 0) - (a.secondsWorking ?? 0));
  return out;
}

function getRecent() {
  const ledgerIndex = buildLedgerIndex();
  const lines = readLastLines(TRACE_LOG, RECENT_COUNT);
  const out = [];
  for (const line of lines) {
    let parsed;
    try {
      parsed = parseTraceLine(line);
    } catch {
      parsed = null; // one malformed line must not drop the rest
    }
    if (!parsed) continue;
    const cost = ledgerIndex.get(parsed.ts);
    out.push({
      name: parsed.name,
      role: parsed.role,
      badge: parsed.badge,
      color: parsed.color,
      summary: parsed.summary,
      tokens: cost ? cost.tokens : null,
      duration: cost ? cost.durationMs : null,
      project: cost ? cost.project : null,
    });
  }
  return out.reverse(); // newest first
}

// ----------------------------------------------------------------- server
const server = createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('method not allowed');
    return;
  }

  if (req.url === '/state') {
    let body;
    try {
      body = JSON.stringify({ working: getWorking(), recent: getRecent() });
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err && err.message || err) }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    try {
      const html = readFileSync(join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('index.html not found next to server.mjs');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

// Same isMainModule() convention as hooks/otto-trace.mjs and
// hooks/otto-state.mjs: only bind a real port when this file is run
// directly, so scripts/test-otto-trace.mjs can `import` the pure parse
// helpers below (parseLedgerLine) without spinning up a live HTTP server.
function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  server.listen(PORT, () => {
    console.log(`activity window viewer running at http://localhost:${PORT}`);
    console.log(`reading config dir: ${CONFIG_DIR}`);
  });
}

// Exported for tests only (scripts/test-otto-trace.mjs) — the module itself
// never imports these from outside.
export { parseLedgerLine };
