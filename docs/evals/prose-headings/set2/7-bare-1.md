The Stop hook earns its keep, and the doubling you remember was removed on 2026-09-08.

Two things changed at that cutover. The blocking set dropped from every rule to 2, `r4-opening-narration` and `r15-question-outside-round`, and both repairs are an appended `## Errata` section rather than the reply again. Across the 150 most recent replies since then, 1 would block. The other 77 replies carrying defects captured to the corpus silently, so the clutter is gone by construction rather than by restraint.

The evidence that blocking works is `r15` itself. It fired in 17 of 150 replies before the cutover and 1 of 150 after, while mean reply length grew from 208 words to 315. A defect with more room to appear that appears 17 times less often is being held down by the block.

The same comparison shows what capture-only costs. `r7-colon` went from 47 replies to 62 and `r7-dash` from 10 to 34, so 96 punctuation defects across 150 replies now reach you with nothing correcting them.

Your instinct about moving the work earlier is right, and it is already built. `turn-reminder.sh` fires on `UserPromptSubmit`, reads which style is active, and injects the classify-then-read instruction plus a verification line. It ran on the message you just sent. Its header comment argues exactly your point, that verification cannot live at Stop, because a Stop hook has no advisory path and injecting there means a block.

What a pre-reply hook cannot do is see text that does not exist yet. `UserPromptSubmit` sees only what you typed, and `Stop` sees the finished reply. No event sits between them, so a colon I am about to write is invisible to every hook until it is already on your screen. Keyword cues can tell me which shape to use, and they cannot govern how I punctuate it.

Against the verdict: `r15` may have fallen because the style's Questions rule got sharper over the same 12 days rather than because the block fired.

## Caveats

C1 - **The `r7` rise is partly opportunity rather than error** - mean reply length grew 51% from 208 to 315 words between the two samples, so longer replies carry more chances to contain a colon.

C2 - **Both samples are the 150 most recent replies on each side of the cutover, not random draws** - they span different work, so the comparison is suggestive rather than controlled.

## Questions

❓ **Q1** - **What to do about `r7`, now the dominant uncaught defect at 96 hits across 150 replies?**
   a. Name `r7` explicitly in `turn-reminder.sh`'s verification line, then re-measure after the next 150 replies
   b. Return `r7` to the blocking set, accepting one `## Errata` line per violation
   c. Leave it as capture-only and treat punctuation as cosmetic

➡️ a - D5 bars b, because fixing a connector colon rewrites a sentence rather than appends to it, and the per-turn reminder is the one lever on `r7` that has never been tested.
