---
name: unit-economics
description: Build a unit-economics / pricing model with a sensitivity range so the founder can make a go/no-go or pricing call. Use when the user (Founder hat) asks "can this make money", "what should we charge", or wants CAC/LTV/margin/runway math. Routes the number-crunching to Baudrate and GTM framing to Holovox.
model: sonnet
---

> **Home robot:** 💰 Baudrate (CFO). Seat-kit cockpit for the human. **Robots cannot dispatch robots — Otto
> mediates every handoff.** So "delegate" here means *hand back to Otto with what he needs to dispatch*:
> the model is Baudrate's, GTM framing is 🔵 Holovox's.

## When to use
The user is wearing the **Founder/Exec hat** and needs the money view: pricing, margin, CAC/LTV,
break-even, token/run cost per user, or a go/no-go on a feature's economics. Not a live ledger — an
honest **estimate** with its assumptions on the table.

## Steps
1. **Frame the decision.** What call does this model need to support (price point? ship/kill? headcount?).
   Pull the few numbers that actually move it; don't build a 40-row spreadsheet for a yes/no.
2. **The math is Baudrate's.** He runs on **sonnet, deliberately** — pricing, unit economics and runway are
   *decisions*, not arithmetic, and **a wrong number from the cheapest model is the most expensive output in
   the company.** Do not treat this as a cheap mechanical job:
   > **Hand back to Otto** with the inputs and ask him to put **💰 Baudrate** on it. Ask for: per-unit cost,
   > contribution margin, break-even volume, and a **sensitivity band** (pessimistic / base / optimistic) on
   > the 2–3 assumptions that actually move the answer.
3. **Sanity-check token/run costs** if it's an AI product — cost per run × expected runs per user, against
   the price. Flag if a plan is underwater at scale.
4. **GTM framing, if pricing is the real question.** For packaging and tier positioning:
   > **Hand back to Otto** and ask him to put **🔵 Holovox** on tier names and value framing.
5. **Deliver a 3-bullet brief** (Founder verbosity): the number, the assumption it's most sensitive to,
   and the recommendation (go / hold / reprice / kill). Expand only on request.

## Guardrails
- Label every figure an **estimate** and list the assumptions — no false precision, no live-ledger claims.
- Money is a decision aid, not the decision; state the strategic read alongside the number.
- Stay terse for the Founder hat; lead with the answer.
