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

// ------------------------------------------------ doctrine tripwire (all prompts)
// §3.2 of docs/doctrine.md resolved this on 2026-07-12: the rule is "the tier the
// work demands", NOT "the cheapest model that can do the job" — which optimises
// per-token price and ignores the redo. The old wording survived in Switchboard
// for four versions after the doctrine changed, and in Baudrate — the robot whose
// own move off haiku IS the case study — for six. A settled doctrine that only
// some of the crew was told is worse than no doctrine: it produces confident,
// contradictory advice. docs/ may quote the dead rule; a prompt may not.
// Quoting the dead rule in order to REJECT it is correct and we do it in several
// places. Teaching it is the failure. So: find every occurrence, and require a
// negation immediately before it. Whitespace is normalised first because the
// phrase wraps across lines — a line-scoped check missed a real violation during
// its own negative test, which is the whole argument for negative-testing a gate.
{
  const CHEAPEST = /cheapest model that (?:can do|does|could do) the job/gi;
  // "…never \"the cheapest model…\"" is a rejection; "…recommend the cheapest model…" is not.
  // The article and any quoting/emphasis may sit between the negation and the phrase.
  const NEGATED = /(?:never|not|rather than|instead of|replaced)\s*["“'*]*\s*(?:the\s+)?["“'*]*\s*$/i;
  for (const dir of ['agents', 'skills', 'commands']) {
    const walk = dir === 'skills'
      ? readdirSync(join(REPO, dir)).map((d) => `${dir}/${d}/SKILL.md`).filter((p) => existsSync(join(REPO, p)))
      : readdirSync(join(REPO, dir)).filter((f) => f.endsWith('.md')).map((f) => `${dir}/${f}`);
    for (const p of walk) {
      const flat = read(p).replace(/\s+/g, ' ');
      for (const m of flat.matchAll(CHEAPEST)) {
        const before = flat.slice(Math.max(0, m.index - 24), m.index);
        if (!NEGATED.test(before)) {
          fail(`${p}: teaches "the cheapest model that can do the job" — doctrine §3.2 replaced it with `
             + `"the tier the work demands" (a cheap model that needs three retries costs more than one clean pass)`);
        }
      }
    }
  }
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

// ------------------------------------------- no prompt may name a skill we don't ship
// Sonar's description said "owns the deep-research skill" for six versions.
// deep-research is a skill on the MAINTAINER's machine — so every user was told,
// on every single turn, that the crew owned a tool it does not have. The roll-call
// leak (below) was the same disease and got a gate; this one is worse, because a
// description is injected into context every turn rather than drawn once.
{
  const SHIPPED = new Set(skillDirs);
  // Skills we deliberately reference but do not ship — the user may own them, or
  // they belong to another plugin. Naming one is fine; CLAIMING it is not.
  const CLAIM = /\bowns? the `?([a-z][a-z0-9-]+)`? skill\b|\bSkills?: \*\*`([a-z][a-z0-9-]+)`\*\*/gi;
  for (const f of agentFiles) {
    const s = read(`agents/${f}`);
    for (const m of s.matchAll(CLAIM)) {
      const id = m[1] || m[2];
      if (id && !SHIPPED.has(id)) {
        fail(`agents/${f}: claims the "${id}" skill, which this plugin does not ship (skills/ has no ${id}/). `
           + `A prompt may say the user might own such a tool; it may never claim one as ours.`);
      }
    }
  }
}

// ------------------------------------------- no prompt may hardcode the config dir
// CLAUDE_CONFIG_DIR moves the whole config directory. hooks/otto-trace.mjs honours it;
// every PROMPT hardcoded `~/.claude`, so a user who moved their config got a crew that
// read a DIFFERENT machine's otto-profile.json, concluded it had met them, and skipped
// the entire first meeting — card, hiring round, seat question, all of it.
//
// Found by pointing a sandbox at a fresh config dir and watching Otto greet the
// maintainer by name. Prompts say `<config>` and define it; only the hook resolves it.
// The definition itself must name the fallback ("CLAUDE_CONFIG_DIR if set, otherwise
// ~/.claude"), and it wraps across lines — so a line-scoped check flags the very rule
// it is enforcing. Flatten first and exempt a `~/.claude` that follows a
// CLAUDE_CONFIG_DIR mention closely enough to be part of the same sentence.
// (The doctrine gate made exactly this mistake. Twice is a pattern; hence the note.)
{
  const HARD = /~\/\.claude|\$HOME\/\.claude/g;
  for (const dir of ['agents', 'skills', 'commands']) {
    const walk = dir === 'skills'
      ? readdirSync(join(REPO, dir)).map((d) => `${dir}/${d}/SKILL.md`).filter((p) => existsSync(join(REPO, p)))
      : readdirSync(join(REPO, dir)).filter((f) => f.endsWith('.md')).map((f) => `${dir}/${f}`);
    for (const p of walk) {
      const flat = read(p).replace(/\s+/g, ' ');
      let bad = 0;
      for (const m of flat.matchAll(HARD)) {
        const window = flat.slice(Math.max(0, m.index - 140), m.index);
        if (!/CLAUDE_CONFIG_DIR/.test(window)) bad++;
      }
      if (bad) {
        fail(`${p}: hardcodes the config dir (${bad} occurrence(s)) — use \`<config>\`, defined once as `
           + `"CLAUDE_CONFIG_DIR if set, else ~/.claude". A user who moves their config otherwise gets a crew `
           + `reading another machine's profile, and the first meeting never happens.`);
      }
    }
  }
}

// ------------------------------------------- robots cannot dispatch robots
// Every robot carries `disallowedTools: Agent` — Otto mediates every handoff. Four
// skills nonetheless instructed robots to "Invoke `glitchtrap-qa` (context: fork +
// agent: ...)", which is impossible for a robot and is not Claude Code syntax at
// all. A robot handed that instruction either errors or quietly does the work
// itself, which is the exact "department with no tools is a costume" failure the
// crew exists to prevent. The correct pattern is: hand back to Otto; he dispatches.
for (const d of skillDirs) {
  const s = read(`skills/${d}/SKILL.md`);
  if (/context:\s*fork/.test(s)) {
    fail(`skills/${d}: uses "context: fork" — not a Claude Code mechanism, and robots deny the Agent tool. `
       + `Hand back to Otto and let him dispatch.`);
  }
}

// ---------------------------------------------------------------- commands
const commands = readdirSync(join(REPO, 'commands')).filter((f) => f.endsWith('.md'));
for (const req of ['otto.md', 'standup.md']) {
  if (!commands.includes(req)) fail(`commands/${req} is missing`);
}
if (commands.includes('otto-publish.md')) fail('commands/otto-publish.md is maintainer-only and must never ship');

// ---------------------------------------------------------------- hooks
// Exactly two hooks ship. otto-trace.mjs (SubagentStop) is best-effort by
// design: it needs `node`, which Claude Code's native installer does NOT
// provide. If node is absent the log is never written and nothing else
// changes. The SessionStart hook (added for auto-onboarding, 2026-07) is the
// opposite case on purpose: it is a bare shell `echo` of a STATIC string, zero
// runtime dependency, chosen specifically because otto-brief.mjs (a prior
// SessionStart-shaped hook) shipped and was retired for needing node on a
// platform that does not guarantee it. No hook may ever be load-bearing for
// the persona — the rule it echoes is written in full in Otto's system prompt
// ("Where the human sits"); the hook is only ever a same-session reinforcement
// of it, so a machine where the hook fails to fire degrades to that paragraph,
// never to a crash and never to a re-triggered first meeting.
//
// Quoting strategy for the SessionStart command (why this survives sh, Git
// Bash AND bare Windows PowerShell with ONE string): Claude Code's hook runner
// picks the interpreter per platform when `shell` is omitted — bash on
// macOS/Linux, Git Bash on Windows if installed, else PowerShell — so the
// SAME command string must parse under both POSIX sh grammar and PowerShell
// grammar. `echo '<literal, real newlines, no apostrophes>'` does: single
// quotes are fully literal (no $ / backtick expansion) in BOTH shells, both
// shells let a single-quoted literal span physical lines with the newline
// characters preserved verbatim, and `echo` exists as a real command in sh
// AND as a PowerShell alias for Write-Output. Deliberately NOT printf or `\n`
// escapes: bash's builtin echo and dash's do not agree on interpreting
// backslash escapes, which is exactly the classic echo portability trap —
// using literal embedded newlines instead of `\n` sequences sidesteps it
// entirely, at the cost of a message that must never itself contain a `'`.
// Empirically run through Git Bash sh AND a genuinely piped bare-PowerShell
// child process on this Windows box: byte-identical output both ways (one
// harmless artifact — PowerShell appends its own trailing \r before the final
// \n; it does not touch the internal newlines). macOS/Linux sh is NOT
// independently verified on real hardware here — POSIX single-quote grammar
// is standard enough that it should generalize, but that is reasoning, not a
// test, and Glitchtrap should confirm on real Unix hardware before release.
{
  const hookFiles = readdirSync(join(REPO, 'hooks'));
  const extra = hookFiles.filter((f) => !['hooks.json', 'otto-trace.mjs'].includes(f));
  if (extra.length) fail(`unexpected files in hooks/: ${extra.join(', ')} — a new hook is a new runtime dependency; see README`);
  const trace = read('hooks/otto-trace.mjs');
  if (VS16.test(trace)) fail('hooks/otto-trace.mjs: contains a U+FE0F variation-selector emoji');
  if (/Level[- ]?2|Operator'/.test(trace)) fail('hooks/otto-trace.mjs: personal tier leaked in');
  const hooks = JSON.parse(read('hooks/hooks.json'));
  const events = Object.keys(hooks.hooks || {});
  const ALLOWED_EVENTS = new Set(['SessionStart', 'SubagentStop']);
  const badEvents = events.filter((e) => !ALLOWED_EVENTS.has(e));
  if (badEvents.length) fail(`hooks.json wires an unreviewed event: ${badEvents.join(', ')} (allowed: ${[...ALLOWED_EVENTS].join(', ')})`);
  if (!events.includes('SubagentStop')) fail('hooks.json is missing the SubagentStop trace hook');

  // The SessionStart hook is the one place a regression could silently smuggle
  // the runtime dependency back in (or fire on the wrong trigger). Gate both.
  for (const entry of hooks.hooks?.SessionStart || []) {
    if (entry.matcher !== 'startup') {
      fail(`hooks.json: SessionStart matcher is "${entry.matcher}", must be "startup" — firing on resume/clear/compact `
         + `risks re-running roll-call for someone already met`);
    }
    for (const h of entry.hooks || []) {
      if (h.args) fail('hooks.json: SessionStart hook sets "args" — that switches Claude Code to EXEC form, which bypasses the shell entirely and would silently stop injecting the echoed text as shell output');
      if (/\bnode\b|\bpython3?\b|\.mjs\b|\.py\b/.test(h.command || '')) {
        fail('hooks.json: SessionStart command references node/python/a script file — the whole point of this hook is zero runtime dependency, see the comment above');
      }
      // The command is a single-quoted shell literal: echo '<payload>'. In
      // BOTH bash and PowerShell, a literal apostrophe INSIDE that payload
      // closes the quote early — the rest of the string is re-parsed as
      // shell syntax, silently, with no error surfaced anywhere a human
      // would see it, on exactly the bare-Windows machine this hook exists
      // for. That is otto-brief.mjs's failure ("undefined behaviour a
      // stranger discovers") wearing a different hat, so it is gated here,
      // not left to survive on a sentence in a comment. Escaping is
      // deliberately not offered as the fix: bash needs '\'' and PowerShell
      // needs '' to embed a literal quote inside a single-quoted string, and
      // those two escapes are NOT interchangeable — supporting one would
      // require per-shell command strings, which defeats the entire point
      // of one portable literal. The only sound rule is zero, always.
      const cmd = h.command || '';
      const firstQuote = cmd.indexOf("'");
      const lastQuote = cmd.lastIndexOf("'");
      if (firstQuote === -1 || lastQuote <= firstQuote) {
        fail(`hooks.json: SessionStart command is not wrapped in the expected single-quoted literal — cannot verify it is apostrophe-safe`);
      } else if (cmd.slice(firstQuote + 1, lastQuote).includes("'")) {
        fail(`hooks.json: SessionStart command payload contains an apostrophe (U+0027) — it closes the single-quoted `
           + `literal early in BOTH bash and PowerShell, and the remainder re-parses as shell syntax, silently, on a `
           + `bare-Windows machine with no error a human will ever see. Rephrase to avoid it ("does not", not `
           + `"doesn't"). Do not substitute a typographic apostrophe (U+2019) as an escape hatch unless it has been `
           + `empirically verified byte-identical through both shells — it has not been.`);
      }
      if (!(h.timeout > 0 && h.timeout <= 10)) fail(`hooks.json: SessionStart timeout is ${h.timeout}, expected a small bounded number (<=10s) — this hook must never hang session start`);
    }
  }

  // The hook's ROBOTS map must know every delegate robot, with the SAME badge and
  // role as Otto's roster. It didn't: Gantry shipped and was never added here, so
  // every one of his runs logged as an anonymous "🤍 gantry-delivery" with no role
  // — and /standup reads this log, so the crew's own morning brief reported one of
  // its own members as a stranger. Nothing caught it, because nothing was looking.
  const mapped = new Map(
    [...trace.matchAll(/^\s*'([a-z-]+)':\s*\['(.+?)',\s*'(.+?)',\s*'(.+?)'\]/gm)]
      .map((m) => [m[1], { badge: m[2], name: m[3], role: m[4] }])
  );
  const delegates = agentFiles.filter((f) => f !== MAIN_THREAD).map((f) => f.replace(/\.md$/, ''));
  for (const d of delegates) {
    if (!mapped.has(d)) {
      fail(`hooks/otto-trace.mjs: no entry for "${d}" — its runs would log as an anonymous 🤍 with no role, and /standup reads that log`);
    }
  }
  for (const k of mapped.keys()) {
    if (!delegates.includes(k)) fail(`hooks/otto-trace.mjs: maps "${k}", which is not a robot in agents/`);
  }
  // Badge + role must agree with Otto's roster, or the live trace and the durable
  // log disagree about who did the work.
  const ottoSrc = read(`agents/${MAIN_THREAD}`);
  for (const [id, { badge, name, role }] of mapped) {
    const row = new RegExp(`\\|\\s*${badge}\\s*\\|\\s*${name}\\s*\\|\\s*${role.replace(/[&]/g, '\\$&')}\\s*\\|`);
    if (!row.test(ottoSrc)) {
      fail(`hooks/otto-trace.mjs: "${id}" is ${badge} ${name} (${role}), which is not a row in Otto's roster — the log and the live trace would disagree`);
    }
  }
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

  // The README is checked too. Its skill count went stale for three versions
  // ("33 seat-kit skills" against a tree of 34) because only the manifests were
  // gated — and the README is the page a stranger actually reads. The skill regex
  // is deliberately NOT pinned to the phrase "seat-kit": it was, and rewording the
  // line to the truthful "38 skills" would have silently disarmed the check.
  // ("seat-kit" was itself a lie — roll-call, hiring-round and stuck-loop are
  // company skills, not seat kits.)
  for (const [where, desc] of [
    ['plugin.json', plugin.description],
    ['marketplace.json', entry?.description],
    ['README.md', read('README.md')],
  ]) {
    if (!desc) continue;
    for (const m of desc.matchAll(/(\d+)[ -]robot/g)) {
      if (Number(m[1]) !== robotCount) fail(`${where}: says "${m[0]}" but the tree has ${robotCount} robots`);
    }
    for (const m of desc.matchAll(/(\d+) (?:model-tiered robot )?subagents/g)) {
      if (Number(m[1]) !== robotCount) fail(`${where}: says "${m[0]}" but the tree has ${robotCount} robot subagents`);
    }
    for (const m of desc.matchAll(/(\d+)(?: seat-kit)? skills/g)) {
      if (Number(m[1]) !== skillDirs.length) fail(`${where}: says "${m[0]}" but the tree has ${skillDirs.length} skills`);
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
console.log(`valid: ${robotCount} robots + otto-foreman, ${skillDirs.length} skills, ${commands.length} commands, 2 hooks`);
