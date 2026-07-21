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

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  computeFacts,
  formatFacts,
  normalizeForCompare,
  computeInventoryFacts,
  cwdPersonaRoot,
  STOCK_AGENT_IDS,
  FACTS_HEADER,
  PROFILE_CHAR_CAP,
} from '../hooks/otto-facts.mjs';

// Local alias so the memory-cap tests below read clearly without shadowing
// the imported constant's name in every assertion message.
const PROFILE_CHAR_CAP_FOR_TEST = PROFILE_CHAR_CAP;

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

// v22.8.1 note (spec-persona-guard-22.8.1.md §6.1): this assertion was
// `=== 7` (6 core + inv) before the hotfix. computeFacts() now carries 7
// CORE keys (cwd_persona_root added) + inv = 8. This session is a returning
// user (sentinel + profile both present), so the gate (spec-facts-inventory
// §4) keeps inv at 'off' and no inv_* keys appear at all — the 8 is exact,
// not "8 or more." This project dir has no persona markers, but the CONFIG
// dir does (sentinel/profile/state_global all present there) — cwd_persona_root
// checks `<cwd>/.claude`, not `<config>`, so it stays false here. (Rev 2
// adjudication, spec §6.1: the earlier table draft said `=== true` /
// "home persona has markers" for this exact row, which mis-described its
// own fixture — this row is (F,F), not a home persona. Bitforge's `false`
// assertion, logged as a deviation at commit `4bd3f72`, was correct; the
// table now says so. The genuine "home persona has markers" case is the
// separate `cwd_is_config_dir=true` test below, whose fixture was extended
// with a real marker for exactly that reason.)
record('default config: 8 keys present (7 core + inv=off for a returning user), correct present/absent per real files on disk', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  writeFileSync(join(configDir, '.otto-met'), '2026-07-01\n');
  writeFileSync(join(configDir, 'otto-profile.json'), '{"seats":["Generalist / Solo"]}');
  writeFileSync(join(configDir, 'otto-state-global.md'), '<!-- x --> \n\n· line\n');
  writeFileSync(join(projectDir, '.claude', 'otto-state.md'), '<!-- x --> \n\n· line\n');

  const facts = runFacts(configDir, configDir, projectDir);
  // v22.10.0 note (docs/spec-memory-cap.md §5.1): this was `=== 8` before the
  // memory-cap backstop. A present, valid, under-budget profile now also
  // carries `profile_over_budget=false` (case 1, "one boolean's worth of
  // behavior change on the happy path: nothing else") -- 9, not 8.
  assert(Object.keys(facts).length === 9, `expected exactly 9 keys (7 core + profile_over_budget + inv), got ${Object.keys(facts).length}: ${Object.keys(facts).join(',')}`);
  assert(facts.config_dir === configDir, `config_dir mismatch: ${facts.config_dir}`);
  assert(facts.sentinel === 'present', `sentinel should be present, got ${facts.sentinel}`);
  assert(facts.profile === 'present', `profile should be present, got ${facts.profile}`);
  assert(facts.profile_over_budget === false, `the fixture's profile is small and valid, expected profile_over_budget=false, got ${facts.profile_over_budget}`);
  assert(facts.state_local === 'present', `state_local should be present, got ${facts.state_local}`);
  assert(facts.state_global === 'present', `state_global should be present, got ${facts.state_global}`);
  assert(facts.cwd_is_config_dir === false, `cwd_is_config_dir should be false for a real project, got ${facts.cwd_is_config_dir}`);
  assert(facts.cwd_persona_root === false, `cwd_persona_root should be false — the project's own .claude has no persona markers, got ${facts.cwd_persona_root}`);
  assert(facts.inv === 'off', `a returning user (sentinel+profile present) must gate the inventory off, got ${facts.inv}`);
  assert(facts.inv_agents === undefined, 'inv=off must carry no inv_* keys at all');
});

