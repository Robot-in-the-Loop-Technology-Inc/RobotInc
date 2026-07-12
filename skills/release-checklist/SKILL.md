---
name: release-checklist
description: What must be true before this ships — verified, reversible, and human-knowable undo. Use when you are about to merge, deploy, or push anything to production, or release to users.
model: haiku
---

> **Home robot:** 📦 Gantry (Project Manager). Anything that touches production, data, secrets, money, or the outside world is a one-way door — no amount of confidence unlocks it. This is the last gate.

## When to use

- You are about to merge a feature or fix to `main`.
- You are about to deploy to production or a public environment.
- You are about to release or publish anything the human cannot unsee or undo.
- A change touches secrets, migrations, money, a webhook, an email, a message, a refund — anything outbound.

**Do not skip this on confident changes.** Confidence is what being wrong feels like from the inside. A robot that feels certain is exactly the robot that should still ask.

## The checks

One simple rule: **if you cannot state the rollback in one line, it is not ready.**

1. **Verified?** Not "did we write tests" — did we actually watch it work? Run the feature end-to-end in the app. Take a screenshot if it's visual. Open the browser and click. The CHECK step from the plan lives here.

2. **Reversible?** Can you undo it in one line? A rollback nobody can execute is not a rollback.
   - A code merge: `git revert <commit>`
   - A schema migration: `ALTER TABLE … DROP COLUMN …` exists
   - A feature flag: toggle off, or rollback the deployment
   - A secret rotation: old secret still works, or you have the undo
   - A webhook: can disable it without breaking; can re-enable the old one
   - **Anything outbound (email, Slack, payment, publish):** can you unsend it? No. You cannot. SLOW.

3. **Does the human know the undo?** Not "the undo is possible" — the *human* could do it. Spell it out. If it is a `git revert`, show the exact command. If it is a flag toggle, name the flag. If it is "call ops", say so and make sure ops is ready.

4. **Is it a one-way door?**
   - Secrets, API keys, database URLs in code (ever) — automatic NO.
   - Schema migrations that drop data — automatic NO unless rollback is tested and documented.
   - Money (Stripe charge, refund, subscription create/cancel) — automatic NO.
   - Deployment to production — ask. SLOW.
   - Email or Slack message sent to the user — automatic NO. You cannot unsend.
   - Merge to `main` — ask. You control when. Never force-push.
   - Publish a page the public can see — automatic NO. Page indexed, screenshots taken, you live with it.
   - Delete a file or database row — document the undo *first*, or do not delete.

   For every one-way door, your job is to stop and ask the human. Not *"should we do this?"* but *"I cannot undo this; you are calling the shot."*

5. **If something breaks at 2am, who gets called?** Runtime errors, a webhook timeout, a payment sync failure — who is woken up, and can they fix it without you? If the answer is "nobody," it is not ready.

## Output

Bullet list of the checks and their status (yes / no / N/A). Lead with the risk:

> *Schema migration is the blocker — rollback tested and works. Webhook is live in sandbox and tested. Feature flag ready. Secrets in `.env`, not code. Ready.*

Or, if something is not ready:

> *Cannot undo the email send — emails sent to 500 users cannot be recalled. Hold on deploy until the human approves.*

Never soften a blocker. If it is not ready, say so plainly.

**Then ask the human:** should we ship it?
