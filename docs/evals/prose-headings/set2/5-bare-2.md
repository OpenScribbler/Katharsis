`work-request.md` already carries Risks. It sits at slot 3 of Shape, between Findings and Decisions, worded as "something that has not gone wrong yet and would change what they do if it did, with the condition and the consequence in the same sentence," and the file's Reference codes line lists `R` among the codes the type sometimes takes. The lab directory moved to `~/.claude/katharsis/` since we last worked on this, and 13 style files now exist there, so the change landed in a later pass.

In `factual-question.md`, a risk shows up as a trailing clause on the answer sentence rather than as an `R` group. That is slot 3 of its Shape today: "attach it to the answer rather than promoting it to a group," with the worked example "Yes, the lint hook is enabled — it is in user settings, so any project that defines its own hooks block replaces it silently." The reasoning holds: the user acts on a factual answer in the same minute they read it, so a condition sitting in a section below the answer arrives after the action it was meant to change. The 150-word ceiling makes the same point from the other side — a group header plus a coded line costs more words than the clause does.

## Findings

F1 - **`factual-question.md` gives two different instructions for a fragile answer** - Shape slot 3 says attach the risk as a clause, while its Reference codes line says the type carries `C` when the answer has a limit and says nothing about `R`. Under the master table those are separable, since `R` is about the world and `C` is about the reliability of a claim in this reply, but a reader hitting slot 3 with a world-risk in hand has no line telling them the prose form wins over the code.

## Questions

❓ **Q9** - **How should `factual-question.md` reconcile slot 3 with its Reference codes line?**

   a. add `R` to the Reference codes line with the note that this type renders it as a clause rather than a group — one edit, keeps the universal rule intact
   b. leave it and treat slot 3 as governing, since a file's own Shape already outranks the common list
   c. widen slot 3 to name both codes, so a `C` limit and an `R` condition both get the trailing-clause treatment

➡️ **a** - the trade-off is edit size against the reader's path: b is defensible but only to someone who already knows the precedence rule, and the one sentence in a buys that for everyone who does not.
