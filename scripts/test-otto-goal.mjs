#!/usr/bin/env node
// Test suite for the goal-anchor feature (docs/spec-goal-contract.md §7) —
// hooks/otto-goal-lib.mjs, hooks/otto-goal-compact.mjs, hooks/otto-goal-audit.mjs,
// and the goal_flags=N reader added to hooks/otto-facts.mjs. Real filesystem
// I/O against scratch temp directories; no mocking, no framework, no
// dependency — same convention as test-otto-facts.mjs / test-otto-state.mjs.
//
//   node scripts/test-otto-goal.mjs
//
// SCOPE, STATED PLAINLY: this build shipped under §4.B (the fallback) —
// build-task-1's live-capture spike (§4) has not run, so hooks/otto-goal-
// inject.mjs does not exist and is not tested here. What IS tested is
// everything downstream of that spike's answer: the shared lib, the
// compaction reader, the audit + its reader, and every structural guarantee
// the prose protocol (agents/otto-foreman.md) depends on code to hold.
// Capture/confirm/pin/amend/retire themselves are Otto's own conversation,
// not code — where a test below stands in for one of those, it says so.

import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  readActiveGoal,
  renderAnchorBlock,
  ANCHOR_SENTINEL,
  ANCHOR_CHAR_CAP,
  goalFlagsPath,
  countGoalFlags,
  writeGoalFlag,
  AUDIT_LOG_CAP,
} from '../hooks/otto-goal-lib.mjs';
import { run as runCompact } from '../hooks/otto-goal-compact.mjs';
import { run as runAudit, missingChecks } from '../hooks/otto-goal-audit.mjs';
import { computeFacts, formatFacts } from '../hooks/otto-facts.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const COMPACT_HOOK_PATH = fileURLToPath(new URL('../hooks/otto-goal-compact.mjs', import.meta.url));
const AUDIT_HOOK_PATH = fileURLToPath(new URL('../hooks/otto-goal-audit.mjs', import.meta.url));

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

function freshProjectDir() {
  const projectDir = mkdtempSync(join(tmpdir(), 'otto-goal-project-'));
  scratchDirs.push(projectDir);
  mkdirSync(join(projectDir, '.claude'), { recursive: true });
  return projectDir;
}

function goalPath(projectDir) {
  return join(projectDir, '.claude', 'otto-goal.md');
}

// Builds the artifact exactly per docs/spec-goal-contract.md §3's template.
function renderGoalFile({
  status = 'active',
  confirmed = '2026-07-15',
  gear = 'feature',
  confirmedGoal = 'Ship the subscription schema and the webhook handler.',
  originalAsk = 'can you build the subscription billing feature end to end',
  nonGoals = null,
  amendmentHistory = null,
} = {}) {
  const lines = [
    '<!-- otto-goal.md test fixture -->',
    '',
    `status: ${status}`,
    `confirmed: ${confirmed}`,
    `gear: ${gear}`,
    '',
    '## Confirmed goal',
    confirmedGoal,
    '',
    '## Original ask (verbatim)',
    originalAsk,
    '',
  ];
  if (nonGoals) {
    lines.push('## Non-goals', nonGoals, '');
  }
  if (amendmentHistory) {
    lines.push('## Amendment history', amendmentHistory, '');
  }
  return lines.join('\n');
}

function writeGoalFile(projectDir, opts) {
  writeFileSync(goalPath(projectDir), renderGoalFile(opts), 'utf8');
}

function agentPayload({ subagentType = 'general-purpose', description = 'test dispatch', prompt, cwd, status = 'completed' }) {
  return {
    tool_name: 'Agent',
    tool_input: { subagent_type: subagentType, description, prompt },
    tool_response: { status },
    cwd,
  };
}

