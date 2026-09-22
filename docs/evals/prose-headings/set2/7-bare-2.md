The Stop hook now earns 2 rules and nothing more, and the pre-reply layer you are describing already fired on this message.

We cut the Stop hook back on 08-30 using the measurement from that session, so the doubling you remember is largely gone. `stop-verifier.sh` blocks on `r4-opening-narration` and `r15-question-outside-round` only, and both repair by appending a line, which leaves everything already on screen correct. Its design comment states the boundary plainly, that "Demanding the reply again is out of bounds whatever the rule." Punctuation, term choice, and list coding capture to the corpus without blocking.

The pre-reply hook exists too. `turn-reminder.sh` runs on every `UserPromptSubmit` and emits the style reminder, the classify-then-read instruction, and the verification line. Its own comment reaches your conclusion independently, that verification "cannot live at Stop" because a Stop hook has no advisory path, so it costs nothing before the reply and forces a reprint after it.

Where your instinct lands on something unfixed is compliance. The gate has logged 25 classification misses since 09-04 and 8 of them today, so the instruction to classify is being skipped often enough to matter. The likely cause is friction, since running the script dumps a guidance file of roughly 1,500 words into context before I write a word.

Your cue idea fixes that better than I first credited, provided it injects shape rather than a stamp. Two or three inline lines triggered by cues cost no tool call and arrive before the draft, so a skipped classification still gets the essential form.

Against the idea: a grep cannot separate "research this" from "I already researched it", so the hint will sometimes name the wrong type, and I would have to treat it as provisional rather than authoritative.

## Findings

F1 - **The Stop hook blocks on 2 rules, not the full set** - `BURIED = {"r4-opening-narration"}` and `UNASKED = {"r15-question-outside-round"}` at lines 75 and 76 of `stop-verifier.sh`.

F2 - **Classification misses are live, not historical** - 25 entries with status `missed` since 09-04, including 8 on 09-11, against 29 `inherited` entries that record untyped turns correctly.

## Risks

R1 - **A cue hook that writes the stamp would hide the problem rather than fix it** - the gate counts stamps as a proxy for reading the guidance, so pre-stamping would drive the miss count to zero while the guidance stayed unread.

## Trade-offs

### Cue-triggered hint against full guidance read

- **Inline hint** forecloses nothing, because it adds text to a hook that already prints text, and removing it is deleting a block. It cannot carry a type's exclusion list or ceiling, so complex turns still need the file.
- **Keeping only the full read** leaves the 8 misses per day unaddressed, and each miss produces a reply shaped by no guidance at all.

## Questions

❓ **Q1** - **Add cue-triggered shape hints to `turn-reminder.sh` as a fallback for skipped classification?**
   a. Yes, inject 2 to 3 lines of shape per matched cue, and leave the stamp untouched so the gate keeps counting misses honestly
   b. Yes, and also have it write a provisional stamp the model must confirm or override
   c. No, and instead attack the friction by shortening the guidance files themselves

➡️ a - it addresses F2 without breaking the measurement in R1, and option b trades an honest miss count for a number that looks better than the behavior behind it.
