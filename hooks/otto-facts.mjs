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
// EXISTENCE CHECKS ONLY, for the six core facts — not the sentinel's
// timestamp, not the profile's seats key, nothing.
//
// v22.8.0 ADDS ONE narrower, separately-scoped capability: a first-run-only
// INVENTORY of the user's own payroll (agent/skill/command ids, settings.json
// hook/mcp key names, collision flags against the stock roster). This kills
// the 31.3s of Bash directory scanning roll-call/hiring-round used to do on
// session 1 (see docs/spec-facts-inventory-22.8.0.md). The boundary is
// deliberate and narrow: directory ENTRIES (readdirSync) and, for
// settings.json, only the top-level KEY NAMES under `hooks` / `mcpServers`.
// Never an agent's `description:`, never frontmatter, never a skill body,
// never a hook command string or an MCP config value — descriptions stay a
// model judgment (hiring-round step 2), the hook only enumerates what exists.
// Gathered ONLY when `sentinel=absent AND profile=absent` (a genuine first
// run) — every other session pays one marker line (`inv=off`), never a full
// enumeration; see the spec's §4 for why this doesn't chase override (a).
//
// Config-dir resolution pattern reused verbatim from hooks/otto-trace.mjs.

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { pathToFileURL } from 'node:url';

export const FACTS_HEADER = '[RobotInc facts] authoritative -- do NOT shell out to recompute:';

// Every basename in agents/ — all 14, INCLUDING otto-foreman: a user file
// shadowing the main thread is the most serious collision of all (spec §5).
// scripts/validate.mjs cross-checks this list against agents/*.md, the same
// shape as the otto-trace.mjs / otto-state.mjs ROBOTS-map gates, so a robot
// added or renamed without updating this list trips CI, not a user's
// collision check.
export const STOCK_AGENT_IDS = new Set([
  'baudrate-cfo',
  'bitforge-engineer',
  'cathode-design',
  'cipherplate-security',
  'dialtone-support',
  'docket-legal',
  'gantry-delivery',
  'glitchtrap-qa',
  'holovox-sales',
  'otto-foreman',
  'patchbay-pm',
  'sonar-research',
  'switchboard-chief-of-staff',
  'vector-architect',
]);

// Hard cap on the serialized inventory (~450 tokens). Collisions are exempt
// (never dropped); everything else fills the remaining budget in priority
// order and the rest degrades to inv=partial + inv_truncated=true (spec §3.4).
const INV_CHAR_CAP = 1800;

// An id containing any of these breaks the wire format's comma-separated
// list (or, for `*`, would be indistinguishable from a collision flag we
// didn't compute). Skipped, never emitted malformed; forces inv=partial.
// Filesystem-safe kebab ids never hit this — a pathological filename does.
const UNSAFE_ID = /[,=*\n]/;

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

// ------------------------------------------------------------- inventory

// Basenames of `*.md` files directly under `dir` (agents, commands — same
// shape). `ok: false` means the directory EXISTS but couldn't be read (a
// real stat/read error, never conflated with legitimate absence — see
// spec §7, "a stat/read error is never read as empty").
function listMdBasenames(dir) {
  if (!existsSync(dir)) return { ids: [], ok: true };
  try {
    const ids = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3));
    return { ids, ok: true };
  } catch {
    return { ids: [], ok: false };
  }
}

// Skill ids are directory names that actually contain a SKILL.md — a bare
// subdirectory with no SKILL.md isn't a skill (matches how Claude Code and
// scripts/validate.mjs both discover skills).
function listSkillIds(dir) {
  if (!existsSync(dir)) return { ids: [], ok: true };
  try {
    const ids = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
      .map((e) => e.name);
    return { ids, ok: true };
  } catch {
    return { ids: [], ok: false };
  }
}

// Top-level KEY NAMES only under settings.json's `hooks` / `mcpServers` —
// never a value, never a command string, never an MCP config. One read; a
// failure here (missing file is fine, a malformed or unreadable one is not)
// takes out both lists together, since they share the one source file.
function listSettingsKeys(configDir) {
  const settingsPath = join(configDir, 'settings.json');
  if (!existsSync(settingsPath)) return { hooks: [], mcp: [], ok: true };
  try {
    const json = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const hooks = json.hooks && typeof json.hooks === 'object' ? Object.keys(json.hooks) : [];
    const mcp = json.mcpServers && typeof json.mcpServers === 'object' ? Object.keys(json.mcpServers) : [];
    return { hooks, mcp, ok: true };
  } catch {
    return { hooks: [], mcp: [], ok: false };
  }
}

