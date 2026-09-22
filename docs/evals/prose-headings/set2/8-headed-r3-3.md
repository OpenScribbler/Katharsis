Keyword triggers are the one use I would skip. The useful version of this hook already runs in your settings, so Q27 is settled.

## What already runs

`turn-reminder.sh` fires on every prompt you type and injects 3 lines. They name the active style, tell me to classify your message and then read its guidance file, and require a verification pass. It also spots turns you never typed, such as bash output, task notifications, and compaction resumes, and stamps them with the last typed type. It prints the next free code numbers too, so the numbering survives compaction. `punt-shape.sh` is the only pattern trigger, and it matches only a `/tmp/punt-*.md` path.

## Where a hook stays reliable

A hook is reliable when the answer is structural and certain, such as a file path, a harness wrapper tag like `<task-notification>`, or a counter value. I miss those or lose them after compaction, and the hook is always right about them at no cost.

## Where it gets annoying

Keywords break on meaning. "Research" shows up in "skip the research and just answer". "I don't understand" shows up in "I don't understand why you did that", which reports something broken rather than asking for an explanation. A wrong injection pushes the reply confidently in the wrong direction. That is why the shipped design leaves judgment to the style's cue table, which reads your whole message, and keeps the hook to facts.

Volume is the other annoyance. This prompt reached me with the style reminder twice, once from the harness and once from the hook. Every repeated line becomes background text I skim.

## Risks

R10 - **Each new reminder line weakens the others** - the hook already injects 3 lines plus a counter on every typed turn, so a fourth line costs attention from all of them.

## Questions

❓ **Q28** - **What should the prompt hook do beyond what it does today?** - This decides whether triggers keep the bar `punt-shape.sh` set.
   a. nothing new, and judgment stays in the style's classification
   b. exact-match triggers for structural markers only, each backed by a measured failure the way punt-shape cites 13 failed openings out of 92
   c. keyword triggers for phrases like "research" and "I don't understand"

➡️ b - it lets a trigger in only with failure data and a certain match, while c misfires on negation and on messages that report something broken.
