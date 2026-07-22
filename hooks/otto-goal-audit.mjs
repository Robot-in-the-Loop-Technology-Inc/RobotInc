#!/usr/bin/env node
// Otto goal-anchor dispatch audit — PostToolUse hook, appended as a SECOND
// entry in the existing `"Task"` matcher's `hooks` array in hooks.json
// (alongside hooks/otto-state.mjs — hooks.json already proves this pattern is
// additive: SubagentStop carries two hook entries today the same way).
//
// THE SAME TRAP hooks/otto-state.mjs's header documents: gate on
// `payload.tool_name === 'Agent'`, NOT `'Task'` — the hooks.json matcher
// string and the delivered event's own `tool_name` field are different
// strings (docs/hook-events.md). This hook copies that gate, it does not
// relearn it.
//
// FIRING CONDITION: only when `.claude/otto-goal.md` has `status: active` for
// THIS project (via readActiveGoal(cwd), the shared lib) — no active goal,
// no-op entirely, no flag line, nothing. This is the gate a write-only,
// un-gated audit would be missing: without it, a mixed-gear project (or one
// that never had a goal) would get flagged on every trivial dispatch that
// correctly never carried the contract line (spec §6.1).
//
// CHECK-SET, CURRENT BUILD (§4.B — prompt-discipline fallback; no deterministic
// inject hook exists yet, build-task-1's spike is still pending): checks for
// ANCHOR_SENTINEL presence (the only backstop there is, since nothing injects
// it mechanically) AND gear=/tier=/box=/verify= substrings. Pure
// string-presence, no semantic validation of WHICH gear/tier was chosen or
// WHAT the verify method actually is, no model, and NEVER a permission
// decision — PostToolUse cannot block a tool call that already ran.
//
// verify= IS THE SAME CLASS OF CHECK AS gear=/tier=/box=, not a new one: it
// only ever tests presence of the substring on the dispatch PROMPT Otto
// composed before the dispatch went out. There is deliberately no equivalent
// check anywhere on Otto's own outgoing reply text (the checkpoint/final-
// summary tie-back) — that would require classifying free-form prose for
// whether it "really" named a verification method, the same natural-language
// frontier that killed the terminal-clear detector twice (otto-state.mjs's
// header). Resurfacing verification at the tie-back stays prompt-discipline,
// in agents/otto-foreman.md, on purpose — do not add a Stop-hook or any other
// check on Otto's own messages here or anywhere else.
//
// §4.A SEAM (read this before touching the check-set): once build-task-1's
// spike confirms hooks/otto-goal-inject.mjs works and that hook ships, this
// check-set NARROWS — drop the ANCHOR_SENTINEL branch entirely. Two reasons,
// both from docs/spec-goal-contract.md §6.1: (1) the inject hook already
// guarantees the anchor deterministically, so checking for it here is inert;
// (2) build-task-1 criterion (f) asks whether PostToolUse sees the PRE- or
// POST-mutation prompt — if pre-mutation, an anchor-presence check here would
// false-flag EVERY dispatch, not just genuine misses, because this hook would
// be reading the prompt before the inject hook ever touched it. When that
// spike lands, delete the `missing.push('anchor')` branch below; gear=/tier=/
// box=/verify= stay exactly as they are, unconditionally, either way — they
// are Otto's live per-dispatch judgment regardless of which way §4 resolves.
//
// THE WRITE: one flagged line per dispatch that misses any check, appended to
// `.claude/otto-goal-flags.log` via the shared lib's writeGoalFlag() — cap-20
// recency eviction, own lock directory (`.claude/.otto-goal.lock`), distinct
// from otto-state.mjs's `.otto-state.lock`, so the two PostToolUse hooks on
// the same matcher never contend. FAIL-SILENT on all errors, same footing as
// every other hook in this plugin.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readActiveGoal, writeGoalFlag, ANCHOR_SENTINEL } from './otto-goal-lib.mjs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Pure string-presence checks against the dispatched prompt. Exported for
// direct testing. See the §4.A SEAM comment above before editing this list —
// the ANCHOR_SENTINEL branch is the one that drops when the deferred inject
// hook lands; gear=/tier=/box=/verify= are permanent regardless of §4's
// outcome (they are Otto's live per-dispatch judgment, never a hook's to
// pre-fill). verify= is identical in kind to the other three: substring
// presence only, no reading of Otto's own reply text, ever.
export function missingChecks(prompt) {
  const missing = [];
  if (!prompt.includes(ANCHOR_SENTINEL)) missing.push('anchor');
  if (!/gear=/.test(prompt)) missing.push('gear');
  if (!/tier=/.test(prompt)) missing.push('tier');
  if (!/box=/.test(prompt)) missing.push('box');
  if (!/verify=/.test(prompt)) missing.push('verify');
  return missing;
}

// Takes an already-parsed hook payload and performs the (possible) flag
// write. Exported for direct testing, same convention as hooks/otto-state.mjs's
// exported run() — real filesystem I/O against a scratch cwd, no mocking.
// Never returns anything meaningful and never throws outward: this hook can
// only ever have one visible effect (a flag line appended), and only that.
export function run(payload) {
  if (payload.tool_name !== 'Agent') return; // NOT "Task" — see docs/hook-events.md

  const cwd = payload.cwd || process.cwd();
  const goal = readActiveGoal(cwd);
  if (!goal) return; // no active goal in this project — no-op entirely, no flag line

  const prompt = payload.tool_input?.prompt;
  if (typeof prompt !== 'string') return; // nothing to check against

  const missing = missingChecks(prompt);
  if (!missing.length) return; // contract line and anchor both present — nothing to flag

  const subagentType = payload.tool_input?.subagent_type || '(unknown)';
  const description = payload.tool_input?.description || '(untitled)';
  const date = new Date().toISOString().slice(0, 10);
  // Raw subagent_type, deliberately NOT resolved through a ROBOTS map (spec
  // §6.1, Cohesion note item 7 — a diagnostic flag line has no need for a
  // pretty badge the way a human-facing relay line does; one fewer place a
  // future hire can go missing from).
  const line = `${date} ${subagentType} ${description}: missing=${missing.join(',')}`;
  writeGoalFlag(cwd, line);
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  try {
    const payload = JSON.parse(readStdin() || '{}');
    run(payload);
  } catch {
    // Fail soft, always — malformed stdin, a payload shape that shifted
    // between Claude Code versions, anything. This is a diagnostic backstop;
    // it must never be the thing that breaks a session.
  }
  process.exit(0);
}
