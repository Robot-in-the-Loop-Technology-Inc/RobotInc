---
name: privacy-policy
description: Draft a privacy policy from what the code actually does with data, not a template. Names the regimes that plausibly apply. Use when publishing anything that collects user data.
model: sonnet
---

> **Home robot:** 📜 Docket (Legal). Reading the actual data flows in code is this skill's job before writing a
> word; a compliance determination that turns on jurisdiction or regulator interpretation routes to Sonar.

## When to use
The user is about to publish or update a privacy policy for a product that collects, stores, or processes any
user data — signups, analytics, payment info, uploads, anything.

**Say once, plainly, at the top of the output: this is a starting draft, not a compliance review, and not
legal advice. GDPR, CCPA and similar regimes carry real penalties for getting this wrong — have a qualified
lawyer in your jurisdiction review it before it's published.** Once.

## Steps

1. **Read the product before writing the policy.** If there's a codebase, grep it: what tables exist, what
   third-party SDKs are wired in (analytics, ads, payment processors, error tracking), what gets sent to them,
   what's stored versus what passes through. A privacy policy is a factual claim about the company's own
   systems — describing a data flow the product doesn't have is worse than having no policy, because it's now
   a false statement you published.

2. **If there's no code to read, or access is limited, ask.** Do not infer "we collect analytics" because most
   apps do. Ask what's actually wired up: which processor, which fields, whether it's stored or just
   forwarded, whether cookies or device IDs are used, whether data leaves the country it's collected in.

3. **Write the policy around actual flows**, not a boilerplate section list. For each category of data
   collected, say what it is, why it's collected, where it goes (self-hosted, or which named third party), and
   how long it's kept. Skip a section entirely rather than pad it with a flow that doesn't exist.

4. **Name the regimes that plausibly apply, without claiming compliance.** If the product has EU users, GDPR
   plausibly applies — say that, and say what it would require (lawful basis, a right to deletion, a named
   DPO if the volume warrants one) as *open questions*, not as boxes already checked. Same for CCPA and
   California users, or any other regime the user names. Never write "this policy is GDPR-compliant" — that is
   a legal determination this skill cannot make.

5. **Cover the standard shape** once the flows are grounded in fact: what's collected, why, third parties data
   is shared with, retention, the user's rights (access, deletion, export — only the ones that actually apply
   to the regimes named), cookies/tracking, children's data (COPPA-adjacent — flag if the product could plausibly
   reach under-13 users), how to contact the company, and how the policy is updated.

6. **Flag the questions that need a real lawyer, specifically** — not "have a lawyer review this" as a
   blanket line, but the actual open items: does this volume of EU users require a DPO, does a specific
   third-party integration count as a "sale" of data under CCPA, does the retention period match a legal
   minimum or maximum in the user's industry.

7. **If a regulatory question turns on jurisdiction or a specific regulator's interpretation** — what counts
   as a "sale," what triggers breach notification, whether a given integration needs a data processing
   agreement — say "unverified" and route to Sonar for a sourced answer.

## Guardrails
- **Never describe a data flow the product doesn't have.** If you can't confirm it from code or the user, leave
  it out or mark it a question — don't default to the industry-standard boilerplate answer.
- Never claim compliance with a named regime. Name what plausibly applies and what it would require; the
  determination is the lawyer's.
- Never invent what a regulation requires. "Unverified" is a complete answer; Sonar sources the rest.
- Print the **full absolute filepath** of any draft policy written for the human to read.
