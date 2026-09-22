Keep the Stop verifier, because it now costs 3% of reply words and catches the 2 defects that hide a finding or a decision from you.

## The reprint cost is gone
The doubled output you remember came from the 08-30 verifier. It blocked on every rule and demanded the whole reply again. Design decision D5 in `docs/design.md` replaced it. A block now asks only for an appended Errata section and, when needed, the missing Questions round.

## Where your idea fits
I agree that shaping belongs before the reply, and D1 and D6 already put it there. The style has me classify your message against an 11-type cue table, and `turn-reminder.sh` adds the verification checklist to every prompt before I write.

A keyword hook would add something only for an exact phrase tied to measured failures. A loose cue like "research" also fires on "the research agent finished", and it would give me guidance that contradicts my own classification. `punt-shape.sh` already works this way. It matches one exact pattern, chosen after 13 of 92 punt openings failed and 30 more were mixed. "I don't understand" meets that bar better than "research", because the phrase is exact and calls for one reply shape.

## The case against keeping it
15 blocks in 3 days is a small sample. If shaping before the reply keeps improving, the verifier could become capture-only with little loss. Without it, though, a question asked outside the Questions round would reach you with no fix.

## Findings
F64 - **Q26 is already settled** - `stop-verifier.sh` lines 75-76 block only `r4-opening-narration` and `r15-question-outside-round`, and every other rule, r7-colon included, now only records to the corpus.

F65 - **The verifier blocked 15 of 323 replies since its 2026-09-11 version** - the fixes added 2,876 words against 94,896 reply words, and 10 of the 15 were an Errata section alone.

F66 - **Blocking on style rules never fixed them** - across 79 blocked-then-rewritten replies in the corpus, 48 still broke a flagged rule afterward, and r7-dash survived 37 of 42 rewrites.

F67 - **`stop-classify.sh` and `ledger-stop.sh` never block** - the first counts skipped classifications (9 since 2026-09-11), and the second writes the reference-code ledger.

## Caveats
C1 - **F66 mixes 2 verifier versions** - under the append-only verifier, the re-scored text is only the appended section, so the 48 failures mostly measure the older reprint verifier.

## Next Actions
NA6 - **Audit your typed prompts for phrases that came before your corrections** - the session transcripts hold the prompts, and a phrase earns a cue only where it clusters with failures.

## Questions
❓ **Q27** - **Keep the Stop verifier blocking on its 2 rules?** - today it costs 3% of reply words.
   a. Keep it as it is, with append-only blocks on r4 and r15
   b. Make it capture-only and rely on shaping before the reply

➡️ a - F65 puts the cost at 2,876 words over 3 days, and without the verifier a misplaced question reaches you with no fix.

❓ **Q28** - **Add exact-phrase cues to the prompt hook?** - NA6 is the only next action.
   a. Yes, start the NA6 audit now and add a cue only for a phrase that clusters with failures
   b. Add cues for "I don't understand" and "research" now, without the audit
   c. No, and classification stays my judgment alone

➡️ a - the punt-shape cue earned its place from 13 failures in 92 openings, and nobody can check whether a cue with no measured failure behind it helps.
