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
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { readActiveGoal } from '../hooks/otto-goal-lib.mjs';

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

// ---------------------------------------------------------- spend report
// Robot -> department display-label normalizer (docs/spec-spend-report.md
// §9): the ROBOTS map's `role` field is already department-shaped for most
// robots (Engineer -> Engineering, Architect -> Architecture) -- this is a
// small mechanical mapping, not a new identity table. Only the handful of
// roles that don't already read as a department name get a translation;
// everything else falls through to its own role string unchanged.
const ROLE_TO_DEPARTMENT = {
  'Chief of Staff': 'Ops / Admin',
  CFO: 'Finance',
  Engineer: 'Engineering',
  Architect: 'Architecture',
};

function departmentForRobot(name) {
  const id = NAME_TO_ID[name];
  const role = id ? ROBOTS[id].role : null;
  if (!role) return 'Unknown';
  return ROLE_TO_DEPARTMENT[role] || role;
}

// The one definition of "forbidden rigor-declaration vocabulary" a rendered
// surface may never contain (docs/spec-spend-report.md §2/§8/§9) — shared,
// not duplicated, by scripts/validate.mjs's no-jargon scan AND scripts/test-
// spend-report.mjs's own jargon tests, so the ban and its test can never
// quietly drift apart. `(?<!-)` excludes the legitimate, unrelated phrase
// "cost-tier breakdown" (LLM pricing granularity, carried over from
// Cathode's mockup on purpose) without exempting any other compound.
const JARGON_RE = /(?<!-)\btier\b|\bWORKSHOP\b|\bT1\b|\bT2\b|\bT3\b/i;

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

// Handles every ledger line shape, old and new (hooks/otto-trace.mjs's
// "LEDGER LINE FORMAT" comment):
//   oldest (untagged, historical, still on disk -- this log is append-only):
//     <ts> <name> tokens=N duration_ms=M
//   v22.8.3, per-project attribution:
//     <ts> [<project>] <name> tokens=N duration_ms=M
//   v22.13.0, optional trailing tier (docs/spec-spend-report.md §10):
//     <ts> [<project>] <name> tokens=N duration_ms=M tier=T
// Both the `[project]` segment and the trailing `tier=` segment are optional
// in the pattern so every pre-existing line keeps parsing exactly as before;
// group 2 (project) and group 6 (tier) are undefined/null for lines that
// never carried them.
const LEDGER_RE = /^(\S+) (?:\[([^\]]+)\] )?(.+) tokens=(\d+) duration_ms=(\d+)(?:\s+tier=(\S+))?$/;

