#!/usr/bin/env node
// Test suite for hooks/otto-state.mjs — task 8 (smoke) and task 9 (9a-9m
// negative tests) from TASKS.md's v22.8.0 build. Real filesystem I/O against
// scratch temp directories; no mocking, no framework, no dependency.
//
//   node scripts/test-otto-state.mjs
//
// NOTE ON SCOPE: this exercises the WRITER (hooks/otto-state.mjs) directly and
// mechanically. The READER half of tasks 9b/9m (agents/otto-foreman.md step 5)
// is an LLM system prompt, not code — it cannot be unit-tested here. Those
// cases are marked below; what IS verified is that the writer produces state
// the documented reader grammar can parse.

import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  run,
  slugify,
  classify,
  bareType,
  renderLine,
  keyOfLine,
  CAP,
  TERMINAL,
  BUILTINS,
} from '../hooks/otto-state.mjs';

const HOOK_PATH = fileURLToPath(new URL('../hooks/otto-state.mjs', import.meta.url));
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

// ---------------------------------------------------------------- fixtures

function freshDirs() {
  const configDir = mkdtempSync(join(tmpdir(), 'otto-state-config-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'otto-state-project-'));
  scratchDirs.push(configDir, projectDir);
  return { configDir, projectDir };
}

function withClaudeDir(projectDir) {
  mkdirSync(join(projectDir, '.claude'), { recursive: true });
}

const globalPath = (configDir) => join(configDir, 'otto-state-global.md');
const localPath = (projectDir) => join(projectDir, '.claude', 'otto-state.md');

function readLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('· '));
}

function payload({ subagentType, description, text, cwd }) {
  return {
    tool_name: 'Agent',
    tool_input: { subagent_type: subagentType, description, prompt: 'irrelevant prompt body text' },
    tool_response: { content: [{ type: 'text', text }] },
    cwd,
  };
}

function runWith(configDir, home, p) {
  run(p, { env: { CLAUDE_CONFIG_DIR: configDir }, home: home || configDir });
}

// ---------------------------------------------------------------- task 2: classification (pure logic)

record('classify: built-in agent types are skip=true', () => {
  for (const b of BUILTINS) assert(classify(b).skip === true, `${b} should be skipped`);
});

record('classify: known crew agent gets its badge/name/role', () => {
  const c = classify('bitforge-engineer');
  assert(c.skip === false && c.badge === '🔩' && c.name === 'Bitforge' && c.role === 'Engineer', 'bitforge-engineer classified wrong');
});

record('classify: plugin-namespaced subagent_type ("robotinc:bitforge-engineer") still matches crew (regression: found via real e2e payload, not synthetic)', () => {
  const c = classify('robotinc:bitforge-engineer');
  assert(c.skip === false && c.hired === false && c.badge === '🔩' && c.name === 'Bitforge', `namespaced type misclassified: ${JSON.stringify(c)}`);
});

record('bareType: strips only the robotinc: prefix, leaves other namespaces alone', () => {
  assert(bareType('robotinc:bitforge-engineer') === 'bitforge-engineer', 'robotinc: prefix not stripped');
  assert(bareType('someplugin:their-agent') === 'someplugin:their-agent', 'a third-party namespace must NOT be stripped');
  assert(bareType('Explore') === 'Explore', 'a bare built-in must pass through unchanged');
});

record('classify: unknown non-built-in gets 🧩 hired-staff marker', () => {
  const c = classify('db-migrator');
  assert(c.skip === false && c.badge === '🧩' && c.hired === true && c.name === 'db-migrator', 'hired-staff classification wrong');
});

record('TERMINAL: matches explicit tokens on word boundaries', () => {
  for (const s of ['Auth middleware done, 4 tests green', 'PR merged', 'feature shipped to prod', 'branch abandoned']) {
    assert(TERMINAL.test(s), `expected terminal match in "${s}"`);
  }
});

record('TERMINAL: does not match unrelated text', () => {
  for (const s of ['kingdom of nouns', 'undone work remains', 'shipping soon']) {
    assert(!TERMINAL.test(s), `unexpected terminal match in "${s}"`);
  }
});

