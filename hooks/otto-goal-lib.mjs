// Shared goal-anchor library — hooks/otto-goal-lib.mjs (NEW, v22.11.0).
//
// FIRST CROSS-HOOK-FILE IMPORT IN THIS PLUGIN, AND IT'S CIRCULAR. Every other
// hook script (otto-state.mjs, otto-trace.mjs) duplicates its small shared
// helpers (bareType(), PERSONA_ROOT_MARKERS) rather than importing another
// hook, because each is invoked standalone via `node <file>` per hooks.json —
// see otto-trace.mjs's own header. docs/spec-goal-contract.md's Cohesion note
// item 6 named cross-hook imports as a real, deliberate departure worth
// TESTING before relying on it, not assuming it. GATE 2 (TASKS.md) ran that
// test empirically first, with two throwaway files mirroring this exact
// shape (one importing the other, and being called back into — the same
// circular reference this file and otto-facts.mjs now have for real),
// invoked via a real `node hooks/<file>.mjs` child process. It resolved and
// executed correctly: ES module function declarations are hoisted before any
// import's side effects run, so each side of the cycle sees a live,
// initialized binding for the function it calls, regardless of which module
// started evaluating first. Result recorded in TASKS.md's Gate 2 section.
//
// This module is a LIBRARY, not a hook — it has no stdin-reading main-module
// block, is never itself registered in hooks.json, and is only ever
// imported. Exports: readActiveGoal, renderAnchorBlock, ANCHOR_SENTINEL,
// ANCHOR_CHAR_CAP, goalFlagsPath, countGoalFlags, writeGoalFlag,
// AUDIT_LOG_CAP. Consumed by hooks/otto-goal-compact.mjs (SessionStart/
// compact), hooks/otto-goal-audit.mjs (PostToolUse), and hooks/otto-facts.mjs
// (SessionStart/startup, the goal_flags=N reader) — one source, so the
// injected anchor, the post-compaction anchor, and the flag count can never
// independently drift (spec §4.A).
//
// REUSE, NOT RE-COPY: cwdPersonaRoot is imported from hooks/otto-facts.mjs,
// not re-implemented — a third hardcoded PERSONA_ROOT_MARKERS array is
// exactly the scar this shared lib exists to stop repeating (otto-state.mjs
// and otto-facts.mjs already carry two independently-hardcoded copies; see
// that file's own comment and docs/spec-goal-contract.md's Cohesion note
// item 5).
//
// FAIL-SILENT ON EVERYTHING, same footing as otto-state.mjs / otto-facts.mjs:
// a missing file, a malformed record, an exhausted lock — readActiveGoal
// returns null, countGoalFlags returns 0, writeGoalFlag no-ops. A goal anchor
// is a strong convenience, never the thing that breaks a dispatch or a
// session.
//
// §4.A SEAM (deliberately left for when the deferred inject hook lands):
// nothing here reads tool_input or makes an injection decision — that stays
// in the not-yet-built hooks/otto-goal-inject.mjs, gated on build-task-1's
// spike (docs/spec-goal-contract.md §4). renderAnchorBlock's output is the
// one text both that eventual hook and Otto's own hand-composition (agents/
// otto-foreman.md, under the current §4.B fallback) must agree on
// byte-for-byte — nothing about this file's shape needs to change when §4.A
// ships; the inject hook simply becomes a third consumer of it.