record('default config: everything absent when nothing exists on disk (genuine first run: inv=ok, empty payroll)', () => {
  const { configDir, projectDir } = freshDirs(); // withClaudeDir NOT called; nothing written
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.sentinel === 'absent', `sentinel should be absent, got ${facts.sentinel}`);
  assert(facts.profile === 'absent', `profile should be absent, got ${facts.profile}`);
  assert(facts.state_local === 'absent', `state_local should be absent, got ${facts.state_local}`);
  assert(facts.state_global === 'absent', `state_global should be absent, got ${facts.state_global}`);
  // Acceptance criterion #1: empty-payroll first run -> inv=ok, no inv_* lines.
  assert(facts.inv === 'ok', `a genuine first run (sentinel+profile both absent) must gather, got inv=${facts.inv}`);
  for (const k of ['inv_agents', 'inv_agents_project', 'inv_skills', 'inv_commands', 'inv_hooks', 'inv_mcp', 'inv_truncated']) {
    assert(facts[k] === undefined || (Array.isArray(facts[k]) && facts[k].length === 0), `${k} should be absent/empty on an empty payroll, got ${JSON.stringify(facts[k])}`);
  }
  const block = formatFacts(facts);
  assert(!block.includes('inv_'), `an empty payroll must emit no inv_* lines at all, got:\n${block}`);
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

// ---------------------------------------------------------------- memory cap (docs/spec-memory-cap.md)
// Seven-case emission table (spec §5.1), plus the fencepost boundary. Same
// real-filesystem-scratch-dir, no-mocking convention as every other test in
// this file. `readIndependent` re-reads the scratch file directly, outside
// computeFacts(), so `profile_size` is checked against a measurement the
// hook itself had no hand in producing.

function readIndependent(path) {
  return readFileSync(path, 'utf8').length;
}

// A fully-populated profile at roughly the schema doc's own example size
// (~620 chars pretty-printed) -- the "complete, realistic profile" case 1
// must stay silent on.
function fullyPopulatedProfile() {
  return JSON.stringify(
    {
      seats: ['Engineering', 'Strategy / Leadership'],
      tier: 'Operator',
      verbosity: 'balanced',
      scale: 'business',
      style: { prefers: ['tables', 'no-preamble'], avoid: ['headers-on-short-answers'], declined: ['workspace-cleanup'] },
      org: { status: 'hired', schema: 'org/1', revision: 2, prefer: [], shadowed: [] },
      workspace: { specs: 'docs/specs/', drafts: 'drafts/ - disposable', neverTouch: ['vendor/', '*.local.*'] },
      lastTuneup: '2026-07-12',
    },
    null,
    2
  );
}

// A valid profile deliberately padded past PROFILE_CHAR_CAP (2000) via a
// long `style.declined` array -- the real growth vector the cap exists to
// catch (spec §1).
function paddedProfile(padCount = 60) {
  const declined = Array.from({ length: padCount }, (_, i) => `synthetic-declined-offer-number-${i}`);
  return JSON.stringify(
    {
      seats: ['Engineering'],
      tier: 'Operator',
      verbosity: 'balanced',
      scale: 'business',
      style: { prefers: ['tables'], avoid: ['headers'], declined },
    },
    null,
    2
  );
}

record('memory cap, case 1 (positive, valid & under budget): silent -- profile_over_budget=false, no entries/valid line, rest of facts unchanged', () => {
  const { configDir, projectDir } = freshDirs();
  const profilePath = join(configDir, 'otto-profile.json');
  const content = fullyPopulatedProfile();
  assert(content.length < PROFILE_CHAR_CAP_FOR_TEST, `fixture should be well under the cap, got ${content.length} chars`);
  writeFileSync(profilePath, content);

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile_over_budget === false, `expected profile_over_budget=false for a valid, under-budget profile, got ${facts.profile_over_budget}`);
  assert(facts.profile_entries === undefined, 'case 1 must never carry profile_entries');
  assert(facts.profile_valid === undefined, 'case 1 must never carry profile_valid');
  assert(facts.profile_size === undefined && facts.profile_cap === undefined, 'case 1 emits profile_over_budget=false alone -- no size/cap line');
  // Rest of the facts block, unchanged shape: config_dir/sentinel/state_local/
  // state_global/cwd_is_config_dir/cwd_persona_root/inv all still present and
  // untouched by this feature.
  assert(facts.config_dir === configDir && facts.sentinel === 'absent' && facts.state_local === 'absent', 'the rest of the facts block must be unaffected by the memory cap');

  const block = formatFacts(facts);
  const profileLineIdx = block.split('\n').findIndex((l) => l.startsWith('profile='));
  assert(block.split('\n')[profileLineIdx + 1] === 'profile_over_budget=false', `expected exactly one line after profile=, got: ${block.split('\n')[profileLineIdx + 1]}`);
  assert(!block.includes('profile_entries') && !block.includes('profile_valid') && !block.includes('profile_size'), `case 1 must render one boolean line only, got:\n${block}`);
});

record('memory cap, case 2 (negative, valid & over budget): profile_over_budget=true, size/cap/entries all present, file untouched on disk', () => {
  const { configDir, projectDir } = freshDirs();
  const profilePath = join(configDir, 'otto-profile.json');
  const content = paddedProfile(60);
  writeFileSync(profilePath, content);
  const before = readFileSync(profilePath, 'utf8');
  assert(before.length > PROFILE_CHAR_CAP_FOR_TEST, `fixture must actually exceed the cap for this test to mean anything, got ${before.length} chars`);

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile_over_budget === true, `expected profile_over_budget=true, got ${facts.profile_over_budget}`);
  assert(facts.profile_size === readIndependent(profilePath), `profile_size should equal an independently measured length, got ${facts.profile_size}`);
  assert(facts.profile_cap === PROFILE_CHAR_CAP_FOR_TEST, `profile_cap should be ${PROFILE_CHAR_CAP_FOR_TEST}, got ${facts.profile_cap}`);
  assert(typeof facts.profile_entries === 'string' && facts.profile_entries.length > 0, 'profile_entries should be present for a valid, over-budget profile');
  assert(facts.profile_entries.includes(`style.declined(60)`), `profile_entries should count style.declined's 60 array entries, got: ${facts.profile_entries}`);
  assert(facts.profile_entries.includes('seats(1)'), `profile_entries should count the seats array, got: ${facts.profile_entries}`);
  assert(facts.profile_entries.includes('tier') && !facts.profile_entries.includes('tier('), `scalar keys render bare (no count), got: ${facts.profile_entries}`);
  assert(!facts.profile_entries.includes('style(') , `a nested object itself must never be emitted bare or with a count, only its array children, got: ${facts.profile_entries}`);

  const block = formatFacts(facts);
  assert(block.includes(`profile_size=${facts.profile_size}`), 'formatFacts output missing profile_size=');
  assert(block.includes(`profile_cap=${PROFILE_CHAR_CAP_FOR_TEST}`), 'formatFacts output missing profile_cap=');
  assert(block.includes('profile_over_budget=true'), 'formatFacts output missing profile_over_budget=true');

  const after = readFileSync(profilePath, 'utf8');
  assert(after === before, 'the hook must only read the profile, never write or truncate it');
});

record('memory cap, case 3 (negative, CORRUPT AND LARGE -- the target case): profile_over_budget=true fires from size alone, valid=false, entries absent, file untouched', () => {
  const { configDir, projectDir } = freshDirs();
  const profilePath = join(configDir, 'otto-profile.json');
  // Same padded content as case 2, but with the closing brace stripped --
  // large (>2000 chars) and deliberately unparseable.
  const valid = paddedProfile(60);
  const corrupt = valid.slice(0, valid.lastIndexOf('}'));
  writeFileSync(profilePath, corrupt);
  const before = readFileSync(profilePath, 'utf8');
  assert(before.length > PROFILE_CHAR_CAP_FOR_TEST, `fixture must still exceed the cap after truncation, got ${before.length} chars`);

  const facts = runFacts(configDir, configDir, projectDir);
  // The anti-silent tooth: a naive "parse failure omits everything" would
  // read this as unknown, false, or entirely absent. None of those are
  // acceptable -- it must be exactly true.
  assert(facts.profile_over_budget === true, `THE TARGET CASE: expected profile_over_budget===true (not unknown, not false, not absent), got ${facts.profile_over_budget}`);
  assert(facts.profile_size === readIndependent(profilePath), `profile_size should equal an independent measurement, got ${facts.profile_size}`);
  assert(facts.profile_cap === PROFILE_CHAR_CAP_FOR_TEST, `profile_cap should be ${PROFILE_CHAR_CAP_FOR_TEST}, got ${facts.profile_cap}`);
  assert(facts.profile_valid === false, `expected profile_valid===false for corrupt JSON, got ${facts.profile_valid}`);
  assert(facts.profile_entries === undefined, `profile_entries must be ABSENT when parse fails, even though over_budget fired, got ${JSON.stringify(facts.profile_entries)}`);

  const block = formatFacts(facts);
  assert(block.includes('profile_over_budget='), `formatFacts output must contain the substring "profile_over_budget=" -- the anti-silent tooth, got:\n${block}`);
  assert(block.includes('profile_over_budget=true'), `expected the rendered line to read true, got:\n${block}`);
  assert(!block.includes('profile_entries'), 'formatFacts output must never render profile_entries when the parse failed');

  const after = readFileSync(profilePath, 'utf8');
  assert(after === before, 'the hook must only read the corrupt profile, never write or repair it');
});

