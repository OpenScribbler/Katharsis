`work-request.md` already carries `## Risks` — it sits at slot 3 in the Shape, between Findings and Decisions, and its Reference codes line already names `R` among the codes the type sometimes carries. Nothing to add there.

`factual-question.md` already answers the second part too, at slot 3 of its own Shape: **a trailing clause naming a risk, when the answer is true but fragile, attached to the answer rather than promoted to a group.** So a risk shows up in that type as part of the answer sentence — "Yes, and it breaks if the token rotates" — rather than as a coded `R` line under a header. That fits the 150-word ceiling: a one-line answer with a `## Risks` block underneath costs more scanning than the risk is worth.

Both files live at `~/.local/src/katharsis-live/styles/`, which `~/.claude/katharsis` symlinks to. The `katharsis-lab` copy we were editing earlier in this session is the old tree and has since diverged.

## Findings

F1 - **The central table and `factual-question.md` give opposite instructions for a big risk** - the output style's Reference codes section says "when the content of a reply fits a code the type did not name, use the code," while factual-question's slot 3 says to attach the risk rather than promote it. Neither states a threshold, so a fragile answer with a serious consequence has two defensible shapes.

## Questions

❓ **Q9** - **How should `factual-question.md` resolve F1?**

   a. leave slot 3 absolute — risks in this type are always a clause, and the ceiling is the reason
   b. add a threshold to slot 3 — a clause by default, a coded `R` when the consequence reaches past the question asked
   c. treat it as already covered — the central table's "use the code when content fits" overrides any type file, and slot 3 is just the common case

➡️ **b** - the trade-off is ceiling discipline against losing a real risk inside a sentence, and a named threshold keeps the 150-word default while giving the rare serious case somewhere to go. (a) is cheaper but silently downgrades a risk the user needed to see; (c) leaves the contradiction in the files for the next reader to hit.
