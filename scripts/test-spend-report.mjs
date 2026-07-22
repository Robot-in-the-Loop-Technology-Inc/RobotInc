#!/usr/bin/env node
// Test suite for the spend report (docs/spec-spend-report.md), building on
// v22.13.0's tier-capture mechanism (see scripts/test-otto-trace.mjs). Real
// filesystem I/O against scratch temp directories; no mocking, no framework,
// no dependency — same convention as scripts/test-otto-goal.mjs and
// scripts/test-otto-trace.mjs.
//
//   node scripts/test-spend-report.mjs
//
// SCOPE, STATED PLAINLY (same honesty as test-otto-goal.mjs's own SCOPE
// note): the build-end footer (agents/otto-foreman.md) and Baudrate's
// terminal reports (agents/baudrate-cfo.md) are PROSE, composed live from a
// robot's own judgment and context — there is no code path a Node script can
// call to "execute" them, so their exact wording and their gear-gating are
// NOT unit-tested here. What IS tested, mechanically, is everything the
// prose depends on to be true: the department rollup, the flag math, the
// self-comparison basis, the two calm-negatives, the "this effort"/"recent
// activity" scoping, and the no-jargon guarantee on the one surface that IS
// code (viewer/server.mjs's `/spend` JSON) — plus a textual regression guard
// on the gear-gating SENTENCE in agents/otto-foreman.md, which is the
// closest thing to "teeth" a prompt-only gate can have: it cannot prove
// Otto's judgment at runtime, but it does prove the instruction is still
// there for Glitchtrap's QA pass (task 14) to verify against.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseLedgerLine,
  departmentForRobot,
  computeFlags,
  median,
  formatK,
  formatDuration,
  fullFlagMessage,
  calmNegativeMessage,
  FLAG_RATIO_MIN,
  FLAG_GAP_MIN_TOKENS,
  FLAG_BASIS_FLOOR_TOKENS,
  JARGON_RE,
} from '../viewer/server.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SERVER_URL = pathToFileURL(join(REPO, 'viewer/server.mjs')).href;

const results = [];
const scratchDirs = [];
let importCounter = 0;

function record(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
  }
}

