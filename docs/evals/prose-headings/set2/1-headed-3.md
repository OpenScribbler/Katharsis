You're right that a writing rule touches it, and my "not a writing defect" line was wrong.

The style already carries the fix. "Always end the turn with prose", plus the `NA`, `MV`, `W` and `B` codes, forbids exactly the shape you are describing, so those turns sit inside the guidance rather than outside it. The cleanest instances are the 25 canned security reviews that ran tools, announced a finding and stopped, as in "I found one substantive security-relevant issue. Let me finalize my findings." with nothing after it.

Where the data parts company with the mechanism you described is what those 64 turns actually contained. 25 are those headless review runs, where no human was waiting on a next action. 12 are turns you stopped yourself, and their reaction text opens `[Request interrupted by user]`. 23 produced no tool call and no text at all, and in 13 of those your next message is the same message edited: "path just the one line" became "patch just the one line" at 0.98 similarity, and "I assume the open pr to update the cloud api OAS" came back with "#703" added. Those are re-sends from before any reply existed, so there was no reply for a next-action section to live in.

That leaves 1 of 64 where something you typed drew tool work and then silence.

So the rule reaches the failure mode and the count does not measure it. The 25 machine cases are real and worth fixing, and they are the ones your point lands on hardest, because a review that names a finding and never states it is the same defect as a work turn that ends without a next action.

## Errata

E1 - **"No output style or writing rule touches it" was wrong** - the Katharsis style's "Always end the turn with prose" rule and the `NA`/`MV`/`W`/`B` codes address it directly, which you were right to push back on.

E2 - **"44 percent of failures are turns that produced no prose, and you re-typed the ask" overstated it** - I relayed the audit's T8 framing without testing the mechanism, and 25 of those 64 are transcript artifacts rather than failures.

## Findings

F1 - **T8 needs re-cutting, not just re-wording** - 25 of the 146 failures (13 edit-and-resend, 12 self-interrupt) are the same artifact class already excluded as `artifact_dup`, so the conversational failure count is nearer 121.

F2 - **The surviving instances are concentrated in scripted runs** - 25 of the 26 turns that ran tools and ended without prose are canned reviews, which is a headless-run problem the style fixes but which never cost you a re-ask.

## Next Actions

NA1 - Re-cut the inventory to exclude self-interrupts and edit-and-resends, recount the verdicts, and correct T8 in `conversation-audit.md`.

## Questions

❓ **Q1** - **Start NA1 now, or go straight to the guidance file?** - The recount changes one theme's size and two of its sentences, and it changes no per-type mapping, which is the part the guidance is built from.
   a. Recount first, then write the guidance against corrected numbers.
   b. Write the guidance now and fix T8 afterward.

➡️ **b** - the per-type medians and the served/failed shapes are untouched by the exclusion, so the guidance has everything it needs, and NA1 is a correction to a document rather than a dependency.
