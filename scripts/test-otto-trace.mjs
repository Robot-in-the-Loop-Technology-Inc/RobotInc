#!/usr/bin/env node
// Test suite for hooks/otto-trace.mjs — v22.8.3 fixes:
//
//   FIX 1 (trace attribution): the ROBOTS map lookup used the raw, still-
//   NAMESPACED subagent_type ("robotinc:cathode-design") against un-prefixed
//   map keys ("cathode-design"). CONFIRMED across every line of a real
//   otto-trace.log: the lookup never hit, so EVERY crew completion logged as
//   an anonymous 🤍 "robotinc:whatever" with no role. Fixed by stripping the
//   "robotinc:" prefix (bareType()) before the ROBOTS[] lookup, same fix
//   hooks/otto-state.mjs already shipped for its own copy of this map.
//
//   FIX 2 (ledger token units): the ledger writer SUMMED every message's
//   `usage` object across a subagent's whole transcript. Anthropic's `usage`
//   field is the TOTAL context that API call processed, not a per-turn
//   delta — under prompt caching it grows monotonically, so summing every
//   message re-adds the same growing context on every turn and compounds
//   into numbers 10-1000x too large. Fixed by taking only the LAST message's
//   usage snapshot, which already reflects the whole run's final token
//   total.
//
//   FIX 3 (per-project ledger attribution, v22.8.4): the ledger carried no
//   project tag, so tokens/duration could not be attributed to the project
//   that spent them once a machine has more than one. Fixed by tagging every
//   new line with `[project]` (basename(cwd), same derivation and bracket
//   style as hooks/otto-state.mjs's own `[project]` tag) — see
//   hooks/otto-trace.mjs's "LEDGER LINE FORMAT" comment. Old, untagged lines
//   already on disk are never rewritten (append-only log); viewer/server.mjs's
//   parseLedgerLine() treats the tag as optional so both shapes parse.
//
// Real filesystem I/O against scratch temp directories; no mocking, no
// framework, no dependency. Matches the convention set by
// scripts/test-otto-state.mjs and scripts/test-otto-facts.mjs.
//
//   node scripts/test-otto-trace.mjs

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  run,
  bareType,
  summarizeResult,
  computeLedgerEntry,
  ROBOTS,
} from '../hooks/otto-trace.mjs';
import { parseLedgerLine } from '../viewer/server.mjs';

const HOOK_PATH = fileURLToPath(new URL('../hooks/otto-trace.mjs', import.meta.url));
const results = [];
const scratchDirs = [];

