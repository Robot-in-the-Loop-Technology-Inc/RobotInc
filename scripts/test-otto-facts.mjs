#!/usr/bin/env node
// Test suite for hooks/otto-facts.mjs — the v22.8.0 session-open facts
// injector. Real filesystem I/O against scratch temp directories; no
// mocking, no framework, no dependency. Deterministic assertions only, no
// prose oracles.
//
//   node scripts/test-otto-facts.mjs
//
// Covers the payload shape (all 6 keys, correct present/absent per real
// files on disk) under: default config resolution, a custom
// CLAUDE_CONFIG_DIR override, a corrupt-but-existing sentinel (existence
// only — garbled contents must still read `present`), cwd == home
// (`cwd_is_config_dir=true`), cwd == a real, unrelated project
// (`cwd_is_config_dir=false`), and Windows-style path separators feeding the
// same normalized comparison. Also exercises the real hook as a subprocess
// (stdin JSON in, formatted block out) so the tests prove the SAME thing a
// real SessionStart invocation would produce, not just the exported
// function in isolation.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeFacts, formatFacts, normalizeForCompare, FACTS_HEADER } from '../hooks/otto-facts.mjs';

const HOOK_PATH = fileURLToPath(new URL('../hooks/otto-facts.mjs', import.meta.url));
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
  const configDir = mkdtempSync(join(tmpdir(), 'otto-facts-config-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'otto-facts-project-'));
  scratchDirs.push(configDir, projectDir);
  return { configDir, projectDir };
}

function withClaudeDir(projectDir) {
  mkdirSync(join(projectDir, '.claude'), { recursive: true });
}

function runFacts(configDir, home, cwd) {
  return computeFacts({ cwd }, { env: { CLAUDE_CONFIG_DIR: configDir }, home: home || configDir });
}

function spawnHook(env, cwd) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({ cwd }),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return result.stdout;
}

function parseBlock(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^([a-z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ---------------------------------------------------------------- shape: all 6 keys, default config

record('default config: all 6 keys present, correct present/absent per real files on disk', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  writeFileSync(join(configDir, '.otto-met'), '2026-07-01\n');
  writeFileSync(join(configDir, 'otto-profile.json'), '{"seats":["Generalist / Solo"]}');
  writeFileSync(join(configDir, 'otto-state-global.md'), '<!-- x --> \n\n· line\n');
  writeFileSync(join(projectDir, '.claude', 'otto-state.md'), '<!-- x --> \n\n· line\n');

  const facts = runFacts(configDir, configDir, projectDir);
  assert(Object.keys(facts).length === 6, `expected exactly 6 keys, got ${Object.keys(facts).length}: ${Object.keys(facts).join(',')}`);
  assert(facts.config_dir === configDir, `config_dir mismatch: ${facts.config_dir}`);
  assert(facts.sentinel === 'present', `sentinel should be present, got ${facts.sentinel}`);
  assert(facts.profile === 'present', `profile should be present, got ${facts.profile}`);
  assert(facts.state_local === 'present', `state_local should be present, got ${facts.state_local}`);
  assert(facts.state_global === 'present', `state_global should be present, got ${facts.state_global}`);
  assert(facts.cwd_is_config_dir === false, `cwd_is_config_dir should be false for a real project, got ${facts.cwd_is_config_dir}`);
});

record('default config: everything absent when nothing exists on disk', () => {
  const { configDir, projectDir } = freshDirs(); // withClaudeDir NOT called; nothing written
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.sentinel === 'absent', `sentinel should be absent, got ${facts.sentinel}`);
  assert(facts.profile === 'absent', `profile should be absent, got ${facts.profile}`);
  assert(facts.state_local === 'absent', `state_local should be absent, got ${facts.state_local}`);
  assert(facts.state_global === 'absent', `state_global should be absent, got ${facts.state_global}`);
});

// ---------------------------------------------------------------- custom CLAUDE_CONFIG_DIR

record('custom CLAUDE_CONFIG_DIR: config_dir reflects the override, not the real homedir', () => {
  const { configDir, projectDir } = freshDirs();
  const decoyHome = mkdtempSync(join(tmpdir(), 'otto-facts-decoyhome-'));
  scratchDirs.push(decoyHome);
  writeFileSync(join(configDir, '.otto-met'), '2026-07-01\n');
  const facts = computeFacts({ cwd: projectDir }, { env: { CLAUDE_CONFIG_DIR: configDir }, home: decoyHome });
  assert(facts.config_dir === configDir, `expected the override to win, got ${facts.config_dir}`);
  assert(facts.sentinel === 'present', 'sentinel should be checked against the OVERRIDE dir, not the decoy home');
});

record('no CLAUDE_CONFIG_DIR set: falls back to <home>/.claude', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-realhome-'));
  scratchDirs.push(home);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', '.otto-met'), '2026-07-01\n');
  const facts = computeFacts({ cwd: home }, { env: {}, home });
  assert(facts.config_dir === join(home, '.claude'), `expected fallback to <home>/.claude, got ${facts.config_dir}`);
  assert(facts.sentinel === 'present', 'sentinel should be found via the fallback path');
});

