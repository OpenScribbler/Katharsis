It's already built and firing in this session, so the live question is what to add rather than whether to start. Three hooks run on `UserPromptSubmit` right now, which are `update-tab-titles.ts`, `punt-shape.sh`, and `turn-reminder.sh`.

Between them they already cover the two patterns that work, and neither is the keyword pattern we sketched. `turn-reminder.sh` injects deterministic state I cannot cheaply know, meaning which type an untyped turn inherits, the next free reference codes, and whether Katharsis is active for the Stop hooks. `punt-shape.sh` is exact-match on `/tmp/punt-*.md`, one case only, and its comment says the 60-day audit measured 92 punt openings at 49 success, 30 mixed, and 13 failure before it was written.

The part that follows and has not been said is that the classifier in the style now makes keyword triggers the wrong direction. A regex firing on "research" is a second classifier reading a wordlist while I read the whole message, and the two disagree on exactly the ambiguous turns where an injection would matter. "I did some research" and "research this for me" carry the same keyword into opposite types.

So the feasible set is the two patterns already there. Deterministic state never annoys because it is never wrong. Exact-match shape injection is safe in proportion to the audit behind it, and the audit is the expensive half rather than the hook.

One candidate fits without new measurement. Session length against a hyperfocus flag, because `identity.md` asks for time and scope creep to be flagged, and wall-clock plus turn count are precisely what I cannot track and the hook can.

There is also an annoyance already live. The first line of `turn-reminder.sh` announces the style is active, and the harness prints that same sentence after every tool result in this session, which the hook does not do. Its comment says custom styles are never reinforced, and that appears to have stopped being true.

## Questions

❓ **Q28** - **What goes in next, if anything?**
   a. the session-length hyperfocus flag, since a standing instruction already justifies it and no new audit is needed
   b. nothing until a turn-failure audit says which turns actually fail, matching how `punt-shape.sh` earned its place
   c. keyword triggers as originally sketched

➡️ a - c duplicates the classifier badly, and b is right in general but a is the one addition whose justification already exists in writing.

❓ **Q29** - **The duplicated style-active line in `turn-reminder.sh`?**
   a. verify against a probe session, then cut line 1 if the harness is reinforcing
   b. leave it, since one short line costs little

➡️ a - the check is cheap and the comment's premise is testable rather than assumed.