function readFlagLines(projectDir) {
  const path = goalFlagsPath(projectDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
}

// ================================================================ NEGATIVE

record('negative: small-change ask never fires — no goal file exists, so every hook finds no active-status file and no-ops silently', () => {
  const projectDir = freshProjectDir(); // no otto-goal.md written — the small-ask project, by construction
  assert(readActiveGoal(projectDir) === null, 'readActiveGoal must return null when no goal file exists');

  // A completely ordinary dispatch prompt, no anchor, no contract line — the
  // exact shape a small-ask/answer-gear dispatch produces.
  const payload = agentPayload({ prompt: 'go fix the typo in the README', cwd: projectDir });
  runAudit(payload);
  assert(readFlagLines(projectDir).length === 0, 'no active goal -> audit must write NO flag line, ever, for any dispatch in this project');

  const compactOutput = runCompact({ cwd: projectDir });
  assert(compactOutput === '', 'no active goal -> compaction hook must emit nothing');

  assert(!existsSync(goalPath(projectDir)), 'no hook may ever create .claude/otto-goal.md — that is exclusively Otto\'s own consented write');
});

record('negative: answer-gear ask never fires — identical assertions to the small-change case', () => {
  const projectDir = freshProjectDir();
  const payload = agentPayload({ prompt: 'what do you think about this pricing question', cwd: projectDir });
  runAudit(payload);
  assert(readFlagLines(projectDir).length === 0, 'answer-gear dispatch in a project with no active goal must never be flagged');
  assert(runCompact({ cwd: projectDir }) === '', 'answer-gear project must never re-inject anything at compaction');
});

record('negative: ambiguous gear, lower gear taken, no upgrade accepted — the file stays untouched', () => {
  const projectDir = freshProjectDir();
  // Simulates Otto taking the lower gear and the human not accepting the
  // upgrade: nothing captures, nothing pins, nothing dispatches under a goal.
  assert(!existsSync(goalPath(projectDir)), 'file must not exist before the dispatch');
  runAudit(agentPayload({ prompt: 'fixed it, no contract line, no anchor', cwd: projectDir }));
  assert(!existsSync(goalPath(projectDir)), 'a dispatch under an un-upgraded lower gear must never create the goal file');
  assert(readFlagLines(projectDir).length === 0, 'must never flag a project that never had an active goal');
});

record('negative: no auto-classification exists (structural) — no drift/pivot classifier function, and the human-decides rule is stated verbatim', () => {
  const foreman = readFileSync(join(REPO, 'agents/otto-foreman.md'), 'utf8');
  const audit = readFileSync(join(REPO, 'hooks/otto-goal-audit.mjs'), 'utf8');
  const compact = readFileSync(join(REPO, 'hooks/otto-goal-compact.mjs'), 'utf8');
  const lib = readFileSync(join(REPO, 'hooks/otto-goal-lib.mjs'), 'utf8');

  const CLASSIFIER_SHAPE = /function\s+\w*(classify|detect|infer)\w*(Drift|Pivot|Terminal|Retire|Amend)/i;
  for (const [label, src] of [['agents/otto-foreman.md', foreman], ['hooks/otto-goal-audit.mjs', audit], ['hooks/otto-goal-compact.mjs', compact], ['hooks/otto-goal-lib.mjs', lib]]) {
    assert(!CLASSIFIER_SHAPE.test(src), `${label}: must contain no drift/pivot/terminal-classifying function — found a shape matching one`);
  }

  // The only place "## Amendment history" may ever be WRITTEN is Otto's own
  // prose act, gated by an explicit human confirmation — never code. None of
  // the shipped hook scripts may write or even reference that heading.
  for (const [label, src] of [['hooks/otto-goal-audit.mjs', audit], ['hooks/otto-goal-compact.mjs', compact], ['hooks/otto-goal-lib.mjs', lib]]) {
    assert(!src.includes('Amendment history'), `${label}: must never write or reference "## Amendment history" — that is exclusively a human-confirmed prose act, never a hook's`);
  }

  // The human-decides rule must be stated verbatim, not paraphrased away in a future edit.
  assert(foreman.includes('the human decides. Always. Never a classifier.'), 'agents/otto-foreman.md must state the drift-vs-pivot rule verbatim');
});

// Write primitives this repo actually uses (see hooks/otto-state.mjs,
// hooks/otto-goal-lib.mjs) — whatever new one shows up, add it here.
const WRITE_FN_NAMES = ['writeFileSync', 'appendFileSync', 'atomicWrite', 'writeSync', 'createWriteStream'];

// Finds every `fnName(...)` call site in `src` and returns its start index
// plus the raw text of its FIRST argument (up to the first top-level comma,
// or the matching close-paren if there's only one arg) — depth-tracked
// across (), [], {} so a nested call like `goalFlagsPath(cwd)` or a
// destructured/templated argument doesn't cut the scan short.
function findCallArgs(src, fnName) {
  const calls = [];
  const pattern = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
  let m;
  while ((m = pattern.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    let firstArgEnd = -1;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 1 && firstArgEnd === -1) firstArgEnd = i;
    }
    const firstArg = src.slice(start, firstArgEnd === -1 ? i - 1 : firstArgEnd).trim();
    calls.push({ callStart: m.index, firstArg });
  }
  return calls;
}

