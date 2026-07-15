#!/usr/bin/env node
// Otto relay-state writer — PostToolUse hook (matcher: Task).
//
// THE TRAP THIS FILE EXISTS TO DODGE: Claude Code's hooks.json matcher string
// for this event is "Task" (the tool's public/doc name), but the event
// actually delivered to a PostToolUse hook names it `tool_name: "Agent"` — the
// tool's internal name. Gate on "Task" here and this script silently never
// fires, forever, with no error anywhere a human would see. Verified
// byte-level against two real captures (a built-in Explore call and a
// built-in general-purpose call) before this file was written; see
// docs/hook-events.md for the full payload and the doc-vs-reality mismatches
// found alongside this one (tool_response is a content-block array, not a
// string; the task body lives in tool_input.prompt, not .description).
//
// WHAT THIS SCRIPT DOES: after every completed Task call, mechanically derive
// one relay-state line and upsert it into two files:
//   - `<config>/otto-state-global.md`  — cross-project, tagged `[project]`
//   - `<cwd>/.claude/otto-state.md`    — this project only, untagged
// This is a DETERMINISTIC BACKSTOP for the same file agents/otto-foreman.md's
// "Announcing a handoff" section already tells Otto to write by hand at relay
// time — that prompt-driven write measured 0/15 in the v22.7.0 round (see
// TASKS.md). Same grammar, same upsert key on both paths, so a successful
// hand-write and this hook's write collapse into one line rather than two.
//
// SILENT BY DESIGN: no stdout, ever — same footing as hooks/otto-trace.mjs.
// FAIL-SILENT BY DESIGN: any error (bad JSON, no node at hook-spawn time,
// missing config dir, a lock that never clears) results in no write and no
// crash. A relay-state line is a convenience; it must never be the thing that
// breaks a session.
//
// ROBOTS map: kept in sync with hooks/otto-trace.mjs by hand; scripts/validate.mjs
// cross-checks both against agents/ and against each other so a new hire can't
// silently go missing from one map and not the other (this happened once, to
// Gantry, in the SubagentStop hook — see the comment there).