record('renderLine / keyOfLine round-trip (internal parser, not the LLM reader)', () => {
  const line = renderLine({
    project: 'myproj',
    badge: '🔩',
    name: 'Bitforge',
    role: 'Engineer',
    description: 'rate limiter',
    summary: 'middleware on feature/rate-limit, 4 tests green',
    date: '2026-07-14',
    tagged: true,
  });
  const key = keyOfLine(line, true);
  assert(key === `myproj::bitforge-engineer::${slugify('rate limiter')}`, `key mismatch: ${key}`);
});

// ---------------------------------------------------------------- task 8: smoke test

record('8. smoke: write + read round-trip, global + local, header present', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({
    subagentType: 'bitforge-engineer',
    description: 'rate limiter',
    text: 'middleware on feature/rate-limit, 4 tests green',
    cwd: projectDir,
  }));
  assert(existsSync(globalPath(configDir)), 'global file not created');
  const gLines = readLines(globalPath(configDir));
  assert(gLines.length === 1, `expected 1 global line, got ${gLines.length}`);
  assert(gLines[0].includes(`[${require_basename(projectDir)}]`), 'global line missing project tag');
  assert(gLines[0].includes('🔩 Bitforge (Engineer)'), 'global line missing badge/name/role');
  assert(readFileSync(globalPath(configDir), 'utf8').startsWith('<!--'), 'global file missing header');

  assert(existsSync(localPath(projectDir)), 'local file not created');
  const lLines = readLines(localPath(projectDir));
  assert(lLines.length === 1, `expected 1 local line, got ${lLines.length}`);
  assert(!lLines[0].includes('['), 'local line should be untagged (no [project])');
  assert(readFileSync(localPath(projectDir), 'utf8').startsWith('<!--'), 'local file missing header');
});

function require_basename(p) {
  return p.split(/[\\/]/).filter(Boolean).pop();
}

// ---------------------------------------------------------------- 9a: home-dir persona

record('9a. home-dir persona: global fires, local skipped', () => {
  const { configDir } = freshDirs();
  const home = configDir; // configDirOf(env={}, home) with no override falls back to <home>/.claude
  const homeDir = mkdtempSync(join(tmpdir(), 'otto-state-home-'));
  scratchDirs.push(homeDir);
  const realConfigDir = join(homeDir, '.claude');
  mkdirSync(realConfigDir, { recursive: true });
  // No CLAUDE_CONFIG_DIR override — home() resolves it; cwd IS the home dir.
  run(payload({
    subagentType: 'bitforge-engineer',
    description: 'home persona item',
    text: 'working from home dir',
    cwd: homeDir,
  }), { env: {}, home: homeDir });
  assert(existsSync(globalPath(realConfigDir)), 'global should be written for home-dir persona');
  assert(!existsSync(localPath(homeDir)), 'local (<home>/.claude/otto-state.md) must NOT be written — that path IS the config dir');
});

// ---------------------------------------------------------------- 9b: custom CLAUDE_CONFIG_DIR (writer half only)

record('9b. custom CLAUDE_CONFIG_DIR: writer targets the env-set path (reader half untestable here — LLM prompt, not code)', () => {
  const { projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const altConfig = mkdtempSync(join(tmpdir(), 'otto-state-altconfig-'));
  scratchDirs.push(altConfig);
  runWith(altConfig, altConfig, payload({
    subagentType: 'bitforge-engineer',
    description: 'alt config item',
    text: 'wrote to the overridden config dir',
    cwd: projectDir,
  }));
  assert(existsSync(globalPath(altConfig)), 'writer did not honour CLAUDE_CONFIG_DIR override');
});

// ---------------------------------------------------------------- 9c: upsert

record('9c. upsert: same key twice collapses to one line, newest kept', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const p1 = payload({ subagentType: 'bitforge-engineer', description: 'rate limiter', text: 'started', cwd: projectDir });
  const p2 = payload({ subagentType: 'bitforge-engineer', description: 'rate limiter', text: 'finished draft', cwd: projectDir });
  runWith(configDir, configDir, p1);
  runWith(configDir, configDir, p2);
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `expected 1 line after upsert, got ${lines.length}`);
  assert(lines[0].includes('finished draft'), 'upsert did not keep the newest summary');
});

record('regression: "robotinc:bitforge-engineer" and bare "bitforge-engineer" upsert to the SAME line', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'robotinc:bitforge-engineer', description: 'rate limiter', text: 'started', cwd: projectDir }));
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'rate limiter', text: 'finished', cwd: projectDir }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `namespaced and bare forms of the same robot should collapse to one line, got ${lines.length}`);
  assert(lines[0].includes('finished') && lines[0].includes('🔩 Bitforge (Engineer)'), `line malformed: ${lines[0]}`);
});