// One-level trace: if the call's first argument is a bare identifier (e.g.
// `path`), find its NEAREST PRECEDING `const/let/var <name> = <expr>;` in the
// same file and resolve to `<expr>` instead — this is what actually reveals
// whether the write target came from goalPath() or goalFlagsPath() in this
// codebase's own style (`const path = goalFlagsPath(cwd); ...
// appendFileSync(path, ...)`), rather than trusting the bare variable name.
function resolveIdentifier(src, name, beforeIndex) {
  const declPattern = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*([^;]+);`, 'g');
  let m;
  let last = null;
  while ((m = declPattern.exec(src))) {
    if (m.index >= beforeIndex) break;
    last = m[1].trim();
  }
  return last;
}

const IS_BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// True if `expr` itself calls the goal-path-producing function or spells the
// goal file's literal name — the ONE real fact that must never hold for a
// write call's target in these files.
function resolvesToGoalPath(expr) {
  if (!expr) return false;
  return /\bgoalPath\s*\(/.test(expr) || expr.includes("'otto-goal.md'") || expr.includes('"otto-goal.md"');
}

record('negative (hardened): no write call in any goal-anchor hook resolves to .claude/otto-goal.md — the ONLY permitted write target is otto-goal-flags.log', () => {
  // This is the real structural fact Glitchtrap's grep verified by hand: not
  // "no function is NAMED like a classifier" (the regex-shape tripwire
  // above, which a differently-named function could slip past), but "no
  // write call's target argument, traced one level through variable
  // assignment, is ever the goal-path function or the goal file's literal
  // name" — the actual guarantee that active->retired can only ever happen
  // via Otto's own consented write, never a hook.
  const files = {
    'hooks/otto-goal-lib.mjs': readFileSync(join(REPO, 'hooks/otto-goal-lib.mjs'), 'utf8'),
    'hooks/otto-goal-compact.mjs': readFileSync(join(REPO, 'hooks/otto-goal-compact.mjs'), 'utf8'),
    'hooks/otto-goal-audit.mjs': readFileSync(join(REPO, 'hooks/otto-goal-audit.mjs'), 'utf8'),
    'hooks/otto-facts.mjs': readFileSync(join(REPO, 'hooks/otto-facts.mjs'), 'utf8'),
  };

  let checkedCallCount = 0;
  for (const [label, src] of Object.entries(files)) {
    for (const fnName of WRITE_FN_NAMES) {
      for (const { callStart, firstArg } of findCallArgs(src, fnName)) {
        checkedCallCount++;
        const resolved = IS_BARE_IDENTIFIER.test(firstArg)
          ? resolveIdentifier(src, firstArg, callStart) || firstArg
          : firstArg;
        assert(
          !resolvesToGoalPath(firstArg) && !resolvesToGoalPath(resolved),
          `${label}: a "${fnName}(...)" call targets the goal file itself (arg="${firstArg}"` +
            (resolved !== firstArg ? `, resolved="${resolved}"` : '') +
            `) — the ONLY permitted write target in these files is otto-goal-flags.log`
        );
      }
    }
  }
  // Anti-vacuity tooth: this suite's own fixtures (otto-goal-lib.mjs's
  // writeGoalFlag) DO call write primitives — if this ever finds zero call
  // sites, the scan itself broke (a renamed function, a moved file), not
  // that the codebase stopped writing anything.
  assert(checkedCallCount > 0, 'found zero write-call sites across the goal-anchor hooks — the scan itself is broken, not proof of anything');
});

record('negative: retirement is never inferred from wording — readActiveGoal never mutates the file, and completion wording alone leaves status untouched', () => {
  const projectDir = freshProjectDir();
  // A confirmed goal whose OWN text contains terminal-sounding wording
  // ("shipped," "no issues found") — exactly the phrasing that fooled two
  // earlier content classifiers in this codebase (otto-state.mjs's header).
  writeGoalFile(projectDir, {
    confirmedGoal: 'Ship the billing feature — shipped, no issues found, done.',
    originalAsk: 'build billing end to end',
  });
  const before = readFileSync(goalPath(projectDir), 'utf8');

  const goal = readActiveGoal(projectDir);
  assert(goal !== null, 'a well-formed active goal must still parse despite terminal-sounding wording inside it');
  assert(goal.status === 'active', `status must remain active — terminal wording inside the confirmed goal text must never flip it, got ${goal.status}`);

  runAudit(agentPayload({ prompt: 'shipped, no issues found, done', cwd: projectDir }));
  runCompact({ cwd: projectDir });

  const after = readFileSync(goalPath(projectDir), 'utf8');
  assert(after === before, 'no reader may ever mutate the goal file on disk — reading is not writing, and nothing here infers retirement');
  assert(readActiveGoal(projectDir).status === 'active', 'status must still read active after every reader has run against it');
});

record('negative: audit never blocks — writes a flag, returns nothing, never throws, regardless of what is missing', () => {
  const projectDir = freshProjectDir();
  writeGoalFile(projectDir);
  const result = runAudit(agentPayload({ prompt: 'no anchor, no contract line at all', cwd: projectDir }));
  assert(result === undefined, 'PostToolUse cannot block a tool call that already ran — run() must never return a permission-shaped value');
  assert(readFlagLines(projectDir).length === 1, 'exactly one flag line should have been written for the missing-everything dispatch');
});

record('negative/positive: audit checks verify= on the same footing as gear=/tier=/box= — flags a dispatch missing it, passes one that has it', () => {
  const projectDir = freshProjectDir();
  writeGoalFile(projectDir);
  const anchor = renderAnchorBlock(readActiveGoal(projectDir));

  // Missing verify= only — same shape as a dispatch missing gear/tier/box.
  const withoutVerify = `${anchor}\n\n[Dispatch contract] gear=feature tier=T2 box="one pass, then report"\n\nGo build it.`;
  assert(missingChecks(withoutVerify).includes('verify'), 'missingChecks must flag verify as missing when the contract line omits it');
  runAudit(agentPayload({ prompt: withoutVerify, cwd: projectDir }));
  const flaggedLines = readFlagLines(projectDir);
  assert(flaggedLines.length === 1, 'a dispatch missing only verify= should still produce exactly one flag line');
  assert(flaggedLines[0].includes('verify'), `flag line should record the missing verify field, got: ${flaggedLines[0]}`);

  // Same dispatch, verify= present — must not be flagged at all (proves the
  // check has teeth in both directions, not just "always flags").
  const projectDir2 = freshProjectDir();
  writeGoalFile(projectDir2);
  const anchor2 = renderAnchorBlock(readActiveGoal(projectDir2));
  const withVerify = `${anchor2}\n\n[Dispatch contract] gear=feature tier=T2 box="one pass, then report" verify="run test-otto-goal.mjs, expect green"\n\nGo build it.`;
  assert(!missingChecks(withVerify).includes('verify'), 'missingChecks must not flag verify when the contract line includes it');
  runAudit(agentPayload({ prompt: withVerify, cwd: projectDir2 }));
  assert(readFlagLines(projectDir2).length === 0, 'a dispatch with the full contract line including verify= must never be flagged');
});

record('negative: idempotency-detection primitive — a prompt already containing ANCHOR_SENTINEL is correctly recognized as anchored', () => {
  // hooks/otto-goal-inject.mjs itself is deferred (build-task-1's spike has
  // not run) — but the SAME substring check its eventual idempotency guard
  // depends on is the one this build's audit backstop already uses. Proving
  // it here proves neither the future inject hook nor this build's audit
  // would ever double-flag or double-anchor a prompt that already carries it.
  const goal = { confirmedGoal: 'x', originalAsk: 'y' };
  const alreadyAnchored = `${renderAnchorBlock(goal)}\n\n[Dispatch contract] gear=feature tier=T2 box="one pass"\nrest of the prompt`;
  const missing = missingChecks(alreadyAnchored);
  assert(!missing.includes('anchor'), 'a prompt already containing ANCHOR_SENTINEL must never be flagged as missing the anchor');
});

record('negative: single-mutator invariant — no hook currently emits updatedInput (the deferred inject hook has not been built)', () => {
  const hookDir = join(REPO, 'hooks');
  const mjsFiles = readdirSync(hookDir).filter((f) => f.endsWith('.mjs'));
  const emitters = mjsFiles.filter((f) => readFileSync(join(hookDir, f), 'utf8').includes('updatedInput'));
  assert(emitters.length === 0, `no shipped hook should emit updatedInput yet (§4.A's inject hook is deferred), found: ${emitters.join(', ')}`);

  const validateSrc = readFileSync(join(REPO, 'scripts/validate.mjs'), 'utf8');
  assert(validateSrc.includes('PreToolUse') && validateSrc.includes('updatedInput'),
    'scripts/validate.mjs must already carry the single-PreToolUse-updatedInput-emitter gate, dormant until §4.A adds an entry');
});