record('memory cap, case 4 (negative, corrupt AND small): profile_over_budget=false, profile_valid=false, size correct, entries absent', () => {
  const { configDir, projectDir } = freshDirs();
  const profilePath = join(configDir, 'otto-profile.json');
  const corrupt = '{invalid}';
  writeFileSync(profilePath, corrupt);

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile_over_budget === false, `a small corrupt file must not read as over budget, got ${facts.profile_over_budget}`);
  assert(facts.profile_valid === false, `expected profile_valid===false, got ${facts.profile_valid}`);
  assert(facts.profile_size === corrupt.length, `expected profile_size===${corrupt.length}, got ${facts.profile_size}`);
  assert(facts.profile_cap === PROFILE_CHAR_CAP_FOR_TEST, `profile_cap should be ${PROFILE_CHAR_CAP_FOR_TEST}, got ${facts.profile_cap}`);
  assert(facts.profile_entries === undefined, 'a corrupt file must never carry profile_entries');
});

record('memory cap, case 5 (negative, empty file, degenerate case of 4): profile_size=0, profile_over_budget=false, profile_valid=false', () => {
  const { configDir, projectDir } = freshDirs();
  const profilePath = join(configDir, 'otto-profile.json');
  writeFileSync(profilePath, '');

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile_size === 0, `expected profile_size===0 for an empty file, got ${facts.profile_size}`);
  assert(facts.profile_over_budget === false, `an empty file must not read as over budget, got ${facts.profile_over_budget}`);
  assert(facts.profile_valid === false, `an empty string is not valid JSON, expected profile_valid===false, got ${facts.profile_valid}`);
  assert(facts.profile_cap === PROFILE_CHAR_CAP_FOR_TEST, `profile_cap should be ${PROFILE_CHAR_CAP_FOR_TEST}, got ${facts.profile_cap}`);
  assert(facts.profile_entries === undefined, 'an empty file must never carry profile_entries');
});

record('memory cap, case 6 (negative, present but unreadable, no mocking): a scratch DIRECTORY named otto-profile.json -- existsSync=present, readFileSync throws EISDIR -- profile_over_budget=unknown', () => {
  const { configDir, projectDir } = freshDirs();
  // existsSync reports present (it is a real directory entry); readFileSync
  // throws EISDIR when asked to read a directory as a file -- a
  // deterministic, mock-free way to hit the read-error path (same technique
  // this file's own inventory tests already use for settings.json).
  mkdirSync(join(configDir, 'otto-profile.json'), { recursive: true });

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile === 'present', `existsSync should report the directory as present, got ${facts.profile}`);
  assert(facts.profile_over_budget === 'unknown', `expected profile_over_budget==='unknown' (read failed, size uncomputable), got ${facts.profile_over_budget}`);
  assert(facts.profile_size === undefined, 'case 6 must carry no profile_size -- there is no string to measure');
  assert(facts.profile_valid === undefined, 'case 6 must carry no profile_valid');
  assert(facts.profile_entries === undefined, 'case 6 must carry no profile_entries');
});

record('memory cap, case 7 (missing): no otto-profile.json at all -- no new profile_* facts, existing profile=absent line already carries it', () => {
  const { configDir, projectDir } = freshDirs();
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile === 'absent', `expected profile===absent, got ${facts.profile}`);
  assert(facts.profile_over_budget === undefined, 'a missing profile must add no profile_over_budget fact at all');
  const block = formatFacts(facts);
  assert(!block.includes('profile_size') && !block.includes('profile_cap') && !block.includes('profile_over_budget') && !block.includes('profile_valid') && !block.includes('profile_entries'), `a missing profile must render no profile_* lines, got:\n${block}`);
});

record('memory cap, boundary: exactly 2000 chars, valid JSON, is NOT over budget (>, not >=)', () => {
  const { configDir, projectDir } = freshDirs();
  const profilePath = join(configDir, 'otto-profile.json');
  // Build a valid JSON string, then pad it to EXACTLY 2000 chars by widening
  // a string value -- padding inside a JSON string value keeps the document
  // valid while landing on an exact character count.
  const base = JSON.stringify({ seats: ['Engineering'], tier: 'Operator', pad: '' });
  const padNeeded = PROFILE_CHAR_CAP_FOR_TEST - base.length;
  assert(padNeeded > 0, 'test fixture logic error: base profile already exceeds the cap');
  const content = JSON.stringify({ seats: ['Engineering'], tier: 'Operator', pad: 'x'.repeat(padNeeded) });
  assert(content.length === PROFILE_CHAR_CAP_FOR_TEST, `fixture should be exactly ${PROFILE_CHAR_CAP_FOR_TEST} chars, got ${content.length}`);
  writeFileSync(profilePath, content);

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile_over_budget === false, `a profile at EXACTLY the cap must NOT be flagged over budget (>, not >=), got ${facts.profile_over_budget}`);
  // At exactly the cap this is case 1 (valid, under budget) -- no anomaly
  // holds, so profile_size/profile_cap are not emitted at all (spec §5.1's
  // emission rule: size+cap only "whenever any anomaly holds").
  assert(facts.profile_size === undefined, `a profile at exactly the cap is case 1 -- no size line expected, got ${facts.profile_size}`);
});

