The hook you want to design already runs on every prompt in this session, so the real question is what to strip from it. My answer is to inject state I can't know on my own and drop instructions I already have.

## What already fires

`turn-reminder.sh` runs on every typed prompt. It names the active style, tells me to classify your message and re-read your ask, stamps a type on turns you didn't type, and prints the ledger counters. `punt-shape.sh` fires only when a prompt names a `/tmp/punt-*.md` file. It stays silent whenever settings.json names Katharsis, which it does today, so that hook is idle.

## Where it earns its place

The state lines never misfire because they need no judgment. The counters keep numbering intact across compaction, and I can't rebuild that from memory. The hook also has a hard limit. `UserPromptSubmit` never fires for `!` bash input, so the Stop gate has to handle those 31 turns instead.

## Where it gets annoying

The instruction lines repeat every turn and don't reliably work. The classify line fired on every typed prompt, yet 21 typed turns between 2026-09-04 and 2026-09-14 still skipped classification. The style-active line is also a duplicate, because the harness sent its own "Katharsis-b output style is active" reminder this turn. It named the wrong style too. The hook reads "Katharsis" from settings.json while this session loaded Katharsis-b.

## Your keyword idea

The style's cue table already matches cues like "research" and uses judgment a regex can't. A keyword trigger would duplicate that work and could contradict it. "I don't understand" does expose one gap, because none of the 11 exchange types covers a request to explain something. That fix belongs in the table.

## Caveats

C1 - **21 skips is a count, not a rate** - the telemetry logs only misses, so the total number of typed turns is unknown, and the classify line may still prevent most skips.

## Questions

❓ **Q28** - **What should `turn-reminder.sh` keep?** - it mixes state lines and instruction lines on every prompt.
   a. Drop only the duplicate style-active line, since the harness already sends it
   b. Also drop the classify and verify lines and keep only state, once the telemetry logs typed-turn totals so a rate can decide
   c. Leave it unchanged

➡️ a - that line is the only one with evidence against it, and C1 means we can't yet show the classify line does nothing.

❓ **Q29** - **Where should a request like "I don't understand" get handled?**
   a. A new cue row in the style's exchange-type table, where classification already happens
   b. A keyword trigger in the hook, which fires reliably but can't tell "I don't understand why it failed" from "I don't understand this term"
   c. Leave it to `default.md`

➡️ a - a hook trigger would be a second classifier that can disagree with the first.