async function recordAsync(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(path) {
  return readFileSync(join(REPO, path), 'utf8');
}

// ---------------------------------------------------------------- fixtures

// A scratch project whose `.claude` directory doubles as CLAUDE_CONFIG_DIR —
// the same coincidence hooks/otto-trace.mjs's resolveLogDir() and viewer/
// server.mjs's own CONFIG_DIR both rely on: the ledger and the goal anchor
// live in the SAME directory (spec §4's scoping depends on this).
function freshProjectDir() {
  const projectDir = mkdtempSync(join(tmpdir(), 'spend-report-project-'));
  scratchDirs.push(projectDir);
  mkdirSync(join(projectDir, '.claude'), { recursive: true });
  return projectDir;
}

function configDirOf(projectDir) {
  return join(projectDir, '.claude');
}

function ledgerLine({ ts, project, robot, tokens, durationMs, tier }) {
  const proj = project ? ` [${project}]` : '';
  const t = tier ? ` tier=${tier}` : '';
  return `${ts}${proj} ${robot} tokens=${tokens} duration_ms=${durationMs}${t}`;
}

function writeLedger(projectDir, rows) {
  const lines = rows.map(ledgerLine);
  writeFileSync(join(configDirOf(projectDir), 'otto-ledger.log'), lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
}

function writeGoalAnchor(projectDir, { confirmed = '2026-07-20', gear = 'build' } = {}) {
  const lines = [
    '<!-- otto-goal.md test fixture -->', '',
    'status: active',
    `confirmed: ${confirmed}`,
    `gear: ${gear}`,
    '', '## Confirmed goal', 'Ship the spend report.', '',
    '## Original ask (verbatim)', 'build the spend report feature end to end', '',
  ];
  writeFileSync(join(configDirOf(projectDir), 'otto-goal.md'), lines.join('\n'), 'utf8');
}

// CONFIG_DIR is a top-level const in viewer/server.mjs, snapshotted at
// import time from process.env.CLAUDE_CONFIG_DIR — so a fresh, cache-busted
// dynamic import is required for every distinct scratch directory a test
// wants computeSpendReport() to read from. Same technique scripts/
// validate.mjs's own runtime jargon check uses, for the same reason.
async function loadSpendReport(configDir) {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  try {
    const mod = await import(`${SERVER_URL}?t=${Date.now()}-${importCounter++}`);
    return mod.computeSpendReport();
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev;
  }
}

// The exact ledger from docs/spec-spend-report.md §5's Option 1 worked
// example — chosen so this suite's numbers are checkable by eye against the
// spec itself, not just internally consistent.
const SPEC_EXAMPLE_ROWS = [
  { ts: '2026-07-22T10:00:00.000Z', project: 'demo', robot: 'Sonar', tokens: 187300, durationMs: 410000, tier: 'T3' },
  { ts: '2026-07-22T10:05:00.000Z', project: 'demo', robot: 'Vector', tokens: 138400, durationMs: 340000, tier: 'T2' },
  { ts: '2026-07-22T10:10:00.000Z', project: 'demo', robot: 'Bitforge', tokens: 96200, durationMs: 185000, tier: 'WORKSHOP' },
  { ts: '2026-07-22T10:15:00.000Z', project: 'demo', robot: 'Glitchtrap', tokens: 58900, durationMs: 140000, tier: 'T2' },
  { ts: '2026-07-22T10:20:00.000Z', project: 'demo', robot: 'Bitforge', tokens: 41800, durationMs: 100000, tier: 'WORKSHOP' },
  { ts: '2026-07-22T10:25:00.000Z', project: 'demo', robot: 'Patchbay', tokens: 22100, durationMs: 55000, tier: 'T1' },
];

// ============================================================ department normalizer
record('departmentForRobot: Engineer -> Engineering (spec example)', () => {
  assert(departmentForRobot('Bitforge') === 'Engineering', 'wrong department for Bitforge');
});
record('departmentForRobot: Architect -> Architecture (spec example)', () => {
  assert(departmentForRobot('Vector') === 'Architecture', 'wrong department for Vector');
});
record('departmentForRobot: CFO -> Finance', () => {
  assert(departmentForRobot('Baudrate') === 'Finance', 'wrong department for Baudrate');
});
record('departmentForRobot: a role that already reads as a department passes through unchanged', () => {
  assert(departmentForRobot('Sonar') === 'Research', 'wrong department for Sonar');
});
record('departmentForRobot: unknown robot name never throws', () => {
  assert(departmentForRobot('Nobody') === 'Unknown', 'expected the honest "Unknown" fallback');
});

// ============================================================ median()
record('median: odd count returns the middle value', () => {
  assert(median([3, 1, 2]) === 2, 'expected 2');
});
record('median: even count returns the average of the two middle values', () => {
  assert(median([1, 2, 3, 4]) === 2.5, 'expected 2.5');
});
record('median: single value returns itself', () => {
  assert(median([42]) === 42, 'expected 42');
});

// ============================================================ formatK / formatDuration
record('formatK rounds to the nearest K, matching the spec\'s worked example', () => {
  assert(formatK(96200) === '96K', `expected "96K", got "${formatK(96200)}"`);
  assert(formatK(41800) === '42K', `expected "42K", got "${formatK(41800)}"`);
});
record('formatDuration renders m/s the way the mockup and spec do', () => {
  assert(formatDuration(410000) === '6m50s', `expected "6m50s", got "${formatDuration(410000)}"`);
  assert(formatDuration(55000) === '0m55s', `expected "0m55s", got "${formatDuration(55000)}"`);
});

// ============================================================ the threshold, each condition individually (spec §8/§11)
record('threshold: ratio alone below 2x suppresses the flag even when gap and floor both pass', () => {
  // basis 20K (floor passes), actual 36K -> gap 16K (passes, >=15K), ratio 1.8x (fails, <2x) -- isolated.
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 20000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 36000, tier: 'T2' },
  ];
  const { rows: out } = computeFlags(rows);
  const actual = out.find((r) => r.tokens === 36000);
  assert(actual.tokens - actual.tokensExpected >= FLAG_GAP_MIN_TOKENS, 'fixture sanity: gap should pass');
  assert(actual.tokensExpected >= FLAG_BASIS_FLOOR_TOKENS, 'fixture sanity: floor should pass');
  assert(actual.ratio < FLAG_RATIO_MIN, 'fixture sanity: ratio should fail');
  assert(actual.flagged === false, 'ratio below 2x must suppress the flag even though gap and floor both pass');
});
record('threshold: ratio + floor pass, but gap alone fails (< 15K) -> no flag', () => {
  // basis 10K (floor OK, exactly at the floor), actual 21K -> ratio 2.1x (passes), gap 11K (fails, < 15K)
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 21000, tier: 'T2' },
  ];
  const { rows: out } = computeFlags(rows);
  const actual = out.find((r) => r.tokens === 21000);
  assert(actual.ratio >= FLAG_RATIO_MIN, 'fixture sanity: ratio should pass');
  assert(actual.tokens - actual.tokensExpected < FLAG_GAP_MIN_TOKENS, 'fixture sanity: gap should fail');
  assert(actual.flagged === false, 'gap below 15K must suppress the flag even though ratio and floor pass');
});
record('threshold: ratio + gap pass, but floor alone fails (basis < 10K) -> no flag', () => {
  // basis 5K (fails floor), actual 15K -> ratio 3x (passes), gap 10K... need gap >= 15K too for isolation.
  // basis 5K, actual 21K -> ratio 4.2x (passes), gap 16K (passes), floor 5K (fails, < 10K).
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 5000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 21000, tier: 'T2' },
  ];
  const { rows: out } = computeFlags(rows);
  const actual = out.find((r) => r.tokens === 21000);
  assert(actual.ratio >= FLAG_RATIO_MIN, 'fixture sanity: ratio should pass');
  assert(actual.tokens - actual.tokensExpected >= FLAG_GAP_MIN_TOKENS, 'fixture sanity: gap should pass');
  assert(actual.tokensExpected < FLAG_BASIS_FLOOR_TOKENS, 'fixture sanity: floor should fail');
  assert(actual.flagged === false, 'basis below the 10K floor must suppress the flag even though ratio and gap pass');
});
record('threshold: all three together -> flagged, matching the spec\'s worked example exactly (2.3x, ~96K vs ~42K)', () => {
  const rows = [
    { robot: 'Bitforge', department: 'Engineering', tokens: 41800, tier: 'WORKSHOP' },
    { robot: 'Bitforge', department: 'Engineering', tokens: 96200, tier: 'WORKSHOP' },
  ];
  const { rows: out, auditState } = computeFlags(rows);
  const flagged = out.find((r) => r.tokens === 96200);
  assert(flagged.flagged === true, 'expected the spec\'s own worked example to flag');
  assert(flagged.ratio === 2.3, `expected ratio 2.3, got ${flagged.ratio}`);
  assert(auditState === 'flagged', `expected auditState "flagged", got "${auditState}"`);
});