function record(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function freshDirs() {
  const configDir = mkdtempSync(join(tmpdir(), 'otto-trace-config-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'otto-trace-project-'));
  scratchDirs.push(configDir, projectDir);
  return { configDir, projectDir };
}

function withClaudeDir(projectDir) {
  mkdirSync(join(projectDir, '.claude'), { recursive: true });
}

function readLog(dir, name) {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return '';
  }
}

// A minimal, realistic subagent-transcript fixture: growing usage per message,
// the exact shape found in a real ~/.claude/projects/.../subagents/*.jsonl —
// cache_read_input_tokens climbs turn over turn because prompt caching
// re-reads the whole accumulated context on every call. The naive "sum every
// message" formula inflates massively on exactly this shape; the fix must
// land on the LAST message's total instead.
function writeTranscript(path, rows) {
  const lines = rows.map((r) =>
    JSON.stringify({
      timestamp: r.ts,
      message: r.usage ? { usage: r.usage } : { role: 'assistant' },
    })
  );
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------- fixtures
const CREW_ID = 'cathode-design';
const [CREW_BADGE, CREW_NAME, CREW_ROLE] = ROBOTS[CREW_ID];

// ============================================================ bareType()
record('bareType strips the robotinc: prefix', () => {
  assert(bareType('robotinc:cathode-design') === 'cathode-design', 'did not strip prefix');
});
record('bareType is a no-op on an unprefixed built-in', () => {
  assert(bareType('Explore') === 'Explore', 'mutated an unprefixed type');
});
record('bareType only strips OUR prefix, not a third party\'s', () => {
  assert(bareType('someplugin:their-agent') === 'someplugin:their-agent', 'stripped a foreign namespace');
});

// ============================================================ summarizeResult()
record('summarizeResult takes the last non-empty line, cleaned', () => {
  const out = summarizeResult('first line\n\n**bold** result: done  \n');
  assert(out === 'bold result: done', `got "${out}"`);
});
record('summarizeResult falls back on empty input', () => {
  assert(summarizeResult('') === '(no result line)', 'wrong fallback');
});

// ============================================================ FIX 1: run() attribution
record('crew regression shape: run() no longer renders a raw "robotinc:" name for a crew robot', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  run(
    {
      agent_type: `robotinc:${CREW_ID}`,
      last_assistant_message: 'Redesigned the card, 3 tests green.',
      cwd: projectDir,
    },
    { env: {}, home: configDir }
  );
  const log = readLog(join(projectDir, '.claude'), 'otto-trace.log');
  assert(log.length > 0, 'no line written');
  // The exact regression: BEFORE the fix, this line read
  // "🤍 robotinc:cathode-design — ...". Assert the raw namespaced id is
  // nowhere in the rendered line — this is the shape that must fail if the
  // bug reappears.
  assert(!/robotinc:/.test(log), `regression: raw "robotinc:" leaked into the trace line: ${log}`);
});

record('crew dispatch resolves to the correct badge, name and role', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  run(
    { agent_type: `robotinc:${CREW_ID}`, last_assistant_message: 'done', cwd: projectDir },
    { env: {}, home: configDir }
  );
  const log = readLog(join(projectDir, '.claude'), 'otto-trace.log');
  assert(log.includes(`${CREW_BADGE} ${CREW_NAME} (${CREW_ROLE})`),
    `expected "${CREW_BADGE} ${CREW_NAME} (${CREW_ROLE})" in: ${log}`);
});

record('every crew id in ROBOTS resolves correctly when namespaced', () => {
  for (const [id, [badge, name, role]] of Object.entries(ROBOTS)) {
    const { configDir, projectDir } = freshDirs();
    withClaudeDir(projectDir);
    run(
      { agent_type: `robotinc:${id}`, last_assistant_message: 'ok', cwd: projectDir },
      { env: {}, home: configDir }
    );
    const log = readLog(join(projectDir, '.claude'), 'otto-trace.log');
    assert(log.includes(`${badge} ${name} (${role})`), `"${id}" did not resolve: ${log}`);
    assert(!/robotinc:/.test(log), `"${id}" leaked its raw namespaced id: ${log}`);
  }
});

record('a built-in (unprefixed, unknown) still renders exactly as before: 🤍 + raw type, no role', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  run(
    { agent_type: 'Explore', last_assistant_message: 'ok', cwd: projectDir },
    { env: {}, home: configDir }
  );
  const log = readLog(join(projectDir, '.claude'), 'otto-trace.log');
  assert(log.includes('🤍 Explore —'), `expected "🤍 Explore —" (no role parens) in: ${log}`);
});

record('a third-party plugin agent keeps its OWN namespace, unstripped, still 🤍', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  run(
    { agent_type: 'someplugin:their-agent', last_assistant_message: 'ok', cwd: projectDir },
    { env: {}, home: configDir }
  );
  const log = readLog(join(projectDir, '.claude'), 'otto-trace.log');
  assert(log.includes('🤍 someplugin:their-agent —'), `expected foreign namespace preserved in: ${log}`);
});

record('no agent_type/subagent_type: nothing written, no throw', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  run({ cwd: projectDir }, { env: {}, home: configDir });
  const log = readLog(join(projectDir, '.claude'), 'otto-trace.log');
  assert(log === '', `expected no line written, got: ${log}`);
});

// ============================================================ FIX 2: ledger tokens
record('computeLedgerEntry: null when the transcript path does not exist', () => {
  assert(computeLedgerEntry('/nonexistent/path/agent.jsonl') === null, 'expected null');
});

record('computeLedgerEntry: null when the transcript has no usage anywhere', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otto-trace-transcript-'));
  scratchDirs.push(dir);
  const p = join(dir, 'agent.jsonl');
  writeTranscript(p, [
    { ts: '2026-07-16T01:00:00.000Z' },
    { ts: '2026-07-16T01:00:05.000Z' },
  ]);
  assert(computeLedgerEntry(p) === null, 'expected null with no usage data');
});

record('computeLedgerEntry: skips malformed JSON lines without crashing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otto-trace-transcript-'));
  scratchDirs.push(dir);
  const p = join(dir, 'agent.jsonl');
  const good = JSON.stringify({
    timestamp: '2026-07-16T01:00:00.000Z',
    message: { usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  });
  writeFileSync(p, `${good}\nnot valid json {{{\n${good}\n`, 'utf8');
  const entry = computeLedgerEntry(p);
  assert(entry && entry.tokens === 30, `expected tokens=30, got ${JSON.stringify(entry)}`);
});

