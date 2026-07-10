#!/usr/bin/env node
// Otto routing reminder — UserPromptSubmit hook.
// stdout from UserPromptSubmit is injected into the model's context every turn,
// which is the only channel that survives auto-compaction. Keep this SHORT:
// it is paid for on every single turn.
//
// Seat/tier are read from otto-profile.json so the crew can ship as static
// files and the co-pilot instruction is applied at runtime instead of being
// baked into each agent's system prompt.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

// Neutral fallback for a user who has not run /otto yet. Never bake a specific
// person's seat or tier in here — it ships to everyone.
const DEFAULT_PROFILE = {
  seats: ['Generalist/Solo'],
  tier: 'unset (run /otto to set it)',
  verbosity: 'balanced',
};

// How much the human wants to hear. Independent of tier: a beginner may want the
// full reasoning, an expert may want three words. Never infer one from the other.
const VERBOSITY = {
  brief:
    'Answer in 1–3 sentences. Lead with the result. Trace lines only for handoffs; no reasoning unless asked.',
  balanced:
    'Lead with the answer, then only the reasoning that would change what the human does next. Skip the rest.',
  thorough:
    'Lead with the answer, then the reasoning, the alternatives you rejected, and the tradeoff you took. Never pad.',
};

// seat -> co-pilot robot. Seats the human occupies get a robot that proposes
// rather than decides; every other function runs autopilot.
const SEAT_COPILOT = {
  'Strategy': null, // Otto himself
  'Leadership': null,
  'Ops': 'switchboard-chief-of-staff',
  'Operations': 'switchboard-chief-of-staff',
  'Admin': 'switchboard-chief-of-staff',
  'Support': 'dialtone-support',
  'Customer Support': 'dialtone-support',
  'Legal': 'docket-legal',
  'Contracts': 'docket-legal',
  'Architecture': 'vector-architect',
  'Engineering': 'bitforge-engineer',
  'QA': 'glitchtrap-qa',
  'Test': 'glitchtrap-qa',
  'Security': 'cipherplate-security',
  'Compliance': 'cipherplate-security',
  'Design': 'cathode-design',
  'UX': 'cathode-design',
  'Sales': 'holovox-sales',
  'Marketing': 'holovox-sales',
  'Finance': 'baudrate-cfo',
  'Product Management': 'patchbay-pm',
  'Research': 'sonar-research',
};

function loadProfile() {
  try {
    const raw = readFileSync(join(CONFIG_DIR, 'otto-profile.json'), 'utf8');
    const p = JSON.parse(raw);
    const v = String(p.verbosity || '').toLowerCase();
    return {
      seats: Array.isArray(p.seats) && p.seats.length ? p.seats : DEFAULT_PROFILE.seats,
      tier: typeof p.tier === 'string' && p.tier ? p.tier : DEFAULT_PROFILE.tier,
      verbosity: VERBOSITY[v] ? v : DEFAULT_PROFILE.verbosity,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function copilotLine(seats) {
  if (seats.some((s) => /generalist|solo/i.test(s))) {
    return 'Seat: Generalist/Solo — the co-pilot rotates to whichever hat is in play. Infer the hat; ask only when genuinely ambiguous.';
  }
  const robots = [...new Set(seats.map((s) => SEAT_COPILOT[s]).filter(Boolean))];
  const seatList = seats.join(' + ');
  if (!robots.length) return `Seat: ${seatList} (Otto co-pilots). All robots: act and report.`;
  return `Seat: ${seatList}. Co-pilot ${robots.join(', ')} — propose 2–3 options and wait for the human's call. All other robots: act and report.`;
}

const { seats, tier, verbosity } = loadProfile();

// Deliberately terse: this is injected on EVERY turn. It carries only what is
// unavailable elsewhere — the badge/role map, the delegate-by-default rule, the
// seat, and the ASCII-description rule. Each robot's *routing* hint already
// lives in its own `description:` frontmatter, which Claude Code injects for
// auto-delegation; repeating it here would be paying twice per turn.
process.stdout.write(
`[otto] You are Otto 🧰, the foreman. Route work to the crew via the Task tool; never do a specialist's work
yourself. Delegate by default, established repos included — Otto writes no production code, no tests, no copy.
Act directly only for trivial reads/answers, or when the user asks for Otto himself.
${copilotLine(seats)} Tier: ${tier}.
Verbosity — ${verbosity}: ${VERBOSITY[verbosity]}
Crew — core: 🤖 Switchboard (Chief of Staff, reports to you) · 📋 Patchbay (PM) · 🔵 Holovox (Sales & Marketing)
💰 Baudrate (CFO) · 📞 Dialtone (Support) · 🔷 Sonar (Research)
Departments (skip any the user retired): 🟣 Vector (Architect) · 🔩 Bitforge (Engineer) · 🔘 Glitchtrap (QA)
🔒 Cipherplate (Security) · 🟢 Cathode (Design) · 📜 Docket (Legal)
Task \`description\`: ASCII only — no emoji or arrows, they garble the TUI. Omit the agent's name (already shown).
Form "<Role>: <few words>", <=60 chars; on a handoff "Glitchtrap > Bitforge: fix failing webhook test".
Then relay ONE prose line, in that robot's voice, badge + role included:
  ↳ 🟣 Vector (Architect) — subscription schema drafted
  ↳ 🔘 Glitchtrap (QA) > 🔩 Bitforge (Engineer) — 2 tests red, fix handed over
Never invent a badge or role.
`);
