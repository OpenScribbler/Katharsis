The hook is already built and running. `turn-reminder.sh` fired on this message, and its current design already draws the line you're asking about.

Everything it does today is content-independent. It reads which style is active from the settings files, whether a human typed the turn or the harness did, whether a punt path appears in the text, and what the ledger counters stand at. It never interprets what your words mean. The one judgment call in the whole flow, which exchange type this message is, it hands to me with a one-line reminder rather than deciding itself.

That boundary is what makes it non-annoying, and it rules out the keyword triggers I floated earlier. A regex firing on "research" or "I don't understand" would be guessing at intent, and it would guess against a classifier that already exists in the style. Two classifiers that disagree cost more than one that is occasionally slow, because I would have to decide which to obey, and the hook's line arrives with more authority than it earned.

What stays inside the line is resolving what you literally typed, rather than inferring what you meant. A code reference is the clean case: when `F3` or `Q7` appears in your message, the pattern is unambiguous, and the hook could paste that ledger line in rather than leaving me to call `kref` or, worse, recall it wrong. It fires only when a code appears, so most turns see nothing.

The other candidate is drift feedback from the corpus, which is measured rather than guessed, though it earns its place only if the aggregate ever says something a single reply does not.

## Questions

❓ **Q28** - **What, if anything, gets added to `turn-reminder.sh`?**
   a. ledger pre-resolution when a code appears in the prompt, since the match is deterministic and it saves a lookup
   b. nothing, because the hook already covers the deterministic facts and additions dilute the lines that matter
   c. drift feedback from the corpus, once enough preference data accumulates to say something

➡️ b — every line the hook prints competes with the classify reminder for attention, and a code reference costs me one cheap `kref` call that I would make anyway.
