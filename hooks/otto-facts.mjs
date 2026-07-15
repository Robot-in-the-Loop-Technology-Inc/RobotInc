#!/usr/bin/env node
// Otto session-open facts injector — SessionStart hook (matcher: startup).
//
// THE BUG THIS FILE EXISTS TO KILL: the session-open protocol needed the model
// to resolve `<config>` (CLAUDE_CONFIG_DIR if set, else ~/.claude) on its own,
// and a model has no direct read on its own process environment — the only
// way to check an env var is a Bash command (`echo $CLAUDE_CONFIG_DIR` or
// similar). Read tool calls do not prompt for permission; Bash calls do. So a
// brand-new user's very first turn — before they have even met the crew —
// was a Bash permission dialog, screenshot-verified live. This hook resolves
// `<config>` and every existence fact the protocol needs mechanically, in
// Node, and injects them as trusted context, so the model never has to shell
// out to find out what it's looking at.
//
// SECOND BUG THIS KILLS: the session-open protocol's override (a) treats
// `./.claude/otto-state.md` (cwd-relative) as evidence of a prior relationship
// without checking whether cwd IS the config dir wearing a project hat — the
// exact same home-persona collision hooks/otto-state.mjs already guards
// against on the WRITE side (see that file's `localDir !== configDir` check).
// A user working from their home directory has `<cwd>/.claude` resolve to the
// SAME path as `<config>`, so override (a) was reading the user's own
// per-machine state file as "project evidence" and silently suppressing a
// brand-new user's first-meeting card. `cwd_is_config_dir` below is exactly
// the fact the protocol needs to close this gap, computed once, mechanically,
// realpath-normalized so a Windows path-separator or case difference can't
// produce a false negative.
//
// TWO SESSIONSTART HOOKS, DELIBERATELY: this one and the existing static
// `echo` trigger are registered as SEPARATE entries in hooks.json, not
// merged into one. The echo trigger has zero runtime dependency and MUST
// keep working on a machine with no Node — it is the mechanism that makes
// the whole session-open protocol fire at all. This hook is Node-only and
// best-effort: if Node is absent, this hook silently never runs, the model
// gets no facts block, and falls through to the pre-existing resolve-it-
// yourself path (including its Bash-permission-prompt cost on a truly
// config-dir-less environment) — a real but pre-existing behavior, not a
// regression this hook introduces. Trigger survives node-loss; facts are a
// convenience layered on top, same footing as otto-trace.mjs and
// otto-state.mjs.
//
// EXISTENCE CHECKS ONLY. Never reads file CONTENTS — not the sentinel's
// timestamp, not the profile's seats key, nothing. Parsing contents into the
// facts block is explicitly out of scope for this build (v22.9.0, if ever).
//
// Config-dir resolution pattern reused verbatim from hooks/otto-trace.mjs.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { pathToFileURL } from 'node:url';

export const FACTS_HEADER = '[RobotInc facts] authoritative -- do NOT shell out to recompute:';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// realpath when the path exists (resolves symlinks, canonical case on
// case-insensitive filesystems); a syntactic resolve() as fallback for a
// path that doesn't exist yet (e.g. a project that has never had a .claude
// dir) — still safe for an equality comparison. Lowercased on win32 in the
// fallback branch only: realpath's on-disk casing is already canonical when
// it succeeds, but a syntactic resolve() preserves whatever casing the
// input string happened to carry, and two differently-cased spellings of
// the same Windows path must still compare equal. `platformOverride` exists
// only so tests can exercise the win32 branch deterministically regardless
// of which OS the suite happens to run on.
export function normalizeForCompare(p, platformOverride = platform()) {
  let real;
  try {
    real = realpathSync(p);
  } catch {
    real = resolve(p);
  }
  return platformOverride === 'win32' ? real.toLowerCase() : real;
}

function existsFlag(p) {
  try {
    return existsSync(p) ? 'present' : 'absent';
  } catch {
    // A stat error (permissions, race) is not evidence of absence, but it is
    // not safe to claim presence either — 'absent' is the fail-closed choice,
    // consistent with "facts absent/malformed falls through to today's path."
    return 'absent';
  }
}

// Pure(ish) computation, no stdout — exported for direct testing. `opts.env`
// and `opts.home` default to the real process environment/homedir, same
// override pattern hooks/otto-state.mjs already uses for its own tests.
export function computeFacts(payload, opts = {}) {
  const env = opts.env || process.env;
  const home = opts.home || homedir();

  const cwd = payload.cwd || process.cwd();
  const configDir = env.CLAUDE_CONFIG_DIR || join(home, '.claude');

  return {
    config_dir: configDir,
    sentinel: existsFlag(join(configDir, '.otto-met')),
    profile: existsFlag(join(configDir, 'otto-profile.json')),
    state_local: existsFlag(join(cwd, '.claude', 'otto-state.md')),
    state_global: existsFlag(join(configDir, 'otto-state-global.md')),
    cwd_is_config_dir: normalizeForCompare(join(cwd, '.claude')) === normalizeForCompare(configDir),
  };
}

// Renders the exact block the hook prints to stdout. Kept separate from
// computeFacts() so a test can assert on structured facts and on the exact
// wire format independently.
export function formatFacts(facts) {
  return [
    FACTS_HEADER,
    `config_dir=${facts.config_dir}`,
    `sentinel=${facts.sentinel}`,
    `profile=${facts.profile}`,
    `state_local=${facts.state_local}`,
    `state_global=${facts.state_global}`,
    `cwd_is_config_dir=${facts.cwd_is_config_dir}`,
  ].join('\n');
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
    console.log(formatFacts(computeFacts(payload)));
  } catch {
    // Fail hard-silent: print NOTHING. A partially-printed or malformed facts
    // block is worse than none -- the protocol's fallback path only engages
    // when the block is absent OR malformed, so a half-written block risks
    // being parsed as a confident (wrong) answer instead of triggering the
    // fallback. Same footing as every other hook in this plugin: a
    // convenience must never become the thing that breaks a session.
  }
  process.exit(0);
}
