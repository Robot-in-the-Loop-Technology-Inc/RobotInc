#!/usr/bin/env node
// Build the RobotInc plugin tree from the live ~/.claude build-out.
// De-personalizes on the way out: strips the user's tier from agent/skill bodies
// (Otto reads ~/.claude/otto-profile.json himself at the start of each session).
//
// Usage: node build-plugin.mjs <path-to-RobotInc-clone>

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CFG = join(homedir(), '.claude');
const REPO = process.argv[2];
if (!REPO) { console.error('usage: node build-plugin.mjs <repo>'); process.exit(1); }

const w = (p, s) => { mkdirSync(join(REPO, p, '..'), { recursive: true }); writeFileSync(join(REPO, p), s); };
const mk = (p) => mkdirSync(join(REPO, p), { recursive: true });

// Check every input EXISTS before destroying any output. This script once
// rmSync'd the repo's plugin tree and only then discovered its source directory
// was missing, leaving nothing on disk and nothing in git. Validate first, wipe
// second: a build that cannot run must change nothing at all.
for (const dir of ['agents', 'skills', 'commands', 'hooks']) {
  const src = join(CFG, dir);
  if (!existsSync(src)) {
    throw new Error(`source ${src} does not exist — refusing to wipe ${join(REPO, dir)}`);
  }
}
if (!existsSync(join(CFG, 'otto-seed.md'))) throw new Error(`source ${join(CFG, 'otto-seed.md')} does not exist`);

// Wipe every generated directory before rebuilding. Without this, a source file
// that was deleted or renamed keeps shipping from a previous build — a retired
// agent stays installable, and the "every robot has a skill" gate below passes
// by reading stale copies of the very files it is meant to be checking.
for (const dir of ['agents', 'skills', 'commands', 'hooks']) {
  rmSync(join(REPO, dir), { recursive: true, force: true });
}

