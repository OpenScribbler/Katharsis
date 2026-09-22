Worth doing, but only where a script knows something for certain, because keyword guesses at intent like "research" are the annoying version.

## You already run one

`turn-reminder.sh` fires on every prompt, since its matcher in `settings.json` is `*`, and it tells me to classify the ask and re-read it. Its first line repeats the harness's own per-turn style reminder word for word, so I get that sentence twice every turn. Firing every turn is the always-on pattern that turned into background in the F45 run.

## Where the annoyance lands

A misfire costs more than clutter. A prompt that says "research" but is really a redirect would get research guidance, and my reply would come back in the wrong shape. That is the rewrite you already dislike, just triggered earlier.

## Facts for the script, judgment for me

The hook stays quiet if it only supplies facts I would misremember or can't see, and leaves the call about what kind of ask this is to me. Three signals meet that bar, because a regex spots each one without guessing:

1. A code reference like "more on F3", where the hook pastes the entry from the `kref` ledger, so I answer the real item even after compaction pushed it out of context.
2. A bare answer round like "17. a", where the hook pastes the open questions those letters answer, which matters after a `/clear`.
3. A turn count crossing a threshold, where the hook tells me to ask whether you want to stop. Your identity notes ask for that, and I rarely do it unprompted.

Each one fires rarely, so it carries information when it does.

## Risks

R10 - **A threshold signal can still nag** - a turn-count line that fires on every turn past the threshold becomes background too, so it has to fire once per crossing.

## Questions

❓ **Q28** - **Should the hook guess intent from words at all?** - Keyword triggers can misfire, and fact signals can't.
   a. No, facts only (code lookups, answer rounds, turn count), and I keep classifying
   b. Yes, keyword triggers alongside the facts, accepting some misfires

➡️ a - a misfire recreates the wrong-shape rewrite, and the style already has me classify every prompt.

❓ **Q29** - **What happens to `turn-reminder.sh`?** - It fires every turn and its first line duplicates the harness reminder.
   a. Keep it as is
   b. Make it fire only when one of the fact signals matches
   c. Remove it and rely on the output style's own reminder

➡️ b - an every-turn reminder becomes background, and folding it into the signal hook means one script instead of two.