record('computeLedgerEntry: takes the LAST usage snapshot, not the sum — regression shape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'otto-trace-transcript-'));
  scratchDirs.push(dir);
  const p = join(dir, 'agent.jsonl');
  // Modeled on a real captured transcript shape: cache_read_input_tokens
  // climbs every turn as prompt caching re-reads the growing conversation.
  const rows = [
    { ts: '2026-07-16T01:00:00.000Z', usage: { input_tokens: 2, output_tokens: 5, cache_creation_input_tokens: 34234, cache_read_input_tokens: 0 } },
    { ts: '2026-07-16T01:00:10.000Z', usage: { input_tokens: 2, output_tokens: 306, cache_creation_input_tokens: 997, cache_read_input_tokens: 34234 } },
    { ts: '2026-07-16T01:00:20.000Z', usage: { input_tokens: 2, output_tokens: 2502, cache_creation_input_tokens: 3176, cache_read_input_tokens: 117741 } },
    { ts: '2026-07-16T01:00:30.000Z', usage: { input_tokens: 2, output_tokens: 9246, cache_creation_input_tokens: 4436, cache_read_input_tokens: 123518 } },
  ];
  writeTranscript(p, rows);

  const entry = computeLedgerEntry(p);
  assert(entry !== null, 'expected an entry');

  // Ground truth: the LAST message's own total.
  const expected = 2 + 9246 + 4436 + 123518; // = 137202
  assert(entry.tokens === expected, `expected last-snapshot total ${expected}, got ${entry.tokens}`);

  // The regression shape: the OLD (buggy) code summed every message's usage.
  // Prove the fixed number is nowhere near that — it must NOT equal the sum.
  const buggySum = rows.reduce((acc, r) =>
    acc + r.usage.input_tokens + r.usage.output_tokens + r.usage.cache_creation_input_tokens + r.usage.cache_read_input_tokens, 0);
  assert(buggySum === 330403, `fixture sanity check failed, sum was ${buggySum}`);
  assert(entry.tokens !== buggySum, `regression: computed total equals the old inflated sum (${buggySum})`);
  assert(entry.tokens < buggySum / 2, `computed total (${entry.tokens}) is not meaningfully smaller than the buggy sum (${buggySum})`);

  assert(entry.durationMs === 30000, `expected duration 30000ms (first-to-last timestamp), got ${entry.durationMs}`);
});

record('run() writes a ledger line using the last-snapshot total, keyed by robot name (Fix 1 + Fix 2 together)', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const transcriptDir = mkdtempSync(join(tmpdir(), 'otto-trace-transcript-'));
  scratchDirs.push(transcriptDir);
  const transcriptPath = join(transcriptDir, 'agent.jsonl');
  writeTranscript(transcriptPath, [
    { ts: '2026-07-16T01:00:00.000Z', usage: { input_tokens: 2, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 } },
    { ts: '2026-07-16T01:00:05.000Z', usage: { input_tokens: 2, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 100 } },
  ]);

  run(
    {
      agent_type: `robotinc:${CREW_ID}`,
      last_assistant_message: 'shipped',
      cwd: projectDir,
      agent_transcript_path: transcriptPath,
    },
    { env: {}, home: configDir }
  );

  const ledger = readLog(join(projectDir, '.claude'), 'otto-ledger.log');
  assert(ledger.includes(CREW_NAME), `expected ledger line keyed by "${CREW_NAME}", got: ${ledger}`);
  assert(!/robotinc:/.test(ledger), `regression: raw "robotinc:" leaked into the ledger line: ${ledger}`);
  const expectedTokens = 2 + 50 + 200 + 100; // last message's total = 352
  assert(ledger.includes(`tokens=${expectedTokens} `), `expected tokens=${expectedTokens} in: ${ledger}`);
});

record('run() writes no ledger line when the transcript path is absent (fail-soft, never fabricate)', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  run(
    { agent_type: `robotinc:${CREW_ID}`, last_assistant_message: 'ok', cwd: projectDir },
    { env: {}, home: configDir }
  );
  const ledger = readLog(join(projectDir, '.claude'), 'otto-ledger.log');
  assert(ledger === '', `expected no ledger line, got: ${ledger}`);
});

// ============================================================ FIX 3: per-project ledger tag
record('run() writes a ledger line carrying the correct [project] tag when cwd is present', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const transcriptDir = mkdtempSync(join(tmpdir(), 'otto-trace-transcript-'));
  scratchDirs.push(transcriptDir);
  const transcriptPath = join(transcriptDir, 'agent.jsonl');
  writeTranscript(transcriptPath, [
    { ts: '2026-07-16T01:00:00.000Z', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 0 } },
  ]);

  run(
    {
      agent_type: `robotinc:${CREW_ID}`,
      last_assistant_message: 'ok',
      cwd: projectDir,
      agent_transcript_path: transcriptPath,
    },
    { env: {}, home: configDir }
  );

  const ledger = readLog(join(projectDir, '.claude'), 'otto-ledger.log');
  const expectedProject = basename(projectDir);
  assert(ledger.includes(`[${expectedProject}] ${CREW_NAME} `),
    `expected "[${expectedProject}] ${CREW_NAME} " in: ${ledger}`);
});

