`work-request.md` already carries it — `## Risks` is slot 3 in its Shape, with the condition-and-consequence rule and the split against `F`, and `R` appears in its Reference codes line. No edit was needed, so I made none.

A risk in `factual-question` shows up as a trailing clause on the answer rather than a group, and that is already slot 3 of its Shape: "when the answer is true but fragile", attached rather than promoted. The reason is the type's own timing — the user asked because they are about to act, usually in the same minute, so a condition parked in a section below the answer gets acted past. The file's own worked case is the shape to copy: "Yes, the lint hook is enabled — it is in user settings, so any project that defines its own hooks block replaces it silently." The risk is the whole second clause, and it costs nine words instead of a header, a code, and a blank line.

That holds for the general case too. A code earns its group when the user has to sort several items; a single conditional attached to a one-line answer has nothing to sort.

## Findings

F1 - **`factual-question.md` names `C` where its Shape describes `R`** - line 88's Reference codes sentence reads "`C` appears when the answer has a limit, and `Q` whenever the answer leaves a call that is the user's", with no mention of `R`, while slot 3 and the first Ambiguity both describe a risk. By the output style's split, "any project that defines its own hooks block replaces it silently" is a condition in the world rather than a limit on my claim, so that example is `R` and the codes line omits it.

## Questions

❓ **Q9** - **How should `factual-question.md` name the fragile-answer case?** - the Shape, the Ambiguity, and the Reference codes line currently disagree about whether it is `R` or `C`.

   a. add `R` to the codes line beside `C`, and leave both as prose clauses rather than groups — the file then matches the split table, at the cost of a reader wondering why a named code never appears as a header here
   b. keep the codes line as is and reword slot 3 and the Ambiguity to say "caveat" throughout — one term, at the cost of calling a world-condition a caveat against the shared definition
   c. say explicitly that this type carries `R` and `C` as trailing clauses rather than groups, and that the group form starts at two items

➡️ **c** - the trade-off is vocabulary against mechanics: a and b both pick a word and leave the reader guessing why no header follows, while c states the mechanic that makes this type different and keeps the shared definitions intact.