// ---------------------------------------------------------------- agents
// Replace the baked-in tier with a runtime pointer. This is the fix that lets
// the crew ship as static files.
const TIER_PATTERNS = [
  [/Audience is a Level-2 Operator: (.)/g, (_, c) => `Audience: pitch to the user's tier as stated in Otto's dispatch. ${c.toUpperCase()}`],
  [/Audience: Level-2 Operator — /g, "Audience: pitch to the user's tier as stated in Otto's dispatch — "],
  [/Audience: Level-2 Operator\./g, "Audience: pitch to the user's tier as stated in Otto's dispatch."],
  [/mention the user's tier so output is pitched right/g, "pitch output to the user's tier as stated in Otto's dispatch"],
];

mk('agents');
let agentCount = 0;
// Otto runs as the main thread (plugin settings.json -> "agent"). He is the only
// one who may hold the Task tool: he mediates every handoff. He is therefore
// exempt from the robot gates below.
const MAIN_THREAD = 'otto-foreman.md';
for (const f of readdirSync(join(CFG, 'agents')).filter((f) => f.endsWith('.md'))) {
  let s = readFileSync(join(CFG, 'agents', f), 'utf8');
  for (const [re, rep] of TIER_PATTERNS) s = s.replace(re, rep);
  if (f === MAIN_THREAD) {
    if (!/^model: inherit$/m.test(s)) throw new Error(`${f} must use "model: inherit" or it overrides the user's session model`);
    if (/^disallowedTools:.*\bAgent\b/m.test(s)) throw new Error(`${f} denies Agent — Otto cannot route without it`);
    w(`agents/${f}`, s);
    agentCount++;
    continue;
  }
  // sonar references a deep-research skill that may not be installed
  s = s.replace(
    'run the **deep-research** skill (it fans out searches, fetches sources, and adversarially verifies) rather than hand-rolling the sweep',
    'use a **deep-research** skill if one is installed (fan-out searches, fetch sources, adversarially verify) rather than hand-rolling the sweep'
  );
  if (/Level-2|Level 2 Operator/.test(s)) throw new Error(`tier leak remains in ${f}`);
  if (!/PROACTIVELY/.test(s)) throw new Error(`missing PROACTIVELY in ${f}`);
  if (!/^model:/m.test(s)) throw new Error(`missing model: in ${f}`);
  if (!/^color:/m.test(s)) throw new Error(`missing color: in ${f}`);
  // A `tools:` allowlist opts the agent out of inheriting the session's MCP
  // servers and web tools — it silently blinds the robot. Use disallowedTools.
  if (/^tools:/m.test(s)) throw new Error(`${f} declares a tools: allowlist — this blocks MCP/web inheritance; use disallowedTools:`);
  // Otto mediates every handoff; robots must not spawn robots (Section 5c).
  const deny = (s.match(/^disallowedTools: (.*)$/m) || [, ''])[1];
  if (!/\bAgent\b/.test(deny)) throw new Error(`${f} does not deny the Agent tool — robots could spawn robots`);
  w(`agents/${f}`, s);
  agentCount++;
}

// ---------------------------------------------------------------- skills
mk('skills');
let skillCount = 0;
for (const d of readdirSync(join(CFG, 'skills'))) {
  const src = join(CFG, 'skills', d, 'SKILL.md');
  if (!existsSync(src)) continue;
  let s = readFileSync(src, 'utf8');
  s = s.replace(/Stay in the user's tier \(Operator\)/g, "Stay in the user's tier (as stated in Otto's dispatch)");
  s = s.replace(/it's pinned to haiku, cheap/g, 'it is pinned to haiku, cheap');
  if (/Level-2/.test(s)) throw new Error(`tier leak in skill ${d}`);
  mk(`skills/${d}`);
  w(`skills/${d}/SKILL.md`, s);
  skillCount++;
}

// Every robot must own at least one skill. A department with a name and no tools
// is a costume — this is the failure the whole v16 rework exists to correct.
{
  // Derive the roster from the agents that actually shipped, never a hardcoded
  // list — otherwise deleting a robot leaves its skills orphaned and nothing complains.
  // `switchboard-chief-of-staff.md` -> `Switchboard`; `otto-foreman.md` -> `Otto`.
  const ROBOTS = readdirSync(join(REPO, 'agents')).map((f) => {
    const first = f.replace(/\.md$/, '').split('-')[0];
    return first[0].toUpperCase() + first.slice(1);
  });
  const owned = new Set();
  for (const d of readdirSync(join(REPO, 'skills'))) {
    const line = (readFileSync(join(REPO, 'skills', d, 'SKILL.md'), 'utf8').match(/\*\*Home robot:\*\*(.*)/) || [, ''])[1];
    // the home robot is the first capitalised word, after any leading badge/punctuation
    const r = (line.replace(/^[^A-Za-z]+/, '').match(/^([A-Z][a-z]+)/) || [])[1];
    if (!r) throw new Error(`skill ${d} declares no home robot`);
    if (!ROBOTS.includes(r)) throw new Error(`skill ${d} names an unknown home robot: ${r}`);
    owned.add(r);
  }
  const naked = ROBOTS.filter((r) => !owned.has(r));
  if (naked.length) throw new Error(`robots with no skills (a department without tools is a costume): ${naked.join(', ')}`);
}

// ---------------------------------------------------------------- commands
// /otto ships. /otto-publish is maintainer-only — deliberately NOT shipped.
// Ship every command except the maintainer-only ones. Never hardcode a single
// filename here — a new command would silently fail to ship.
const MAINTAINER_ONLY = new Set(['otto-publish.md']);
mk('commands');
let commandCount = 0;
for (const f of readdirSync(join(CFG, 'commands')).filter((f) => f.endsWith('.md'))) {
  if (MAINTAINER_ONLY.has(f)) continue;
  w(`commands/${f}`, readFileSync(join(CFG, 'commands', f), 'utf8'));
  commandCount++;
}
if (!commandCount) throw new Error('no commands shipped — /otto is required');

// ---------------------------------------------------------------- hooks
// Only otto-trace ships. The old otto-brief.mjs re-injected the persona and the
// routing rules on every UserPromptSubmit, because a CLAUDE.md seed gets evicted
// by compaction. That is obsolete: settings.json pins `agent: otto-foreman`, so
// those rules now live in Otto's SYSTEM PROMPT, which is present every turn by
// construction and cannot be compacted away. The hook was paying ~330 tokens a
// turn to duplicate it — and it made `node` a hard install dependency, which
// Claude Code's native installer does not provide. See the gate below.
mk('hooks');
for (const h of ['otto-trace.mjs']) {
  const s = readFileSync(join(CFG, 'hooks', h), 'utf8');
  // The hooks ship to strangers: no seat/tier of a specific person may be baked in.
  if (/Level[- ]?2|Operator'/.test(s)) throw new Error(`tier leak in hook ${h}`);
  // No VS16 emoji anywhere in a hook. A variation selector turns a narrow text
  // glyph into a wide one; terminals miscount it and the cursor desyncs, which
  // silently corrupts every line that follows. Badges must be single-codepoint.
  if (/️/.test(s)) throw new Error(`variation-selector (U+FE0F) emoji in hook ${h} — will garble terminals`);
  w(`hooks/${h}`, s);
}

// Otto's system prompt is now the sole carrier of the badge/role map, the
// delegate-by-default rule, and the ASCII-description rule. Losing a line here
// silently kills routing or the crew's identity, and the failure is invisible
// until someone notices Otto doing everything alone again. This gate moved off
// otto-brief.mjs when that hook was retired; the invariant follows the content.
{
  const otto = readFileSync(join(REPO, 'agents', MAIN_THREAD), 'utf8');
  const must = {
    'all 12 robot badges': ['🤖', '📋', '🔵', '💰', '📞', '🔷', '🟣', '🔩', '🔘', '🔒', '🟢', '📜'],
    "Otto's own badge": ['🧰'],
    'all 12 roles': ['Chief of Staff', 'PM', 'Sales & Marketing', 'CFO', 'Support', 'Research',
                     'Architect', 'Engineer', 'QA', 'Security', 'Design', 'Legal'],
    'delegate-by-default': ['Delegate by default'],
    'otto builds nothing': ['no production code, no tests, no copy'],
    'ascii description rule': ['ASCII only'],
    'handoff notation': ['Glitchtrap > Bitforge'],
    'verbosity levels': ['brief', 'balanced', 'thorough'],
    'reads the seat at session start': ['otto-profile.json'],
  };
  for (const [label, needles] of Object.entries(must)) {
    const missing = needles.filter((n) => !otto.includes(n));
    if (missing.length) throw new Error(`${MAIN_THREAD} is missing ${label}: ${missing.join(', ')}`);
  }
}

// ${CLAUDE_PLUGIN_ROOT} is substituted inside `args`; the exec form spawns node
// directly with no shell, so this config is identical on win32 and posix.
//
// SubagentStop is best-effort by design: its stdout is neither shown to the user
// nor injected into the model, so it is a side effect only (it appends to
// otto-trace.log). If `node` is absent the log is simply never written, and the
// handoffs remain visible in Claude Code's native subagent UI. Nothing about
// routing depends on it. No hook may ever again be load-bearing for the persona.
w('hooks/hooks.json', JSON.stringify({
  hooks: {
    SubagentStop: [
      { hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/otto-trace.mjs'], timeout: 5 }] },
    ],
  },
}, null, 2) + '\n');

// ------------------------------------------------- plugin default settings
// A plugin's settings.json supports exactly two keys: `agent` and
// `subagentStatusLine`; anything else is silently ignored. Env vars and
// permissions are user-owned, so /otto must ask before merging those.
// `agent` runs the main thread as otto-foreman — Otto ships as a file.
w('settings.json', JSON.stringify({ agent: 'otto-foreman' }, null, 2) + '\n');

// ---------------------------------------------------------------- manifests
const seed = readFileSync(join(CFG, 'otto-seed.md'), 'utf8');
const version = (seed.match(/^version: (.+)$/m) || [, '16.0.0'])[1].trim();

mk('.claude-plugin');
w('.claude-plugin/plugin.json', JSON.stringify({
  name: 'otto',
  version,
  description: `Otto the crimson foreman plus a ${agentCount - 1}-robot crew as real, model-tiered Claude Code subagents — with proactive routing, per-turn reinforcement that survives compaction, and honest guardrails.`,
  author: { name: 'Robot in the Loop Technology Inc', url: 'https://robotintheloop.io' },
  homepage: 'https://github.com/Robot-in-the-Loop-Technology-Inc/RobotInc',
  license: 'MIT',
}, null, 2) + '\n');

w('.claude-plugin/marketplace.json', JSON.stringify({
  $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
  name: 'robotinc',
  description: 'RobotInc — Otto and the robot crew for Claude Code.',
  owner: { name: 'Robot in the Loop Technology Inc', url: 'https://robotintheloop.io' },
  plugins: [
    {
      name: 'otto',
      source: './',
      description: `A full robot company as real Claude Code primitives: ${agentCount - 1} model-tiered robot subagents, ${skillCount} seat-kit skills, /otto, and routing hooks.`,
      category: 'orchestration',
    },
  ],
}, null, 2) + '\n');

// ---------------------------------------------------------------- seed
w('RobotInc.md', seed);

console.log(`built plugin v${version}: ${agentCount} agents, ${skillCount} skills, ${commandCount} commands, 1 hook`);
