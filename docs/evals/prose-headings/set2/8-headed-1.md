It's already built and firing in this session, and the style's classification table absorbed most of what we designed it for.

Two UserPromptSubmit hooks run today. `turn-reminder.sh` fires on every typed turn with three lines, carrying the style reminder, the classify instruction, and the verification instruction. `punt-shape.sh` fires only on a prompt naming `/tmp/punt-*.md`, and it stays silent while Katharsis is active because `status-and-resume.md` now carries that shape.

The Q27 idea of keyword triggers mapping "research" or "I don't understand" to shape advice is redundant rather than unbuilt. The classification table does that job against the whole message across 11 types with written splits, while a regex reads a fragment and gets the splits wrong. Building it would duplicate the style worse than the style does it.

What remains is bounded by what the hook can see, which is your raw text, cwd, session id, and anything on disk, never the conversation. That leaves two things worth injecting. One is deterministic fact I would otherwise assert from stale memory, such as branch and dirty state, open tracker items, or ledger counters, which is never wrong and fires only when the state exists. The other is exact-match injection for a prompt shape with a measured failure rate, which is the punt-shape model and the only pattern here with evidence behind it.

The tension you have not named is that turn-reminder is itself always-on, which is the property that made the custom style fade in the first place. Its style-reminder line is justified, because the harness reinforces built-in styles and not custom ones. The classify and verification lines are static instruction repeated on every turn, and they are the two doing the most work, so they are the most exposed to becoming background I skim.

## Questions

❓ **Q28** - **Does the classify line still bind, or has it gone background?**
   a. Query the recorded classifications first, since stop-classify.sh already writes them and this costs a read rather than an experiment
   b. Trim the two instruction lines now on the F68 principle and watch what breaks
   c. Leave it alone, because the style depends on classification happening

➡️ a - the data exists already, and b would remove the scaffolding before knowing whether anything stands without it.

❓ **Q29** - **Does anything new go into the prompt hook?**
   a. Deterministic session state, so I stop asserting branch and tracker status from memory
   b. Another exact-match shape, once an audit names a prompt shape that fails as often as punt openings did
   c. Nothing yet

➡️ c - adding a third injection before Q28 says whether the current two land would repeat the mistake that made r7-colon block 12 replies for no gain.
