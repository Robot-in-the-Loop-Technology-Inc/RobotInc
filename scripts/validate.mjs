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
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// ------------------------------------------- roll-call: sentinel write must precede the card, in FILE order
// G measured 1/10: the card drawn correctly, the sentinel never written. Root cause was a proximity
// instruction ("written the moment the card is drawn") sitting near the draw instead of fused into it.
// 22.7.1's fix reordered the file so the write instruction appears BEFORE the wordmark — a skill is prose
// a model reads top to bottom, so file order is not cosmetic here, it is close to execution order. This is
// the one part of that fix that IS mechanically checkable (unlike the self-heal timestamp wording, which
// is prompt semantics, not a structural property of the tree): a future edit that moves the write section
// back below the card would silently reopen exactly this bug, and nothing else would catch it.
{
  const rc = read('skills/roll-call/SKILL.md');
  const writeIdx = rc.indexOf('Write the sentinel, then draw');
  const wordmarkIdx = rc.indexOf('## The wordmark');
  if (writeIdx === -1) {
    fail(`skills/roll-call: no "Write the sentinel, then draw" section found — the write-before-draw fix `
       + `for the G 1/10 (card drawn, sentinel never written) regressed or was renamed without updating this gate.`);
  } else if (wordmarkIdx === -1) {
    fail(`skills/roll-call: no "## The wordmark" section found — cannot verify write-before-draw ordering.`);
  } else if (writeIdx > wordmarkIdx) {
    fail(`skills/roll-call: the sentinel-write section appears AFTER "## The wordmark" — this is the exact `
       + `draw-then-write order that shipped a card with no sentinel (G 1/10). Move the write section before `
       + `the wordmark, or the fix silently regresses.`);
  }
}

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

// ------------------------------------------- otto-state.md / otto-state-global.md: named writers only
// Vector's original spec was that Otto is the SOLE writer of otto-state.md, upserting at relay
// time, instruction living in EXACTLY ONE prompt (agents/otto-foreman.md). v22.8.0 added a second,
// NAMED writer: hooks/otto-state.mjs, a deterministic mechanical backstop for the same file (see its
// header comment and agents/otto-foreman.md's "Announcing a handoff" — the prompt-driven write alone
// measured 0/15). That is a deliberate, documented exception, the same shape as `.otto-met` having
// exactly two named writers below — NOT a reopening of "any department may log its own state," which
// is still exactly the drift-by-duplication problem this gate exists to catch (see the otto-trace.mjs
// ROBOTS-map gate above for the same disease in an earlier organ). otto-state-global.md is newer
// still and has only ONE writer (the hook; there is no prompt-driven path for it at all). Gated here
// so the next edit that "helpfully" teaches Bitforge to log its own state — in either file — gets
// caught before it ships, not after someone notices two logs disagree.
{
  const MAIN_THREAD_FILE = `agents/${MAIN_THREAD}`;
  const STATE_FILES = ['otto-state.md', 'otto-state-global.md'];
  const STATE_WRITER_HOOK = 'otto-state.mjs';
  for (const f of agentFiles) {
    if (f === MAIN_THREAD) continue;
    const s = read(`agents/${f}`);
    for (const sf of STATE_FILES) {
      if (s.includes(sf)) {
        fail(`agents/${f}: mentions ${sf} — only ${MAIN_THREAD_FILE} and hooks/${STATE_WRITER_HOOK} may write `
           + `or know about it. A department that writes its own line rebuilds the drift this file exists to prevent.`);
      }
    }
  }
  // Also refuse the same leak from a skill or a command — the write path is a robot's job, not theirs.
  for (const d of skillDirs) {
    const s = read(`skills/${d}/SKILL.md`);
    for (const sf of STATE_FILES) {
      if (s.includes(sf)) fail(`skills/${d}: mentions ${sf} — the write path belongs to agents/${MAIN_THREAD} and hooks/${STATE_WRITER_HOOK} only.`);
    }
  }
  // `commands` isn't declared until the ---- commands section further down;
  // read the directory locally rather than depend on load order.
  // offboard.md is exempt: it names these exact paths so it can INVENTORY and,
  // with consent, DELETE them as part of teardown — it never writes the
  // state-log grammar this gate exists to protect, so it is not a second
  // writer in the sense this section guards against. Same shape as the
  // STATE_WRITER_HOOK exemption just above: a named, deliberate exception,
  // not a reopening of "any file may mention these names."
  const STATE_FILE_MENTION_EXEMPT = new Set(['offboard.md']);
  for (const f of readdirSync(join(REPO, 'commands')).filter((c) => c.endsWith('.md'))) {
    if (STATE_FILE_MENTION_EXEMPT.has(f)) continue;
    const s = read(`commands/${f}`);
    for (const sf of STATE_FILES) {
      if (s.includes(sf)) fail(`commands/${f}: mentions ${sf} — the write path belongs to agents/${MAIN_THREAD} and hooks/${STATE_WRITER_HOOK} only.`);
    }
  }
  // otto-state-global.md is hook-only — even Otto's own prompt has no business
  // naming it anywhere outside step 5 (the read path); if it starts appearing
  // near "Announcing a handoff" (the write path) that is the same drift with a
  // new filename. Read the hook file locally rather than depend on the `state`
  // variable declared later, in the ---- hooks section.
  if (existsSync(join(REPO, 'hooks/otto-state.mjs')) && !read('hooks/otto-state.mjs').includes('otto-state-global.md')) {
    fail('hooks/otto-state.mjs: does not mention otto-state-global.md — the hook is meant to be its only writer');
  }
}