record('negative: stale-goal flags do not leak forward into a new goal\'s count', () => {
  const projectDir = freshProjectDir();
  // An OLD goal's flags, dated before the NEW goal's confirmed date.
  writeFileSync(goalFlagsPath(projectDir), [
    '2026-06-01 general-purpose old effort: missing=gear,box',
    '2026-06-02 general-purpose old effort: missing=tier',
  ].join('\n') + '\n', 'utf8');
  // A brand-new goal, confirmed AFTER those old flags.
  writeGoalFile(projectDir, { confirmed: '2026-07-10' });
  assert(countGoalFlags(projectDir) === 0, 'flags dated before the active goal\'s own confirmed date must never inflate its count');
});

// ================================================================ POSITIVE

record('positive: feature/build ask fires end-to-end — pin, dispatch carries anchor + contract line, audit clean, reader reflects it', () => {
  const projectDir = freshProjectDir();
  // "Pin" — Otto's own write, simulated here as the fixture (capture/confirm are prose, not code).
  writeGoalFile(projectDir, { confirmedGoal: 'Ship the subscription schema and webhook handler.', originalAsk: 'build subscription billing end to end' });

  const goal = readActiveGoal(projectDir);
  assert(goal.status === 'active', 'pinned goal must read active');
  assert(goal.confirmedGoal.includes('subscription schema'), 'confirmed goal text must round-trip verbatim');

  // "Inject" (hand-composed, §4.B) — the exact block Otto would prepend.
  const anchor = renderAnchorBlock(goal);
  assert(anchor.startsWith(ANCHOR_SENTINEL), 'rendered anchor must start with the sentinel header');

  const prompt = `${anchor}\n\n[Dispatch contract] gear=feature tier=T2 box="one pass, then report" verify="run test-otto-goal.mjs, expect green"\n\nGo build it.`;
  runAudit(agentPayload({ prompt, cwd: projectDir }));
  assert(readFlagLines(projectDir).length === 0, 'a well-formed dispatch (anchor + full contract line) must never be flagged');

  // Compaction re-injects the identical text.
  const compactOutput = runCompact({ cwd: projectDir });
  assert(compactOutput === anchor, 'compaction re-injection must be byte-identical to the hand-composed anchor for the same goal');
});