import {
  readFileSync,
  existsSync,
  mkdirSync,
  rmdirSync,
  renameSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

// [badge, name, role] — identical map to hooks/otto-trace.mjs. Otto 🧰 (the
// main thread) never appears here; he is never dispatched as a Task.
const ROBOTS = {
  'switchboard-chief-of-staff': ['🤖', 'Switchboard', 'Chief of Staff'],
  'patchbay-pm': ['📋', 'Patchbay', 'Product'],
  'gantry-delivery': ['📦', 'Gantry', 'Project'],
  'holovox-sales': ['🔵', 'Holovox', 'Sales & Marketing'],
  'baudrate-cfo': ['💰', 'Baudrate', 'CFO'],
  'dialtone-support': ['📞', 'Dialtone', 'Support'],
  'sonar-research': ['🔷', 'Sonar', 'Research'],
  'vector-architect': ['🟣', 'Vector', 'Architect'],
  'bitforge-engineer': ['🔩', 'Bitforge', 'Engineer'],
  'glitchtrap-qa': ['🔘', 'Glitchtrap', 'QA'],
  'cipherplate-security': ['🔒', 'Cipherplate', 'Security'],
  'cathode-design': ['🟢', 'Cathode', 'Design'],
  'docket-legal': ['📜', 'Docket', 'Legal'],
};
const NAME_TO_ID = Object.fromEntries(Object.entries(ROBOTS).map(([id, [, name]]) => [name, id]));

// Built-in Claude Code agent types produce NO state line — they are not the
// crew and not hired staff, they are the harness's own tools. List sourced
// from the v22.8.0 design task (TASKS.md task 1); only Explore and
// general-purpose were independently re-verified in the spike that gated this
// build. Plan, claude and statusline-setup are taken on the design doc's word.
// An unlisted future built-in fails safe: it renders as a 🧩 hired-staff line
// instead of vanishing, which is a cosmetic wart, never a crash.
const BUILTINS = new Set(['Explore', 'general-purpose', 'Plan', 'claude', 'statusline-setup']);

// ---------------------------------------------------------------------------
// NO CONTENT INSPECTION. NO CLEAR PATH. This is deliberate, not an omission.
//
// Two build rounds tried to classify a subagent's own wording as "terminal"
// (done/shipped/merged/abandoned) vs. "still active," first with a bare
// word-boundary match, then with a negation-aware window. Both were measured,
// end-to-end, to fail in OPPOSITE directions on realistic phrasing: the bare
// match false-cleared active work 7/7 on negated phrasing ("not done yet,
// still drafting"); the negation-window fix that closed that gap immediately
// opened a worse one, false-KEEPING 8/8 on genuinely finished work that
// merely contained an innocent nearby negation word ("shipped; no issues
// found", "merged to main, not without drama"). The premise was wrong, not
// the heuristic: natural language announces completion BY NEGATING remaining
// work ("nothing left to do", "no issues found") — there is no keyword
// scanner that crosses that frontier in both directions at once. Vector's
// ratified call after the second failure: delete the inference, don't try a
// third heuristic. See TASKS.md's "Option C" section for the full history.
//
// The contract is now: every relay is an upsert, unconditionally. Cleanup is
// cap-8 RECENCY eviction only — the 9th distinct item displaces the 10th...
// the oldest, never a content-based judgment. A finished item ages out of the
// top 8 exactly like everything else; nothing here decides "finished" at all.
const CAP = 8;
const LOCK_RETRY_ATTEMPTS = 10;
const LOCK_RETRY_DELAY_MS = 50;

const LOCAL_HEADER = `<!-- otto-state.md -- recent work, newest first, active among it. Upserted by Otto at relay
     time (see agents/otto-foreman.md, "Announcing a handoff"), and mechanically backstopped by the
     PostToolUse hook hooks/otto-state.mjs after every completed Task call -- same grammar, same upsert key.
     The hook does not replace Otto's own composition; it welds it. There is no clear path: every relay is an
     upsert, unconditionally, and cleanup is cap-8 RECENCY eviction only -- the 9th distinct item displaces the
     oldest, never a content-based judgment (an earlier design tried to detect "done/shipped/merged/abandoned"
     wording and clear those lines; two rounds of testing found it fails in opposite directions on realistic
     phrasing, so it was removed rather than patched a third time). The robot's own wording carries whatever
     completion signal there is ("shipped" reads as closed to a human); a line older than 7 days renders with
     a relative-age suffix as a second, honest signal, never a deletion. The session-open brief renders the
     top 5 lines verbatim. Full history lives in otto-trace.log; the task list is TASKS.md. If this project is
     version-controlled, add .claude/ to .gitignore -- RobotInc's own repo does exactly this, so a stranger
     who clones the project never inherits someone else's "we've already met." -->`;

const GLOBAL_HEADER = `<!-- otto-state-global.md -- recent work across ALL projects on this machine, newest first,
     active among it. Upserted only by the PostToolUse hook hooks/otto-state.mjs after every completed Task
     call. Lines are tagged [project] so state from other projects stays identifiable. There is no clear
     path: every relay is an upsert, unconditionally, and cleanup is cap-8 RECENCY eviction only across all
     projects combined -- the 9th distinct item displaces the oldest, never a content-based judgment (see
     otto-state.md's header for why a done/shipped/merged/abandoned detector was tried and removed). The
     session-open brief (agents/otto-foreman.md step 5) merges this with the project-local
     ./.claude/otto-state.md and renders the top 5, newest first -- global wins on a (robot, item) conflict. -->`;

// Matches a rendered line from either file. Group 1 is the optional
// `[project]` tag (global only); group 2 the badge; group 3 the name (a
// robot's display name, or a hired subagent_type verbatim); group 4 the role
// text (literally "hired" for hired-staff lines); group 5 the description;
// group 6 the summary; group 7 the date.
const LINE_RE =
  /^· (?:\[([^\]]+)\] )?(\S+) ([A-Za-z][A-Za-z0-9-]*) \(([^)]+)\) — (.+?): (.+?) {2}\((\d{4}-\d{2}-\d{2})\)$/;

