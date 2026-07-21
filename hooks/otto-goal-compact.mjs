#!/usr/bin/env node
// Otto goal-anchor compaction preservation — SessionStart hook, NEW
// `matcher: "compact"` entry (hooks.json), independent of otto-facts.mjs's
// existing `matcher: "startup"` entries.
//
// WHY A THIRD, SEPARATE SessionStart HOOK, NOT FOLDED INTO otto-facts.mjs:
// otto-facts.mjs is startup-scoped and comparatively heavy (seven core facts,
// the first-run inventory gather, the profile-budget computation) — almost
// none of that matters immediately after a compaction, where the only thing
// that matters is getting the goal back in front of Otto before his next
// reply. hooks.json already runs TWO separate SessionStart hooks on
// `matcher: "startup"` deliberately (see otto-facts.mjs's own header, "TWO
// SESSIONSTART HOOKS, DELIBERATELY") — a third, narrowly-scoped SessionStart
// hook on a different matcher is the same pattern, not a new one
// (docs/spec-goal-contract.md §4.C).
//
// WHAT THIS CLOSES: the whole feature's root cause (docs/spec-goal-contract.md
// §1) is Otto's OWN context eroding across a long session — not a subagent's.
// Auto-compaction squeezes exactly that context. This hook forces a
// deterministic re-read of `.claude/otto-goal.md` and echoes the anchor block
// to stdout — the same proven re-injection channel otto-facts.mjs's
// `[RobotInc facts]` block already uses for SessionStart. Independent of how
// §4's injection spike resolves (§4.A inject hook vs §4.B fallback): this
// hook works identically either way, because it reads the goal file directly
// via the shared lib, not via anything the (possibly unbuilt) inject hook
// does.
//
// PARENT-SESSION-ONLY, and that is sufficient: a subagent's context does not
// survive past its own Task call, so no subagent ever spans a compaction. A
// post-compaction subagent gets the anchor fresh on its very next dispatch
// regardless (§4.B hand-composition today; §4.A's inject hook once it lands).
//
// No-op, emit nothing, exit 0 when the goal file is absent, `status` is not
// `active`, or the project is a persona root — same guard, same shared lib,
// same reasoning as every other reader of this file. FAIL-SILENT on all
// errors, same footing as every other hook in this plugin: a goal anchor is
// a strong convenience, never the thing that breaks a session re-open.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readActiveGoal, renderAnchorBlock, countGoalFlags } from './otto-goal-lib.mjs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Pure(ish) computation, no stdout — exported for direct testing (mirrors
// hooks/otto-facts.mjs's computeFacts()/formatFacts() split). Returns '' when
// there is nothing to say (no active goal, absent, retired, or persona root).
export function run(payload) {
  const cwd = payload.cwd || process.cwd();
  const goal = readActiveGoal(cwd);
  if (!goal) return '';

  const lines = [renderAnchorBlock(goal)];
  // Same countGoalFlags() call otto-facts.mjs's reader uses — one source, so
  // the two SessionStart readers can never disagree about the count
  // (spec §6.1, "LAND THE READER WITH THE WRITER").
  const flags = countGoalFlags(cwd);
  if (flags > 0) lines.push(`goal_flags=${flags}`);
  return lines.join('\n');
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  try {
    let payload = {};
    try {
      payload = JSON.parse(readStdin() || '{}');
    } catch {
      // Malformed or empty stdin: cwd falls back to process.cwd() below, same
      // as every other hook in this plugin.
    }
    const output = run(payload);
    if (output) console.log(output);
  } catch {
    // Fail hard-silent: print NOTHING on an unexpected error, same footing as
    // otto-facts.mjs's own main-module block — a half-written anchor block is
    // worse than none.
  }
  process.exit(0);
}
