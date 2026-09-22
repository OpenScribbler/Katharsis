The Stop hook stopped doubling replies on 2026-09-08, and the pre-reply hook you are describing already runs as `turn-reminder.sh`.

Your complaint was correct when you made it, and the fix landed in the blocking logic rather than in the hook's existence. What remains worth deciding is whether the blocking half still earns its place at a 0.4% catch rate.

## Findings

F64 - **The blocking set shrank from every rule to 2**, `r4-opening-narration` and `r15-question-outside-round`, and `stop-verifier.sh` now instructs "Do NOT reprint the reply. Send only an ## Errata section", so a block costs roughly 40 appended words instead of the whole reply.

F65 - **The blocking set is nearly idle**, firing on 1 of the last 250 captured replies, with `r4-opening-narration` firing on none of them.

F66 - **The Stop layer now earns its place by measuring rather than blocking**, since `capture-stop.sh` built the 3,743-payload corpus this answer is measured from, and `stop-classify.sh` logged 25 real classification misses across roughly 0.7% of turns.

F67 - **`turn-reminder.sh` already implements your proposal**, firing on UserPromptSubmit, stamping untyped turns with the inherited type, directing the classify-then-read step, and carrying the verification line. Its own comment makes your argument, that "Verification cannot live at Stop: a Stop hook has no advisory path".

F68 - **The surviving drift sits entirely in capture-only rules**, with `r7-dash` hitting 65 of 250 replies and `r7-colon` hitting 146 times across the same sample, none of which produces any correction today.

## Caveats

C1 - **The `r7-dash` count is inflated**, because some hits are em dashes used as empty-cell placeholders inside markdown tables rather than as connectors, so the true drift rate is lower than 65 of 250.

On your keyword idea specifically, I disagree with the trigger and agree with the instinct: words like "research" appear across every exchange type, so a keyword match fires on the wrong turns, while the same slot could carry the rules the corpus proves I actually drift on. The strongest case against my verdict is that F65 measures a period when the blocking rules were already deterring the behavior they catch, so a 0.4% rate may be the deterrent working rather than the rules being unnecessary.

## Questions

❓ **Q27** - **Keep the 2 blocking rules, or make the Stop layer capture-only?**
   a. Keep both, since the repair is append-only and costs about 40 words
   b. Drop to capture-only, so no reply is ever interrupted
   c. Keep `r15-question-outside-round` and drop `r4-opening-narration`, which fired 0 times in 250

➡️ a - the cost per block is now bounded at an appended Errata section, and dropping the rules forfeits the only check that sees what was actually written.

❓ **Q28** - **Feed measured drift into the per-turn reminder?**
   a. Yes, have `turn-reminder.sh` name my top 2 capture-only rules from recent corpus data
   b. Keyword triggers on words like "research" or "I don't understand"
   c. Leave the reminder generic

➡️ a - F68 gives a measured target that a keyword never could, and it puts the correction before the reply where you wanted it.