// ---------------------------------------------------------------- 9d: cap at 8

record('9d. cap at 8: 9th write evicts the 1st (oldest)', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  for (let i = 1; i <= 9; i++) {
    runWith(configDir, configDir, payload({
      subagentType: 'bitforge-engineer',
      description: `item-${i}`,
      text: `work on item ${i}`,
      cwd: projectDir,
    }));
  }
  const lines = readLines(localPath(projectDir));
  assert(lines.length === CAP, `expected ${CAP} lines, got ${lines.length}`);
  assert(!lines.some((l) => l.includes('item-1:')), 'oldest entry (item-1) should have been evicted');
  assert(lines.some((l) => l.includes('item-9:')), 'newest entry (item-9) should be present');
});

// ---------------------------------------------------------------- 9e: terminal clear (both files)

record('9e. terminal clear: line removed from BOTH global and local', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'webhook fix', text: 'in progress', cwd: projectDir }));
  assert(readLines(localPath(projectDir)).length === 1, 'setup: line should exist before terminal call');
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'webhook fix', text: 'shipped to prod', cwd: projectDir }));
  assert(readLines(localPath(projectDir)).length === 0, 'local line should be cleared by terminal token');
  assert(readLines(globalPath(configDir)).length === 0, 'global line should be cleared by terminal token');
});

// ---------------------------------------------------------------- 9f: false-clear negative

record('9f. false-clear: "done" in description text, not in summary, does not clear', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({
    subagentType: 'bitforge-engineer',
    description: 'mark item as done manually',
    text: 'drafted the toggle, needs review',
    cwd: projectDir,
  }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `"done" in description text alone should not clear the line — got ${lines.length} lines`);
});

// ---------------------------------------------------------------- 9g: first-create header

record('9g. first-create header: present exactly once, matches the documented format', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  assert(!existsSync(localPath(projectDir)) && !existsSync(globalPath(configDir)), 'setup: files should not exist yet');
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'x', text: 'y', cwd: projectDir }));
  const g = readFileSync(globalPath(configDir), 'utf8');
  const l = readFileSync(localPath(projectDir), 'utf8');
  assert((g.match(/<!--/g) || []).length === 1, 'global header should appear exactly once');
  assert((l.match(/<!--/g) || []).length === 1, 'local header should appear exactly once');
  assert(g.includes('otto-state-global.md') && g.includes('-->'), 'global header malformed');
  assert(l.includes('otto-state.md') && l.includes('-->'), 'local header malformed');
});

// ---------------------------------------------------------------- 9h: no .claude dir -> no local write

record('9h. no .claude dir: local skipped, global still proceeds, no error', () => {
  const { configDir, projectDir } = freshDirs(); // withClaudeDir NOT called
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'x', text: 'y', cwd: projectDir }));
  assert(!existsSync(localPath(projectDir)), 'local should not be written when .claude does not exist');
  assert(existsSync(globalPath(configDir)), 'global should still be written');
});

// ---------------------------------------------------------------- 9i: built-ins produce no state

record('9i. built-ins (Explore, general-purpose, Plan) produce zero state lines', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  for (const b of ['Explore', 'general-purpose', 'Plan']) {
    runWith(configDir, configDir, payload({ subagentType: b, description: 'built-in call', text: 'did something', cwd: projectDir }));
  }
  assert(!existsSync(localPath(projectDir)), 'local file should not exist — only built-ins were called');
  assert(!existsSync(globalPath(configDir)), 'global file should not exist — only built-ins were called');
});

// ---------------------------------------------------------------- 9j: hired staff -> 🧩

record('9j. hired staff (unknown non-built-in) renders with 🧩', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'db-migrator', description: '2 migrations', text: 'written', cwd: projectDir }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1 && lines[0].includes('🧩 db-migrator (hired)'), `hired-staff line malformed: ${lines[0]}`);
});

// ---------------------------------------------------------------- 9k: cross-process race

