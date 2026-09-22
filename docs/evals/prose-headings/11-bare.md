Confirmed the wordlists live in `technical-english.md`, and that file has no examples file. Writing the replacement now.

A concurrent session rewrote the rule files while I was working. Aligning my reference file to the contract its `SKILL.md` now sets.

`skills/writing-examples/references/technical-english.md` now holds 17 sections. Each states the test, gives one before/after pair, and lists the loophole forms that escape a ban on the original wording. The negation section carries the live-premise carve-out you asked for.

## Findings

F1 - **another session rewrote the rule files while I worked** - `core/writing.md`, `core/technical-english.md`, and `skills/writing-examples/SKILL.md` changed at 11:30 and 11:31 today, dropping the wordlists for stated tests, and all three now point at the reference file I wrote.

F2 - **neither rule file reaches a chat reply** - `core/AGENTS.md:8` carries a comment dated 2026-08-31 that removed the `writing.md`, `guidance.md`, and `technical-english.md` imports so reply shaping runs through the Katharsis output style alone. They still govern commit messages and PR bodies through `git-writing.md`, and the examples reach any session that loads the skill.

## Actions Taken

AT1 - **wrote the examples reference** - 300 lines, 17 sections; the 9 constructions `SKILL.md:14` promises appear in its order, and 8 more cover the remaining bullets in `technical-english.md`.

## Questions

❓ **Q1** - **Restore the three `@` imports to AGENTS.md?** - The experiment is 11 days old, and the ban-to-test rewrite lands only in git destinations until you end it.
   a. Restore all three, ending the experiment.
   b. Restore `technical-english.md` alone, so sentence rules reach chat and Katharsis keeps reply structure.
   c. Leave it running.

➡️ b - the Katharsis style already owns structure, so restoring `writing.md` duplicates it, and the sentence-level tests have no equivalent there.

❓ **Q2** - **Commit the writing work now?** - The tree has 6 modified files, 5 of them from the other session's unrelated work.
   a. Commit `core/writing.md`, `core/technical-english.md`, `skills/writing-examples/SKILL.md`, and the new reference only.
   b. Hold until the other session finishes.

➡️ b - a concurrent session is mid-edit on two of those files, and committing now captures a partial state.
