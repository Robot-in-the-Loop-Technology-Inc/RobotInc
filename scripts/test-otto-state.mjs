#!/usr/bin/env node
// Test suite for hooks/otto-state.mjs — task 8 (smoke), task 9 (9a-9m
// negative tests) from TASKS.md's v22.8.0 build, plus Glitchtrap's
// adversarial-pass additions (G2-G8, G11) and the Option C contract tests
// (G9/G10 and the keying/eviction-independence cases below). Real filesystem
// I/O against scratch temp directories; no mocking, no framework, no
// dependency.
//
//   node scripts/test-otto-state.mjs
//
// NOTE ON SCOPE: this exercises the WRITER (hooks/otto-state.mjs) directly and
// mechanically. The READER half (agents/otto-foreman.md step 5) is an LLM
// system prompt, not code — it cannot be unit-tested here. Those cases are
// marked below; what IS verified is that the writer produces state the
// documented reader grammar can parse.
//
// ---------------------------------------------------------------- Option C
// Two build rounds tried to classify a subagent's own summary text as
// "terminal" (done/shipped/merged/abandoned) vs. "still active" so the
// writer could clear a finished item's line instead of upserting it. Round 1
// (bare word-boundary match): false-cleared active work 7/7 on realistic
// negated phrasing ("not done yet, still drafting"). Round 2 (negation-aware
// window, fixing round 1): closed those false-clears but opened a worse
// failure in the OPPOSITE direction, false-KEEPING 8/8 on genuinely finished
// work containing an innocent nearby negation word ("shipped; no issues
// found", "merged to main, not without drama") — a persistent, indefinite
// false signal, worse than the silent-once false-clear it replaced. Ratified
// decision (Vector, after the stuck-loop escalation): delete the inference
// entirely rather than try a third heuristic. No content inspection, no clear
// path — every relay is an upsert; cleanup is cap-8 recency eviction only.
//
// The tests below that used to prove a clear/keep DECISION (G1, G6, G9, G10
// in earlier rounds) now prove the ABSENCE of one: every phrase that used to
// be adversarial, in either direction, is just upsert content now, verified
// byte-for-byte, with zero special-casing anywhere in the pipeline.

import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  run,
  slugify,
  classify,
  bareType,
  renderLine,
  keyOfLine,
  CAP,
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