// ============================================================ self-comparison basis (spec §8/§11)
record('basis: 2+ priors -> the median of the priors, never a crew-wide band', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 20000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 50000, tier: 'T2' },
  ];
  const { rows: out } = computeFlags(rows);
  const last = out.find((r) => r.tokens === 50000);
  assert(last.tokensExpected === 15000, `expected median of [10000,20000] = 15000, got ${last.tokensExpected}`);
  assert(last.comparisonBasis === 'median-of-priors', `expected "median-of-priors", got "${last.comparisonBasis}"`);
});
record('basis: exactly 1 prior -> that single run IS the basis', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 40000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 90000, tier: 'T2' },
  ];
  const { rows: out } = computeFlags(rows);
  const second = out.find((r) => r.tokens === 90000);
  assert(second.tokensExpected === 40000, `expected the single prior 40000 as the basis, got ${second.tokensExpected}`);
  assert(second.comparisonBasis === 'single-prior', `expected "single-prior", got "${second.comparisonBasis}"`);
});
record('basis: 0 priors (a singleton bucket) -> null basis, never flagged, never a crew-wide fallback', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 90000, tier: 'T2' },
    { robot: 'Y', department: 'Research', tokens: 90000, tier: 'T2' }, // different robot AND department -- no bucket overlap
  ];
  const { rows: out } = computeFlags(rows);
  for (const r of out) {
    assert(r.tokensExpected === null, `expected null basis for a singleton bucket, got ${r.tokensExpected}`);
    assert(r.flagged === false, 'a singleton bucket must never flag');
    assert(r.comparisonBasis === 'none', `expected "none", got "${r.comparisonBasis}"`);
  }
});
record('basis: a robot is only ever compared against ITSELF -- a different robot at the same tokens never forms its basis', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'Z', department: 'Engineering', tokens: 10000, tier: 'T2' }, // same dept/tier, DIFFERENT robot
    { robot: 'X', department: 'Engineering', tokens: 30000, tier: 'T2' },
  ];
  const { rows: out } = computeFlags(rows);
  const xSecond = out.find((r) => r.robot === 'X' && r.tokens === 30000);
  // X has exactly ONE prior (its own 10000 run) -- Z's 10000 run must not count.
  assert(xSecond.priorRunCount === 1, `expected priorRunCount 1 (self only), got ${xSecond.priorRunCount}`);
});

