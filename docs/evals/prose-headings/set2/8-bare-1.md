It's built and running. `turn-reminder.sh` is a UserPromptSubmit hook on `matcher='*'`, and the three lines at the top of this turn are its output. `punt-shape.sh` is a second one, currently silent because Katharsis is active.

What it does splits into two kinds. Three lines are standing guidance: the style reminder, the classify-then-read instruction, and the verification reminder. Those fire on every typed turn regardless of what you wrote. The rest is deterministic fact: on an untyped turn it computes the inherited type and tells me the answer, it maintains the active marker and the chain link, and it appends a counter line from the ledger so numbering survives compaction.

The part you haven't named is that the guidance budget is already spent. Always-on instruction is the exact shape that measured worse than context-only in the three-condition run, and three lines of it now arrive every turn. Adding a fourth competes with the three rather than adding to them. The headroom is in the fact-injection half, because a fact either gets used or doesn't and never becomes background.

The annoyance cost is yours before it's mine. That stdout renders in your transcript on every turn, so each standing line is one you scroll past forever, while a conditional line you see only when it fired on something real.

What stays cheap and fires rarely: resolving a reference code you cite, so "more on F3" injects F3's text from the ledger that `kref.sh` already reads; confirming a path you paste still exists, so I never discuss a file that moved; and branch plus dirty-file count when the prompt is git-shaped, which AGENTS.md already requires me to check before a push.

What I'd rule out: regex classification of exchange type, since the style buys judgment the script can't match, and the hook already confines itself to the untyped case where the answer is mechanical.

## Questions

❓ **Q28** - **Which half of the hook do we work on next?**
   a. Add conditional fact injection, starting with reference-code resolution
   b. Cut the standing lines back first, then measure whether classification still happens
   c. Both, treating the cut as the control for the addition

➡️ b — the three standing lines are the one part with evidence against them, and cutting first tells us whether they were load-bearing before we add anything that would mask the answer.