function newProjectDir() {
  const projectDir = mkdtempSync(join(tmpdir(), 'otto-state-project-'));
  scratchDirs.push(projectDir);
  withClaudeDir(projectDir);
  return projectDir;
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

function require_basename(p) {
  return p.split(/[\\/]/).filter(Boolean).pop();
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

// ---------------------------------------------------------------- 9a: home-dir persona

record('9a. home-dir persona: global fires, local skipped', () => {
  const { configDir } = freshDirs();
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

// ---------------------------------------------------------------- 9c: upsert-overwrite on re-touch

record('9c. upsert-overwrite on re-touch: same key twice collapses to one line, newest content kept', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const p1 = payload({ subagentType: 'bitforge-engineer', description: 'rate limiter', text: 'started', cwd: projectDir });
  const p2 = payload({ subagentType: 'bitforge-engineer', description: 'rate limiter', text: 'finished draft', cwd: projectDir });
  runWith(configDir, configDir, p1);
  runWith(configDir, configDir, p2);
  const lines = readLines(localPath(projectDir));
  assert(lines.length === 1, `expected 1 line after upsert, got ${lines.length}`);
  assert(lines[0].includes('finished draft'), 'upsert did not keep the newest summary');
  assert(!lines[0].includes(': started'), 'upsert should have replaced, not appended, the old content');
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

// ---------------------------------------------------------------- 9d: eviction order (cap at 8, recency only)

record('9d. eviction order: cap at 8, 9th write evicts the 1st (oldest) — recency only, no other rule', () => {
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
  // Order is strictly newest-first — item-9 at the top, item-2 (the new oldest survivor) at the bottom.
  assert(lines[0].includes('item-9:'), `newest item should be first, got: ${lines[0]}`);
  assert(lines[lines.length - 1].includes('item-2:'), `oldest surviving item should be last, got: ${lines[lines.length - 1]}`);
});

// ---------------------------------------------------------------- 9g: first-create header

record('9g. first-create header: present exactly once, states the recent-first (not "active only") contract', () => {
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
  // The contract text itself, not just its presence: no clear path, no "active work only" claim.
  // Flatten whitespace first -- the header is hand-wrapped prose and a phrase can legitimately
  // span a physical line break (e.g. "no clear\n     path:"), same reasoning as scripts/validate.mjs's
  // own wrapped-prose checks.
  const gFlat = g.replace(/\s+/g, ' ');
  const lFlat = l.replace(/\s+/g, ' ');
  assert(lFlat.includes('no clear path') && lFlat.includes('recent work'), 'local header does not state the recent-first, no-clear-path contract');
  assert(gFlat.includes('no clear path') && gFlat.includes('recent work'), 'global header does not state the recent-first, no-clear-path contract');
  assert(!lFlat.includes('active work only') && !gFlat.includes('active work only'), 'header still claims "active work only" — stale contract text');
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
  assert(existsSync(localPath(projectDir)), 'degraded append should still land the line');
  let lines = readLines(localPath(projectDir));
  assert(lines.length === 1 && lines[0].includes('appended while locked'), 'degraded line missing or malformed');
  rmSync(lockDir, { recursive: true, force: true }); // release the simulated lock
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
  const GRAMMAR = /^· \S+ [A-Z][A-Za-z]+ \([A-Za-z ]+\) — .+: .+ {2}\(\d{4}-\d{2}-\d{2}\)$/;
  const line = readLines(localPath(projectDir))[0];
  assert(GRAMMAR.test(line), `writer's line does not match otto-foreman.md's GRAMMAR regex: ${line}`);
});

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
  await Promise.all([1, 2, 3, 4, 5, 6].map(spawnOne));
  let lines = readLines(localPath(projectDir));
  assert(lines.length >= 1, 'same-key race under real contention lost every write');
  for (const l of lines) assert(keyOfLine(l, false) !== null, `corrupted line after real same-key contention: ${l}`);
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
  const LOCAL_ONLY_GRAMMAR = /^· \S+ [A-Z][A-Za-z]+ \([A-Za-z ]+\) — .+: .+ {2}\(\d{4}-\d{2}-\d{2}\)$/;
  assert(!LOCAL_ONLY_GRAMMAR.test(line), 'expected: the local-only GRAMMAR const does not cover tagged global lines (documents a test-coverage gap, not a writer bug)');
  const TAG_AWARE_GRAMMAR = /^· (?:\[[^\]]+\] )?\S+ [A-Z][A-Za-z]+ \([A-Za-z ]+\) — .+: .+ {2}\(\d{4}-\d{2}-\d{2}\)$/;
  assert(TAG_AWARE_GRAMMAR.test(line), `tag-aware grammar should match a real global line: ${line}`);
});

// ---------------------------------------------------------------- G11: truncation, grapheme-cluster boundary (informational)

record('G11. informational: grapheme-cluster boundary (combining accent) can still be silently altered by a code-point-safe truncation', () => {
  const combining = 'é'; // "e" + combining acute accent (U+0301) -- two code points, one visual glyph (é)
  const text = 'z'.repeat(139) + combining + 'TRAILING';
  const result = Array.from(text).slice(0, 140).join('');
  const droppedAccent = result.endsWith('e') && !result.includes('́');
  console.log(`    [G11] combining-char truncation: ${droppedAccent ? 'accent silently dropped (valid output, altered glyph)' : 'kept whole'}`);
  assert(!result.includes('�'), 'should never contain a literal replacement character regardless of grapheme handling');
});

// ---------------------------------------------------------------- G9: content that used to false-clear now just upserts (Option C)
//
// Every phrase below wrongly cleared an active line in round 1 or round 2 of the deleted terminal-inference
// machinery. Under the new contract there is no inspection at all, so each one is simply verbatim upsert
// content — proven here by dispatching it as a SECOND call over an existing line and confirming the line
// persists (never removed) with the new text exactly, byte-for-byte.

const FORMERLY_FALSE_CLEAR_CASES = [
  ['not done yet, still drafting the second endpoint', 'round 1 (G1b): bare match negated-before'],
  ['nothing merged yet -- waiting on review', 'round 1 (G1c): bare match negated-before'],
  ['far from done, 3 tests still red', 'round 1 (G1a): negation phrase before'],
  ['done is not the word for this -- 3 tests failing', 'round 1 (G1a): negation after the match'],
  ['half-done, needs another pass', 'round 1 (G1a): glued negation prefix'],
  ['we are done waiting on X, still building', 'round 2 (G9b): semantic distance, window missed it'],
  ['the "shipped emails" feature is still red', 'round 2 (G9c): terminal word inside a quoted item name'],
];

for (const [text, provenance] of FORMERLY_FALSE_CLEAR_CASES) {
  record(`G9. "${text}" (${provenance}) persists unchanged by construction -- no inspection, so nothing to false-clear`, () => {
    const { configDir, projectDir } = freshDirs();
    withClaudeDir(projectDir);
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'g9 case', text: 'setup: in progress', cwd: projectDir }));
    assert(readLines(localPath(projectDir)).length === 1, 'setup: line should exist before the formerly-adversarial call');
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'g9 case', text, cwd: projectDir }));
    const localLines = readLines(localPath(projectDir));
    assert(localLines.length === 1, `line should persist (exactly 1), got ${localLines.length}`);
    assert(localLines[0].includes(`: ${text}  (`), `line content should be the verbatim new text, got: ${localLines[0]}`);
    const globalLines = readLines(globalPath(configDir));
    assert(globalLines.length === 1, `global line should persist too, got ${globalLines.length}`);
    assert(globalLines[0].includes(`: ${text}  (`), `global line content should match verbatim, got: ${globalLines[0]}`);
  });
}