function parseLedgerLine(line) {
  const m = line.match(LEDGER_RE);
  if (!m) return null;
  const [, ts, project, robot, tokens, durationMs, tier] = m;
  return {
    ts,
    project: project || null,
    robot,
    tokens: Number(tokens),
    durationMs: Number(durationMs),
    tier: tier || null,
  };
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

// ------------------------------------------------------------------ /spend
// docs/spec-spend-report.md §4/§8/§9 — the statement view's data contract.
// Reads the SAME ledger every other rendering reads, once, never a second
// copy of the arithmetic.

// Reads the WHOLE ledger (not just the last N lines buildLedgerIndex() caps
// at for the live feed) -- a spend report has to sum every scoped line, not
// just the recent tail.
function readAllLedgerRows() {
  const rows = [];
  for (const line of readLastLines(LEDGER_LOG, Infinity)) {
    const parsed = parseLedgerLine(line);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

// Scopes to "this effort" (spec §4): the active goal anchor for the project
// this viewer is reading -- `dirname(CONFIG_DIR)` is the same project root
// hooks/otto-trace.mjs's own resolveLogDir() derives the ledger path from
// (both land under `<cwd>/.claude` when that directory exists), so this is
// the same "project" the ledger's own `[project]` tag already names. No
// active anchor (or a project that never captured one) falls back to the
// whole ledger for that project -- same as Baudrate's on-request behavior
// today -- and the label degrades one step further, from "this effort" to
// "recent activity" (spec §4, never "this build").
function scopeLedgerRows(rows) {
  const projectRoot = dirname(CONFIG_DIR);
  const goal = readActiveGoal(projectRoot);
  if (!goal) return { rows, scopeLabel: 'recent activity' };
  const project = basename(projectRoot);
  const scoped = rows.filter((r) => {
    if (r.project && r.project !== project) return false;
    // ISO timestamps compare correctly as plain strings against the
    // anchor's bare YYYY-MM-DD `confirmed` date: same-or-later dates always
    // sort lexically >= the shorter date-only prefix.
    return r.ts >= goal.confirmed;
  });
  return { rows: scoped, scopeLabel: 'this effort' };
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatK(tokens) {
  return `${Math.round(tokens / 1000)}K`;
}

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

// The threshold's three conditions, spec §8 — all three required, together.
const FLAG_RATIO_MIN = 2;
const FLAG_GAP_MIN_TOKENS = 15000;
const FLAG_BASIS_FLOOR_TOKENS = 10000;

// Baudrate's full flagged template (spec §8), tier-free, `~`-rounded to the
// nearest K. `{descriptor}` deliberately always takes the documented
// fallback ("this pass") rather than attempting to extract a task word from
// free-form trace text — that free-text-classification frontier is the same
// one this codebase's hooks explicitly stay out of (see hooks/otto-goal-
// audit.mjs's header on why verify= text is never parsed for meaning). This
// is Baudrate's own prose voice when he composes the terminal reports
// directly from the ledger; the viewer renders the identical string so the
// wording never forks between the two surfaces.
function fullFlagMessage(row) {
  const ratioStr = row.ratio % 1 === 0 ? String(row.ratio) : row.ratio.toFixed(1);
  return `⚠ ${row.robot}'s this pass cost about ${ratioStr}× its own typical run in `
    + `${row.department} this effort (~${formatK(row.tokens)} vs ~${formatK(row.tokensExpected)}) `
    + `— worth a look.`;
}

// Self-comparison basis + threshold (spec §8): a robot compared only against
// its OWN other same-tier, same-department runs in this scoped window —
// never a crew-wide band. 2+ priors -> their median is the basis; exactly 1
// prior -> that single run IS the basis; 0 priors -> no basis, no flag,
// contributes to the "no-data" finding rather than "clean". Rows with no
// captured tier can't be matched into a same-tier bucket at all, so they
// carry tokens/duration into the rollup but never participate in flag
// comparison, on either side (spec §10's degrade: missing tier degrades the
// FLAG on that row, never the rest of the report).
function computeFlags(rows) {
  const withTier = rows.filter((r) => r.tier);
  const buckets = new Map(); // "<robot>|<department>|<tier>" -> rows sharing that bucket
  for (const r of withTier) {
    const key = `${r.robot}|${r.department}|${r.tier}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const evaluated = [];
  let evaluableCount = 0; // rows that had at least 1 prior to compare against
  let anyFlagged = false;

  for (const r of withTier) {
    const key = `${r.robot}|${r.department}|${r.tier}`;
    const priors = buckets.get(key).filter((x) => x !== r).map((x) => x.tokens);

    if (priors.length === 0) {
      evaluated.push({ ...r, tokensExpected: null, priorRunCount: 0, ratio: null, flagged: false, comparisonBasis: 'none', message: null });
      continue;
    }

    evaluableCount++;
    const basis = priors.length >= 2 ? median(priors) : priors[0];
    const ratio = basis > 0 ? r.tokens / basis : Infinity;
    const meetsRatio = ratio >= FLAG_RATIO_MIN;
    const meetsGap = r.tokens - basis >= FLAG_GAP_MIN_TOKENS;
    const meetsFloor = basis >= FLAG_BASIS_FLOOR_TOKENS;
    const flagged = meetsRatio && meetsGap && meetsFloor;
    const row = {
      ...r,
      tokensExpected: basis,
      priorRunCount: priors.length,
      ratio: Math.round(ratio * 10) / 10,
      flagged,
      comparisonBasis: priors.length >= 2 ? 'median-of-priors' : 'single-prior',
      message: null,
    };
    if (flagged) {
      anyFlagged = true;
      row.message = fullFlagMessage(row);
    }
    evaluated.push(row);
  }

  // Rows with no tier at all: still real rows, just never evaluable.
  const untiered = rows.filter((r) => !r.tier).map((r) => ({
    ...r, tokensExpected: null, priorRunCount: 0, ratio: null, flagged: false, comparisonBasis: 'none', message: null,
  }));

  // The 4th state (Baudrate's honesty catch, spec §8): "checked and found
  // clean" and "had nothing to check" are different findings. Clean requires
  // at least ONE row to have had a real basis to compare against — the N>=2
  // language in the spec describes the comparable-runs bucket, not a
  // per-row minimum; a mix of evaluable and singleton rows with no flags is
  // still clean as long as at least one row had a real basis (spec §8's
  // note to Bitforge).
  const auditState = anyFlagged ? 'flagged' : evaluableCount > 0 ? 'clean' : 'no-data';

  return { rows: [...evaluated, ...untiered], auditState };
}

function calmNegativeMessage(auditState, totalRuns) {
  if (auditState === 'clean') return `Spend looked proportionate across all ${totalRuns} runs.`;
  if (auditState === 'no-data') return 'Not enough same-scope runs this effort to compare — no audit finding either way.';
  return null;
}

function computeSpendReport() {
  const allRows = readAllLedgerRows();
  const { rows: scopedRaw, scopeLabel } = scopeLedgerRows(allRows);
  const scoped = scopedRaw.map((r) => ({ ...r, department: departmentForRobot(r.robot) }));

  const totalRuns = scoped.length;
  const crewMeasuredTokens = scoped.reduce((sum, r) => sum + r.tokens, 0);
  const crewMeasuredDurationMs = scoped.reduce((sum, r) => sum + r.durationMs, 0);

  const deptTotals = new Map();
  for (const r of scoped) {
    deptTotals.set(r.department, (deptTotals.get(r.department) || 0) + r.tokens);
  }
  const departments = [...deptTotals.entries()]
    .map(([name, tokens]) => ({
      name,
      tokens,
      pct: crewMeasuredTokens > 0 ? Math.round((tokens / crewMeasuredTokens) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const { rows: flaggedRows, auditState } = computeFlags(scoped);
  const robots = flaggedRows.map((r) => ({
    robot: r.robot,
    badge: (ROBOTS[NAME_TO_ID[r.robot]] || {}).badge || '🧩',
    department: r.department,
    tokens: r.tokens,
    duration: formatDuration(r.durationMs),
    flagged: r.flagged,
    flagMessage: r.message,
  }));
  const flags = flaggedRows.filter((r) => r.flagged).map((r) => ({
    robot: r.robot,
    department: r.department,
    message: r.message,
  }));

  return {
    scopeLabel, // "this effort" | "recent activity" -- never "this build"
    totalRuns,
    crewMeasuredTokens,
    crewMeasuredDurationMs,
    // Otto's own main-thread spend is never logged to the ledger (it stays
    // an estimate derived live from context length + turn count) — this
    // static log reader has no data source for it and must not fabricate
    // one. Honest absence, not a silent zero.
    ottoEstimateTokens: null,
    departments,
    robots,
    auditState, // 'flagged' | 'clean' | 'no-data'
    calmNegative: calmNegativeMessage(auditState, totalRuns),
    flags,
  };
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

  if (req.url === '/spend') {
    let body;
    try {
      body = JSON.stringify(computeSpendReport());
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

  if (req.url === '/spend.html') {
    try {
      const html = readFileSync(join(__dirname, 'spend.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('spend.html not found next to server.mjs');
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

// Exported for tests only (scripts/test-otto-trace.mjs, scripts/test-spend-
// report.mjs) — the module itself never imports these from outside.
export {
  parseLedgerLine,
  departmentForRobot,
  computeFlags,
  computeSpendReport,
  scopeLedgerRows,
  calmNegativeMessage,
  median,
  formatK,
  formatDuration,
  fullFlagMessage,
  FLAG_RATIO_MIN,
  FLAG_GAP_MIN_TOKENS,
  FLAG_BASIS_FLOOR_TOKENS,
  JARGON_RE,
};