record('positive: amend on explicit yes — the reader always surfaces the CURRENT confirmed goal, never text buried in amendment history', () => {
  const projectDir = freshProjectDir();
  writeGoalFile(projectDir, {
    confirmedGoal: 'Build the new dashboard with the redesigned nav.',
    originalAsk: 'redo the dashboard',
    amendmentHistory: '2026-07-12 — pivoted from "Build the old dashboard" to "Build the new dashboard with the redesigned nav." — confirmed by human',
  });
  const goal = readActiveGoal(projectDir);
  assert(goal.confirmedGoal === 'Build the new dashboard with the redesigned nav.', 'the reader must surface the CURRENT confirmed goal, not the pre-amendment text');
  assert(!goal.confirmedGoal.includes('old dashboard'), 'the retired pre-amendment text must never be what a fresh dispatch carries');
  const anchor = renderAnchorBlock(goal);
  assert(anchor.includes('new dashboard'), 'the next dispatch\'s anchor must carry the NEW confirmed text');
  assert(!anchor.includes('old dashboard'), 'the next dispatch\'s anchor must never carry the OLD, superseded text');
});

record('positive: compaction hook re-injects — byte-identical to renderAnchorBlock, empty when no active goal, includes goal_flags when flags exist', () => {
  const withGoal = freshProjectDir();
  writeGoalFile(withGoal);
  const goal = readActiveGoal(withGoal);
  assert(runCompact({ cwd: withGoal }) === renderAnchorBlock(goal), 'compact hook output must be byte-identical to renderAnchorBlock for the same goal, no flags case');

  writeGoalFlag(withGoal, '2026-07-15 general-purpose x: missing=gear');
  writeGoalFlag(withGoal, '2026-07-16 general-purpose y: missing=tier');
  const withFlags = runCompact({ cwd: withGoal });
  assert(withFlags === `${renderAnchorBlock(goal)}\ngoal_flags=2`, `expected the anchor plus a trailing goal_flags=2 line, got:\n${withFlags}`);

  const noGoal = freshProjectDir();
  assert(runCompact({ cwd: noGoal }) === '', 'no active goal -> compact hook must produce empty stdout');
});

