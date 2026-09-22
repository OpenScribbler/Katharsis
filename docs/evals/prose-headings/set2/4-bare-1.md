**The audit ran clean and the live style already carries its themes. One gap: three of the style's ceilings sit below where successful replies actually landed.**

I cross-checked `~/.claude/katharsis/styles/` against the audit's own evidence rather than re-reading conclusions you already have. Stripping coded lines, headers, and option lines so the comparison matches what the ceilings govern, four types sit comfortably under their limit and three do not.

## Findings

F1 - **`factual-question` is capped at 150 words, and 58% of its 66 successful replies ran longer, at a 209-word prose median** - the type whose replies are almost pure prose, so the coded-item exemption cannot absorb the gap.

F2 - **`redirect` (250 cap, 291 median, 54% of 35 over) and `broken-report` (250 cap, 403 median, 86% of 7 over) show the same shape** - broken-report rests on 7 successes, so treat it as weak; redirect's 35 carry more weight.

F3 - **`work-request`, `approval`, `diagnosis`, and `thinking-out-loud` are calibrated correctly** - prose medians of 260/198/461/164 against caps of 400/250/500/350.

F4 - **The style absorbed every cross-cutting theme** - T2 narration and T5 buried conclusion in the result-first line, T6 in the classification table itself, T8 in the always-end-with-prose rule, T11 in the cut-praise line.

F5 - **My salvaging hypothesis was wrong and the audit refuted it** - 14 of 1,366 triples, 7 of them in canned security reviews. The failure mode I never named, narration before the result at 207 triples, was the largest one.

## Questions

❓ **Q1** - **Move the three ceilings, or leave them tight on purpose?** - the audit's central theme is that words past the answer correlate with mixed outcomes, so a cap below the success median is defensible as deliberate pressure toward the short end of the range that worked.
   a. leave all three, accepting that I will cut content from answers the audit says were fine
   b. raise `factual-question` to 200 only, where the evidence is strongest at n=66, and leave redirect and broken-report tight
   c. raise all three to their observed medians, 200 / 300 / 400

➡️ b - 58% of 66 is a real signal and 86% of 7 is not, so one change earns its way in and the other two do not.