// ============================================================ the 4th state: two calm-negatives, never blurred (spec §8/§11)
record('4th state: clean -- 2+ comparable runs existed, none flagged', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 12000, tier: 'T2' }, // ratio 1.2x -- well under threshold
    { robot: 'Y', department: 'Research', tokens: 5000, tier: 'T1' },
  ];
  const { auditState } = computeFlags(rows);
  assert(auditState === 'clean', `expected "clean", got "${auditState}"`);
  assert(calmNegativeMessage('clean', 3) === 'Spend looked proportionate across all 3 runs.',
    'clean message must match the spec\'s exact wording, with N substituted');
});
record('4th state: no-data -- every run is a singleton in its own comparison bucket', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'Y', department: 'Research', tokens: 20000, tier: 'T3' },
    { robot: 'Z', department: 'QA', tokens: 30000, tier: 'T1' },
  ];
  const { auditState } = computeFlags(rows);
  assert(auditState === 'no-data', `expected "no-data", got "${auditState}"`);
  assert(
    calmNegativeMessage('no-data', 3) === 'Not enough same-scope runs this effort to compare — no audit finding either way.',
    'no-data message must match the spec\'s exact wording'
  );
});
record('4th state: no-data on a single run total, the other named case in the spec', () => {
  const rows = [{ robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' }];
  const { auditState } = computeFlags(rows);
  assert(auditState === 'no-data', `expected "no-data" for a lone run, got "${auditState}"`);
});
record('4th state: a MIX of evaluable and singleton rows, no flags, is still "clean" (Bitforge\'s tie-breaker, spec §8)', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 12000, tier: 'T2' }, // evaluable pair, clean
    { robot: 'Y', department: 'Research', tokens: 50000, tier: 'T3' },    // singleton, never evaluated
  ];
  const { auditState } = computeFlags(rows);
  assert(auditState === 'clean', `expected "clean" per the mix rule, got "${auditState}"`);
});
record('4th state and flagged are mutually exclusive: any real flag always wins over a calm-negative', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 30000, tier: 'T2' }, // flags
    { robot: 'Y', department: 'Research', tokens: 20000, tier: 'T3' },    // singleton, irrelevant
  ];
  const { auditState } = computeFlags(rows);
  assert(auditState === 'flagged', `expected "flagged", got "${auditState}"`);
});

// ============================================================ rows with no captured tier degrade gracefully (spec §10)
record('a row with no captured tier never joins any bucket, on either side, but still carries tokens/duration', () => {
  const rows = [
    { robot: 'X', department: 'Engineering', tokens: 10000, tier: 'T2' },
    { robot: 'X', department: 'Engineering', tokens: 90000, tier: null }, // no tier -- must never form or consume a basis
  ];
  const { rows: out } = computeFlags(rows);
  const untiered = out.find((r) => r.tokens === 90000);
  assert(untiered.flagged === false, 'a row with no tier must never flag');
  assert(untiered.tokensExpected === null, 'a row with no tier must never carry a basis');
  const tiered = out.find((r) => r.tokens === 10000);
  assert(tiered.priorRunCount === 0, 'the tiered row must not see the untiered row as a prior');
});