// ---------------------------------------------------------------- sentinel present/absent/corrupt-but-existing

record('sentinel corrupt-but-existing: garbled contents still read present (existence only, never parsed)', () => {
  const { configDir, projectDir } = freshDirs();
  writeFileSync(join(configDir, '.otto-met'), '\x00\x01 not even close to a date ��');
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.sentinel === 'present', `a garbled-but-existing sentinel file must still read present, got ${facts.sentinel}`);
});

record('sentinel absent: no file on disk at all', () => {
  const { configDir, projectDir } = freshDirs();
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.sentinel === 'absent', `expected absent, got ${facts.sentinel}`);
});

record('profile corrupt-but-existing: invalid JSON still reads present (existence only)', () => {
  const { configDir, projectDir } = freshDirs();
  writeFileSync(join(configDir, 'otto-profile.json'), '{not valid json at all');
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile === 'present', `a garbled-but-existing profile file must still read present, got ${facts.profile}`);
});

// ---------------------------------------------------------------- cwd_is_config_dir

record('cwd_is_config_dir=true: cwd IS the home dir (home-dir persona, the exact collision this fact exists to catch)', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-home-'));
  scratchDirs.push(home);
  mkdirSync(join(home, '.claude'), { recursive: true });
  const facts = computeFacts({ cwd: home }, { env: {}, home });
  assert(facts.cwd_is_config_dir === true, `cwd (the home dir) should collide with config_dir, got ${facts.cwd_is_config_dir}`);
});

record('cwd_is_config_dir=false: cwd is a real, unrelated project directory', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.cwd_is_config_dir === false, `a real project's cwd must not collide with config_dir, got ${facts.cwd_is_config_dir}`);
});

record('cwd_is_config_dir with CLAUDE_CONFIG_DIR override: only collides when cwd/.claude matches the OVERRIDE, not the real home', () => {
  const { configDir } = freshDirs();
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-home2-'));
  scratchDirs.push(home);
  // cwd is the real home dir, but CLAUDE_CONFIG_DIR points elsewhere -- <home>/.claude is NOT config_dir here.
  const facts = computeFacts({ cwd: home }, { env: { CLAUDE_CONFIG_DIR: configDir }, home });
  assert(facts.cwd_is_config_dir === false, `home dir cwd should NOT collide with an overridden config_dir elsewhere, got ${facts.cwd_is_config_dir}`);
});

// ---------------------------------------------------------------- Windows-style path normalization

record('path normalization: forward-slash and backslash spellings of the same directory compare equal', () => {
  const { configDir } = freshDirs();
  const forwardSlash = configDir.replace(/\\/g, '/');
  const key1 = normalizeForCompare(configDir);
  const key2 = normalizeForCompare(forwardSlash);
  assert(key1 === key2, `forward-slash and backslash spellings of the same real path should normalize identically: "${key1}" vs "${key2}"`);
});

record('path normalization: win32 override lowercases a non-existent (syntactic-resolve-only) path for comparison', () => {
  const nonExistent = join(tmpdir(), 'otto-facts-does-not-exist-' + Date.now(), 'Mixed-Case-Dir');
  const lower = normalizeForCompare(nonExistent.toLowerCase(), 'win32');
  const upper = normalizeForCompare(nonExistent.toUpperCase(), 'win32');
  assert(lower === upper, `win32 comparison of two case-spellings of a non-existent path should match: "${lower}" vs "${upper}"`);
});

