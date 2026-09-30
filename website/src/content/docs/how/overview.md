---
title: How a turn works
description: What the prompt hook, the model, and the Stop hooks do in each turn.
---

1. You send a message.
   The prompt hook adds the classification instruction and the next free code numbers to the model's context.
   When your message answers a question, the hook records the answer, and it names the questions still open.
   When the model changes to one that takes a different note, or after a compaction, the hook also adds a short note for that model, from a note for its version when one exists and otherwise for its family.
   After a compaction, it also lists each owed item the ledger still has open, the oldest 12, with its body and a question's options and recommendation, each shortened to 200 characters, so the resumed turn does not depend on the summary's account of what was owed.
1. The model classifies your message and runs `katharsis-exchange-style.sh <type>`.
   The script prints the guidance file for that type.
1. The model writes the reply that the guidance file describes.
1. The Stop hooks run:
   - The first records a turn that skipped the classification step.
   - The second writes each coded item to the ledger.
   - The third checks that the reply opens with its finding.
   - The fourth checks the reply's claims against the session's tool results, and shows one `Katharsis check:` line for each claim they contradict.

## Mistakes the plugin shows you

The fourth Stop hook compares what the reply says with what the tools showed, and never holds the reply for it:

- Tests, a build, plugin validation, a linter, or CI said to pass when the last run failed, ran before a later code edit, or never ran. A command counts as a run only where it is the command, so `rg pytest` is not a test run. When no command the hook knows ran but some command's output reads like a check's result, the hook says nothing. A failed command with several steps counts against a check only when the check's output shows a failure or the check is the last step. When two different commands for the same check ended differently, only a claim about all of them, such as "the tests pass", is judged.
- A ticked checklist line in a PR body or commit, which counts as the same claim unless the line shows the check failing. A line in the file `--body-file` or `git commit -F` names is read only when that file has not changed since the call returned, and `--replay` reads no such file.
- A change the reply itself says it verified with nothing run after the last edit.
- A count whose only source is `grep -I`, `grep -c`, or `rg` without `-uu`, which skip files or count lines instead of matches. An exact count that printed the same number clears it, and a line count is not flagged when you asked for lines.
- A count of one literal word that `grep -r` or `rg` took under a folder and piped to `wc -l`, which the hook first recounts in every file under that folder, binary and hidden ones included. When its number differs and the files grep or rg skipped hold the whole difference, the notice names those files. When its number matches the reply's, skipped files are not reported. Otherwise, and at a symlink or special file, or past 5,000 files, 32 MiB, or 3 seconds, you get only the line above. `--replay` never recounts.

A PreToolUse and PostToolUse hook on Bash watches calls that replace a file no earlier call in the session named, and runs without function hooks.
Before the call it copies the file, a regular file up to 256 KiB found through any symlinks in its path, unless the same command first moves or copies that file elsewhere.
When lines of the old content are gone afterward, it saves the earlier copy under `clobbered/<session>/`, readable only by you, shows you one line with the `cp` command that restores it, and tells the model the same.
A file the call left larger than 1 MiB is not compared.
Once `clobbered/` holds 64 MiB, it saves no new copy and says so.
Each finding is appended to `detections/<session>.jsonl`, readable only by you. The record of a replaced file counts the lost lines and names the saved copy.

## Held replies

A Stop hook can hold a reply once and ask for the missing lines.
It never asks for a rewrite.

| Problem | The hook asks for |
|---|---|
| A code's claim changed with no erratum | A line saying the code stands as on file, the corrected line with an `E` line, or the new item under a fresh code |
| The reply opens by describing what it's about to do | The finding on its own line |
| A Bash call replaced a file the session never read, and the reply doesn't say so | One line naming the loss and the saved copy |

Each hook exits 0 when it can't do its job, so a failing hook costs a ledger row, not a turn.
