---
name: churn-postmortem
description: Find out honestly why a customer left and turn it into something the product can act on — distinguishing a broken promise from a customer who was never the right fit. Use when the user (Support hat) has a cancellation, a churned account, or a cluster of churn to understand.
model: sonnet
---

> **Home robot:** 📞 Dialtone (Support). Seat-kit cockpit for the human — routes the defect to Bitforge, the
> pricing signal to Baudrate, the positioning signal to Holovox.

## When to use
A customer cancelled, downgraded, or went quiet, and the human wants to know why — one account, or a cluster
of them over a stretch of time. Not a retention pitch to win them back; a postmortem to stop losing the next
one for the same reason.

## The one distinction that matters
Every churn has one of two honest causes, and they call for opposite responses:

- **We broke a promise.** The product didn't do what it was sold as doing, a bug never got fixed, a price
  changed without warning, support went unanswered. This is **our fault** and it is fixable — the fix goes to
  the robot who owns the broken piece.
- **They were never the right customer.** The product does what it says; it just isn't what they needed. No
  amount of fixing anything will keep this segment. Chasing them is how a company slowly reshapes its roadmap
  around users who were always going to leave.

**Conflating the two is the actual failure mode.** Read "they were never the right fit" into a broken promise
and you never fix the defect. Read "we broke a promise" into a bad-fit customer and you chase a segment that
was never going to stay, at the expense of the one that would have. Do not let one soften into the other for
the sake of a tidier answer.

## Steps

1. **Gather the record, not the exit survey alone.** Exit surveys are notoriously unreliable — people give the
   easy answer, not the real one. Pull the actual usage pattern, the support history, and the last few
   interactions before they left. What did they try to do, and where did it stop working (literally or for
   them)?

2. **Sort the evidence into the two buckets above**, honestly. If the evidence doesn't clearly support one,
   say so rather than forcing a verdict — "unclear, more data needed" is a valid outcome, not a failure to
   deliver.

3. **For a broken promise, route to the owner with the evidence, not a paraphrase:**
   - A reproducible defect → Bitforge, with the repro.
   - A price that didn't match perceived value, or terms they felt ambushed by → Baudrate.
   - A gap between what was marketed and what shipped → Holovox.
   - A screen or flow that confused them into leaving → Cathode.

4. **For a cluster of churn, count causes, not accounts.** Five cancellations citing five different reasons is
   five stories. Five citing the same one is a single fixable cause — name it plainly and say how many
   accounts it cost, without inventing a number you don't have.

5. **Never conclude "they were never the right customer" as a way to avoid an uncomfortable finding.** That
   verdict is only honest when the evidence actually points there — a genuine mismatch in need, budget, or use
   case, not a defect nobody wants to own.

6. **Report.** One verdict per account or cluster (broken promise / not-the-right-fit / unclear), the evidence,
   and the owner it was routed to. If a cluster reveals a pattern worth a roadmap conversation, say so and hand
   it to Otto rather than trying to fix it yourself.

## Guardrails
- No invented statistics. If you only have five data points, say five — never round up to "many" or imply a
  study that doesn't exist.
- Quote the customer's stated reason accurately even when the evidence suggests a different real cause; show
  both, don't overwrite what they said.
- This skill produces a finding, not a win-back campaign. A win-back offer is a Holovox/Baudrate call the
  human makes deliberately, not a default next step here.