record('memory cap, boundary: exactly 2001 chars (cap + 1), valid JSON, IS over budget (>, not >=)', () => {
  const { configDir, projectDir } = freshDirs();
  const profilePath = join(configDir, 'otto-profile.json');
  // Mirrors the exactly-2000 boundary test above, one char over the cap --
  // the two fenceposts sit together so a broken comparison (e.g. `>= cap`
  // becoming `> cap + 1`) cannot silently pass on one side while failing the
  // other unnoticed.
  const base = JSON.stringify({ seats: ['Engineering'], tier: 'Operator', pad: '' });
  const padNeeded = PROFILE_CHAR_CAP_FOR_TEST + 1 - base.length;
  assert(padNeeded > 0, 'test fixture logic error: base profile already exceeds the cap + 1');
  const content = JSON.stringify({ seats: ['Engineering'], tier: 'Operator', pad: 'x'.repeat(padNeeded) });
  assert(content.length === PROFILE_CHAR_CAP_FOR_TEST + 1, `fixture should be exactly ${PROFILE_CHAR_CAP_FOR_TEST + 1} chars, got ${content.length}`);
  writeFileSync(profilePath, content);

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.profile_over_budget === true, `a profile at cap + 1 char must be flagged over budget, got ${facts.profile_over_budget}`);
  assert(facts.profile_size === PROFILE_CHAR_CAP_FOR_TEST + 1, `expected profile_size===${PROFILE_CHAR_CAP_FOR_TEST + 1}, got ${facts.profile_size}`);
  assert(facts.profile_cap === PROFILE_CHAR_CAP_FOR_TEST, `profile_cap should be ${PROFILE_CHAR_CAP_FOR_TEST}, got ${facts.profile_cap}`);
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

// ---------------------------------------------------------------- cwd_persona_root (v22.8.1 hotfix, spec-persona-guard-22.8.1.md)
// Acceptance matrix rows R2-R5, R7, R14-R15 (§7). The 2x2 cross-product's
// (F,F) and (T,T) cells are already covered above/below by the default-config
// and cwd_is_config_dir=true tests respectively (both now assert
// cwd_persona_root alongside cwd_is_config_dir).

record('R2: relocated CLAUDE_CONFIG_DIR, cwd=home persona root, real otto-state.md present -- the original repro, case 3 -- cwd_persona_root=true, cwd_is_config_dir=false', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-r2-home-'));
  scratchDirs.push(home);
  const sandboxConfig = mkdtempSync(join(tmpdir(), 'otto-facts-r2-sandbox-'));
  scratchDirs.push(sandboxConfig);
  // home's REAL .claude carries the user's real identity markers and a real work table.
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', '.otto-met'), '2026-07-01\n');
  writeFileSync(join(home, '.claude', 'otto-profile.json'), '{"seats":["Generalist / Solo"]}');
  writeFileSync(join(home, '.claude', 'otto-state.md'), '<!-- x --> \n\n· real work table\n');
  // CLAUDE_CONFIG_DIR is relocated to a sandbox elsewhere; cwd is still home.
  const facts = computeFacts({ cwd: home }, { env: { CLAUDE_CONFIG_DIR: sandboxConfig }, home });
  assert(facts.cwd_is_config_dir === false, `cwd_is_config_dir compares against the RELOCATED config, so it structurally misses this case -- got ${facts.cwd_is_config_dir}`);
  assert(facts.cwd_persona_root === true, `cwd_persona_root must catch what cwd_is_config_dir cannot: <cwd>/.claude holds real identity markers, got ${facts.cwd_persona_root}`);
});

record('R3: markerless active config as cwd (new user, session 1, hand-placed otto-state.md) -- cwd_is_config_dir=true blocks even with no markers', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-r3-home-'));
  scratchDirs.push(home);
  mkdirSync(join(home, '.claude'), { recursive: true });
  // No .otto-met, no otto-profile.json, no otto-state-global.md -- only a hand-placed local state file.
  writeFileSync(join(home, '.claude', 'otto-state.md'), '<!-- x --> \n\n· hand-placed\n');
  const facts = computeFacts({ cwd: home }, { env: {}, home });
  assert(facts.cwd_is_config_dir === true, `test setup should reproduce cwd_is_config_dir=true, got ${facts.cwd_is_config_dir}`);
  assert(facts.cwd_persona_root === false, `no markers exist yet -- cwd_persona_root must read false; cwd_is_config_dir alone must still gate the block (R3), got ${facts.cwd_persona_root}`);
});

record('R5: OR of three markers -- otto-profile.json alone is sufficient', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-r5a-'));
  scratchDirs.push(home);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'otto-profile.json'), '{}');
  assert(cwdPersonaRoot(join(home, '.claude')) === true, 'otto-profile.json alone must be sufficient to flag a persona root');
});

record('R5: OR of three markers -- .otto-met alone is sufficient', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-r5b-'));
  scratchDirs.push(home);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', '.otto-met'), '2026-07-01\n');
  assert(cwdPersonaRoot(join(home, '.claude')) === true, '.otto-met alone must be sufficient to flag a persona root');
});

record('R5: OR of three markers -- otto-state-global.md alone is sufficient', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-r5c-'));
  scratchDirs.push(home);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'otto-state-global.md'), '<!-- x -->\n');
  assert(cwdPersonaRoot(join(home, '.claude')) === true, 'otto-state-global.md alone must be sufficient to flag a persona root');
});

record('R6 regression: cloned repo -- committed otto-state.md, no markers -- accepted-risk PERMIT boundary unchanged', () => {
  const { projectDir } = freshDirs();
  withClaudeDir(projectDir);
  // otto-state.md is per-project evidence, deliberately NOT a marker (spec §2) -- it is the one file a
  // genuine project legitimately owns, including a committed/cloned one.
  writeFileSync(join(projectDir, '.claude', 'otto-state.md'), '<!-- x --> \n\n· stale committed brief\n');
  assert(cwdPersonaRoot(join(projectDir, '.claude')) === false, 'otto-state.md alone (no identity markers) must never flag a persona root -- that would re-close the accepted-risk cloned-repo case');
});

