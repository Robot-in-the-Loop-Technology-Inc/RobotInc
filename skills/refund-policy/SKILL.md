---
name: refund-policy
description: Draft a refund policy that is fair, defensible, and cheap to administer, so each request stops being a fresh argument. Use when the user (Support hat) is fielding ad-hoc refund asks with no written policy, or Docket/Baudrate input is needed before one gets written.
model: sonnet
---

> **Home robot:** 📞 Dialtone (Support). Seat-kit cockpit for the human — the legal language and
> platform-compliance line belong to Docket; the cost math belongs to Baudrate. This skill frames the
> question for both and never writes law or sets a number on its own.

## When to use
Refund requests are being decided one at a time, from scratch, with no consistent answer — which means every
request becomes a negotiation, and every negotiation costs support time and goodwill whether or not the refund
is granted. Use this to get a written policy the human can point to instead.

## The actual goal
**The goal is not to minimize refunds; it is to minimize the arguments.** An unclear policy is expensive in a
way that doesn't show up on the refund line: every ambiguous request burns support time, every inconsistent
answer between two customers becomes a complaint of its own, and every "let me check" erodes trust more than a
clear no would have. A clear, published policy — even a strict one — is cheaper to run than a generous but
unwritten one.

## Steps

1. **Look at what's actually been happening.** Pull the last several months of refund requests: how many, what
   reasons, what was granted vs. refused, and whether the answer was consistent. A policy written without this
   is a guess; a policy written from the real pattern is a fit.

2. **Frame the shape of the policy, not the legal text.** Questions to settle with the human before drafting:
   - A time window (e.g. within N days) or a case-by-case standard — pick one; mixing them is what creates
     arguments.
   - Does a defect (their fault: none) get treated differently from a change-of-mind (their fault: not really
     "fault," but a different case)? It should — see `churn-postmortem` for the same distinction applied to
     churn.
   - Platform constraints: app-store and payment-processor rules often set a floor or ceiling here that isn't
     optional. Docket needs to check this before anything is published.

3. **Hand the cost side to Baudrate.** What does the current refund rate actually cost, and does the proposed
   policy change that materially? Baudrate frames this as an estimate with assumptions, not a promise:
   > Invoke `baudrate-cfo` (Task/Agent tool, or a step with `context: fork` + `agent: baudrate-cfo`) with the
   > refund history and the proposed policy shape; ask for the cost delta and whether it's material.

4. **Hand the legal and compliance side to Docket.** The exact wording, the platform-compliance line (app
   store / payment processor refund rules), and anything that becomes a legal commitment the moment it's
   published are Docket's call, not this skill's:
   > Invoke `docket-legal` (Task/Agent tool, or a step with `context: fork` + `agent: docket-legal`) with the
   > policy shape from step 2 for the binding language.

5. **Draft the customer-facing version in plain language**, short enough that a support reply can quote it
   directly. If the policy needs a sentence of legalese to be safe, put the legalese in the ToS and keep the
   support-facing version to the plain-English rule people will actually read.

6. **Report.** The proposed policy shape, what Baudrate said it costs, and that Docket has (or hasn't yet)
   signed off on the wording. Nothing here is published or enforced until the human says so.

## Guardrails
- **This skill frames the question; it does not set the policy.** Docket owns the binding wording, Baudrate
  owns the cost call. This skill's job is to make sure both get asked, with real data, before either is
  written.
- Never draft a refund reply that promises something the written policy doesn't yet say — a policy in
  progress is not a policy you can quote to a customer.
- Consistency beats generosity: the fastest way to multiply arguments is to grant on a whim and refuse the
  same request from someone else.
- No invented refund-rate numbers — pull the real history or say the human needs to.
