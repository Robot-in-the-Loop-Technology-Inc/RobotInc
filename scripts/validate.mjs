#!/usr/bin/env node
// Validate the RobotInc plugin tree. READ-ONLY — writes nothing, ever.
//
// This repo is the source of truth: agents/, skills/, commands/, hooks/ are
// authored here directly and shipped verbatim by Claude Code's plugin
// installer. This script is the gate that keeps a hand edit from breaking the
// crew in ways nobody notices until routing quietly dies. CI runs it on every
// push and PR; run it locally before committing:
//
//   node scripts/validate.mjs
//
// It replaced scripts/build-plugin.mjs (removed 2026-07-11), which GENERATED
// this tree from the maintainer's personal ~/.claude — meaning nobody else
// could build the repo and CI could not verify a contribution. The gates
// survived; the generation did not.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const read = (p) => readFileSync(join(REPO, p), 'utf8');

const COLORS = new Set(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']);
const MODELS = new Set(['haiku', 'sonnet', 'opus', 'inherit']);
// U+FE0F promotes a narrow glyph to a wide emoji; terminals miscount the width
// and the cursor desyncs, corrupting every line drawn after it.
const VS16 = /️/;

// ---------------------------------------------------------------- agents
// Otto runs as the main thread (settings.json -> "agent"). He is the only one
// who may hold the Task tool: he mediates every handoff. He is therefore
// exempt from the delegate-robot gates.
const MAIN_THREAD = 'otto-foreman.md';
const agentFiles = readdirSync(join(REPO, 'agents')).filter((f) => f.endsWith('.md'));

for (const f of agentFiles) {
  const s = read(`agents/${f}`);
  const name = (s.match(/^name: (.*)$/m) || [])[1];
  if (!name || !/^[a-z][a-z-]*$/.test(name)) fail(`${f}: name must be lowercase kebab-case (got "${name}")`);
  if (name && name + '.md' !== f) fail(`${f}: name "${name}" does not match filename`);
  const color = (s.match(/^color: (.*)$/m) || [])[1];
  if (!COLORS.has(color)) fail(`${f}: color "${color}" not in ${[...COLORS].join('|')}`);
  const model = (s.match(/^model: (.*)$/m) || [])[1];
  if (!MODELS.has(model)) fail(`${f}: model "${model}" not in ${[...MODELS].join('|')}`);
  if (/Level[- ]?2|Level 2 Operator/.test(s)) fail(`${f}: personal tier leaked in (ships to strangers)`);
  // A `tools:` allowlist opts the agent out of inheriting the session's MCP
  // servers and web tools — it silently blinds the robot. Use disallowedTools.
  if (/^tools:/m.test(s)) fail(`${f}: declares a tools: allowlist — blocks MCP/web inheritance; use disallowedTools:`);

  if (f === MAIN_THREAD) {
    if (model !== 'inherit') fail(`${f}: must use "model: inherit" or it overrides the user's session model`);
    if (/^disallowedTools:.*\bAgent\b/m.test(s)) fail(`${f}: denies Agent — Otto cannot route without it`);
    continue;
  }
  // The PROACTIVELY trigger drives Claude Code's auto-delegation. An agent
  // whose description lacks it sits idle forever while the main thread quietly
  // does its job — the exact failure the plugin exists to fix.
  if (!/PROACTIVELY/.test(s)) fail(`${f}: description missing the literal "PROACTIVELY" trigger`);
  // Otto mediates every handoff; robots must not spawn robots.
  const deny = (s.match(/^disallowedTools: (.*)$/m) || [, ''])[1];
  if (!/\bAgent\b/.test(deny)) fail(`${f}: does not deny the Agent tool — robots could spawn robots`);
}

// Otto's system prompt is the sole carrier of the badge/role map, the
// delegate-by-default rule, and the ASCII-description rule. It is pinned as
// the main thread via settings.json, so unlike a hook or a CLAUDE.md it cannot
// be evicted by compaction — but only if the lines are actually there. Losing
// one silently kills routing or the crew's identity, and the failure is
// invisible until someone notices Otto doing everything alone again.
{
  const otto = read(`agents/${MAIN_THREAD}`);
  // The roster: badge, name, role — one table row each. Checked as whole rows,
  // not substrings: a badge also appearing in a handoff example must not
  // satisfy the check for its deleted roster row.
  const ROSTER = [
    ['🤖', 'Switchboard', 'Chief of Staff'], ['📋', 'Patchbay', 'Product'],
    ['📦', 'Gantry', 'Project'],
    ['🔵', 'Holovox', 'Sales & Marketing'], ['💰', 'Baudrate', 'CFO'],
    ['📞', 'Dialtone', 'Support'], ['🔷', 'Sonar', 'Research'],
    ['🟣', 'Vector', 'Architect'], ['🔩', 'Bitforge', 'Engineer'],
    ['🔘', 'Glitchtrap', 'QA'], ['🔒', 'Cipherplate', 'Security'],
    ['🟢', 'Cathode', 'Design'], ['📜', 'Docket', 'Legal'],
  ];
  for (const [badge, robot, role] of ROSTER) {
    const row = new RegExp(`\\|\\s*${badge}\\s*\\|\\s*${robot}\\s*\\|\\s*${role.replace(/[&]/g, '\\$&')}\\s*\\|`);
    if (!row.test(otto)) fail(`agents/${MAIN_THREAD}: roster table missing the row for ${badge} ${robot} (${role})`);
  }
  const must = {
    "Otto's own badge": ['🧰'],
    'delegate-by-default': ['Delegate by default'],
    'otto builds nothing': ['no production code, no tests, no copy'],
    'ascii description rule': ['ASCII only'],
    'handoff notation': ['Glitchtrap > Bitforge'],
    'verbosity levels': ['brief', 'balanced', 'thorough'],
    'reads the seat at session start': ['otto-profile.json'],
  };
  for (const [label, needles] of Object.entries(must)) {
    const missing = needles.filter((n) => !otto.includes(n));
    if (missing.length) fail(`agents/${MAIN_THREAD}: missing ${label}: ${missing.join(', ')}`);
  }
  if (VS16.test(otto)) fail(`agents/${MAIN_THREAD}: contains a U+FE0F variation-selector emoji — will garble terminals`);
}

// ---------------------------------------------------------------- skills
const skillDirs = readdirSync(join(REPO, 'skills')).filter((d) => existsSync(join(REPO, 'skills', d, 'SKILL.md')));
// `switchboard-chief-of-staff.md` -> `Switchboard`; `otto-foreman.md` -> `Otto`.
const ROBOTS = agentFiles.map((f) => {
  const first = f.replace(/\.md$/, '').split('-')[0];
  return first[0].toUpperCase() + first.slice(1);
});
const owned = new Set();
for (const d of skillDirs) {
  const s = read(`skills/${d}/SKILL.md`);
  const model = (s.match(/^model: (.*)$/m) || [])[1];
  if (!MODELS.has(model)) fail(`skills/${d}: model "${model}" not in ${[...MODELS].join('|')}`);
  if (/Level[- ]?2/.test(s)) fail(`skills/${d}: personal tier leaked in`);
  // Every skill answers to a robot even when the human drives it — that is
  // what keeps the org coherent as the skills library grows.
  const line = (s.match(/\*\*Home robot:\*\*(.*)/) || [, ''])[1];
  const r = (line.replace(/^[^A-Za-z]+/, '').match(/^([A-Z][a-z]+)/) || [])[1];
  if (!r) { fail(`skills/${d}: declares no home robot`); continue; }
  if (!ROBOTS.includes(r)) fail(`skills/${d}: names an unknown home robot: ${r}`);
  owned.add(r);
}
// ------------------------------------------- no personal config in the product
// The maintainer's own machine is not the product. An example that names a real
// tool from someone's private setup is a leak — and worse, a user who sees a tool
// they do not own listed as *theirs* stops trusting every other number on the page.
// This shipped once: the company card used `deep-research`, a skill from the
// maintainer's ~/.claude, as an illustration of "your staff".
{
  // Anything the crew shows as an EXAMPLE of the user's own assets must be an
  // obvious placeholder, never a name that could be somebody's real tool.
  const card = existsSync(join(REPO, 'skills/roll-call/SKILL.md'))
    ? read('skills/roll-call/SKILL.md') : '';
  if (card) {
    const staffRows = card.split('\n').filter((l) => /^\|\s*🧩/.test(l));
    for (const row of staffRows) {
      const id = (row.match(/`([^`]+)`/) || [, ''])[1];
      if (id && !/^</.test(id)) {
        fail(`skills/roll-call: the YOUR STAFF example names "${id}" — it must be a <placeholder>, `
           + `never a real tool name. Someone's private config is not our illustration.`);
      }
    }
  }
}