record('negative: a ledger line is never missing its [project] tag when cwd was present', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const transcriptDir = mkdtempSync(join(tmpdir(), 'otto-trace-transcript-'));
  scratchDirs.push(transcriptDir);
  const transcriptPath = join(transcriptDir, 'agent.jsonl');
  writeTranscript(transcriptPath, [
    { ts: '2026-07-16T01:00:00.000Z', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 0 } },
  ]);

  run(
    { agent_type: `robotinc:${CREW_ID}`, last_assistant_message: 'ok', cwd: projectDir, agent_transcript_path: transcriptPath },
    { env: {}, home: configDir }
  );

  const ledger = readLog(join(projectDir, '.claude'), 'otto-ledger.log');
  // The regression this guards: a ledger writer that silently drops the tag
  // reverts to the pre-v22.8.4 shape "<ts> <name> tokens=..." even though
  // cwd was present on the payload. Fail if no [project] tag made it in.
  assert(/^\S+ \[[^\]]+\] /.test(ledger), `regression: ledger line has no [project] tag though cwd was present: ${ledger}`);
});

record('viewer parseLedgerLine: parses a NEW tagged line and extracts ts/project/tokens/duration', () => {
  const line = '2026-07-16T01:00:00.000Z [RobotInc] Bitforge tokens=352 duration_ms=5000';
  const parsed = parseLedgerLine(line);
  assert(parsed !== null, 'expected a parse');
  assert(parsed.ts === '2026-07-16T01:00:00.000Z', `wrong ts: ${parsed.ts}`);
  assert(parsed.project === 'RobotInc', `wrong project: ${parsed.project}`);
  assert(parsed.tokens === 352, `wrong tokens: ${parsed.tokens}`);
  assert(parsed.durationMs === 5000, `wrong durationMs: ${parsed.durationMs}`);
});

record('viewer parseLedgerLine: still parses a legacy UNTAGGED line, project comes back null', () => {
  const line = '2026-07-16T01:00:00.000Z Bitforge tokens=137202 duration_ms=30000';
  const parsed = parseLedgerLine(line);
  assert(parsed !== null, 'expected a parse of the legacy shape');
  assert(parsed.project === null, `expected null project on a legacy line, got: ${parsed.project}`);
  assert(parsed.tokens === 137202, `wrong tokens: ${parsed.tokens}`);
  assert(parsed.durationMs === 30000, `wrong durationMs: ${parsed.durationMs}`);
});

record('viewer parseLedgerLine: garbage input returns null, never throws', () => {
  assert(parseLedgerLine('not a ledger line at all') === null, 'expected null on garbage');
  assert(parseLedgerLine('') === null, 'expected null on empty string');
});

// ============================================================ real subprocess (end-to-end)
record('the real hook process (stdin JSON in) resolves a crew id and writes both logs', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const transcriptDir = mkdtempSync(join(tmpdir(), 'otto-trace-transcript-'));
  scratchDirs.push(transcriptDir);
  const transcriptPath = join(transcriptDir, 'agent.jsonl');
  writeTranscript(transcriptPath, [
    { ts: '2026-07-16T01:00:00.000Z', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 } },
    { ts: '2026-07-16T01:00:15.000Z', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 500, cache_read_input_tokens: 1000 } },
  ]);

  const payload = JSON.stringify({
    agent_type: `robotinc:${CREW_ID}`,
    last_assistant_message: 'end to end ok',
    cwd: projectDir,
    agent_transcript_path: transcriptPath,
  });

  const res = spawnSync(process.execPath, [HOOK_PATH], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  });
  assert(res.status === 0, `hook exited ${res.status}, stderr: ${res.stderr}`);

  const log = readLog(join(projectDir, '.claude'), 'otto-trace.log');
  assert(log.includes(`${CREW_BADGE} ${CREW_NAME} (${CREW_ROLE})`), `subprocess trace line wrong: ${log}`);
  assert(!/robotinc:/.test(log), `subprocess trace line leaked raw namespace: ${log}`);

  const ledger = readLog(join(projectDir, '.claude'), 'otto-ledger.log');
  assert(ledger.includes(`tokens=${1 + 1 + 500 + 1000} `), `subprocess ledger line wrong: ${ledger}`);
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