record('positive: audit reader agrees with the writer — otto-facts.mjs and otto-goal-compact.mjs both render goal_flags=3 via the same countGoalFlags call', () => {
  const projectDir = freshProjectDir();
  writeGoalFile(projectDir, { confirmed: '2026-07-01' });
  writeGoalFlag(projectDir, '2026-07-02 general-purpose a: missing=gear');
  writeGoalFlag(projectDir, '2026-07-03 general-purpose b: missing=tier,box');
  writeGoalFlag(projectDir, '2026-07-04 bitforge-engineer c: missing=anchor');

  assert(countGoalFlags(projectDir) === 3, 'countGoalFlags should report exactly 3');

  const facts = computeFacts({ cwd: projectDir }, { env: { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'otto-goal-config-')) } });
  assert(facts.goal_flags === 3, `otto-facts.mjs's computeFacts() should carry goal_flags=3, got ${facts.goal_flags}`);
  assert(formatFacts(facts).includes('goal_flags=3'), 'otto-facts.mjs formatFacts() wire output must include goal_flags=3');

  const compactOutput = runCompact({ cwd: projectDir });
  assert(compactOutput.endsWith('goal_flags=3'), `otto-goal-compact.mjs should also render goal_flags=3, got:\n${compactOutput}`);
});

record('positive: real subprocess — otto-goal-compact.mjs invoked as a real node process produces the same output as the direct call', () => {
  const projectDir = freshProjectDir();
  writeGoalFile(projectDir);
  const goal = readActiveGoal(projectDir);
  const result = spawnSync(process.execPath, [COMPACT_HOOK_PATH], {
    input: JSON.stringify({ cwd: projectDir }),
    encoding: 'utf8',
  });
  assert(result.status === 0, `subprocess should exit 0, got ${result.status}`);
  assert(result.stdout.trim() === renderAnchorBlock(goal), `subprocess stdout should match renderAnchorBlock, got:\n${result.stdout}`);
});