async function testCrossProcessRace() {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const spawnOne = (description) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [HOOK_PATH], {
        env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
      });
      child.stdin.write(
        JSON.stringify(
          payload({ subagentType: 'bitforge-engineer', description, text: `concurrent write for ${description}`, cwd: projectDir })
        )
      );
      child.stdin.end();
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`child exited ${code}`))));
      child.on('error', reject);
    });
  await Promise.all([spawnOne('race-item-a'), spawnOne('race-item-b')]);
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 2, `expected 2 lines after concurrent distinct-key writes, got ${lines.length}: ${JSON.stringify(lines)}`);
  assert(lines.some((l) => l.includes('race-item-a')), 'race-item-a line missing — lost write under lock contention');
  assert(lines.some((l) => l.includes('race-item-b')), 'race-item-b line missing — lost write under lock contention');
  // File must still be well-formed (every line parses).
  for (const l of lines) assert(keyOfLine(l, false) !== null, `corrupted line after concurrent writes: ${l}`);
}

// ---------------------------------------------------------------- 9l: lock exhaustion degradation

record('9l. lock exhaustion: degrades to raw append, self-heals on next clean write', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const lockDir = join(projectDir, '.claude', '.otto-state.lock');
  mkdirSync(lockDir); // simulate another process already holding the lock
  runWith(configDir, configDir, payload({
    subagentType: 'bitforge-engineer',
    description: 'degraded write',
    text: 'appended while locked',
    cwd: projectDir,
  }));
  // Under a held lock, the writer must not have touched CAP/header logic —
  // just a raw append. File may not even exist yet if it was never created
  // before (append creates it, but with no header — expected and documented:
  // "self-heals on next clean write").
  assert(existsSync(localPath(projectDir)), 'degraded append should still land the line');
  let lines = readLines(localPath(projectDir));
  assert(lines.length === 1 && lines[0].includes('appended while locked'), 'degraded line missing or malformed');
  rmSync(lockDir, { recursive: true, force: true }); // release the simulated lock
  // Next clean write for a DIFFERENT key should read the degraded line back
  // in (loadFile tolerates a missing/absent header) and cap/dedupe normally.
  runWith(configDir, configDir, payload({
    subagentType: 'bitforge-engineer',
    description: 'clean follow-up',
    text: 'lock released now',
    cwd: projectDir,
  }));
  lines = readLines(localPath(projectDir));
  assert(lines.length === 2, `expected self-heal to preserve both lines after a clean write, got ${lines.length}`);
  assert(readFileSync(localPath(projectDir), 'utf8').startsWith('<!--'), 'clean write after degrade should restore the header');
});

// ---------------------------------------------------------------- 9m: round-trip (writer output through the reader grammar)

record('9m. round-trip: writer output matches agents/otto-foreman.md\'s documented grammar exactly', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({
    subagentType: 'bitforge-engineer',
    description: 'subscription schema',
    text: 'drafted',
    cwd: projectDir,
  }));
  const raw = readFileSync(localPath(projectDir), 'utf8');
  const dateStr = new Date().toISOString().slice(0, 10);
  const expected = `· 🔩 Bitforge (Engineer) — subscription schema: drafted  (${dateStr})`;
  assert(raw.includes(expected), `line does not match the grammar's own worked example shape.\nExpected substring: ${expected}\nGot file:\n${raw}`);
  // The GRAMMAR regex scripts/validate.mjs checks against otto-foreman.md's
  // worked example — reuse the same shape here so a drift between the two
  // is caught by this test, not just eyeballed.
  const GRAMMAR = /^· \S+ [A-Z][A-Za-z]+ \([A-Za-z ]+\) — .+: .+ {2}\(\d{4}-\d{2}-\d{2}\)$/;
  const line = readLines(localPath(projectDir))[0];
  assert(GRAMMAR.test(line), `writer's line does not match otto-foreman.md's GRAMMAR regex: ${line}`);
});

// ---------------------------------------------------------------- Glitchtrap: adversarial pass, v22.8.0 QA
//
// Everything below was written to attack the build, not confirm it — the priority list Bitforge/Gantry
// flagged as accepted risks in TASKS.md's build notes, plus edge cases the 23/23 suite above does not cover.
// Where a test asserts the CORRECT (desired) behaviour and the build does not deliver it, the test is left
// failing on purpose — that is the regression repro, not a mistake. See the QA report for the verdict.

// ---------------------------------------------------------------- G1: TERMINAL false-clear on realistic negation
//
// TERMINAL is a bare word-boundary match (`/\b(done|shipped|merged|abandoned)\b/i`) against the SUMMARY (the
// subagent's own last non-empty line), with no negation handling — flagged as a known, accepted risk in the
// file's own header comment. This is not a synthetic gotcha: "not done yet" and "nothing merged" are exactly
// how a subagent naturally phrases an in-progress result. A false clear is silent — no error, no stdout, the
// active-work line just vanishes from both files, and nothing else in the product will ever say it happened.

