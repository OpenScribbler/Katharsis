I agree that guidance before the reply should carry the load, and that design already ran this turn.

## What runs before the reply
turn-reminder.sh fires on every prompt and injects the classify-then-read instruction plus a verification checklist. The Katharsis style's cue table then sends me to 1 of 11 guidance files before I write. The script's header gives your reason, that "a Stop hook has no advisory path", so any check placed there forces a reprint.

## What the Stop hook still gains
The doubling you remember came from the 08-30 version of the Stop hook. stop-verifier.sh now blocks on 2 defect types only, a finding buried in prose and a decision asked outside `## Questions`. Its repair instruction reads "Do NOT reprint the reply", so the fix arrives as an appended Errata and Questions section. Colons, dashes, and term choice get logged to the corpus without blocking.

What the hook adds is a backstop for misses that guidance alone never prevented. In the 24-call run, 6 of 24 replies still carried violations with the rules loaded before writing. A buried decision is the one miss that costs you something real, because you never see the question.

## Where your keyword idea points
A keyword trigger on the prompt misfires, because "research" also matches "no research needed" and pasted text. Your 2 examples still expose a real gap. The cue table has no type for a research request. "I don't understand" lands in factual-question or diagnosis, and those types deliver an answer without first checking what you already understand.

## Questions

❓ **Q27** - **How should research requests and "I don't understand" messages get their own guidance?**
   a. Add 2 exchange types with cue rows and guidance files, so I recognize the phrase in context
   b. Add keyword triggers to turn-reminder.sh that inject a reminder on a match, which fires every time but can't tell a negation or a paste from a real request
   c. Add the phrases as cues on existing rows, with no new guidance files

➡️ a - c routes the messages but reuses shapes built for other exchanges, and b adds the misfire risk on top of the classification that already runs.