// Splits raw ids into delimiter-safe survivors and a flag recording whether
// anything was dropped (forces inv=partial — spec §3.2's "delimiter safety").
function sanitizeIds(rawIds) {
  const safe = [];
  let unsafeFound = false;
  for (const id of rawIds) {
    if (UNSAFE_ID.test(id)) unsafeFound = true;
    else safe.push(id);
  }
  return { safe, unsafeFound };
}

// { id, collide } pairs — collide flags a bare user filename equal to a
// stock agent basename (spec §5). Namespaced plugin agents (`robotinc:*`)
// are never seen here at all: this only ever reads the user's own
// `<config>/agents` and `<cwd>/.claude/agents`, never the plugin's own
// namespaced tree, so a false collision is structurally impossible, not
// just unlikely.
function withCollisionFlags(ids) {
  return ids.map((id) => ({ id, collide: STOCK_AGENT_IDS.has(id) }));
}

// Raw gather, no cap applied yet. `agentsProject` is `null` (not `[]`) when
// `cwdIsConfigDir` is true — omitted from the wire format entirely per spec
// §3.2, not just rendered empty, because cwd IS the config dir there and a
// second scan would double-count the same directory.
function gatherInventory(configDir, cwd, cwdIsConfigDir) {
  let subScanFailed = false;
  let delimiterUnsafe = false;

  const noteScan = (res) => {
    if (!res.ok) subScanFailed = true;
  };
  const sanitize = (rawIds) => {
    const { safe, unsafeFound } = sanitizeIds(rawIds);
    if (unsafeFound) delimiterUnsafe = true;
    return safe;
  };

  const agentsRes = listMdBasenames(join(configDir, 'agents'));
  noteScan(agentsRes);
  const agents = withCollisionFlags(sanitize(agentsRes.ids));

  let agentsProject = null;
  if (!cwdIsConfigDir) {
    const projectRes = listMdBasenames(join(cwd, '.claude', 'agents'));
    noteScan(projectRes);
    agentsProject = withCollisionFlags(sanitize(projectRes.ids));
  }

  const skillsRes = listSkillIds(join(configDir, 'skills'));
  noteScan(skillsRes);
  const skills = sanitize(skillsRes.ids);

  const commandsRes = listMdBasenames(join(configDir, 'commands'));
  noteScan(commandsRes);
  const commands = sanitize(commandsRes.ids);

  const settingsRes = listSettingsKeys(configDir);
  noteScan(settingsRes);
  const hooks = sanitize(settingsRes.hooks);
  const mcp = sanitize(settingsRes.mcp);

  return { agents, agentsProject, skills, commands, hooks, mcp, subScanFailed, delimiterUnsafe };
}

// Builds the `inv_*` lines a given (status, faceted-fields) pair would
// render as — the single source of truth for the wire-format shape, shared
// by the real formatFacts() output and by the cap-fitting probe below so
// the two can never disagree about what "fits" means. `f` uses the SAME
// `inv_*`-prefixed field names the facts object itself carries, so this
// function works unmodified on both a real facts object and an in-progress
// truncation trial.
function inventoryLines(status, f) {
  const lines = [`inv=${status}`];
  if (f.inv_agents?.length) lines.push(`inv_agents=${f.inv_agents.join(',')}`);
  if (f.inv_agents_project?.length) lines.push(`inv_agents_project=${f.inv_agents_project.join(',')}`);
  if (f.inv_skills?.length) lines.push(`inv_skills=${f.inv_skills.join(',')}`);
  if (f.inv_commands?.length) lines.push(`inv_commands=${f.inv_commands.join(',')}`);
  if (f.inv_hooks?.length) lines.push(`inv_hooks=${f.inv_hooks.join(',')}`);
  if (f.inv_mcp?.length) lines.push(`inv_mcp=${f.inv_mcp.join(',')}`);
  if (f.inv_truncated) lines.push('inv_truncated=true');
  return lines;
}

