A closing next-actions section would have prevented 38 of the 64 silent failures, which makes you right about most of them. No writing rule can reach the other 26.

## Errata

E1 - **A writing rule does reach the silent turns** - I said last turn that no output style or writing rule touches them. In fact 38 of the 64 ran at least 1 tool and then ended with 0 words, and a required closing Next Actions section exists to prevent exactly that kind of turn.

In those 38 turns, the work may well have happened. You still had no way to see what state it left or what came next, so you re-asked and added scope to rebuild the thread. The Katharsis style now covers this in two places: "Always end the turn with prose", and the rule that every piece of work I owe appears under Next Actions.

The 26 turns that ran 0 tools are different, because they produced nothing for a rule to shape. I read all 26:

- **12 are the same prompt re-sent with a small edit.** For example, "path just the one line" became "patch just the one line". That looks like you fixing a typo before I answered, not re-asking after silence.
- **8 end in something other than a missing answer.** That means a session close, an interrupt, a `/model` or `/punt`, a style probe, or a `/btw`, whose answer never lands in the transcript.
- **About 6 are real dead turns.** One is the turn where you asked "did you get my answers?" and retyped 8 answers. Those are harness failures, and a style can't fix them.

The rule lowers the rate but doesn't guarantee anything, because a turn can still end on a tool call. Whether the 38 go away is something the Stop gate's corpus can measure.

The audit's T8 makes the same mistake I did, since it calls all 64 "not a writing defect".

## Questions

❓ **Q29** - **Should I correct T8 in `conversation-audit.md`?** - The fix splits it into the 38 turns where tools ran and then nothing was said, which the closing-prose rule covers, and the 26 turns with no activity, most of which aren't real failures.
   a. Correct it now, so the audit you build guidance from shows the split.
   b. Leave the audit as Fable wrote it and keep the correction in this conversation.

➡️ a - T8 is the one theme whose framing would steer you away from a fix the style already has.