// ---------------------------------------------------------------- G10: content that used to false-keep now just upserts, and evicts normally (Option C)
//
// Every phrase below was genuinely finished work that the round-2 negation window wrongly kept forever
// (false-KEEP: an unrelated "no"/"nothing"/"without" nearby suppressed a real terminal match). Under the new
// contract there is no keep/clear decision either — proven two ways: the content lands verbatim (not
// specially cleared, not specially protected), and it is subject to the exact same cap-8 recency eviction as
// any other line -- proving it has no special immortality left over from the old (broken) "keep" behaviour.

const FORMERLY_FALSE_KEEP_CASES = [
  'merged to main, not without drama',
  'done -- nothing left to do',
  'shipped; no issues found',
  'merged -- no conflicts',
];

for (const text of FORMERLY_FALSE_KEEP_CASES) {
  record(`G10. "${text}" persists with correct verbatim content -- no inspection, so nothing to false-keep or false-clear`, () => {
    const { configDir, projectDir } = freshDirs();
    withClaudeDir(projectDir);
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'g10 case', text, cwd: projectDir }));
    const lines = readLines(localPath(projectDir));
    assert(lines.length === 1, `expected exactly 1 line, got ${lines.length}`);
    assert(lines[0].includes(`: ${text}  (`), `line content should be the verbatim text, got: ${lines[0]}`);
  });
}