// Applies the truncation policy (spec §3.4): every collision-marked agent is
// emitted first and never dropped; the remaining budget fills in priority
// order (non-colliding agents -> commands -> mcp -> skills -> hooks) until
// the ~1800-char cap is hit, at which point whatever's left is simply not
// included — never a malformed line, never a silently-complete lie.
function applyTruncation(gathered) {
  const collideIds = (list) => (list || []).filter((a) => a.collide).map((a) => `${a.id}*`);
  const plainIds = (list) => (list || []).filter((a) => !a.collide).map((a) => a.id);
  const hasProject = gathered.agentsProject !== null;

  const groups = {
    inv_agents: collideIds(gathered.agents),
    inv_agents_project: hasProject ? collideIds(gathered.agentsProject) : null,
    inv_skills: [],
    inv_commands: [],
    inv_hooks: [],
    inv_mcp: [],
  };

  // Fill order matches spec §3.4 exactly; agentsProject rides immediately
  // after agents since both are "agents" for priority purposes — the wire
  // format's own field order (spec §3.1) already groups them adjacently.
  const queue = [
    ...plainIds(gathered.agents).map((id) => ({ bucket: 'inv_agents', id })),
    ...(hasProject ? plainIds(gathered.agentsProject).map((id) => ({ bucket: 'inv_agents_project', id })) : []),
    ...gathered.commands.map((id) => ({ bucket: 'inv_commands', id })),
    ...gathered.mcp.map((id) => ({ bucket: 'inv_mcp', id })),
    ...gathered.skills.map((id) => ({ bucket: 'inv_skills', id })),
    ...gathered.hooks.map((id) => ({ bucket: 'inv_hooks', id })),
  ];

  let truncated = false;
  for (const item of queue) {
    const trial = { ...groups, [item.bucket]: [...groups[item.bucket], item.id] };
    // Probed at worst-case ('partial' + inv_truncated=true) so a status
    // string shorter than the true final one never lets something through
    // that wouldn't actually fit once truncation is confirmed.
    if (inventoryLines('partial', { ...trial, inv_truncated: true }).join('\n').length <= INV_CHAR_CAP) {
      groups[item.bucket] = trial[item.bucket];
    } else {
      truncated = true;
      break;
    }
  }

  return { ...groups, truncated };
}

// Gate: gather ONLY on a genuine first run (spec §4). Every other session —
// the overwhelming majority, steady-state — pays exactly one marker line.
// Wrapped in its own try/catch, isolated from core-fact computation: an
// unexpected throw here must never take the six core facts down with it
// (spec §7). Exported for direct testing of that isolation.
export function computeInventoryFacts(core, cwd) {
  if (!(core.sentinel === 'absent' && core.profile === 'absent')) {
    return { inv: 'off' };
  }
  try {
    const gathered = gatherInventory(core.config_dir, cwd, core.cwd_is_config_dir);
    const capped = applyTruncation(gathered);
    const status = capped.truncated || gathered.subScanFailed || gathered.delimiterUnsafe ? 'partial' : 'ok';
    const result = {
      inv: status,
      inv_agents: capped.inv_agents,
      inv_skills: capped.inv_skills,
      inv_commands: capped.inv_commands,
      inv_hooks: capped.inv_hooks,
      inv_mcp: capped.inv_mcp,
    };
    if (capped.inv_agents_project !== null) result.inv_agents_project = capped.inv_agents_project;
    if (capped.truncated) result.inv_truncated = true;
    return result;
  } catch {
    // core facts unaffected -- see the header comment and spec §7's
    // "Inventory gather throws (unexpected)" row.
    return { inv: 'error' };
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

  const core = {
    config_dir: configDir,
    sentinel: existsFlag(join(configDir, '.otto-met')),
    profile: existsFlag(join(configDir, 'otto-profile.json')),
    state_local: existsFlag(join(cwd, '.claude', 'otto-state.md')),
    state_global: existsFlag(join(configDir, 'otto-state-global.md')),
    cwd_is_config_dir: normalizeForCompare(join(cwd, '.claude')) === normalizeForCompare(configDir),
  };

  return { ...core, ...computeInventoryFacts(core, cwd) };
}

// Renders the exact block the hook prints to stdout. Kept separate from
// computeFacts() so a test can assert on structured facts and on the exact
// wire format independently.
export function formatFacts(facts) {
  const lines = [
    FACTS_HEADER,
    `config_dir=${facts.config_dir}`,
    `sentinel=${facts.sentinel}`,
    `profile=${facts.profile}`,
    `state_local=${facts.state_local}`,
    `state_global=${facts.state_global}`,
    `cwd_is_config_dir=${facts.cwd_is_config_dir}`,
  ];
  if (facts.inv !== undefined) {
    // Under off/error there are no inv_* lines at all (spec §3.2) — pass an
    // empty object so inventoryLines() renders only the bare `inv=` line.
    lines.push(...inventoryLines(facts.inv, facts.inv === 'ok' || facts.inv === 'partial' ? facts : {}));
  }
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