record('R7: full persona copied into a project .claude/ -- fail-safe on pathological copy, BLOCK', () => {
  const { projectDir } = freshDirs();
  withClaudeDir(projectDir);
  // A hand-built layout that copied a real persona's identity files alongside a project-shaped state file.
  writeFileSync(join(projectDir, '.claude', 'otto-state.md'), '<!-- x --> \n\n· copied-in brief\n');
  writeFileSync(join(projectDir, '.claude', '.otto-met'), '2026-07-01\n');
  writeFileSync(join(projectDir, '.claude', 'otto-profile.json'), '{"seats":["Generalist / Solo"]}');
  assert(cwdPersonaRoot(join(projectDir, '.claude')) === true, 'a persona copied wholesale into a project .claude/ must still flag as a persona root, even though it also looks like a project');
});

record('R14: cwd_persona_root computation throws (injected) -- fails toward BLOCK (true), not open', () => {
  // join(undefined, marker) throws a TypeError ("Path must be a string") --
  // exercises the try/catch's actual catch branch, not just its absence.
  assert(cwdPersonaRoot(undefined) === true, 'a thrown error inside the persona-root probe must resolve to true (fail-toward-block), never false');
});

record('R15: symlink edge -- <cwd>/.claude symlinked to a real config dir -- existsSync follows the link, flags the persona root', () => {
  const realConfig = mkdtempSync(join(tmpdir(), 'otto-facts-r15-real-'));
  scratchDirs.push(realConfig);
  writeFileSync(join(realConfig, '.otto-met'), '2026-07-01\n');
  const projectParent = mkdtempSync(join(tmpdir(), 'otto-facts-r15-proj-'));
  scratchDirs.push(projectParent);
  const symlinkedClaude = join(projectParent, '.claude');
  try {
    symlinkSync(realConfig, symlinkedClaude, 'junction');
  } catch (e) {
    // Symlink/junction creation can be permission-gated on some CI runners;
    // this row is POSIX-relevant (spec §9.4) and re-verified on the Mac gate
    // regardless -- degrade to a skip here rather than a false failure.
    console.log(`  (R15 symlink test skipped -- could not create link: ${e.message})`);
    return;
  }
  assert(cwdPersonaRoot(symlinkedClaude) === true, 'existsSync must follow the symlink to the real config dir and flag the persona root');
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

record('formatFacts: exact block shape, header verbatim, core key order fixed, inv=off carries no inv_* lines', () => {
  const facts = {
    config_dir: 'C:\\Users\\andre\\.claude',
    sentinel: 'present',
    profile: 'absent',
    state_local: 'present',
    state_global: 'absent',
    cwd_is_config_dir: false,
    cwd_persona_root: false,
    inv: 'off',
  };
  const block = formatFacts(facts);
  const lines = block.split('\n');
  assert(lines[0] === FACTS_HEADER, `header line mismatch: ${lines[0]}`);
  // v22.8.1 note (spec-persona-guard-22.8.1.md §6.1): this was `=== 8`
  // (header + 7 core keys, before cwd_persona_root existed). `inv` moves down
  // one slot to make room for the new 7th core line.
  assert(lines.length === 9, `expected 9 lines (header + 7 core keys + inv=off), got ${lines.length}`);
  assert(lines[1] === 'config_dir=C:\\Users\\andre\\.claude', `config_dir line wrong: ${lines[1]}`);
  assert(lines[2] === 'sentinel=present', `sentinel line wrong: ${lines[2]}`);
  assert(lines[3] === 'profile=absent', `profile line wrong: ${lines[3]}`);
  assert(lines[4] === 'state_local=present', `state_local line wrong: ${lines[4]}`);
  assert(lines[5] === 'state_global=absent', `state_global line wrong: ${lines[5]}`);
  assert(lines[6] === 'cwd_is_config_dir=false', `cwd_is_config_dir line wrong: ${lines[6]}`);
  assert(lines[7] === 'cwd_persona_root=false', `cwd_persona_root line wrong: ${lines[7]}`);
  assert(lines[8] === 'inv=off', `inv line wrong: ${lines[8]}`);
});

// The exact wire-format sample from docs/spec-facts-inventory-22.8.0.md §3.1,
// reproduced verbatim as a test — if the spec's own worked example and this
// hook's actual output ever diverge, this is the assertion that catches it.
record('formatFacts: the spec\'s own worked example, byte-for-byte, field order fixed', () => {
  const facts = {
    config_dir: '/Users/x/.claude',
    sentinel: 'absent',
    profile: 'absent',
    state_local: 'absent',
    state_global: 'absent',
    cwd_is_config_dir: false,
    cwd_persona_root: false,
    inv: 'ok',
    inv_agents: ['db-migrator', 'bitforge-engineer*', 'my-planner'],
    inv_agents_project: ['code-reviewer'],
    inv_skills: ['deploy-helper', 'landing-copy'],
    inv_commands: ['ship'],
    inv_hooks: ['PreToolUse', 'PostToolUse'],
    inv_mcp: ['github', 'linear'],
  };
  const expected = [
    FACTS_HEADER,
    'config_dir=/Users/x/.claude',
    'sentinel=absent',
    'profile=absent',
    'state_local=absent',
    'state_global=absent',
    'cwd_is_config_dir=false',
    'cwd_persona_root=false',
    'inv=ok',
    'inv_agents=db-migrator,bitforge-engineer*,my-planner',
    'inv_agents_project=code-reviewer',
    'inv_skills=deploy-helper,landing-copy',
    'inv_commands=ship',
    'inv_hooks=PreToolUse,PostToolUse',
    'inv_mcp=github,linear',
  ].join('\n');
  assert(formatFacts(facts) === expected, `formatFacts output diverged from the spec's own §3.1 example:\n${formatFacts(facts)}\n---vs---\n${expected}`);
});

// ---------------------------------------------------------------- real subprocess: the actual hook invocation path

record('real subprocess: hook stdin->stdout produces a well-formed, parseable block matching computeFacts()', () => {
  const { configDir, projectDir } = freshDirs();
  withClaudeDir(projectDir);
  writeFileSync(join(configDir, '.otto-met'), '2026-07-01\n');

  const stdout = spawnHook({ CLAUDE_CONFIG_DIR: configDir }, projectDir);
  assert(stdout.trim().startsWith(FACTS_HEADER), `subprocess output should start with the facts header, got: ${stdout.slice(0, 80)}`);
  const parsed = parseBlock(stdout);
  // v22.8.1 note (spec-persona-guard-22.8.1.md §6.1): sentinel is present
  // here, so the inventory gate is off and the only new line is the bare
  // `inv=off` marker; core grew from 6 to 7 keys (cwd_persona_root added) —
  // 8 parsed keys (7 core + inv), not 7.
  assert(Object.keys(parsed).length === 8, `expected 8 parsed keys from subprocess output (7 core + inv), got ${Object.keys(parsed).length}`);
  assert(parsed.config_dir === configDir, `subprocess config_dir mismatch: ${parsed.config_dir}`);
  assert(parsed.sentinel === 'present', `subprocess sentinel mismatch: ${parsed.sentinel}`);
  assert(parsed.profile === 'absent', `subprocess profile mismatch: ${parsed.profile}`);
  assert(parsed.cwd_is_config_dir === 'false', `subprocess cwd_is_config_dir mismatch: ${parsed.cwd_is_config_dir}`);
  assert(parsed.inv === 'off', `subprocess should gate the inventory off (sentinel present), got inv=${parsed.inv}`);

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

// ---------------------------------------------------------------- inventory: gate on/off

record('gate: sentinel present alone (profile absent) still gates the inventory off', () => {
  const { configDir, projectDir } = freshDirs();
  writeFileSync(join(configDir, '.otto-met'), '2026-07-01\n');
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.inv === 'off', `sentinel present alone must gate off (AND, not OR), got inv=${facts.inv}`);
});

record('gate: profile present alone (sentinel absent) still gates the inventory off', () => {
  const { configDir, projectDir } = freshDirs();
  writeFileSync(join(configDir, 'otto-profile.json'), '{"seats":["Generalist / Solo"]}');
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.inv === 'off', `profile present alone must gate off (AND, not OR), got inv=${facts.inv}`);
});

// ---------------------------------------------------------------- inventory: populated payroll, collision, namespacing

record('inventory: populated payroll enumerates every type; ids only, never contents; collision flagged with a trailing *', () => {
  const { configDir, projectDir } = freshDirs();
  mkdirSync(join(configDir, 'agents'), { recursive: true });
  writeFileSync(join(configDir, 'agents', 'bitforge-engineer.md'), 'name: bitforge-engineer\ndescription: a secret only the frontmatter knows\n');
  writeFileSync(join(configDir, 'agents', 'db-migrator.md'), 'name: db-migrator\n');
  mkdirSync(join(projectDir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(projectDir, '.claude', 'agents', 'code-reviewer.md'), 'name: code-reviewer\n');
  mkdirSync(join(configDir, 'skills', 'deploy-helper'), { recursive: true });
  writeFileSync(join(configDir, 'skills', 'deploy-helper', 'SKILL.md'), 'name: deploy-helper\n');
  // A skill directory with no SKILL.md is not a skill id (matches validate.mjs's own discovery).
  mkdirSync(join(configDir, 'skills', 'not-a-skill'), { recursive: true });
  mkdirSync(join(configDir, 'commands'), { recursive: true });
  writeFileSync(join(configDir, 'commands', 'ship.md'), 'ship it\n');
  writeFileSync(
    join(configDir, 'settings.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'x' }] }, mcpServers: { github: { command: 'gh-mcp-server --secret-flag' } } })
  );

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.inv === 'ok', `expected inv=ok, got ${facts.inv}`);
  assert(
    new Set(facts.inv_agents).size === 2 && facts.inv_agents.includes('bitforge-engineer*') && facts.inv_agents.includes('db-migrator'),
    `inv_agents should be exactly {bitforge-engineer*, db-migrator} (set membership, not order — spec §10.2), got ${JSON.stringify(facts.inv_agents)}`
  );
  assert(facts.inv_agents_project.includes('code-reviewer'), `inv_agents_project should include code-reviewer, got ${JSON.stringify(facts.inv_agents_project)}`);
  assert(facts.inv_skills.includes('deploy-helper') && !facts.inv_skills.includes('not-a-skill'), `inv_skills should include only real skills (SKILL.md present), got ${JSON.stringify(facts.inv_skills)}`);
  assert(facts.inv_commands.includes('ship'), `inv_commands should include ship, got ${JSON.stringify(facts.inv_commands)}`);
  assert(facts.inv_hooks.includes('PreToolUse'), `inv_hooks should include PreToolUse, got ${JSON.stringify(facts.inv_hooks)}`);
  assert(facts.inv_mcp.includes('github'), `inv_mcp should include github, got ${JSON.stringify(facts.inv_mcp)}`);

  // Boundary check (spec §2): ids/types only, never authored content. The
  // agent's description and the MCP command string must never appear
  // anywhere in the serialized facts, structured or wire-format.
  const block = formatFacts(facts);
  assert(!block.includes('a secret only the frontmatter knows'), 'inventory leaked an agent description into the facts block');
  assert(!block.includes('gh-mcp-server'), 'inventory leaked an MCP server command string into the facts block (settings.json key-name-only read)');
  assert(!JSON.stringify(facts).includes('gh-mcp-server'), 'inventory leaked an MCP server command string into the structured facts object');
});

record('inventory: cwd_is_config_dir=true omits inv_agents_project entirely (not just empty) — no double-count of the same dir', () => {
  // Same home-persona setup as the existing "cwd_is_config_dir=true" core-fact
  // test above: no CLAUDE_CONFIG_DIR override, cwd IS the home dir, so
  // internal config_dir resolves to <home>/.claude and cwd/.claude resolves
  // to that SAME path. v22.8.1: this is also acceptance row R4 (T,T) — a
  // real onboarded home persona plants markers there too. Marker is
  // otto-state-global.md, deliberately NOT .otto-met/otto-profile.json here:
  // either of those would also flip the inventory GATE (sentinel/profile
  // present -> inv=off), which is an orthogonal mechanism this test isn't
  // about -- cwd_persona_root must read true regardless of which marker
  // fires, and this keeps inv=ok so the inv_agents_project assertions below
  // still exercise the S3 omission path they're named for.
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-inv-home-'));
  scratchDirs.push(home);
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(home, '.claude', 'agents', 'db-migrator.md'), 'name: db-migrator\n');
  writeFileSync(join(home, '.claude', 'otto-state-global.md'), '<!-- x -->\n');

  const facts = computeFacts({ cwd: home }, { env: {}, home });
  assert(facts.cwd_is_config_dir === true, 'test setup should reproduce cwd_is_config_dir=true');
  assert(facts.cwd_persona_root === true, `R4 (T,T): a default onboarded home persona must also read cwd_persona_root=true, got ${facts.cwd_persona_root}`);
  assert(facts.inv === 'ok', `expected inv=ok, got ${facts.inv}`);
  assert(facts.inv_agents.includes('db-migrator'), 'the single agents dir should still enumerate once, under inv_agents');
  assert(!('inv_agents_project' in facts), `inv_agents_project must be entirely absent when cwd_is_config_dir=true, got ${JSON.stringify(facts.inv_agents_project)}`);
  assert(!formatFacts(facts).includes('inv_agents_project'), 'formatFacts must never emit an inv_agents_project line when cwd_is_config_dir=true');
});

record('R8: first-run active config (sandbox), cwd=foreign persona root -- S3 inventory leak closed, inv_agents_project omitted', () => {
  const home = mkdtempSync(join(tmpdir(), 'otto-facts-r8-home-'));
  scratchDirs.push(home);
  const sandboxConfig = mkdtempSync(join(tmpdir(), 'otto-facts-r8-sandbox-'));
  scratchDirs.push(sandboxConfig);
  // home's REAL .claude is a persona root holding a real (foreign, from this sandbox session's point of
  // view) agents directory -- the exact thing S3 must never enumerate into inv_agents_project.
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(home, '.claude', 'agents', 'someones-real-agent.md'), 'name: someones-real-agent\n');
  writeFileSync(join(home, '.claude', '.otto-met'), '2026-07-01\n');
  // The sandbox config dir is a genuine first run (nothing written there yet) so the inventory gate fires.
  const facts = computeFacts({ cwd: home }, { env: { CLAUDE_CONFIG_DIR: sandboxConfig }, home });
  assert(facts.cwd_is_config_dir === false, `sandbox config differs from home's real .claude, got ${facts.cwd_is_config_dir}`);
  assert(facts.cwd_persona_root === true, `home's real .claude holds a real marker, got ${facts.cwd_persona_root}`);
  assert(facts.inv === 'ok', `expected inv=ok (genuine first run for the sandbox config), got ${facts.inv}`);
  assert(!('inv_agents_project' in facts), `S3: inv_agents_project must be entirely omitted when cwd is a foreign persona root, got ${JSON.stringify(facts.inv_agents_project)}`);
  assert(!formatFacts(facts).includes('someones-real-agent'), 'the foreign persona\'s real agent id must never leak into the wire format');
});

record('R9: genuine project, first-run -- S3 fix does not break normal inventory, inv_agents_project still emitted', () => {
  const { configDir, projectDir } = freshDirs();
  mkdirSync(join(projectDir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(projectDir, '.claude', 'agents', 'code-reviewer.md'), 'name: code-reviewer\n');
  // No persona markers under projectDir/.claude -- a genuine project, not a persona root.
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.cwd_is_config_dir === false && facts.cwd_persona_root === false, `setup should be a genuine (F,F) project, got cwd_is_config_dir=${facts.cwd_is_config_dir} cwd_persona_root=${facts.cwd_persona_root}`);
  assert(facts.inv === 'ok', `expected inv=ok, got ${facts.inv}`);
  assert(Array.isArray(facts.inv_agents_project) && facts.inv_agents_project.includes('code-reviewer'), `a genuine project's own agents/ must still enumerate under inv_agents_project, got ${JSON.stringify(facts.inv_agents_project)}`);
});

record('inventory: otto-foreman itself collides — the main thread is not exempt from filename collision', () => {
  const { configDir, projectDir } = freshDirs();
  mkdirSync(join(configDir, 'agents'), { recursive: true });
  writeFileSync(join(configDir, 'agents', 'otto-foreman.md'), 'name: otto-foreman\n');
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.inv_agents.includes('otto-foreman*'), `a user file shadowing the main thread must still flag, got ${JSON.stringify(facts.inv_agents)}`);
});