// A department with a name and no tools is a costume.
const naked = ROBOTS.filter((r) => r !== 'Otto' && !owned.has(r));
if (naked.length) fail(`robots with no skills (a department without tools is a costume): ${naked.join(', ')}`);

// ---------------------------------------------------------------- commands
const commands = readdirSync(join(REPO, 'commands')).filter((f) => f.endsWith('.md'));
for (const req of ['otto.md', 'standup.md']) {
  if (!commands.includes(req)) fail(`commands/${req} is missing`);
}
if (commands.includes('otto-publish.md')) fail('commands/otto-publish.md is maintainer-only and must never ship');

// ---------------------------------------------------------------- hooks
// Exactly one hook ships, and it is best-effort by design: otto-trace.mjs
// needs `node`, which Claude Code's native installer does NOT provide. If node
// is absent the log is never written and nothing else changes. No hook may
// ever be load-bearing for the persona — that lives in Otto's system prompt.
{
  const hookFiles = readdirSync(join(REPO, 'hooks'));
  const extra = hookFiles.filter((f) => !['hooks.json', 'otto-trace.mjs'].includes(f));
  if (extra.length) fail(`unexpected files in hooks/: ${extra.join(', ')} — a new hook is a new runtime dependency; see README`);
  const trace = read('hooks/otto-trace.mjs');
  if (VS16.test(trace)) fail('hooks/otto-trace.mjs: contains a U+FE0F variation-selector emoji');
  if (/Level[- ]?2|Operator'/.test(trace)) fail('hooks/otto-trace.mjs: personal tier leaked in');
  const hooks = JSON.parse(read('hooks/hooks.json'));
  const events = Object.keys(hooks.hooks || {});
  if (events.join() !== 'SubagentStop') fail(`hooks.json must wire ONLY SubagentStop (got: ${events.join(', ') || 'none'})`);
}

// ------------------------------------------------- plugin default settings
// A plugin's settings.json supports exactly two keys: `agent` and
// `subagentStatusLine`; anything else is silently ignored by Claude Code —
// which means a typo here fails without a trace.
{
  const settings = JSON.parse(read('settings.json'));
  const bad = Object.keys(settings).filter((k) => !['agent', 'subagentStatusLine'].includes(k));
  if (bad.length) fail(`settings.json: unsupported keys (silently ignored by Claude Code): ${bad.join(', ')}`);
  if (settings.agent !== 'otto-foreman') fail(`settings.json: agent must be "otto-foreman" (got "${settings.agent}")`);
  if (!agentFiles.includes(settings.agent + '.md')) fail(`settings.json: agent "${settings.agent}" has no agents/${settings.agent}.md`);
}

// ---------------------------------------------------------------- manifests
// These are hand-maintained now. The counts in the descriptions rotted once
// already ("9 subagents" while shipping 12) — so derive the truth from the
// tree and refuse to ship a mismatch.
{
  const robotCount = agentFiles.length - 1; // otto-foreman is the main thread, not a delegate robot
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const market = JSON.parse(read('.claude-plugin/marketplace.json'));

  if (plugin.name !== 'robotinc') fail(`plugin.json: name must be "robotinc" (got "${plugin.name}")`);
  if (market.name !== 'robotinc') fail(`marketplace.json: name must be "robotinc" (got "${market.name}")`);
  // The plugin's name is the prefix Claude Code shows on every agent, command
  // and skill it ships (robotinc:bitforge-engineer). It was "otto" until 16.2.0,
  // which rendered as otto:otto-foreman — the plugin name colliding with the
  // agent name. Keep the plugin named for the company, the agents for the robots.
  const entry = (market.plugins || []).find((p) => p.name === 'robotinc');
  if (!entry) fail('marketplace.json: no plugin entry named "robotinc"');

  for (const [where, desc] of [['plugin.json', plugin.description], ['marketplace.json', entry?.description]]) {
    if (!desc) continue;
    for (const m of desc.matchAll(/(\d+)[ -]robot/g)) {
      if (Number(m[1]) !== robotCount) fail(`${where}: description says "${m[0]}" but the tree has ${robotCount} robots`);
    }
    for (const m of desc.matchAll(/(\d+) (?:model-tiered robot )?subagents/g)) {
      if (Number(m[1]) !== robotCount) fail(`${where}: description says "${m[0]}" but the tree has ${robotCount} robot subagents`);
    }
    for (const m of desc.matchAll(/(\d+) seat-kit skills/g)) {
      if (Number(m[1]) !== skillDirs.length) fail(`${where}: description says "${m[0]}" but the tree has ${skillDirs.length} skills`);
    }
  }

  // One version, stated twice: plugin.json (what the installer reads) and the
  // seed's frontmatter (what a CLAUDE.md-fallback user sees). Keep them equal.
  const seedVersion = (read('RobotInc.md').match(/^version: (.+)$/m) || [])[1]?.trim();
  if (!plugin.version) fail('plugin.json: missing version');
  if (seedVersion && plugin.version !== seedVersion) {
    fail(`version mismatch: plugin.json says ${plugin.version}, RobotInc.md frontmatter says ${seedVersion}`);
  }
}

// ---------------------------------------------------------------- verdict
const robotCount = agentFiles.length - 1;
if (errors.length) {
  console.error(`INVALID — ${errors.length} problem${errors.length > 1 ? 's' : ''}:\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`valid: ${robotCount} robots + otto-foreman, ${skillDirs.length} skills, ${commands.length} commands, 1 hook`);