record('G10e. a formerly-false-keep line evicts at cap-8 exactly like any other -- proves it has no special lifecycle', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'finished-item', text: 'shipped; no issues found', cwd: projectDir }));
  assert(readLines(localPath(projectDir)).some((l) => l.includes('finished-item')), 'setup: finished-item line should exist');
  for (let i = 1; i <= 8; i++) {
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: `filler-${i}`, text: `work on filler ${i}`, cwd: projectDir }));
  }
  const lines = readLines(localPath(projectDir));
  assert(lines.length === CAP, `expected ${CAP} lines, got ${lines.length}`);
  assert(!lines.some((l) => l.includes('finished-item')), 'the "shipped; no issues found" line should have been evicted by recency like anything else, but is still present');
});

// ---------------------------------------------------------------- keying: (project, robot, slug)

record('keying: the same robot + same slug in TWO DIFFERENT PROJECTS stays two distinct GLOBAL lines', () => {
  const { configDir } = freshDirs();
  const projectA = newProjectDir();
  const projectB = newProjectDir();
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'shared item name', text: 'work in project A', cwd: projectA }));
  runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: 'shared item name', text: 'work in project B', cwd: projectB }));
  const gLines = readLines(globalPath(configDir));
  assert(gLines.length === 2, `same robot+slug in two different projects should be two distinct global lines, got ${gLines.length}`);
  assert(gLines.some((l) => l.includes(`[${require_basename(projectA)}]`) && l.includes('work in project A')), 'project A global line missing or wrong');
  assert(gLines.some((l) => l.includes(`[${require_basename(projectB)}]`) && l.includes('work in project B')), 'project B global line missing or wrong');
  // Each project's own LOCAL file only ever sees its own single line -- the project tag is a global-only concern.
  assert(readLines(localPath(projectA)).length === 1, 'project A local file should have exactly 1 line');
  assert(readLines(localPath(projectB)).length === 1, 'project B local file should have exactly 1 line');
});

// ---------------------------------------------------------------- eviction independence: local and global cap separately

record('eviction independence: local (per-project, cap 8) and global (cross-project, cap 8) evict on their own schedules', () => {
  const { configDir } = freshDirs();
  const projectA = newProjectDir();
  const projectB = newProjectDir();
  // 5 distinct items in project A: local A has 5, global has 5 (all tagged [A]).
  for (let i = 1; i <= 5; i++) {
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: `a-item-${i}`, text: `work ${i}`, cwd: projectA }));
  }
  assert(readLines(localPath(projectA)).length === 5, 'project A local should have 5 lines after 5 distinct writes');
  assert(readLines(globalPath(configDir)).length === 5, 'global should have 5 lines after 5 writes, all from project A');
  // 5 MORE distinct items in project B: local B gets its OWN 5 (unaffected by project A's local file), while
  // global now has 10 candidate entries total and must cap at 8 -- evicting the 2 oldest (from project A).
  for (let i = 1; i <= 5; i++) {
    runWith(configDir, configDir, payload({ subagentType: 'bitforge-engineer', description: `b-item-${i}`, text: `work ${i}`, cwd: projectB }));
  }
  const localA = readLines(localPath(projectA));
  const localB = readLines(localPath(projectB));
  const global = readLines(globalPath(configDir));
  assert(localA.length === 5, `project A local should still have its own 5 lines, untouched by project B's writes -- got ${localA.length}`);
  assert(localB.length === 5, `project B local should have its own 5 lines -- got ${localB.length}`);
  assert(global.length === CAP, `global should be capped at ${CAP} across both projects combined -- got ${global.length}`);
  // The global cap should have evicted project A's OLDEST entries (a-item-1, a-item-2), not project B's --
  // recency is global-file-wide, not per-project, and local caps are completely independent of it.
  assert(!global.some((l) => l.includes('a-item-1:')), 'global cap should have evicted the oldest entry (a-item-1) first');
  assert(!global.some((l) => l.includes('a-item-2:')), 'global cap should have evicted the 2nd-oldest entry (a-item-2) too');
  assert(global.some((l) => l.includes('a-item-3:')), 'a-item-3 should have survived the global cap');
  assert(global.filter((l) => l.includes('b-item')).length === 5, 'all 5 of project B\'s items should be present in global (none evicted yet)');
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