record('namespacing: STOCK_AGENT_IDS holds bare ids only — a plugin-namespaced id can never false-collide', () => {
  assert(STOCK_AGENT_IDS.has('bitforge-engineer'), 'STOCK_AGENT_IDS should hold the bare stock id');
  assert(!STOCK_AGENT_IDS.has('robotinc:bitforge-engineer'), 'STOCK_AGENT_IDS must never hold a namespaced id — the hook never reads the plugin\'s own namespaced tree in the first place, so this checks the set stays bare by construction');
  assert(STOCK_AGENT_IDS.size === 14, `expected all 14 stock agents (13 delegates + otto-foreman), got ${STOCK_AGENT_IDS.size}`);
});

// ---------------------------------------------------------------- inventory: delimiter safety

record('delimiter-unsafe id: a comma in a filename is skipped from its list and forces inv=partial', () => {
  const { configDir, projectDir } = freshDirs();
  mkdirSync(join(configDir, 'commands'), { recursive: true });
  writeFileSync(join(configDir, 'commands', 'ship.md'), 'ship\n');
  writeFileSync(join(configDir, 'commands', 'oops,comma.md'), 'bad id\n'); // legal on both NTFS and POSIX filesystems
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.inv === 'partial', `a delimiter-unsafe id must force inv=partial, got ${facts.inv}`);
  assert(facts.inv_commands.includes('ship'), 'the safe id should still be emitted');
  assert(!facts.inv_commands.some((c) => c.includes(',')), `the unsafe id must never appear, even malformed, got ${JSON.stringify(facts.inv_commands)}`);
});