// ------------------------------------------- otto-state.md is cwd-relative, never <config>-relative
// otto-profile.json and .otto-met are global, per-machine, under <config>. otto-state.md is
// the opposite on purpose: per-PROJECT, under ./.claude/, precisely so a stray mention of
// "<config>/otto-state.md" would silently point every project on a machine at one shared
// file — the same class of path confusion this feature has already shipped twice (the
// config-dir wander, the hardcoded ~/.claude gate above). A mention here is wrong by
// construction; there is no context in which it is correct.
{
  const BAD_STATE_PATH = /<config>`?\/otto-state\.md/;
  for (const dir of ['agents', 'skills', 'commands']) {
    const walk = dir === 'skills'
      ? readdirSync(join(REPO, dir)).map((d) => `${dir}/${d}/SKILL.md`).filter((p) => existsSync(join(REPO, p)))
      : readdirSync(join(REPO, dir)).filter((f) => f.endsWith('.md')).map((f) => `${dir}/${f}`);
    for (const p of walk) {
      if (BAD_STATE_PATH.test(read(p).replace(/\s+/g, ' '))) {
        fail(`${p}: refers to otto-state.md as <config>-relative — it is per-PROJECT (./.claude/otto-state.md, `
           + `cwd only), never per-machine. <config> is right for otto-profile.json and .otto-met; it is wrong here.`);
      }
    }
  }
}

// ------------------------------------------- otto-state.md line grammar, checked against its own example
// The grammar is prose in agents/otto-foreman.md, not a shipped file (otto-state.md is
// generated per-project at runtime) — so the one thing actually gateable is that the
// WORKED EXAMPLE in the spec matches the grammar it is illustrating. An example that drifts
// from its own rule is worse than no example: it is the thing a future edit copy-pastes.
{
  const otto = read(`agents/${MAIN_THREAD}`);
  // Grammar converged with the ↳ relay line (2026-07-14, the write-path weld): badge, Name, (Role), item,
  // note, then the written copy's date suffix. Two prefixes share this same body — `↳ ` shown to the human,
  // `· ` written to otto-state.md — so the example pair below must both match.
  const GRAMMAR = /^ {4}· \S+ [A-Z][A-Za-z]+ \([A-Za-z ]+\) — .+: .+ {2}\(\d{4}-\d{2}-\d{2}\)$/m;
  if (!GRAMMAR.test(otto)) {
    fail(`agents/${MAIN_THREAD}: the otto-state.md worked example does not match its own stated grammar `
       + `(· <badge> <Name> (<Role>) — <item>: <note>  (YYYY-MM-DD)) — fix the example or the rule, they must agree.`);
  }
}

// ------------------------------------------- .otto-met has exactly two writers, named, no drift
// 22.7.1's migration fix gave agents/otto-foreman.md a second job w.r.t. .otto-met: it used to
// only READ the sentinel; the seated-profile override now WRITES it too (self-heal). That is a
// deliberate, documented exception to "one writer" — roll-call writes it at first meeting,
// otto-foreman.md self-heals it on a proven migration gap — but it is now exactly the moment a
// THIRD file could start writing or checking it "helpfully" and nobody would notice until two
// writers disagreed. Lock the set at exactly these two before that happens.
{
  const SENTINEL_WRITERS = new Set(['roll-call']);
  for (const d of skillDirs) {
    if (SENTINEL_WRITERS.has(d)) continue;
    if (/\.otto-met/.test(read(`skills/${d}/SKILL.md`))) {
      fail(`skills/${d}: mentions .otto-met — only skills/roll-call and agents/${MAIN_THREAD} may write or `
         + `rely on it. A third writer is exactly how two copies of "have we met" start to disagree.`);
    }
  }
  for (const f of agentFiles) {
    if (f === MAIN_THREAD) continue;
    if (/\.otto-met/.test(read(`agents/${f}`))) {
      fail(`agents/${f}: mentions .otto-met — only agents/${MAIN_THREAD} and skills/roll-call may write or `
         + `rely on it.`);
    }
  }
}

// ------------------------------------------- otto-ledger.log: filename referenced consistently
// The ledger's write path is code (hooks/otto-trace.mjs), not a prompt duplicated across department
// files, so the otto-state.md-shaped "single writer" drift risk does not apply the same way here —
// nothing else is instructed to write it. What IS real and mechanically checkable: the three places
// that must agree on its existence (the hook that writes it, Baudrate who reads it, the docs that
// name it) all spell the filename identically. A silent typo in any one of them (otto-ledger.log vs
// otto_ledger.log) would have Baudrate confidently reading a file the hook never wrote to.
{
  const LEDGER_FILE = 'otto-ledger.log';
  const mustMention = [
    ['hooks/otto-trace.mjs', 'hooks/otto-trace.mjs'],
    [`agents/baudrate-cfo.md`, 'agents/baudrate-cfo.md'],
    ['docs/profile-schema.md', 'docs/profile-schema.md'],
  ];
  for (const [path, label] of mustMention) {
    if (existsSync(join(REPO, path)) && !read(path).includes(LEDGER_FILE)) {
      fail(`${label}: does not mention "${LEDGER_FILE}" — the hook that writes it, the robot that reads `
         + `it, and the docs that name it must all agree on the exact filename.`);
    }
  }
}

// ------------------------------------------- spend report: no rigor-declaration jargon on a rendered surface
// docs/spec-spend-report.md §2/§8/§9/§11 -- the hard, non-negotiable constraint: the words "tier", "WORKSHOP",
// "T1", "T2", "T3" (this codebase's internal rigor-declaration vocabulary, docs/doctrine.md's "Rigor tiers")
// are captured and consumed ONLY to compute the plain-language proportionality flag; they must never reach a
// human, on any surface. Scan-exclusion seam (Vector's ruling, §10): otto-ledger.log legitimately stores
// `tier=<T>` backstage and hooks/otto-trace.mjs IS the capture mechanism -- neither is a rendered surface and
// neither is scanned here; scanning them would false-positive on this feature's own mechanism.
{
  // JARGON_RE is single-sourced in viewer/server.mjs (exported specifically so
  // this scan and scripts/test-spend-report.mjs's own jargon tests can never
  // quietly drift apart). This first import just reads the constant off the
  // module — it does not care which CLAUDE_CONFIG_DIR was active when Node
  // evaluated the file, since nothing here calls computeSpendReport() yet.
  const { JARGON_RE: JARGON } = await import(pathToFileURL(join(REPO, 'viewer/server.mjs')).href);

  // viewer/spend.html has no legitimate reason to ever mention this vocabulary
  // at all (unlike agents/otto-foreman.md or agents/baudrate-cfo.md, which
  // separately discuss Stripe pricing tiers and the human's own otto-profile
  // "tier" seat setting) -- whole-file scan. This is the exact regression the
  // mockup shipped with ("declared WORKSHOP", "T2 targeted-board runs",
  // .tier-pill/.tier-workshop) -- it must be caught here before it ships again.
  if (existsSync(join(REPO, 'viewer/spend.html'))) {
    const spendHtml = read('viewer/spend.html');
    if (JARGON.test(spendHtml)) {
      fail('viewer/spend.html: contains forbidden rigor-declaration vocabulary (tier/WORKSHOP/T1-3) -- this '
         + 'user-facing page must never teach the word "tier" (docs/spec-spend-report.md §2)');
    }
  }

  // agents/otto-foreman.md and agents/baudrate-cfo.md legitimately use "tier"
  // elsewhere in this same file (Stripe pricing tiers, the human's own
  // otto-profile tier setting) -- a whole-file scan would false-positive on
  // those. Only the SPEND-REPORT-PROSE marker block -- the actual report-
  // composing prose this feature added -- is scanned.
  for (const path of ['agents/otto-foreman.md', 'agents/baudrate-cfo.md']) {
    if (!existsSync(join(REPO, path))) continue;
    const src = read(path);
    const m = src.match(/<!-- SPEND-REPORT-PROSE:START[\s\S]*?-->([\s\S]*?)<!-- SPEND-REPORT-PROSE:END -->/);
    if (!m) {
      fail(`${path}: no SPEND-REPORT-PROSE marker block found -- the no-jargon scan cannot verify the `
         + `report-composing prose (docs/spec-spend-report.md §9)`);
      continue;
    }
    if (JARGON.test(m[1])) {
      fail(`${path}: the SPEND-REPORT-PROSE block contains forbidden rigor-declaration vocabulary `
         + `(tier/WORKSHOP/T1-3) -- this prose composes a report a human reads and must never teach that word`);
    }
  }

  // viewer/server.mjs's SOURCE legitimately discusses the capture/scoping
  // mechanism in comments (parseLedgerLine, the /spend endpoint) -- a text
  // scan of the file would false-positive on its own backstage documentation.
  // What must actually stay clean is the RENDERED OUTPUT a client receives,
  // so exercise the real function against a fixture built to populate every
  // string field (a flagged row, so `message` is non-null) and scan the real
  // JSON response instead of the source text.
  if (existsSync(join(REPO, 'viewer/server.mjs'))) {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const scratchDir = mkdtempSync(join(tmpdir(), 'spend-jargon-scan-'));
    mkdirSync(join(scratchDir, '.claude'), { recursive: true });
    const project = 'spend-jargon-scan-project';
    const ledgerLines = [
      `2026-07-22T10:00:00.000Z [${project}] Bitforge tokens=10000 duration_ms=60000 tier=T2\n`,
      `2026-07-22T10:05:00.000Z [${project}] Bitforge tokens=40000 duration_ms=120000 tier=T2\n`,
    ].join('');
    writeFileSync(join(scratchDir, '.claude', 'otto-ledger.log'), ledgerLines, 'utf8');

    const prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
    // CONFIG_DIR is a top-level const in viewer/server.mjs, snapshotted at
    // import time -- it must be set BEFORE the dynamic import below, not after.
    process.env.CLAUDE_CONFIG_DIR = join(scratchDir, '.claude');
    try {
      const mod = await import(pathToFileURL(join(REPO, 'viewer/server.mjs')).href + `?jargon-scan=${Date.now()}`);
      const report = mod.computeSpendReport();
      if (!report.flags.length || !report.flags[0].message) {
        fail('scripts/validate.mjs: the spend-report jargon-scan fixture did not produce a flagged row -- '
           + 'cannot verify viewer/server.mjs\'s rendered output is jargon-free (fixture drifted from the '
           + 'threshold in docs/spec-spend-report.md §8)');
      } else if (JARGON.test(JSON.stringify(report))) {
        fail('viewer/server.mjs: the /spend endpoint\'s rendered JSON output contains forbidden rigor-'
           + 'declaration vocabulary (tier/WORKSHOP/T1-3) -- this must never reach a client');
      }
    } finally {
      if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }
}

// ------------------------------------------- spend report: spendReporting enum, single source
// docs/profile-schema.md is the schema's one definition (its own header says so); agents/otto-foreman.md's
// footer table must state the exact same four values, same convention as the PROFILE_CHAR_CAP drift gate
// above -- a future edit to one alone (a renamed value, a dropped setting) gets caught here instead of
// shipping a dial that silently disagrees with what the docs promise.
{
  const schema = read('docs/profile-schema.md');
  const schemaEnumMatch = schema.match(/"spendReporting":\s*"[^"]*",\s*\/\/\s*(.+)/);
  if (!schemaEnumMatch) {
    fail('docs/profile-schema.md: no `"spendReporting": "..." // <enum>` line found in the whole-file '
       + 'example -- the spendReporting drift gate cannot run');
  } else {
    const schemaEnum = new Set(
      schemaEnumMatch[1].split('|').map((s) => s.replace(/\(default\)/i, '').trim()).filter(Boolean)
    );
    const otto = read(`agents/${MAIN_THREAD}`);
    for (const val of schemaEnum) {
      const re = new RegExp('`' + val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`');
      if (!re.test(otto)) {
        fail(`agents/${MAIN_THREAD}: spendReporting drift -- docs/profile-schema.md's enum includes `
           + `"${val}", not found as a backtick-quoted value in the spend footer's dial table`);
      }
    }
    const ottoValues = new Set([...otto.matchAll(/\|\s*`(off|on-request|build-end|verbose)`/g)].map((m) => m[1]));
    for (const val of ottoValues) {
      if (!schemaEnum.has(val)) {
        fail(`agents/${MAIN_THREAD}: spendReporting drift -- the spend footer's dial table lists "${val}", `
           + `which docs/profile-schema.md's enum does not have`);
      }
    }
  }
}

