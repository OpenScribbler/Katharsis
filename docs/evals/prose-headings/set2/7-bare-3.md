The Stop hook already stopped doing what you're describing, and your argument for moving checks earlier is written in its own comments.

Four hooks run at Stop and three never block. `capture-stop.sh` writes the corpus, `ledger-stop.sh` writes the ledger, and `stop-classify.sh` records whether the turn classified. Its comment settles your question directly, that "a block after the reply is on screen can only produce a second reply."

`stop-verifier.sh` is the only one that blocks, and it blocks on 2 rules, `r4-opening-narration` and `r15-question-outside-round`. Every preference rule, meaning punctuation, term choice, and list coding, captures to the corpus without blocking. The comment naming that change cites the measurement from this conversation on 08-30, 21 blocked replies and 10,679 of 16,984 words reprinted, as its reason.

The doubling is gone as well. Both blocking repairs now say "Do NOT reprint the reply. Send only an ## Errata section", so you read the reply once and the appended lines once.

The before-reply hook also exists. `turn-reminder.sh` runs on UserPromptSubmit, and its comment makes your point nearly verbatim, that verification cannot live at Stop because a Stop hook has no advisory path, so injecting there forces a reprint.

What the 2 remaining blocks buy is the residue priming misses. Both are placement defects I can only commit once the reply exists, so no amount of upfront guidance catches them, and something has to read the finished text.

Your keyword idea is the one piece not built, and I disagree with the strong form of it. Ten types share cues, and 11 splits are documented because those cues overlap. "Research" sits in `work-request` ("research X and report") and in `thinking-out-loud` ("should we research this?"). A regex picking the type would misfire exactly where the splits are needed, and a wrong type costs more than no type, because it swaps both the ceiling and the exclusion list.

The version that works is a check rather than a classifier, comparing the type I chose against the cues in the prompt and warning mid-turn.

## Questions

❓ **Q27** - **How far to take the cue-word check?**
   a. build it now as a PostToolUse hook on `katharsis-exchange-style.sh`, warning when my chosen type conflicts with the prompt's cues
   b. measure first, by having the existing telemetry log my chosen type beside the cue matches, so the misclassification rate is known before anything is built
   c. leave it, since the 08-30 audit found 30 misses over 19 sessions all with mechanical causes the prompt hook now handles

➡️ b - we have data on how often classification was *missing* and none on how often it was *wrong*, and the same telemetry that answers it is a few lines in a hook that already runs.