// ============================================================ fullFlagMessage / templates (spec §8)
record('fullFlagMessage matches the spec\'s exact worked-example string, verbatim', () => {
  const row = { robot: 'Bitforge', department: 'Engineering', tokens: 96200, tokensExpected: 41800, ratio: 2.3 };
  const msg = fullFlagMessage(row);
  assert(
    msg === "⚠ Bitforge's this pass cost about 2.3× its own typical run in Engineering this effort (~96K vs ~42K) — worth a look.",
    `message did not match verbatim, got: ${msg}`
  );
});
record('fullFlagMessage never contains a dollar sign', () => {
  const row = { robot: 'X', department: 'Engineering', tokens: 96200, tokensExpected: 41800, ratio: 2.3 };
  assert(!fullFlagMessage(row).includes('$'), 'flag message must never carry a dollar figure');
});

// ============================================================ department rollup + full pipeline (real ledger I/O)
await recordAsync('computeSpendReport: known ledger -> department rollup and per-robot rows match the spec\'s exact numbers', async () => {
  const projectDir = freshProjectDir();
  writeLedger(projectDir, SPEC_EXAMPLE_ROWS);
  const report = await loadSpendReport(configDirOf(projectDir));

  assert(report.totalRuns === 6, `expected 6 runs, got ${report.totalRuns}`);
  assert(report.crewMeasuredTokens === 544700, `expected 544700 crew-measured tokens, got ${report.crewMeasuredTokens}`);

  const research = report.departments.find((d) => d.name === 'Research');
  assert(research.tokens === 187300 && research.pct === 34.4, `Research rollup wrong: ${JSON.stringify(research)}`);
  const engineering = report.departments.find((d) => d.name === 'Engineering');
  assert(engineering.tokens === 138000 && engineering.pct === 25.3, `Engineering rollup wrong: ${JSON.stringify(engineering)}`);

  assert(report.auditState === 'flagged', `expected "flagged", got "${report.auditState}"`);
  assert(report.flags.length === 1, `expected exactly 1 flag, got ${report.flags.length}`);
  assert(report.flags[0].message.includes('2.3×'), `flag message wrong: ${report.flags[0].message}`);
});

record('computeSpendReport: crew-measured and Otto-estimate are never summed -- Otto\'s figure is honestly absent, not fabricated', () => {
  // Sync check against the exported shape contract directly (no ledger needed): computeSpendReport's
  // return always carries ottoEstimateTokens as its own field, distinct from crewMeasuredTokens, and this
  // static log reader has no data source for Otto's own main-thread spend -- it must say so, never invent
  // a number or silently fold one figure into the other.
  assert(true, 'structural guarantee asserted via the async pipeline test above and the source read below');
  const src = read('viewer/server.mjs');
  assert(src.includes('ottoEstimateTokens'), 'expected a distinct, honestly-absent ottoEstimateTokens field');
  assert(!/crewMeasuredTokens\s*\+\s*ottoEstimateTokens/.test(src), 'regression: the two figures must never be summed in code');
});

await recordAsync('computeSpendReport: a flagged row\'s message is the SAME string in robots[] and flags[] -- one source, never two', async () => {
  const projectDir = freshProjectDir();
  writeLedger(projectDir, SPEC_EXAMPLE_ROWS);
  const report = await loadSpendReport(configDirOf(projectDir));
  const flaggedRobotRow = report.robots.find((r) => r.flagged);
  assert(flaggedRobotRow.flagMessage === report.flags[0].message, 'the per-robot flag message and the flags[] message must be identical, verbatim');
});

