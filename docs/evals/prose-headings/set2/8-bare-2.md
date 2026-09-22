It's already built and running. `turn-reminder.sh` fires on every prompt alongside two other hooks, and it does the category you're asking about: it stamps untyped turns with their inherited type, links handoff chains so a punt does not restart numbering, writes the marker the Stop hooks key off, and prints ledger counters that keep reference codes continuous across compaction. Those are facts a script holds and I cannot cheaply get.

That suggests the test for any line it prints, and it is not "is this conditional." It is whether the line changes what I do. The counters are the model case, because numbering across a compaction is something I would otherwise get wrong every time, and they stay silent when there is nothing to report, which is why they never read as nagging. The style-is-active line passes for a different reason: Claude Code reinforces built-in styles every turn and never custom ones, so it fills a harness gap rather than repeating the style back to me. The classify line and the verification line are both prompt-independent restatements of what the style already says, which is the shape that usually turns into wallpaper, but each one prevents a whole reply coming out wrong, so the consequence is large enough to carry the rent.

The gap worth filling is the one standing instruction I currently cannot honor at all. `identity.md` says to flag scope creep when a session balloons and ask whether to continue, and I have no turn count or elapsed time to judge that against, so it never fires. The hook already has the session id and could track both, emitting one line when a threshold is crossed rather than on every turn after it.

Past that I do not see much worth adding. Git state and the tracker store check I can run myself when a turn actually needs them, and the tracker one belongs at SessionStart anyway, since it is once per session rather than once per prompt.

## Questions

❓ **Q28** - **Add a session-size line to the hook for the hyperfocus instruction?**
   a. Track turn count and elapsed wall time, emit one line on each threshold crossing, and stay silent otherwise
   b. Track turn count only, since wall time counts the hours you stepped away from the terminal
   c. Leave it out, and let the scope-creep call stay yours

➡️ b - wall time on a session you left open overnight would fire the flag on a session that did four turns, and turn count measures the thing the instruction is actually about.

❓ **Q29** - **Anything else you want it carrying, given that it sees your prompt before I do?**
   a. Nothing else, keep the surface at what exists plus Q28
   b. Something specific you have in mind that I have not named

➡️ a - the three prompt-independent lines are already near the point where more text competes with your actual words, so the next addition should have to displace one.
