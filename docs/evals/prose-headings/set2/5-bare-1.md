Both parts are already settled on disk, from work done since this thread started.

`work-request.md` carries `## Risks` as slot 3 of its Shape, between Findings and Decisions, with the finding-versus-risk split stated inline. The output style's code table now opens with "Every code below applies in every exchange type," so your "risks probably belong in all styles" is the general rule rather than a per-file addition.

In `factual-question.md` a risk shows up as a trailing clause on the answer, never as a group. Slot 3 says "A trailing clause naming a risk, when the answer is true but fragile. Attach it to the answer rather than promoting it to a group," and the file's example carries it: "Yes, the lint hook is enabled — it is in user settings, so any project that defines its own hooks block replaces it silently." The 150-word ceiling is what forces that. A `## Risks` header plus an `R1` line spends three lines of structure on one sentence, and it puts the condition below the answer when the user is acting on the answer in the same minute they asked.

## Findings

F1 - **`factual-question.md` contradicts itself on which code that clause is** - Shape slot 3 calls it a risk, while the file's Reference codes line names only `C` and `Q` and omits `R`. The output style's table splits them by subject: `R` is about the world, `C` is about the reliability of a claim in this reply. Both worked examples in the file — the hooks-block one above and "a third rule on either side makes the match order decide the outcome" — are about the world, so they are `R` by that test and the Reference codes line names the wrong code for its own examples.

## Questions

❓ **Q9** - **How should `factual-question.md` resolve F1?** - the clause stays inline either way; this is only about which code the file names for it.

   a. add `R` to the Reference codes line beside `C`, and leave slot 3 saying "risk" — the file then names both, and a reply that has a genuine `C` still has one
   b. rewrite slot 3 to say "caveat" and keep the Reference codes line as-is — one code for the slot, at the cost of relabelling two examples that are not caveats
   c. leave it — the clause is uncoded prose in this type, so neither code is ever emitted and the mismatch is cosmetic

➡️ **a** - the trade-off is precision against churn, and (b) would force the two examples to be reclassified as something the table says they are not, while (c) leaves a file that names a code its own examples contradict — a reader hitting slot 3 and the codes line in the same pass has to guess which one is stale.