record('path normalization: non-win32 override does NOT lowercase (case-sensitive filesystems must stay exact)', () => {
  const nonExistent = join(tmpdir(), 'otto-facts-posix-case-' + Date.now(), 'MixedCase');
  const result = normalizeForCompare(nonExistent, 'linux');
  assert(result.includes('MixedCase'), `non-win32 path should preserve case, got: ${result}`);
});

// ---------------------------------------------------------------- exact wire format

record('formatFacts: exact block shape, header verbatim, key order fixed', () => {
  const facts = {
    config_dir: 'C:\\Users\\andre\\.claude',
    sentinel: 'present',
    profile: 'absent',
    state_local: 'present',
    state_global: 'absent',
    cwd_is_config_dir: false,
  };
  const block = formatFacts(facts);
  const lines = block.split('\n');
  assert(lines[0] === FACTS_HEADER, `header line mismatch: ${lines[0]}`);
  assert(lines.length === 7, `expected 7 lines (header + 6 keys), got ${lines.length}`);
  assert(lines[1] === 'config_dir=C:\\Users\\andre\\.claude', `config_dir line wrong: ${lines[1]}`);
  assert(lines[2] === 'sentinel=present', `sentinel line wrong: ${lines[2]}`);
  assert(lines[3] === 'profile=absent', `profile line wrong: ${lines[3]}`);
  assert(lines[4] === 'state_local=present', `state_local line wrong: ${lines[4]}`);
  assert(lines[5] === 'state_global=absent', `state_global line wrong: ${lines[5]}`);
  assert(lines[6] === 'cwd_is_config_dir=false', `cwd_is_config_dir line wrong: ${lines[6]}`);
});

// ---------------------------------------------------------------- real subprocess: the actual hook invocation path

record('real subprocess: hook stdin->stdout produces a well-formed, parseable block matching computeFacts()', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  writeFileSync(join(configDir, '.otto-met'), '2026-07-01\n');

  const stdout = spawnHook({ CLAUDE_CONFIG_DIR: configDir }, projectDir);
  assert(stdout.trim().startsWith(FACTS_HEADER), `subprocess output should start with the facts header, got: ${stdout.slice(0, 80)}`);
  const parsed = parseBlock(stdout);
  assert(Object.keys(parsed).length === 6, `expected 6 parsed keys from subprocess output, got ${Object.keys(parsed).length}`);
  assert(parsed.config_dir === configDir, `subprocess config_dir mismatch: ${parsed.config_dir}`);
  assert(parsed.sentinel === 'present', `subprocess sentinel mismatch: ${parsed.sentinel}`);
  assert(parsed.profile === 'absent', `subprocess profile mismatch: ${parsed.profile}`);
  assert(parsed.cwd_is_config_dir === 'false', `subprocess cwd_is_config_dir mismatch: ${parsed.cwd_is_config_dir}`);

  const direct = runFacts(configDir, configDir, projectDir);
  assert(parsed.sentinel === direct.sentinel && parsed.profile === direct.profile, 'subprocess and direct computeFacts() should agree');
});

record('real subprocess: malformed stdin still produces a block (falls back to process.cwd(), never crashes)', () => {
  const { configDir } = freshDirs();
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: 'not json at all {{{',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    encoding: 'utf8',
  });
  assert(result.status === 0, `hook should exit 0 even on malformed stdin, got ${result.status}`);
  assert(result.stdout.trim().startsWith(FACTS_HEADER), 'hook should still emit a facts block on malformed stdin (falls back to process.cwd())');
});

record('real subprocess: empty stdin still produces a block, no crash', () => {
  const { configDir } = freshDirs();
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: '',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    encoding: 'utf8',
  });
  assert(result.status === 0, `hook should exit 0 on empty stdin, got ${result.status}`);
  assert(result.stdout.trim().startsWith(FACTS_HEADER), 'hook should still emit a facts block on empty stdin');
});

// ---------------------------------------------------------------- run

function main() {
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