record('positive: real subprocess — otto-goal-audit.mjs invoked as a real node process writes the same flag line the direct call would', () => {
  const projectDir = freshProjectDir();
  writeGoalFile(projectDir);
  const payload = agentPayload({ prompt: 'no contract line here at all', cwd: projectDir, subagentType: 'bitforge-engineer', description: 'subprocess test' });
  const result = spawnSync(process.execPath, [AUDIT_HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  assert(result.status === 0, `subprocess should exit 0, got ${result.status}`);
  const lines = readFlagLines(projectDir);
  assert(lines.length === 1, 'the real subprocess invocation should have written exactly one flag line');
  assert(lines[0].includes('bitforge-engineer') && lines[0].includes('subprocess test'), `flag line should carry the subagent_type and description verbatim, got: ${lines[0]}`);
});

// ================================================================ BOUNDARY

record('boundary: ANCHOR_CHAR_CAP — a deliberately oversized record renders truncated, header untouched, never crashes, never corrupts', () => {
  const goal = {
    confirmedGoal: 'g'.repeat(400),
    originalAsk: 'a'.repeat(400),
  };
  const block = renderAnchorBlock(goal);
  assert(block.startsWith(ANCHOR_SENTINEL), 'header must survive untouched even when the content is truncated');
  const contentAfterHeader = block.slice(ANCHOR_SENTINEL.length + 1); // +1 for the \n
  assert(Array.from(contentAfterHeader).length === ANCHOR_CHAR_CAP, `content portion should be truncated to exactly ${ANCHOR_CHAR_CAP} code points, got ${Array.from(contentAfterHeader).length}`);
});

record('boundary: ANCHOR_CHAR_CAP fencepost — exactly at the cap is untouched, one over truncates, code-point-safe across a surrogate pair', () => {
  // Build content that lands exactly at the cap, then one further, straddling
  // an emoji (a genuine surrogate pair) right at the cutoff — the same
  // adversarial placement otto-state.mjs's summarize() test already proved
  // safe for this exact technique (Array.from().slice().join()).
  const prefix = 'Goal: '; // renderAnchorBlock's own literal prefix
  const askPrefix = '\nAsk: ';
  const fixedLen = prefix.length + askPrefix.length;
  const padNeeded = ANCHOR_CHAR_CAP - fixedLen - 1; // leave room for one emoji code point at the very boundary
  const goalText = 'x'.repeat(padNeeded);
  const atCap = { confirmedGoal: goalText, originalAsk: '😀' }; // lands exactly at ANCHOR_CHAR_CAP code points
  const blockAtCap = renderAnchorBlock(atCap);
  const contentAtCap = blockAtCap.slice(ANCHOR_SENTINEL.length + 1);
  assert(Array.from(contentAtCap).length === ANCHOR_CHAR_CAP, `expected exactly at the cap, got ${Array.from(contentAtCap).length}`);
  assert(contentAtCap.includes('😀'), 'the emoji at exactly the cap boundary must survive whole, not split');

  const overCap = { confirmedGoal: goalText, originalAsk: '😀😀' }; // one code point over
  const blockOverCap = renderAnchorBlock(overCap);
  const contentOverCap = blockOverCap.slice(ANCHOR_SENTINEL.length + 1);
  assert(Array.from(contentOverCap).length === ANCHOR_CHAR_CAP, `expected truncation to exactly the cap, got ${Array.from(contentOverCap).length}`);
  // No unpaired surrogate anywhere in the truncated output — proves the cut
  // never landed inside a surrogate pair.
  const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  assert(!UNPAIRED_SURROGATE.test(contentOverCap), 'truncation must never split a surrogate pair, producing a corrupted lone half');
});

record('boundary: AUDIT_LOG_CAP — 25 writes leaves exactly the most recent 20, oldest 5 evicted, no crash, no corruption', () => {
  const projectDir = freshProjectDir();
  for (let i = 1; i <= 25; i++) {
    writeGoalFlag(projectDir, `2026-07-${String(i).padStart(2, '0')} general-purpose item-${i}: missing=gear`);
  }
  const lines = readFlagLines(projectDir);
  assert(lines.length === AUDIT_LOG_CAP, `expected exactly ${AUDIT_LOG_CAP} lines, got ${lines.length}`);
  for (let i = 1; i <= 5; i++) {
    assert(!lines.some((l) => l.includes(`item-${i}:`)), `item-${i} should have been evicted (oldest 5), found: ${lines.find((l) => l.includes(`item-${i}:`))}`);
  }
  for (let i = 6; i <= 25; i++) {
    assert(lines.some((l) => l.includes(`item-${i}:`)), `item-${i} should have survived the cap`);
  }
});

// ---------------------------------------------------------------- run

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