import {
  readFileSync,
  existsSync,
  mkdirSync,
  rmdirSync,
  renameSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { cwdPersonaRoot } from './otto-facts.mjs';

// The literal header every rendered anchor block opens with. This IS the
// idempotency sentinel §4.A's inject hook will check for ("if
// tool_input.prompt already contains ANCHOR_SENTINEL, no-op") and the same
// substring this build's §4.B audit backstop checks for under the fallback
// path — one string serves both jobs: visual framing for a human/model
// reading the dispatch prompt, and the exact marker any deterministic check
// tests for. Single source: scripts/validate.mjs's drift gate fails the
// build if this constant is ever defined a second time anywhere in hooks/.
export const ANCHOR_SENTINEL = '[Goal anchor — do not drop this context]';

// Caps the confirmed-goal + verbatim-ask portion of the rendered block —
// NEVER the header above. Small next to otto-facts.mjs's PROFILE_CHAR_CAP
// (2,000) on purpose: that budget is paid once per session; this one is paid
// on EVERY dispatch while a goal is active (spec §4.A, §7).
export const ANCHOR_CHAR_CAP = 500;

// Flag-sink cap: recency eviction only, same "no clear path" grammar as
// otto-state.mjs's CAP=8, scaled up because this is a diagnostic log a human
// rarely reads directly, not a relay record (spec §6.1).
export const AUDIT_LOG_CAP = 20;

const LOCK_RETRY_ATTEMPTS = 10;
const LOCK_RETRY_DELAY_MS = 50;

function goalPath(cwd) {
  return join(cwd, '.claude', 'otto-goal.md');
}

export function goalFlagsPath(cwd) {
  return join(cwd, '.claude', 'otto-goal-flags.log');
}

// Own lock directory, distinct from otto-state.mjs's `.otto-state.lock`, so
// the two PostToolUse hooks on the same "Task" matcher never contend with
// each other (spec §6.1, Cohesion note item 8).
function lockDir(cwd) {
  return join(cwd, '.claude', '.otto-goal.lock');
}

// Genuine synchronous sleep, no busy-wait — identical technique to
// otto-state.mjs's sleepMs(); this script runs once per hook invocation and
// exits, it is never a long-lived process.
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(dir) {
  for (let i = 0; i < LOCK_RETRY_ATTEMPTS; i++) {
    try {
      mkdirSync(dir);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') return false; // unexpected error: fail closed, fail silent
      if (i < LOCK_RETRY_ATTEMPTS - 1) sleepMs(LOCK_RETRY_DELAY_MS);
    }
  }
  return false;
}

function releaseLock(dir) {
  try {
    rmdirSync(dir);
  } catch {
    // Fail soft — a lock dir that won't remove is a wart for the next
    // acquirer to retry through, never a crash for this one.
  }
}

function atomicWrite(path, content) {
  const tmp = `${path}.tmp-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path); // fs.renameSync overwrites the destination on Windows too
}

// ------------------------------------------------------------ parse the goal

// Extracts the body of a `## Heading` section: everything after the heading
// line up to the next `## ` heading or end of file, trimmed. Matches the
// artifact shape in docs/spec-goal-contract.md §3 exactly.
function sectionBody(text, heading) {
  const idx = text.indexOf(heading);
  if (idx === -1) return null;
  const afterHeading = text.slice(idx + heading.length);
  const nextHeadingIdx = afterHeading.search(/\n##\s/);
  const body = nextHeadingIdx === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIdx);
  const trimmed = body.trim();
  return trimmed.length ? trimmed : null;
}

// Reads and parses `.claude/otto-goal.md`. Returns null on ANY of: `<cwd>/
// .claude` is a foreign persona root, the file is absent, `status` is not
// `active`, or the record fails to parse a confirmed date / confirmed goal /
// original ask. NEVER throws — every branch is a plain return, wrapped in
// one outer try/catch for anything genuinely unexpected (a read racing a
// delete, etc).
export function readActiveGoal(cwd) {
  try {
    const claudeDir = join(cwd, '.claude');
    if (cwdPersonaRoot(claudeDir)) return null;

    const path = goalPath(cwd);
    if (!existsSync(path)) return null;

    const raw = readFileSync(path, 'utf8');
    // Strip the leading HTML comment header, same convention as
    // otto-state.mjs's loadFile().
    let body = raw;
    if (raw.trimStart().startsWith('<!--')) {
      const endIdx = raw.indexOf('-->');
      if (endIdx !== -1) body = raw.slice(endIdx + 3);
    }

    const status = (body.match(/^status:\s*(.+)$/m) || [])[1]?.trim();
    if (status !== 'active') return null;

    const confirmed = (body.match(/^confirmed:\s*(\d{4}-\d{2}-\d{2})/m) || [])[1];
    const gear = (body.match(/^gear:\s*(.+)$/m) || [])[1]?.trim() || null;
    const confirmedGoal = sectionBody(body, '## Confirmed goal');
    const originalAsk = sectionBody(body, '## Original ask (verbatim)');

    if (!confirmed || !confirmedGoal || !originalAsk) return null; // malformed record

    return { status, confirmed, gear, confirmedGoal, originalAsk };
  } catch {
    return null;
  }
}

// Code-point-safe truncation — Array.from().slice().join(), the same
// technique otto-state.mjs's summarize() uses, never split a surrogate pair
// (an emoji, some CJK) into a corrupted replacement-character glyph.
function truncateCodePoints(s, cap) {
  const points = Array.from(s);
  if (points.length <= cap) return s;
  return points.slice(0, cap).join('');
}

// Renders the exact block every dispatch (§4.B hand-composition today; §4.A's
// inject hook once it lands) and every post-compaction re-injection carries.
// Truncates the CONTENT portion (confirmed goal + verbatim ask) to
// ANCHOR_CHAR_CAP code points — the `[Goal anchor — do not drop this
// context]` header itself is never touched or counted against the cap
// (spec §4.A, §7 "Boundary — ANCHOR_CHAR_CAP").
export function renderAnchorBlock(goal) {
  const content = `Goal: ${goal.confirmedGoal}\nAsk: ${goal.originalAsk}`;
  const truncated = truncateCodePoints(content, ANCHOR_CHAR_CAP);
  return `${ANCHOR_SENTINEL}\n${truncated}`;
}

// ------------------------------------------------------------ flag sink

// Appends one flagged line, capped at AUDIT_LOG_CAP by recency eviction (the
// 21st write drops the oldest) — same "no clear path, cap-N recency only"
// grammar as otto-state.mjs's CAP=8, scaled up (spec §6.1). Fail-silent on
// every error. On lock exhaustion, degrades to a raw append (unconditional,
// same shape as otto-state.mjs's appendDegrade) — the next clean write reads
// it back in and re-applies the cap.
export function writeGoalFlag(cwd, line) {
  try {
    const claudeDir = join(cwd, '.claude');
    if (!existsSync(claudeDir)) return; // no project .claude dir to flag into
    const path = goalFlagsPath(cwd);
    const dir = lockDir(cwd);

    const gotLock = acquireLock(dir);
    if (!gotLock) {
      try {
        appendFileSync(path, line + '\n', 'utf8');
      } catch {
        // fail-silent
      }
      return;
    }
    try {
      const existing = existsSync(path)
        ? readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
        : [];
      existing.push(line);
      const capped = existing.slice(-AUDIT_LOG_CAP);
      atomicWrite(path, capped.join('\n') + '\n');
    } finally {
      releaseLock(dir);
    }
  } catch {
    // fail-silent, same footing as every other write in this plugin.
  }
}

// Counts flag-log lines dated on or after the active goal's own `confirmed:`
// date — scoping stops a retired goal's stale flags from inflating a
// brand-new goal's count (spec §6.1, Cohesion note item 4). Returns 0
// whenever there is no active goal, no flag file, or anything fails to read.
export function countGoalFlags(cwd) {
  try {
    const goal = readActiveGoal(cwd);
    if (!goal) return 0;
    const path = goalFlagsPath(cwd);
    if (!existsSync(path)) return 0;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
    const cutoff = goal.confirmed;
    return lines.filter((l) => {
      const d = (l.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1];
      return d && d >= cutoff;
    }).length;
  } catch {
    return 0;
  }
}