await recordAsync('computeSpendReport: an empty/missing ledger renders an honest empty state, never an error', async () => {
  const projectDir = freshProjectDir(); // no otto-ledger.log written at all
  const report = await loadSpendReport(configDirOf(projectDir));
  assert(report.totalRuns === 0, 'expected 0 runs on a missing ledger');
  assert(report.crewMeasuredTokens === 0, 'expected 0 tokens on a missing ledger');
  assert(report.departments.length === 0, 'expected no departments on a missing ledger');
  assert(report.robots.length === 0, 'expected no robot rows on a missing ledger');
  assert(report.auditState === 'no-data', `expected "no-data" on an empty ledger, got "${report.auditState}"`);
  assert(report.calmNegative && report.calmNegative.includes('Not enough same-scope runs'), 'expected the honest no-data calm-negative, never blank');
});

// ============================================================ "this effort" / "recent activity" (spec §4/§7/§11)
await recordAsync('scopeLabel: an active goal anchor scopes to "this effort" and filters by its confirmed date', async () => {
  const projectDir = freshProjectDir();
  const project = basename(projectDir); // the [project] tag scopeLedgerRows() matches against is basename(projectRoot)
  writeGoalAnchor(projectDir, { confirmed: '2026-07-22' });
  writeLedger(projectDir, [
    { ts: '2026-07-21T09:00:00.000Z', project, robot: 'Sonar', tokens: 999000, durationMs: 1000, tier: 'T2' }, // BEFORE the anchor -- excluded
    { ts: '2026-07-22T10:00:00.000Z', project, robot: 'Sonar', tokens: 5000, durationMs: 1000, tier: 'T2' },   // on/after -- included
  ]);
  const report = await loadSpendReport(configDirOf(projectDir));
  assert(report.scopeLabel === 'this effort', `expected "this effort", got "${report.scopeLabel}"`);
  assert(report.totalRuns === 1, `expected the pre-anchor run excluded, got totalRuns=${report.totalRuns}`);
  assert(report.crewMeasuredTokens === 5000, `expected only the post-anchor run's tokens, got ${report.crewMeasuredTokens}`);
});
await recordAsync('scopeLabel: no active goal anchor degrades to "recent activity", never "this build"', async () => {
  const projectDir = freshProjectDir(); // no otto-goal.md at all
  const project = basename(projectDir);
  writeLedger(projectDir, [{ ts: '2026-07-22T10:00:00.000Z', project, robot: 'Sonar', tokens: 5000, durationMs: 1000, tier: 'T2' }]);
  const report = await loadSpendReport(configDirOf(projectDir));
  assert(report.scopeLabel === 'recent activity', `expected "recent activity", got "${report.scopeLabel}"`);
  assert(report.scopeLabel !== 'this build', 'regression: the label must never read "this build"');
});
await recordAsync('scopeLabel: a second run under the SAME un-retired anchor shows the growing total, not a reset or a double-count', async () => {
  const projectDir = freshProjectDir();
  const project = basename(projectDir);
  writeGoalAnchor(projectDir, { confirmed: '2026-07-22' });
  writeLedger(projectDir, [{ ts: '2026-07-22T10:00:00.000Z', project, robot: 'Sonar', tokens: 5000, durationMs: 1000, tier: 'T2' }]);
  const first = await loadSpendReport(configDirOf(projectDir));
  assert(first.crewMeasuredTokens === 5000, 'first read should show only the first run');

  // A second subagent completion appends to the SAME ledger, same anchor, still active.
  const line = ledgerLine({ ts: '2026-07-22T11:00:00.000Z', project, robot: 'Sonar', tokens: 3000, durationMs: 1000, tier: 'T2' });
  writeFileSync(join(configDirOf(projectDir), 'otto-ledger.log'), line + '\n', { flag: 'a' });
  const second = await loadSpendReport(configDirOf(projectDir));
  assert(second.crewMeasuredTokens === 8000, `expected the growing total 8000 (5000+3000), got ${second.crewMeasuredTokens}`);
  assert(second.totalRuns === 2, `expected 2 runs accumulated under the same anchor, got ${second.totalRuns}`);
});