// ------------------------------------------- the rigor-tiers core lesson, verbatim in both homes
// docs/doctrine.md carries the full doctrine; agents/otto-foreman.md carries a compact version because
// that file is billed every turn. The one sentence Otto named as the actual point of the retro --
// "keep it verbatim or improve it, don't drop it" -- is exactly the line a future edit is most likely
// to quietly soften in one copy and not the other. Gate the two copies staying identical, not just
// both present.
{
  const CORE_LESSON = 'A scary finding raises the tier of THAT case — never the default tier of every case after it.';
  const otto = read(`agents/${MAIN_THREAD}`);
  const doctrine = existsSync(join(REPO, 'docs/doctrine.md')) ? read('docs/doctrine.md') : '';
  if (!otto.includes(CORE_LESSON)) {
    fail(`agents/${MAIN_THREAD}: missing the rigor-tiers core lesson sentence verbatim -- it must read `
       + `"${CORE_LESSON}"`);
  }
  if (doctrine && !doctrine.includes(CORE_LESSON)) {
    fail(`docs/doctrine.md: missing the rigor-tiers core lesson sentence verbatim, or it has drifted from `
       + `agents/${MAIN_THREAD}'s copy -- must read "${CORE_LESSON}"`);
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
  // v22.11.0 adds three goal-anchor files (docs/spec-goal-contract.md):
  // otto-goal-lib.mjs (a shared library, never itself registered in
  // hooks.json), otto-goal-compact.mjs (SessionStart/compact), and
  // otto-goal-audit.mjs (PostToolUse, second entry under "Task").
  const EXPECTED_HOOK_FILES = [
    'hooks.json', 'otto-trace.mjs', 'otto-state.mjs', 'otto-facts.mjs',
    'otto-goal-lib.mjs', 'otto-goal-compact.mjs', 'otto-goal-audit.mjs',
  ];
  const extra = hookFiles.filter((f) => !EXPECTED_HOOK_FILES.includes(f));
  if (extra.length) fail(`unexpected files in hooks/: ${extra.join(', ')} — a new hook is a new runtime dependency; see README`);
  const trace = read('hooks/otto-trace.mjs');
  if (VS16.test(trace)) fail('hooks/otto-trace.mjs: contains a U+FE0F variation-selector emoji');
  if (/Level[- ]?2|Operator'/.test(trace)) fail('hooks/otto-trace.mjs: personal tier leaked in');
  const stateHookPath = join(REPO, 'hooks/otto-state.mjs');
  const state = existsSync(stateHookPath) ? read('hooks/otto-state.mjs') : null;
  if (state) {
    if (VS16.test(state)) fail('hooks/otto-state.mjs: contains a U+FE0F variation-selector emoji');
    if (/Level[- ]?2|Operator'/.test(state)) fail('hooks/otto-state.mjs: personal tier leaked in');
  }
  const factsHookPath = join(REPO, 'hooks/otto-facts.mjs');
  const facts = existsSync(factsHookPath) ? read('hooks/otto-facts.mjs') : null;
  if (facts) {
    if (VS16.test(facts)) fail('hooks/otto-facts.mjs: contains a U+FE0F variation-selector emoji');
    if (/Level[- ]?2|Operator'/.test(facts)) fail('hooks/otto-facts.mjs: personal tier leaked in');
  }
  // v22.11.0 goal-anchor files — same VS16 / personal-tier scans as every
  // other shipped hook script above.
  const goalFiles = {
    'hooks/otto-goal-lib.mjs': existsSync(join(REPO, 'hooks/otto-goal-lib.mjs')) ? read('hooks/otto-goal-lib.mjs') : null,
    'hooks/otto-goal-compact.mjs': existsSync(join(REPO, 'hooks/otto-goal-compact.mjs')) ? read('hooks/otto-goal-compact.mjs') : null,
    'hooks/otto-goal-audit.mjs': existsSync(join(REPO, 'hooks/otto-goal-audit.mjs')) ? read('hooks/otto-goal-audit.mjs') : null,
  };
  for (const [label, src] of Object.entries(goalFiles)) {
    if (!src) continue;
    if (VS16.test(src)) fail(`${label}: contains a U+FE0F variation-selector emoji`);
    if (/Level[- ]?2|Operator'/.test(src)) fail(`${label}: personal tier leaked in`);
  }
  const goalLib = goalFiles['hooks/otto-goal-lib.mjs'];
  const goalCompact = goalFiles['hooks/otto-goal-compact.mjs'];
  const goalAudit = goalFiles['hooks/otto-goal-audit.mjs'];
  const hooks = JSON.parse(read('hooks/hooks.json'));
  const events = Object.keys(hooks.hooks || {});
  const ALLOWED_EVENTS = new Set(['SessionStart', 'SubagentStop', 'PostToolUse']);
  const badEvents = events.filter((e) => !ALLOWED_EVENTS.has(e));
  if (badEvents.length) fail(`hooks.json wires an unreviewed event: ${badEvents.join(', ')} (allowed: ${[...ALLOWED_EVENTS].join(', ')})`);
  if (!events.includes('SubagentStop')) fail('hooks.json is missing the SubagentStop trace hook');

  // v22.8.2 HOTFIX: SubagentStop must wire BOTH otto-trace.mjs (the
  // best-effort activity trace, unchanged) AND otto-state.mjs (the relay-
  // state writer's recovery path for background-default dispatches — see
  // docs/spec-relay-async-fix.md). One entry per script, both "command"/node,
  // same shape the PostToolUse gate below already enforces for otto-state.mjs.
  if (events.includes('SubagentStop')) {
    const stopScripts = new Set();
    for (const entry of hooks.hooks.SubagentStop || []) {
      for (const h of entry.hooks || []) {
        const match = (h.args || []).find((a) => /otto-(trace|state)\.mjs$/.test(a));
        if (match) stopScripts.add(match.match(/otto-(trace|state)\.mjs$/)[0]);
        if (h.type !== 'command') {
          fail(`hooks.json: SubagentStop hook has "type": "${h.type}" — must be "command", same convention `
             + `every other hook here uses.`);
        }
      }
    }
    if (!stopScripts.has('otto-trace.mjs')) fail('hooks.json: SubagentStop no longer wires otto-trace.mjs');
    if (!stopScripts.has('otto-state.mjs')) {
      fail('hooks.json: SubagentStop does not wire otto-state.mjs — the v22.8.2 hotfix requires it as the '
         + 'recovery path for background-default (async_launched) dispatches; see docs/spec-relay-async-fix.md');
    }
  }

  // v22.8.2 HOTFIX source-text gates: prove otto-state.mjs actually implements
  // the background-default recovery path, not just that hooks.json wires it.
  // Bounded string checks, same footing as the U+FE0F/tier-leak scans above —
  // cheap, direct, and each tied to one specific fact the fix depends on
  // (docs/spec-relay-async-fix.md's Step 1 correlator evidence).
  if (state) {
    if (!state.includes('async_launched')) {
      fail('hooks/otto-state.mjs: no reference to "async_launched" — the background-dispatch status this '
         + 'hotfix exists to handle. See docs/spec-relay-async-fix.md.');
    }
    if (!state.includes('SubagentStop') || !state.includes('hook_event_name')) {
      fail('hooks/otto-state.mjs: missing SubagentStop / hook_event_name dispatch — the hook must branch on '
         + 'payload.hook_event_name to route the recovery path.');
    }
    if (!state.includes('.otto-pending')) {
      fail('hooks/otto-state.mjs: no reference to ".otto-pending" — the marker directory that carries a '
         + 'background dispatch\'s description from PostToolUse to SubagentStop.');
    }
  }

  // PostToolUse (otto-state.mjs, matcher "Task"): a design draft for this exact
  // entry called for `"type": "script"` instead of the established `"command"`
  // convention. Tested empirically (not assumed): a hook registered with
  // `"type": "script"` never fires — silently, same failure class as gating on
  // `tool_name === "Task"` instead of the delivered `"Agent"` (see
  // docs/hook-events.md). Gate the working shape directly so a future
  // "helpful" edit toward the untested draft trips CI instead of shipping dark.
  //
  // v22.11.0 adds a SECOND hook (otto-goal-audit.mjs) inside this SAME "Task"
  // entry's `hooks` array (docs/spec-goal-contract.md §6.1) — mirrors the
  // SubagentStop gate's own `stopScripts` Set pattern above rather than
  // requiring every individual hook to reference otto-state.mjs, which would
  // false-fail the moment a second, differently-named script joined the array.
  if (events.includes('PostToolUse')) {
    for (const entry of hooks.hooks.PostToolUse || []) {
      if (entry.matcher !== 'Task') {
        fail(`hooks.json: PostToolUse matcher is "${entry.matcher}", must be "Task" — this is the ONLY matcher `
           + `string for the Task tool; the delivered event's own tool_name field is "Agent", a separate fact `
           + `the hook script itself must gate on (see docs/hook-events.md)`);
      }
      const taskScripts = new Set();
      for (const h of entry.hooks || []) {
        if (h.type !== 'command') {
          fail(`hooks.json: PostToolUse hook has "type": "${h.type}" — must be "command" (the same convention `
             + `SessionStart and SubagentStop already use). "script" was tried and empirically never fires; `
             + `see docs/hook-events.md.`);
        }
        const match = (h.args || []).find((a) => /otto-(state|goal-audit)\.mjs$/.test(a));
        if (h.command === 'node' && match) taskScripts.add(match.match(/otto-(state|goal-audit)\.mjs$/)[0]);
        if (!(h.timeout > 0 && h.timeout <= 10)) {
          fail(`hooks.json: PostToolUse timeout is ${h.timeout}, expected a small bounded number (<=10s) — `
             + `file I/O plus lock contention must never hang a Task return`);
        }
      }
      if (!taskScripts.has('otto-state.mjs')) fail('hooks.json: PostToolUse "Task" entry does not invoke node on hooks/otto-state.mjs');
      if (goalAudit && !taskScripts.has('otto-goal-audit.mjs')) {
        fail('hooks.json: PostToolUse "Task" entry does not invoke node on hooks/otto-goal-audit.mjs — the '
           + 'v22.11.0 goal-anchor dispatch audit must be a second entry alongside otto-state.mjs, see '
           + 'docs/spec-goal-contract.md §6.1');
      }
    }
  }

  // The SessionStart hook is the one place a regression could silently smuggle
  // the runtime dependency back in (or fire on the wrong trigger). TWO entries
  // are expected here, deliberately, since v22.8.0's facts injector: the
  // original zero-dependency echo TRIGGER (gated exactly as always — it is
  // what makes the whole session-open protocol fire at all, even with no
  // Node on the machine) and a Node-only FACTS hook (hooks/otto-facts.mjs)
  // that resolves <config> and a handful of existence facts mechanically so
  // the model never has to shell out to check CLAUDE_CONFIG_DIR itself — a
  // live, screenshot-verified bug (a brand-new user's first turn was a Bash
  // permission dialog). The facts hook is explicitly ALLOWED to use node/args
  // — it degrades to silently absent when Node is missing (see that file's
  // own header comment), which is why it never needs the trigger's
  // zero-dependency or apostrophe-safety properties.
  // v22.11.0 adds a THIRD SessionStart entry, deliberately on a DIFFERENT
  // matcher ("compact", not "startup") — hooks/otto-goal-compact.mjs, the
  // deterministic compaction-preservation reader (docs/spec-goal-contract.md
  // §4.C). This is the same "two separate SessionStart hooks, deliberately"
  // precedent otto-facts.mjs's own header already established for the
  // "startup" matcher, extended to a second matcher rather than reopened.
  const EXPECTED_SESSION_START_ENTRIES = goalCompact ? 3 : 2;
  const sessionStartEntries = hooks.hooks?.SessionStart || [];
  if (sessionStartEntries.length !== EXPECTED_SESSION_START_ENTRIES) {
    fail(`hooks.json: expected exactly ${EXPECTED_SESSION_START_ENTRIES} SessionStart entries (the `
       + `zero-dependency trigger + the Node facts injector${goalCompact ? ' + the goal-anchor compact reader' : ''}), `
       + `found ${sessionStartEntries.length}`);
  }
  let sawTrigger = false;
  let sawFactsHook = false;
  let sawCompactHook = false;
  for (const entry of sessionStartEntries) {
    const isCompactEntry = (entry.hooks || []).some(
      (h) => h.command === 'node' && (h.args || []).some((a) => /otto-goal-compact\.mjs$/.test(a))
    );
    if (isCompactEntry) {
      if (entry.matcher !== 'compact') {
        fail(`hooks.json: the otto-goal-compact.mjs entry's matcher is "${entry.matcher}", must be "compact" — `
           + `that is the real, usable post-compaction hook (docs/spec-goal-contract.md §4.C); "PreCompact" does `
           + `not exist in this codebase's evidence base.`);
      }
      for (const h of entry.hooks || []) {
        sawCompactHook = true;
        if (h.type !== 'command') {
          fail(`hooks.json: SessionStart compact hook has "type": "${h.type}" — must be "command", the same `
             + `convention every other hook here uses.`);
        }
        if (!(h.timeout > 0 && h.timeout <= 10)) {
          fail(`hooks.json: SessionStart compact hook timeout is ${h.timeout}, expected a small bounded number `
             + `(<=10s) — file I/O must never hang session start`);
        }
      }
      continue; // the startup-only checks below (trigger shape, facts hook shape) don't apply to this entry
    }
    if (entry.matcher !== 'startup') {
      fail(`hooks.json: SessionStart matcher is "${entry.matcher}", must be "startup" — firing on resume/clear/compact `
         + `risks re-running roll-call for someone already met`);
    }
    for (const h of entry.hooks || []) {
      const isFactsHook = h.command === 'node' && (h.args || []).some((a) => /otto-facts\.mjs$/.test(a));
      if (isFactsHook) {
        sawFactsHook = true;
        if (h.type !== 'command') {
          fail(`hooks.json: SessionStart facts hook has "type": "${h.type}" — must be "command", the same `
             + `convention every other hook here uses ("script" was tried elsewhere in this file and empirically `
             + `never fires; see docs/hook-events.md)`);
        }
        if (!(h.timeout > 0 && h.timeout <= 10)) {
          fail(`hooks.json: SessionStart facts hook timeout is ${h.timeout}, expected a small bounded number `
             + `(<=10s) — file I/O must never hang session start`);
        }
        continue; // zero-dependency / single-quote-literal gates below apply to the TRIGGER only
      }
      sawTrigger = true;
      if (h.args) fail('hooks.json: SessionStart trigger hook sets "args" — that switches Claude Code to EXEC form, which bypasses the shell entirely and would silently stop injecting the echoed text as shell output');
      if (/\bnode\b|\bpython3?\b|\.mjs\b|\.py\b/.test(h.command || '')) {
        fail('hooks.json: SessionStart trigger command references node/python/a script file — the whole point of this hook is zero runtime dependency, see the comment above');
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
        fail(`hooks.json: SessionStart trigger command is not wrapped in the expected single-quoted literal — cannot verify it is apostrophe-safe`);
      } else if (cmd.slice(firstQuote + 1, lastQuote).includes("'")) {
        fail(`hooks.json: SessionStart trigger command payload contains an apostrophe (U+0027) — it closes the single-quoted `
           + `literal early in BOTH bash and PowerShell, and the remainder re-parses as shell syntax, silently, on a `
           + `bare-Windows machine with no error a human will ever see. Rephrase to avoid it ("does not", not `
           + `"doesn't"). Do not substitute a typographic apostrophe (U+2019) as an escape hatch unless it has been `
           + `empirically verified byte-identical through both shells — it has not been.`);
      }
      if (!(h.timeout > 0 && h.timeout <= 10)) fail(`hooks.json: SessionStart trigger timeout is ${h.timeout}, expected a small bounded number (<=10s) — this hook must never hang session start`);
    }
  }
  if (!sawTrigger) fail('hooks.json: no zero-dependency SessionStart trigger entry found (expected an echo-based entry)');
  if (!sawFactsHook) fail('hooks.json: no Node-based SessionStart facts hook found (expected an entry invoking hooks/otto-facts.mjs)');
  if (goalCompact && !sawCompactHook) {
    fail('hooks.json: no SessionStart "compact" entry found invoking hooks/otto-goal-compact.mjs — see '
       + 'docs/spec-goal-contract.md §4.C');
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

  // otto-state.mjs carries its own copy of the same ROBOTS map (hook scripts
  // are invoked standalone via `node <file>`, so it cannot import otto-trace's
  // copy) — same disease, same gate: a robot missing from THIS map renders as
  // an anonymous 🧩 hired-staff line in relay state instead of its own badge.
  if (state) {
    const stateMapped = new Map(
      [...state.matchAll(/^\s*'([a-z-]+)':\s*\['(.+?)',\s*'(.+?)',\s*'(.+?)'\]/gm)]
        .map((m) => [m[1], { badge: m[2], name: m[3], role: m[4] }])
    );
    for (const d of delegates) {
      if (!stateMapped.has(d)) {
        fail(`hooks/otto-state.mjs: no entry for "${d}" — its Task calls would render as an anonymous 🧩 hired-staff line instead of its own badge`);
      }
    }
    for (const k of stateMapped.keys()) {
      if (!delegates.includes(k)) fail(`hooks/otto-state.mjs: maps "${k}", which is not a robot in agents/`);
    }
    for (const [id, { badge, name, role }] of stateMapped) {
      const row = new RegExp(`\\|\\s*${badge}\\s*\\|\\s*${name}\\s*\\|\\s*${role.replace(/[&]/g, '\\$&')}\\s*\\|`);
      if (!row.test(ottoSrc)) {
        fail(`hooks/otto-state.mjs: "${id}" is ${badge} ${name} (${role}), which is not a row in Otto's roster — relay state and the roster would disagree`);
      }
    }
    // The two hooks' maps must also agree with EACH OTHER, not just with the
    // roster independently — two maps that both individually match Otto's
    // table can still disagree with one another if a row is copy-pasted wrong.
    for (const [id, entry] of mapped) {
      const other = stateMapped.get(id);
      if (other && (other.badge !== entry.badge || other.name !== entry.name || other.role !== entry.role)) {
        fail(`hooks/otto-trace.mjs and hooks/otto-state.mjs disagree on "${id}": `
           + `${entry.badge} ${entry.name} (${entry.role}) vs ${other.badge} ${other.name} (${other.role})`);
      }
    }
  }
}

// ------------------------------------------------- facts hook: STOCK_AGENT_IDS <-> agents/*.md
// v22.8.0's session-open inventory (hooks/otto-facts.mjs) flags a filename collision
// deterministically, in the hook, by comparing a user's own agent ids against a hardcoded
// STOCK_AGENT_IDS set — the same "structure beats wording, the machine judges" shape as the
// otto-trace.mjs / otto-state.mjs ROBOTS-map gates just above, and the same disease those exist
// to catch: a robot added, removed, or renamed in agents/ without updating the hook's own copy
// of the list silently produces a WRONG collision verdict for every user from then on (a false
// negative — a real shadowing agent goes undetected — is the dangerous direction, since it's the
// one the model has no other way to catch; the hook owns this check specifically because the
// model no longer scans agents/ itself under inv=ok). Parsed from source text, same technique
// the ROBOTS-map gates use, since the hook is invoked standalone (`node hooks/otto-facts.mjs`)
// and cannot import this validator's own agentFiles list.
{
  const facts = read('hooks/otto-facts.mjs');
  const setBlock = (facts.match(/STOCK_AGENT_IDS = new Set\(\[([\s\S]*?)\]\)/) || [])[1];
  if (!setBlock) {
    fail('hooks/otto-facts.mjs: no STOCK_AGENT_IDS = new Set([...]) block found — the collision-detection gate below cannot run');
  } else {
    const stockIds = new Set([...setBlock.matchAll(/'([a-z][a-z-]*)'/g)].map((m) => m[1]));
    const treeIds = new Set(agentFiles.map((f) => f.replace(/\.md$/, '')));
    for (const id of treeIds) {
      if (!stockIds.has(id)) {
        fail(`hooks/otto-facts.mjs: STOCK_AGENT_IDS is missing "${id}" (present in agents/) — a user file named `
           + `${id}.md would silently go undetected as a collision, the exact "robot added, hook not updated" drift this gate exists to catch`);
      }
    }
    for (const id of stockIds) {
      if (!treeIds.has(id)) {
        fail(`hooks/otto-facts.mjs: STOCK_AGENT_IDS carries "${id}", which is not a robot in agents/ — a retired `
           + `or renamed robot left stale here would flag a false collision for a user who legitimately owns that filename`);
      }
    }
  }
}

// ------------------------------------------------- memory cap: PROFILE_CHAR_CAP <-> docs/profile-schema.md
// docs/spec-memory-cap.md §4: the number lives in exactly one place in code
// (PROFILE_CHAR_CAP in hooks/otto-facts.mjs) and docs/profile-schema.md states
// it in prose -- same drift-prevention convention as the ROBOTS-map gates
// above (a hook's copy of a truth and a doc's copy of the same truth, cross-
// checked so a future edit to one alone gets caught here instead of shipping
// a cap that disagrees with what the docs promise).
{
  const facts = read('hooks/otto-facts.mjs');
  const capMatch = facts.match(/PROFILE_CHAR_CAP\s*=\s*(\d+)/);
  if (!capMatch) {
    fail('hooks/otto-facts.mjs: no "PROFILE_CHAR_CAP = <number>" constant found — the memory-cap drift gate below cannot run');
  } else {
    const codeCap = Number(capMatch[1]);
    const schema = existsSync(join(REPO, 'docs/profile-schema.md')) ? read('docs/profile-schema.md') : '';
    if (!schema) {
      fail('docs/profile-schema.md: missing — cannot verify it states the same PROFILE_CHAR_CAP as hooks/otto-facts.mjs');
    } else {
      // Accept "2,000" or "2000" in prose — either spelling is fine, as long
      // as the digits match the code's number exactly.
      const proseMatch = schema.match(/([\d,]+)\s*characters/);
      const proseCap = proseMatch ? Number(proseMatch[1].replace(/,/g, '')) : null;
      if (proseCap === null) {
        fail('docs/profile-schema.md: no "<number> characters" cap statement found — the memory-cap section (docs/spec-memory-cap.md §7) is missing or reworded past this gate\'s pattern');
      } else if (proseCap !== codeCap) {
        fail(`memory cap drift: hooks/otto-facts.mjs's PROFILE_CHAR_CAP is ${codeCap}, but docs/profile-schema.md's prose says ${proseCap} characters — the two must agree`);
      }
    }
  }
}

// ------------------------------------------------- goal anchor: ANCHOR_SENTINEL / ANCHOR_CHAR_CAP single-source
// docs/spec-goal-contract.md §4.A / Cohesion note item 9: both constants are
// defined EXACTLY ONCE, in hooks/otto-goal-lib.mjs, and imported everywhere
// else (hooks/otto-goal-compact.mjs, hooks/otto-goal-audit.mjs,
// hooks/otto-facts.mjs) — never redefined. Same drift-prevention shape as the
// PROFILE_CHAR_CAP cross-check just above: a second, independently-hardcoded
// copy is exactly how the injected anchor, the post-compaction anchor, and
// the audit's idempotency check would quietly disagree.
{
  const goalHookFiles = [
    'hooks/otto-goal-lib.mjs', 'hooks/otto-goal-compact.mjs', 'hooks/otto-goal-audit.mjs', 'hooks/otto-facts.mjs',
    'hooks/otto-state.mjs', 'hooks/otto-trace.mjs',
  ].filter((p) => existsSync(join(REPO, p)));
  if (existsSync(join(REPO, 'hooks/otto-goal-lib.mjs'))) {
    for (const [constName, defRe] of [
      ['ANCHOR_SENTINEL', /(?:export )?const ANCHOR_SENTINEL\s*=/g],
      ['ANCHOR_CHAR_CAP', /(?:export )?const ANCHOR_CHAR_CAP\s*=/g],
    ]) {
      const definedIn = [];
      for (const p of goalHookFiles) {
        const count = (read(p).match(defRe) || []).length;
        if (count) definedIn.push(p);
      }
      if (definedIn.length === 0) {
        fail(`hooks/otto-goal-lib.mjs: no "${constName}" constant definition found — the single-source drift gate cannot run`);
      } else if (definedIn.length > 1 || definedIn[0] !== 'hooks/otto-goal-lib.mjs') {
        fail(`${constName} must be defined exactly once, in hooks/otto-goal-lib.mjs — found in: ${definedIn.join(', ')}`);
      }
    }
  }
}

// ------------------------------------------------- goal anchor: single-PreToolUse-updatedInput-emitter invariant
// docs/spec-goal-contract.md §4.A: hooks/otto-goal-inject.mjs (the deferred
// PreToolUse inject hook, built only once build-task-1's spike confirms
// feasibility) will be the ONLY PreToolUse hook ever allowed to emit
// `updatedInput` — Claude Code resolves multiple emitters non-deterministically
// (last-writer-wins), which would make that hook's own guarantee unverifiable.
// DORMANT BY DESIGN, NOT YET LOAD-BEARING: this build ships no PreToolUse
// entry at all (§4.A is deferred; see TASKS.md), so the loop below currently
// iterates zero entries and this gate passes vacuously. It is written now,
// against the real hooks.json structure, so the exact day a PreToolUse entry
// is added this check starts doing real work with no further edit required —
// the seam §4.A slots into, not a placeholder to remember to come back to.
{
  const hooksJson = JSON.parse(read('hooks/hooks.json'));
  const preToolUseEntries = hooksJson.hooks?.PreToolUse || [];
  const emitters = [];
  for (const entry of preToolUseEntries) {
    for (const h of entry.hooks || []) {
      for (const arg of h.args || []) {
        const m = arg.match(/([^/\\]+\.mjs)$/);
        if (!m) continue;
        const scriptPath = join(REPO, 'hooks', m[1]);
        if (existsSync(scriptPath) && read(`hooks/${m[1]}`).includes('updatedInput')) {
          emitters.push(m[1]);
        }
      }
    }
  }
  const uniqueEmitters = [...new Set(emitters)];
  if (uniqueEmitters.length > 1) {
    fail(`hooks.json: more than one PreToolUse script emits "updatedInput" (${uniqueEmitters.join(', ')}) — `
       + `Claude Code resolves multiple emitters non-deterministically (last-writer-wins); merge into one hook. `
       + `See docs/spec-goal-contract.md §4.A's single-mutator invariant.`);
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
const shippedHookScripts = readdirSync(join(REPO, 'hooks')).filter((f) => f.endsWith('.mjs')).length;
console.log(`valid: ${robotCount} robots + otto-foreman, ${skillDirs.length} skills, ${commands.length} commands, ${shippedHookScripts} hook scripts`);