const REALISTIC_NEGATION_CASES = [
  'not done yet, still drafting the second endpoint',
  'nothing merged yet -- waiting on review',
  'far from done, 3 tests still red',
  'undone work remains, not shipped to prod',
  'this is not abandoned, just paused for review',
  'done is not the word for this -- 3 tests failing',
  'half-done, needs another pass',
];

record('G1a. TERMINAL false-clear rate on realistic negated subagent phrasing (measured, not asserted-safe)', () => {
  const falseClears = REALISTIC_NEGATION_CASES.filter((s) => TERMINAL.test(s));
  // Recorded as informational even if it "passes" zero-tolerance — the number IS the finding.
  // As of this build: matches on ALL of them (rate logged to stdout below for the report).
  console.log(`    [G1a] false-clear rate on ${REALISTIC_NEGATION_CASES.length} realistic negated cases: ${falseClears.length}/${REALISTIC_NEGATION_CASES.length}`);
  assert(true, 'informational only — see logged rate above');
});

record('G1b. REGRESSION (expected to FAIL until fixed): "not done yet, still drafting" must not clear an active line end-to-end', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'webhook retry logic', text: 'started the backoff handler', cwd: projectDir }));
  assert(readLines(localPath(projectDir)).length === 1, 'setup: line should exist before the negated call');
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'webhook retry logic', text: 'not done yet, still drafting the second endpoint', cwd: projectDir }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `FALSE CLEAR: "not done yet" wrongly cleared the active line (TERMINAL matched "done" with no negation handling) — local lines remaining: ${lines.length}`);
  assert(readLines(globalPath(configDir)).length === 1, 'FALSE CLEAR: global line was also wrongly cleared');
});

record('G1c. REGRESSION (expected to FAIL until fixed): "nothing merged yet -- waiting on review" must not clear an active line', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'pr queue', text: 'opened the PR', cwd: projectDir }));
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'pr queue', text: 'nothing merged yet -- waiting on review', cwd: projectDir }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `FALSE CLEAR: "nothing merged" wrongly cleared the active line — local lines remaining: ${lines.length}`);
});

// ---------------------------------------------------------------- Bitforge fix-verification: true terminal
// phrasing must still clear, both directions of the negation fix proven together, not just the negative side.

for (const [label, text] of [
  ['merged to main', 'merged to main'],
  ['shipped in 4 commits', 'shipped in 4 commits'],
  ['done -- 4 tests green', 'done -- 4 tests green'],
  ["QA's original doc example ('Auth middleware done, 4 tests green')", 'Auth middleware done, 4 tests green'],
]) {
  record(`true-positive: "${label}" still clears an active line (negation fix must not over-correct)`, () => {
    const { configDir, projectDir } = freshDirs();
    withClaudeDir(projectDir);
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'true-positive check', text: 'in progress', cwd: projectDir }));
    assert(readLines(localPath(projectDir)).length === 1, 'setup: line should exist before the terminal call');
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'true-positive check', text, cwd: projectDir }));
    assert(readLines(localPath(projectDir)).length === 0, `"${text}" should have cleared the local line but did not`);
    assert(readLines(globalPath(configDir)).length === 0, `"${text}" should have cleared the global line but did not`);
  });
}

// ---------------------------------------------------------------- G2: unicode survives description/summary

record('G2. unicode in description and summary survives render + upsert (badge, CJK, emoji, accents)', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({
    subagentType: 'bitforge-engineer',
    description: '国际化 façade — résumé import 🎉',
    text: 'wired the 国际化 façade, café-name edge case fixed 🎉',
    cwd: projectDir,
  }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `expected 1 line, got ${lines.length}`);
  assert(lines[0].includes('国际化 façade — résumé import 🎉'), `unicode description mangled: ${lines[0]}`);
  assert(lines[0].includes('café-name edge case fixed 🎉'), `unicode summary mangled: ${lines[0]}`);
  // Upsert a second time with the same unicode description -- key must still match (slugify must be stable
  // across the same unicode input) or this silently becomes a duplicate line instead of an upsert.
  runWith(configDir, configDir, payload({
    subagentType: 'bitforge-engineer',
    description: '国际化 façade — résumé import 🎉',
    text: 'second pass, tests green',
    cwd: projectDir,
  }));
  const after = readLines(localPath(projectDir));
  assert(after.length === 1, `unicode description did not upsert to the same key -- got ${after.length} lines (duplicate instead of replace)`);
});