// ---------------------------------------------------------------- inventory: truncation

record('truncation: a huge payroll caps at ~1800 chars, sets inv=partial + inv_truncated=true, and never drops a collision', () => {
  const { configDir, projectDir } = freshDirs();
  mkdirSync(join(configDir, 'agents'), { recursive: true });
  // A collision planted deliberately LAST alphabetically among 150 plain
  // agents (readdir order is not guaranteed, but priority order in the hook
  // itself puts every collision first regardless of scan order — spec §3.4).
  writeFileSync(join(configDir, 'agents', 'bitforge-engineer.md'), 'name: bitforge-engineer\n');
  for (let i = 0; i < 150; i++) {
    writeFileSync(join(configDir, 'agents', `user-agent-${String(i).padStart(3, '0')}.md`), `name: user-agent-${i}\n`);
  }
  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.inv === 'partial', `a payroll this large must exceed the cap and read partial, got ${facts.inv}`);
  assert(facts.inv_truncated === true, 'inv_truncated=true must be set when the cap truncation fires');
  assert(facts.inv_agents.includes('bitforge-engineer*'), 'a collision-marked agent must never be dropped by truncation, even under a huge payroll');
  assert(facts.inv_agents.length < 151, `truncation should have dropped SOME of the 151 planted agents, got all ${facts.inv_agents.length}`);
  const block = formatFacts(facts);
  assert(block.length < 2200, `serialized block should stay in the neighborhood of the ~1800-char cap (plus core lines/header), got ${block.length} chars`);
});