// ---------------------------------------------------------------- pure helpers

function slugify(s) {
  return (
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item'
  );
}

function extractText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

// Same result-line extraction as hooks/otto-trace.mjs: last non-empty line,
// stripped of markdown decoration, whitespace collapsed, capped at 140 chars.
function summarize(text) {
  const result =
    (text || '')
      .split('\n')
      .map((l) =>
        l
          .replace(/^[\s>#|*_-]+/, '')
          .replace(/[`*_]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean)
      .pop() || '(no result)';
  // Truncate by CODE POINT, not UTF-16 code unit — a bare .slice(0, 140) can
  // land inside a surrogate pair (an emoji, some CJK) and split it, writing a
  // corrupted replacement-character glyph into the state file. Found by QA
  // via an end-to-end run with an emoji sitting exactly on the cutoff.
  return Array.from(result).slice(0, 140).join('');
}

// A plugin-sourced subagent_type is delivered NAMESPACED, e.g.
// "robotinc:bitforge-engineer" — not the bare "bitforge-engineer" every doc
// draft (and this file's own first pass) assumed. Confirmed the hard way: an
// end-to-end run through the real hook, wired to a real Task dispatch, wrote
// a real crew member's line with a 🧩 hired-staff badge because ROBOTS[type]
// missed on the prefixed id. Built-ins (Explore, general-purpose, ...) are
// NOT plugin-sourced and are never prefixed — this strip is a no-op for them.
function bareType(subagentType) {
  return subagentType.replace(/^robotinc:/, '');
}

// Crew map lookup, or hired-staff 🧩. Never returns null — every non-built-in
// subagent_type gets a line, known or not.
function classify(subagentType) {
  const bare = bareType(subagentType);
  if (BUILTINS.has(bare)) return { skip: true };
  const crew = ROBOTS[bare];
  if (crew) {
    const [badge, name, role] = crew;
    return { skip: false, badge, name, role, hired: false };
  }
  // Hired-staff keep their RAW id (unstripped) — a third-party plugin's own
  // namespace prefix is real, useful information for a 🧩 line; only this
  // plugin's own "robotinc:" prefix is the false signal being corrected here.
  return { skip: false, badge: '🧩', name: subagentType, role: null, hired: true };
}

function renderLine({ project, badge, name, role, description, summary, date, tagged }) {
  const roleText = role ? `(${role})` : '(hired)';
  const tag = tagged && project ? `[${project}] ` : '';
  return `· ${tag}${badge} ${name} ${roleText} — ${description}: ${summary}  (${date})`;
}

// The exact inverse of renderLine, used only to recover the upsert key from
// an existing line already on disk. `tagged` must match the file this line
// came from — global keys include the project tag, local keys do not, so the
// SAME robot/slug in two different projects are two different global entries
// but collapse to one identity for local purposes (there is only ever one
// project's worth of local state).
function keyOfLine(line, tagged) {
  const m = LINE_RE.exec(line.trim());
  if (!m) return null;
  const [, project, , name, role, description] = m;
  const id = role === 'hired' ? name : NAME_TO_ID[name] || name;
  const base = `${id}::${slugify(description)}`;
  return tagged ? `${project || ''}::${base}` : base;
}

// ---------------------------------------------------------------- file I/O

function configDirOf(env, home) {
  return env.CLAUDE_CONFIG_DIR || join(home, '.claude');
}

// Persona-root markers: config-dir-exclusive identity artifacts that never
// legitimately appear in a genuine project's `.claude/` (byte-identical to
// hooks/otto-facts.mjs's PERSONA_ROOT_MARKERS — two definitions ship in this
// hotfix, unified in 22.9-D2; see docs/spec-persona-guard-22.8.1.md §5).
const PERSONA_ROOT_MARKERS = ['otto-profile.json', '.otto-met', 'otto-state-global.md'];

// v22.8.1 HOTFIX (S4): `localDir !== configDir` alone is the exact same
// broken discriminator the reader's `cwd_is_config_dir` was — it only
// catches THIS session's own config dir wearing a project hat. When
// CLAUDE_CONFIG_DIR is relocated (a sandbox session) and cwd is the user's
// real home, `localDir` = the user's real `~/.claude`, `configDir` = the
// sandbox — the guard passes, and this hook WRITES a sandbox relay line into
// the real `~/.claude/otto-state.md`, mutating another persona's real state.
// Reproduced live. Fail-toward-block, same polarity and residual as the
// facts hook's cwdPersonaRoot(): existsSync never throws, so an unstat-able
// marker reads absent (fail-toward-permit) — nil blast radius on the primary
// leak, the user's own fully-readable directory.
function isPersonaRoot(dir) {
  try {
    return PERSONA_ROOT_MARKERS.some((marker) => existsSync(join(dir, marker)));
  } catch {
    return true;
  }
}

function sleepMs(ms) {
  // Genuine synchronous sleep with no busy-wait and no extra dependency —
  // Atomics.wait blocks the thread for real, which is fine here: this script
  // runs once per hook invocation and exits, it is never a long-lived process.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(lockDir) {
  for (let i = 0; i < LOCK_RETRY_ATTEMPTS; i++) {
    try {
      mkdirSync(lockDir);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') return false; // unexpected error: fail closed, fail silent
      if (i < LOCK_RETRY_ATTEMPTS - 1) sleepMs(LOCK_RETRY_DELAY_MS);
    }
  }
  return false; // exhausted — caller degrades
}

function releaseLock(lockDir) {
  try {
    rmdirSync(lockDir);
  } catch {
    // Fail soft: a lock dir that won't remove is a wart for the next
    // acquirer to retry through, never a crash for this one.
  }
}

function atomicWrite(path, content) {
  const tmp = `${path}.tmp-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path); // fs.renameSync overwrites the destination on Windows too
}

function loadFile(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  let body = raw;
  if (raw.trimStart().startsWith('<!--')) {
    const endIdx = raw.indexOf('-->');
    if (endIdx !== -1) body = raw.slice(endIdx + 3);
  }
  return body
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().startsWith('· '));
}

function saveFile(path, header, lines) {
  const body = header + '\n\n' + lines.join('\n') + (lines.length ? '\n' : '');
  atomicWrite(path, body);
}

// Mutates and returns `lines`: upserts `rendered` under `key` — moves to top,
// replacing any existing line with the same key. Unconditional; there is no
// clear path (see the header comment on CAP above). Corrupt lines (keyOfLine
// returns null) are left in place, never matched, and age out naturally
// under the cap, same as any other line.
function upsert(lines, key, rendered, tagged) {
  const idx = lines.findIndex((l) => keyOfLine(l, tagged) === key);
  if (idx !== -1) lines.splice(idx, 1);
  lines.unshift(rendered);
  if (lines.length > CAP) lines.length = CAP;
  return lines;
}

function appendDegrade(path, rendered) {
  try {
    appendFileSync(path, rendered + '\n', 'utf8');
  } catch {
    // Same fail-silent footing as everything else in this file.
  }
}

// One locked read-modify-write cycle against `path`. On lock exhaustion,
// degrades to a raw append (unconditional now — there is no clear path to
// skip); the next clean write reads it back in and applies the cap normally.
function writeTarget(path, lockDir, header, key, rendered, tagged) {
  const gotLock = acquireLock(lockDir);
  if (!gotLock) {
    appendDegrade(path, rendered);
    return;
  }
  try {
    const lines = upsert(loadFile(path), key, rendered, tagged);
    saveFile(path, header, lines);
  } finally {
    releaseLock(lockDir);
  }
}

// ---------------------------------------------------------------- entry point

// Takes an already-parsed hook payload and performs the writes. Exported for
// direct testing (scripts/test-otto-state.mjs) — real filesystem I/O against
// a scratch config dir and scratch cwd, no mocking.
export function run(payload, opts = {}) {
  const env = opts.env || process.env;
  const home = opts.home || homedir();

  if (payload.tool_name !== 'Agent') return; // NOT "Task" — see file header

  const subagentType = payload.tool_input?.subagent_type;
  if (!subagentType) return;

  const cls = classify(subagentType);
  if (cls.skip) return;

  const description = payload.tool_input?.description || '(untitled)';
  const finalText = extractText(payload.tool_response?.content);
  const summary = summarize(finalText); // verbatim (truncated) — no content inspection, no clear path
  const slug = slugify(description);
  const date = new Date().toISOString().slice(0, 10);

  const cwd = payload.cwd || process.cwd();
  const configDir = configDirOf(env, home);
  const project = basename(cwd);

  // Crew keys use the bare id (stable regardless of plugin-namespace prefix);
  // hired-staff keys use the raw id (see classify()'s comment on why).
  const identifier = cls.hired ? subagentType : bareType(subagentType);

  // ---- global: always attempted ----
  const globalKey = `${project}::${identifier}::${slug}`;
  const globalRendered = renderLine({
    project,
    badge: cls.badge,
    name: cls.name,
    role: cls.role,
    description,
    summary,
    date,
    tagged: true,
  });
  if (existsSync(configDir)) {
    writeTarget(
      join(configDir, 'otto-state-global.md'),
      join(configDir, '.otto-state.lock'),
      GLOBAL_HEADER,
      globalKey,
      globalRendered,
      true
    );
  }

  // ---- local: only when the project already has a .claude dir, and that dir
  // is genuinely a project's own — not the config dir wearing a project hat,
  // and not ANOTHER machine's real persona root reached because
  // CLAUDE_CONFIG_DIR was relocated this session (v22.8.1 hotfix, S4). A
  // home-dir persona (cwd === the user's home) has `<cwd>/.claude` equal to
  // `<config>` itself when CLAUDE_CONFIG_DIR is unset — comparing cwd against
  // configDir is not enough to catch that; the path that actually collides is
  // localDir, not cwd. `isPersonaRoot(localDir)` catches the sibling case the
  // string compare is structurally blind to: localDir resolves to the user's
  // OWN real `~/.claude`, holding real identity markers, while configDir
  // points at a relocated (sandbox) config elsewhere — see
  // docs/spec-persona-guard-22.8.1.md §5. ----
  const localDir = join(cwd, '.claude');
  if (localDir !== configDir && !isPersonaRoot(localDir) && existsSync(localDir)) {
    const localKey = `${identifier}::${slug}`;
    const localRendered = renderLine({
      project: null,
      badge: cls.badge,
      name: cls.name,
      role: cls.role,
      description,
      summary,
      date,
      tagged: false,
    });
    writeTarget(
      join(localDir, 'otto-state.md'),
      join(localDir, '.otto-state.lock'),
      LOCAL_HEADER,
      localKey,
      localRendered,
      false
    );
  }
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
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
    // between Claude Code versions, anything. A relay-state line is a
    // convenience; it must never be the thing that breaks a session.
  }
  process.exit(0);
}

// Exported for tests only — the hook itself never imports these from outside.
export { slugify, extractText, summarize, classify, bareType, renderLine, keyOfLine, configDirOf, isPersonaRoot, CAP, BUILTINS, ROBOTS };