// ---------------------------------------------------------------- G3: empty description

record('G3. empty description falls back to (untitled), does not throw, still upserts on repeat', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: '', text: 'started something', cwd: projectDir }));
  let lines = readLines(localPath(projectDir));
  assert(lines.length === 1 && lines[0].includes('(untitled)'), `empty description should render as (untitled): ${lines[0]}`);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: '', text: 'finished something', cwd: projectDir }));
  lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `two empty-description calls from the same robot should upsert to one line (same slug "item"), got ${lines.length}`);
});

// ---------------------------------------------------------------- G4: very long result text truncation

record('G4. very long result text truncates at 140 chars without corrupting the line or splitting a surrogate pair', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const longText = 'x'.repeat(200) + ' end-marker-should-not-appear';
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'long result', text: longText, cwd: projectDir }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `expected 1 line, got ${lines.length}`);
  assert(!lines[0].includes('end-marker-should-not-appear'), 'truncation did not cut off the overflow text');
  const m = lines[0].match(/— long result: (.+?)  \(\d{4}-\d{2}-\d{2}\)$/);
  assert(m, `line did not parse for truncation check: ${lines[0]}`);
  assert(m[1].length === 140, `summary should be exactly capped at 140 chars, got ${m[1].length}`);

  // Surrogate-pair boundary: an emoji sits exactly on char 139/140 of the raw text; a naive .slice(0,140)
  // can split a UTF-16 surrogate pair in half and corrupt the string (renders as a replacement glyph).
  const emojiBoundaryText = 'y'.repeat(139) + '🎉' + 'trailing text that must be cut';
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'emoji boundary', text: emojiBoundaryText, cwd: projectDir }));
  const lines2 = readLines(localPath(projectDir));
  const line2 = lines2.find((l) => l.includes('emoji boundary'));
  assert(line2, 'emoji-boundary line missing');
  const m2 = line2.match(/— emoji boundary: (.+?)  \(\d{4}-\d{2}-\d{2}\)$/);
  assert(m2, `emoji-boundary line did not parse: ${line2}`);
  assert(!m2[1].includes('�'), `truncation split a surrogate pair and corrupted the string: ${JSON.stringify(m2[1])}`);
});

// ---------------------------------------------------------------- G5: same item, two different robots

record('G5. the same description dispatched to two different robots produces two distinct lines, not a collision', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'rate limiter', text: 'implementation started', cwd: projectDir }));
  runWith(configDir, configDir, payload({ subagentType: 'glitchtrap-qa', description: 'rate limiter', text: 'writing tests', cwd: projectDir }));
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 2, `same description from two different robots should be two lines, got ${lines.length}`);
  assert(lines.some((l) => l.includes('🔩 Bitforge')), 'Bitforge line missing');
  assert(lines.some((l) => l.includes('🔘 Glitchtrap')), 'Glitchtrap line missing');
});

// ---------------------------------------------------------------- G6: terminal result for a line that doesn't exist

record('G6. terminal result for a key with no existing line: no crash, no phantom line added, file stays consistent', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  // No setup write at all for this key -- straight to a terminal call.
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'never started', text: 'shipped to prod', cwd: projectDir }));
  assert(readLines(localPath(projectDir)).length === 0, 'a terminal result for a nonexistent key should add nothing');
  assert(readLines(globalPath(configDir)).length === 0, 'a terminal result for a nonexistent key should add nothing (global)');
  // Header should still exist and be well-formed (upsertOrClear ran against an empty list, saveFile still fires).
  assert(existsSync(localPath(projectDir)), 'file should still be created (with header, zero body lines)');
  assert(readFileSync(localPath(projectDir), 'utf8').startsWith('<!--'), 'header should still be present even with zero lines');
});

// ---------------------------------------------------------------- G7: real concurrent race, same key, forced contention

