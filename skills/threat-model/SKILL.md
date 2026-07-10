---
name: threat-model
description: Work out who would attack this, how, and what it would cost — before the feature is built. Trust boundaries, attacker goals, realistic mitigations. Use when the user (Security hat) is adding auth, payments, uploads, multi-tenancy, or anything handling other people's data.
model: sonnet
---

> **Home robot:** 🔒 Cipherplate (Security). Boundaries and schema changes go to Vector; fixes to Bitforge;
> anything about legal liability or breach notification goes to Docket.

## When to use
Before building a feature that handles credentials, money, uploads, other people's data, or separates one
tenant from another. Afterwards is an incident review, not a threat model.

## Steps

1. **Draw the trust boundaries.** Where does data cross from something you control to something you don't?
   Browser → server, server → third party, tenant → tenant, admin → user. Every boundary is a place to check.
   Draw it as ASCII; if you can't draw it, you don't yet understand it.

2. **Name the attackers, concretely.** Not "a hacker". A curious logged-in customer. A former employee whose
   token still works. An automated scanner. A malicious file upload. The attacker who *is* a legitimate user
   of a different tenant. Each wants something different.

3. **For each boundary, ask what they'd try** — spoof an identity, tamper with a value the client sends, read
   something not theirs, replay a request, exhaust a resource, escalate a role. Walk the boundary, not a
   checklist of vulnerability names.

4. **Rank by `likelihood × blast radius`, not by how clever the attack is.** A guessable sequential ID that
   exposes every customer's invoice outranks an exotic timing attack. The boring bug is the one that fires.

5. **Propose the mitigation that actually fits.** Prefer structural fixes that make the bug *impossible* over
   checks someone must remember to call: a foreign key scoped to the tenant beats a validation function. Say
   what each mitigation costs.

6. **Say what you are accepting.** A threat model with no accepted risks is not honest. Name the risk, the
   reason, and who decided.

## Guardrails
- **This is not a penetration test and not a compliance certificate.** Say so once, plainly.
- Never invent a CVE, an attack, or a claim about what an attacker "always" does.
- Legal exposure, breach-notification duties, and what a contract obliges the user to do are **Docket's**.
- Structural mitigations that change the data model go to **Vector** before Bitforge builds them.
- Never write a working exploit. Describe the weakness precisely enough to fix, no further.