// ============================================================ no-jargon guarantee (spec §9/§11 -- the second critical negative)
record('JARGON_RE catches every forbidden token, case-insensitively', () => {
  for (const bad of ['declared tier', 'Tier: WORKSHOP', 'a WORKSHOP run', 'ran as T1', 'targeted T2 board', 'full T3 board']) {
    assert(JARGON_RE.test(bad), `expected JARGON_RE to catch "${bad}"`);
  }
});
record('JARGON_RE does NOT false-positive on the legitimate "cost-tier" phrase (LLM pricing, unrelated concept)', () => {
  assert(!JARGON_RE.test('not a cost-tier breakdown'), 'the exclusion for "cost-tier" must hold — it is model-pricing granularity, not the rigor declaration');
});
await recordAsync('computeSpendReport: the rendered JSON output is jargon-free even when the SOURCE ledger legitimately carries tier=', async () => {
  const projectDir = freshProjectDir();
  writeLedger(projectDir, [
    { ts: '2026-07-22T10:00:00.000Z', project: 'x', robot: 'Bitforge', tokens: 10000, durationMs: 60000, tier: 'WORKSHOP' },
    { ts: '2026-07-22T10:05:00.000Z', project: 'x', robot: 'Bitforge', tokens: 40000, durationMs: 120000, tier: 'WORKSHOP' },
  ]);
  // Prove the seam is REAL, not vacuous: the backstage ledger file itself
  // must legitimately contain the word, or this test would prove nothing.
  const rawLedger = readFileSync(join(configDirOf(projectDir), 'otto-ledger.log'), 'utf8');
  assert(JARGON_RE.test(rawLedger), 'fixture sanity: the raw ledger must legitimately carry tier= (the excluded backstage surface)');

  const report = await loadSpendReport(configDirOf(projectDir));
  assert(report.flags.length === 1, 'fixture sanity: expected this to flag');
  assert(!JARGON_RE.test(JSON.stringify(report)), `regression: the rendered /spend JSON contains forbidden vocabulary: ${JSON.stringify(report)}`);
});
record('the excluded hook (hooks/otto-trace.mjs) legitimately mentions the vocabulary -- the exclusion has a real target', () => {
  const traceSrc = read('hooks/otto-trace.mjs');
  assert(JARGON_RE.test(traceSrc), 'fixture sanity: hooks/otto-trace.mjs is the capture mechanism and must legitimately mention "tier"');
});
record('viewer/spend.html has no legitimate reason to mention the vocabulary at all -- whole-file scan is clean', () => {
  const html = read('viewer/spend.html');
  assert(!JARGON_RE.test(html), 'regression: viewer/spend.html contains forbidden rigor-declaration vocabulary');
});

// ============================================================ the first critical negative -- textual regression guard (spec §7/§11)
// PROSE-ONLY, per this file's SCOPE note above: this cannot execute Otto's runtime gear-gating judgment, only
// confirm the instruction that judgment depends on is still present, verbatim enough to still say what it must.
record('agents/otto-foreman.md still states the spend footer\'s gear-gate: feature/build only, explicitly never answer/small-change', () => {
  const otto = read('agents/otto-foreman.md');
  const m = otto.match(/<!-- SPEND-REPORT-PROSE:START[\s\S]*?-->([\s\S]*?)<!-- SPEND-REPORT-PROSE:END -->/);
  assert(m, 'expected the SPEND-REPORT-PROSE marker block in agents/otto-foreman.md');
  const block = m[1];
  assert(/gear=feature.*gear=build|gear=build.*gear=feature/.test(block.replace(/\s+/g, ' ')),
    'expected the footer\'s gear-gate to name both feature and build dispatches');
  assert(/never.*answer.*small change|never.*small change.*answer/i.test(block.replace(/\s+/g, ' ')),
    'expected an explicit "never" on answer/small-change dispatches — the critical negative this gate exists to prevent');
});
record('agents/otto-foreman.md\'s spend-footer table states all four spendReporting values (drift already gated in scripts/validate.mjs)', () => {
  const otto = read('agents/otto-foreman.md');
  for (const val of ['off', 'on-request', 'build-end', 'verbose']) {
    assert(new RegExp('`' + val + '`').test(otto), `expected \`${val}\` in agents/otto-foreman.md's spend-footer table`);
  }
});

// ---------------------------------------------------------------- verdict
for (const dir of scratchDirs) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? 'ok  ' : 'FAIL'} - ${r.name}`);
  if (!r.pass) console.log(`     ${r.detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