async function testRealContentionSameKey() {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const spawnOne = (n) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [HOOK_PATH], { env: { ...process.env, CLAUDE_CONFIG_DIR: configDir } });
      child.stdin.write(JSON.stringify(payload({ subagentType: 'bitforge-engineer', description: 'same-key race', text: `pass ${n}`, cwd: projectDir })));
      child.stdin.end();
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`child ${n} exited ${code}`))));
      child.on('error', reject);
    });
  // 6 real processes, SAME upsert key, fired together -- this forces real mkdir-lock contention (not the
  // manually-staged lock of 9l) and is the actual invocation path a hook spawn uses (stdin JSON, node
  // subprocess), not the imported run() function. Whichever write lands last should win; the file must stay
  // parseable and have exactly one line for this key either way (clean win) or show evidence of a degraded
  // append that a subsequent clean write self-heals (per the documented degrade contract).
  await Promise.all([1, 2, 3, 4, 5, 6].map(spawnOne));
  let lines = readLines(localPath(projectDir));
  assert(lines.length >= 1, 'same-key race under real contention lost every write');
  for (const l of lines) assert(keyOfLine(l, false) !== null, `corrupted line after real same-key contention: ${l}`);
  // Self-heal: one more clean write for a DIFFERENT key must succeed and the file must still parse, proving
  // no lock dir was left orphaned by the contention above.
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'post-race cleanup', text: 'clean write after contention', cwd: projectDir }));
  lines = readLines(localPath(projectDir));
  assert(lines.some((l) => l.includes('post-race cleanup')), 'lock was left held after real contention -- next clean write starved');
  for (const l of lines) assert(keyOfLine(l, false) !== null, `corrupted line after post-race clean write: ${l}`);
}

// ---------------------------------------------------------------- G8: tagged global line round-trips through keyOfLine and the GRAMMAR the reader uses

record('G8. tagged global line parses with keyOfLine(line, true) and still matches a tag-aware grammar', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'subscription schema', text: 'drafted', cwd: projectDir }));
  const gLines = readLines(globalPath(configDir));
  assert(gLines.length === 1, `expected 1 global line, got ${gLines.length}`);
  const line = gLines[0];
  const key = keyOfLine(line, true);
  assert(key !== null, `tagged global line failed to parse via keyOfLine: ${line}`);
  assert(key.startsWith(`${require_basename(projectDir)}::bitforge-engineer::`), `tagged key missing project prefix: ${key}`);
  // NOTE: scripts/test-otto-state.mjs's own 9m GRAMMAR constant
  // (`/^· \S+ [A-Z][A-Za-z]+ \(...\) .../`) does NOT have an optional `[project] ` group, so it does not
  // actually match a global tagged line -- 9m only ever exercises it against the untagged LOCAL file. Confirmed
  // here: the local-only GRAMMAR fails against a real global line, which is a gap in the *test's* coverage of
  // the reader contract, not proof the reader itself is broken (agents/otto-foreman.md's step 5 is prose, not
  // this regex, and a live session-open run does parse the tag -- see QA report). Left as an explicit,
  // documented assertion so the gap is visible instead of silently uncovered.
  const LOCAL_ONLY_GRAMMAR = /^· \S+ [A-Z][A-Za-z]+ \([A-Za-z ]+\) — .+: .+ {2}\(\d{4}-\d{2}-\d{2}\)$/;
  assert(!LOCAL_ONLY_GRAMMAR.test(line), 'expected: the local-only GRAMMAR const does not cover tagged global lines (documents a test-coverage gap, not a writer bug)');
  const TAG_AWARE_GRAMMAR = /^· (?:\[[^\]]+\] )?\S+ [A-Z][A-Za-z]+ \([A-Za-z ]+\) — .+: .+ {2}\(\d{4}-\d{2}-\d{2}\)$/;
  assert(TAG_AWARE_GRAMMAR.test(line), `tag-aware grammar should match a real global line: ${line}`);
});

// ---------------------------------------------------------------- run

async function main() {
  try {
    await testCrossProcessRace();
    results.push({ name: '9k. cross-process race: no lost line, no corruption', pass: true });
  } catch (e) {
    results.push({ name: '9k. cross-process race: no lost line, no corruption', pass: false, detail: e.message });
  }

  try {
    await testRealContentionSameKey();
    results.push({ name: 'G7. real same-key contention (6 spawned processes): no corruption, self-heals', pass: true });
  } catch (e) {
    results.push({ name: 'G7. real same-key contention (6 spawned processes): no corruption, self-heals', pass: false, detail: e.message });
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);

  for (const d of scratchDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {}
  }

  if (failed.length) process.exit(1);
}

main();
