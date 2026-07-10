---
name: unit-economics
description: Build a unit-economics / pricing model with a sensitivity range so the founder can make a go/no-go or pricing call. Use when the user (Founder hat) asks "can this make money", "what should we charge", or wants CAC/LTV/margin/runway math. Routes the number-crunching to Baudrate and GTM framing to Holovox.
model: haiku
---

> **Home robot:** Baudrate (Finance seat). Seat-kit cockpit for the human — delegates the math to Baudrate and GTM framing to Holovox.

## When to use
The user is wearing the **Founder/Exec hat** and needs the money view: pricing, margin, CAC/LTV,
break-even, token/run cost per user, or a go/no-go on a feature's economics. Not a live ledger — an
honest **estimate** with its assumptions on the table.

## Steps
1. **Frame the decision.** What call does this model need to support (price point? ship/kill? headcount?).
   Pull the few numbers that actually move it; don't build a 40-row spreadsheet for a yes/no.
2. **Hand the math to Baudrate.** Delegate the model itself to the CFO robot (it is pinned to haiku, cheap):
   > Invoke `baudrate-cfo` (Task/Agent tool, or a step with `context: fork` + `agent: baudrate-cfo`)
   > with the inputs. Ask for: per-unit cost, contribution margin, break-even volume, and a
   > **sensitivity band** (pessimistic / base / optimistic) on the 2–3 assumptions that matter most.
3. **Sanity-check token/run costs** if it's an AI product — cost per run × expected runs per user, against
   the price. Flag if a plan is underwater at scale.
4. **Pull GTM framing if pricing is the question.** For packaging/tier positioning, delegate copy to Sales:
   > Invoke `holovox-sales` (`context: fork` + `agent: holovox-sales`) for tier names and value framing.
5. **Deliver a 3-bullet brief** (Founder verbosity): the number, the assumption it's most sensitive to,
   and the recommendation (go / hold / reprice / kill). Expand only on request.

## Guardrails
- Label every figure an **estimate** and list the assumptions — no false precision, no live-ledger claims.
- Money is a decision aid, not the decision; state the strategic read alongside the number.
- Stay terse for the Founder hat; lead with the answer.