// ---------------------------------------------------------------- inventory: degrade-open on a sub-scan failure

record('degrade-open: settings.json unreadable (a directory, not a file) — hooks/mcp omitted, everything else still enumerates, inv=partial not error', () => {
  const { configDir, projectDir } = freshDirs();
  mkdirSync(join(configDir, 'agents'), { recursive: true });
  writeFileSync(join(configDir, 'agents', 'db-migrator.md'), 'name: db-migrator\n');
  // settings.json exists but can't be read as a file (EISDIR) — a portable,
  // deterministic stand-in for "unreadable" that works identically on
  // Windows and POSIX, unlike chmod-based permission denial (spec §7's
  // "unreadable directory" / "one sub-scan fails" rows: skip it, inv=partial,
  // not a total error — the sub-scans that DID succeed still ship).
  mkdirSync(join(configDir, 'settings.json'), { recursive: true });

  const facts = runFacts(configDir, configDir, projectDir);
  assert(facts.inv === 'partial', `one failed sub-scan should degrade to partial, not error or ok — got ${facts.inv}`);
  assert(facts.inv_agents.includes('db-migrator'), 'a sub-scan that succeeded (agents) must still be emitted in full');
  // The key itself may still be present as an empty array (computeFacts's
  // internal shape) — what must actually be true is the wire format: no
  // inv_hooks/inv_mcp LINE at all (spec's "empty type -> omit the line").
  assert(!(facts.inv_hooks?.length), `the failed sub-scan (settings.json) must contribute no hooks, got ${JSON.stringify(facts.inv_hooks)}`);
  assert(!(facts.inv_mcp?.length), `the failed sub-scan (settings.json) must contribute no mcp, got ${JSON.stringify(facts.inv_mcp)}`);
  const block = formatFacts(facts);
  assert(!block.includes('inv_hooks='), 'the wire format must omit the inv_hooks line entirely when the sub-scan failed');
  assert(!block.includes('inv_mcp='), 'the wire format must omit the inv_mcp line entirely when the sub-scan failed');
  // Core facts must be completely unaffected by the inventory failure.
  assert(facts.sentinel === 'absent' && facts.profile === 'absent', 'core facts must never regress when a sub-scan fails');

  // NOTE for Glitchtrap: docs/spec-facts-inventory-22.8.0.md's failure-mode
  // table (§7) classifies "unreadable directory" / "one sub-scan fails" as
  // inv=partial, matching this test — but the acceptance-criteria table
  // (§9, row 7, "make <config>/agents unreadable") names the resulting
  // status "inv=error". Those two sections of the spec disagree with each
  // other. Implemented to §7 (the detailed, per-condition failure-mode
  // contract, and the more useful behavior — "partial truth beats none" is
  // stated explicitly there): an ordinary, anticipated read failure on one
  // sub-scan degrades that sub-scan only and reads inv=partial; the
  // sub-scans that succeeded still ship. `inv=error` is reserved for the
  // OTHER row in the same table — the gather pipeline throwing somewhere
  // unexpected, outside any single sub-scan's own try/catch (see the next
  // test). Flagging this deviation per the task's own instruction rather
  // than silently picking one reading.
});

record('error isolation: an unexpected throw inside inventory gathering never reaches the caller and never touches core facts', () => {
  // computeInventoryFacts() is exported specifically so this can be tested
  // in isolation from computeFacts() — an unexpected throw (not a plain
  // sub-scan read failure, which degrades to partial per the test above)
  // must be caught by the inventory's OWN try/catch and read as inv=error,
  // never propagate and never take the six core facts down with it (spec §7,
  // "Inventory gather throws (unexpected)").
  const core = { sentinel: 'absent', profile: 'absent', config_dir: null, cwd_is_config_dir: false };
  let result;
  let threw = false;
  try {
    result = computeInventoryFacts(core, '/irrelevant');
  } catch {
    threw = true;
  }
  assert(!threw, 'an unexpected error inside inventory gathering must never propagate out of computeInventoryFacts()');
  assert(result.inv === 'error', `expected inv=error on an unexpected throw (config_dir=null breaks path.join internally), got ${JSON.stringify(result)}`);
  assert(Object.keys(result).length === 1, `inv=error must carry no inv_* fields at all, got ${JSON.stringify(result)}`);
});

record('real subprocess: an unexpected inventory failure still exits 0 with core facts intact (whole-hook fail-silent stays outermost)', () => {
  const { configDir, projectDir } = freshDirs();
  mkdirSync(join(configDir, 'settings.json'), { recursive: true }); // same EISDIR trigger, exercised through the real subprocess
  const stdout = spawnHook({ CLAUDE_CONFIG_DIR: configDir }, projectDir);
  assert(stdout.trim().startsWith(FACTS_HEADER), 'the hook must still emit a well-formed facts block when a sub-scan fails');
  const parsed = parseBlock(stdout);
  assert(parsed.sentinel === 'absent' && parsed.config_dir === configDir, 'core facts must survive a sub-scan failure over the real subprocess path too');
  assert(parsed.inv === 'partial', `expected inv=partial over the real subprocess path, got ${parsed.inv}`);
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
