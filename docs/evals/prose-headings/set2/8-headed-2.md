The hook is already built and firing on every turn of this session, so the open question is what to add to it rather than what to build.

`turn-reminder.sh` runs on `UserPromptSubmit` and spends about four lines per typed turn: the style-active reminder, the classify-then-read instruction, the verification instruction, and the ledger counters. It also decides things on its own, stamping the inherited type on untyped turns so no judgment is asked of me at all.

Those four lines hold where the digest faded, and the reason is worth naming, because it decides what else can go there. Each one names an action with a checkable outcome, so running a script or re-reading the ask either happened or did not. A line that names a quality to embody is the shape that fades, which is what the keyword triggers we discussed would have been. Firing "structure this as research" on the word `research` asks me to be a way rather than do a thing, and by the fourth turn it reads as furniture.

That points the feasible additions away from instruction entirely, toward things the hook can see that I cannot. Elapsed time since the last turn, files that changed on disk since my previous reply, a background task that landed, a branch that moved. None of that is a reminder, it is information, and it never goes stale because it differs every turn.

Two others use state that already exists. The detector scores every reply at Stop, so a rule that actually slipped in this session could buy one line on the next turn and then go quiet, which fires rarely enough to stay legible. The ledger holds my own coded claims, so a file changing under a finding I called verified is a contradiction the hook can catch and I cannot.

R1 - Each line added dilutes the four that currently work, and the hook has no way to measure that dilution.

## Questions

❓ **Q28** - **Which addition, if any, is worth the fifth line?**
   a. observable state I cannot see, such as disk changes since my last reply
   b. drift-conditional rule reminders, fired only after the detector saw that rule slip this session
   c. ledger contradictions, where a file moved under a claim I called verified
   d. nothing, and the four lines stay as they are

➡️ a - it is the only one that carries information rather than instruction, so it cannot fade, and b and c both depend on the reply being the thing that went wrong, which the Stop gate already covers.
