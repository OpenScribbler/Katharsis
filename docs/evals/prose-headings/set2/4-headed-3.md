The audit is sound, and most of it already shipped: the live Katharsis style's 11-type table is this document's 13 ask types minus the three machine-generated buckets.

Its method held up where it mattered. 559 of 559 files parsed with zero failures, 1,392 triples extracted, and it tested your three hypotheses honestly rather than confirming them, which is how T7 ended up refuting salvaging at 14 of 1,366 instead of quietly dropping it. The largest failure mode it found, narration before the result at 207 triples, was not on your list at all.

The one thing worth acting on is calibration. The audit closes by recommending roughly 300 words for status and factual asks and 400 for approvals, and the shipped ceilings for those two types are half that.

## Findings

F1 - **Diagnosis and work-request shipped exactly on the audit's numbers** - `diagnosis.md` ceilings at 500 against a 503-word success median, and `work-request.md` at 400 against 377.

F2 - **Four ceilings ship tighter than the audit's own success medians** - `factual-question.md` 150 against 318, `approval.md` 250 against 378, `redirect.md` 250 against 345, and `broken-report.md` 250 against a 542-word served median on the type with the corpus's worst ratio at 7 of 24.

F3 - **The style covers T8, the biggest raw failure source** - 64 zero-word turns cost you a full re-ask each, and "Always end the turn with prose" plus the bash-mode one-word rule close it.

## Caveats

C1 - **T1's central number rests on labels the audit assigned itself** - the success-against-mixed medians that carry the whole length argument come from 383 subagent-assigned "mixed" verdicts, and your prompt reserved that call for you; 435 of 1,366 are marked low confidence.

C2 - **F2's gap is overstated for coded-heavy types** - ceilings govern prose while the audit's medians count whole replies including coded groups, so the real mismatch is largest on conversational types like `factual-question`, where prose is nearly the whole reply.

## Questions

❓ **Q1** - **Raise the `factual-question` and `approval` ceilings to the audit's recommended numbers?** - both currently ship at roughly half what the audit's own success band supports, and C2 says the confound is smallest on exactly these two types.

   a. raise `factual-question` to 300 and `approval` to 400, matching the audit's closing recommendation
   b. leave both, on the theory that cutting below the success median is the point given T1
   c. raise only `factual-question`, where the 150-word ceiling is furthest from the data

➡️ a - the audit explicitly rejected "shorter is always better" and named these two numbers, so shipping half of them discards the one calibration the data actually supports
