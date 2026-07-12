---
name: nda-draft
description: Draft or review a mutual NDA and flag the traps — unbounded confidentiality, no end date, a non-compete smuggled inside. Use before sharing anything confidential with a client, contractor or investor.
model: sonnet
---

> **Home robot:** 📜 Docket (Legal). A non-compete or non-solicit found riding inside an NDA gets flagged, not
> silently drafted — that's a separate agreement with separate consequences. Enforceability questions route to
> Sonar.

## When to use
The user needs to share something confidential — a pitch, a codebase, a client list, a product roadmap —
before a deal is signed, and wants paper covering that conversation. Or someone sent them an NDA to sign and
they want to know what it actually does.

**Say once, plainly, at the top of the output: this is a starting draft, not legal advice. Have a qualified
lawyer in your jurisdiction review it before it's signed.** Once.

## Steps

1. **Default to mutual, not one-way**, unless the user is clearly only receiving confidential information and
   never sharing any. A one-way NDA that a two-way conversation gets forced into is itself a red flag — ask
   why the other side wants it.

2. **Keep it short enough to be read.** A twelve-page NDA for a first conversation gets skimmed and signed
   unread, which defeats the point. Cover: definition of confidential information, exclusions (public
   knowledge, independently developed, already known), obligations, term, and remedy. That's the whole
   document.

3. **Set a term with an actual end date.** "Confidential information" that binds forever is both unenforceable
   in most places and a thing a counterparty will refuse to sign once they notice. 2–5 years from disclosure,
   or a fixed date, is standard — flag a perpetual term as a problem, not a strength.

4. **Check the definition of "confidential" isn't doing too much work.** "Any information disclosed by either
   party" with no bounds is so broad it's hard to enforce and easy to accidentally breach. Tie it to what's
   actually marked or reasonably understood as confidential.

5. **Flag anything that isn't actually confidentiality.** A non-compete, a non-solicit, an IP assignment, or an
   exclusivity clause sometimes gets folded into an "NDA" because it's a friendlier name. Call it out by name
   — it's a different agreement with different stakes, and the user should know they're being asked to sign
   one under a disguise.

6. **Say plainly what an NDA does not do.** It does not stop someone from building a competing product using
   only their own memory and general knowledge (most NDAs explicitly exclude this). It does not give you a
   fast, cheap remedy — enforcement means a lawsuit, and proving breach is often hard. Most people sign an NDA
   and believe they're safer than they are; correct that expectation, don't just hand over the document.

7. **If enforceability of a specific clause depends on jurisdiction** — how courts there treat perpetual
   terms, injunctive relief, liquidated damages — say "unverified" and route to Sonar.

## Guardrails
- Never invent what a jurisdiction does or doesn't enforce. "Unverified" is a complete answer.
- Don't draft a non-compete or IP assignment clause into something the user asked for as "just an NDA" —
  flag it as a separate ask instead.
- Plain English. An NDA riddled with "heretofore" protects no one better than one in plain sentences.
- Print the **full absolute filepath** of any draft written for the human to read.
