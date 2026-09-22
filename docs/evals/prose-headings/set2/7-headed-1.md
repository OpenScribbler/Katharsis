Both halves of what you're describing already exist, and the Stop hook was narrowed on 2026-09-08 to fit exactly the argument you just made.

`turn-reminder.sh` fires on UserPromptSubmit for every message, this one included, and its header states your case in your words: verification "cannot live at Stop: a Stop hook has no advisory path, so injecting there means exit 2 or {"decision":"block"}, both of which force a full reply reprint. Here it costs nothing and it arrives before the reply is written rather than after."

What the Stop layer still earns is recording rather than correcting. Three of its four scripts never block. `stop-classify.sh` records the exchange type, `capture-stop.sh` feeds the corpus, and `ledger-stop.sh` writes the ledger that `kref` reads. Only `stop-verifier.sh` blocks, on 2 rules, `r4-opening-narration` and `r15-question-outside-round`, and neither reprints the reply, because the repair is an appended Errata section.

Those 2 survived for the reason your proposal implies. Both are placement failures that cannot exist until the reply does, so no pre-reply reminder prevents them. I cannot know I buried the finding until the opening is already written.

The keyword form is the weakest version of your idea. "research" carries different work in "research this topic", "the research directory", and "I already researched it", and the cue tables in the style are contextual in a way a regex is not. The prompt hook already stamps the type on untyped turns and hands typed ones to me.

That handoff is where the real hole sits. Nothing checks whether my classification was right. `stop-classify.sh` records the type I declared, so choosing the wrong guidance file shapes the entire reply and gets logged as fact.

## Questions

❓ **Q86** - **How should classification correctness get checked?**
   a. score the ledger's recorded types against the user messages that produced them, as an offline batch review
   b. have the prompt hook cue-match independently and warn only when its guess disagrees with mine
   c. leave it, since a wrong type still lands inside the same craft rules and codes

➡️ a - it measures the error rate before anything gets built, and b is worth its brittleness only if that rate turns out to be non-trivial.
