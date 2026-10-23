---
title: How a turn works
description: What the prompt hook, the model, and the Stop hooks do in each turn.
---

1. You send a message.
   The prompt hook adds the classification instruction and the next free code numbers to the model's context.
   When your message answers a question, the hook records the answer, and it names the questions still open.
   At the `standard` or `autonomous` [autonomy level](#autonomy-level), it adds one line naming the level.
   At the `sketch` or `rich` [richness level](#richness-level), it adds one line naming that level, and attaches the sketch rules from `styles/richness/sketches.md` when the session has not had them, after a compaction, and when the level returns from `text`.
   With the [Claude Motion](#claude-motion) option off, it adds one line at every richness level saying no reply uses Motion.
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

## Autonomy level

The autonomy level sets which actions the model takes without asking you first.
Open `/config`, search for `autonomy`, and pick a value on the Autonomy level row. The setting's key is `katharsis.autonomy`.

| Level | What changes |
|---|---|
| `guided` (default) | Nothing. The style's "When a call is mine" test applies as written, so a push, a PR, or a message to a colleague is your call. |
| `standard` | Further publishing inside a scope you approved this session goes ahead, such as another push to a branch you approved pushing, or an update to a PR you approved opening, by adding commits. Starting something new that publishes, such as opening a new PR, and messaging people, including a comment, a review reply, or a review request on a PR, stay your call. |
| `autonomous` | Everything `standard` allows, and also pushing a branch the work created and opening or updating a PR from it by adding commits go ahead once the work is verified, by the repo's own checks where it has them. A push to the default branch or to someone else's branch, and opening or updating a PR against a repo you can't push to, such as a third-party project reached through a fork, including a push to the branch that PR is from, are not among these additions. Every other action that is your call at `guided` stays your call, such as merging, deleting data the model did not create this session, force-pushing shared history, spending money, and messaging people, including a comment, a review reply, or a review request on a PR. |

"Your call" means the model asks first unless it can infer your answer from what you said, the repo's conventions, or preferences you stated earlier. Deleting data it did not create this session and force-pushing shared history wait for your own words at every level, and no level's additions include a force-push, even to a branch the work created.

At `standard` or `autonomous`, the prompt hook (`hooks/register.ts`) adds one line to each turn's context naming the level, and the style's "Autonomy level" section says what the level moves. At `guided`, the hook adds nothing. At every level, the model checks the repo's conventions before asking. Beyond what the level itself lets go ahead, neither `standard` nor `autonomous` widens a permission you gave for a named action past the actions and repos it names. Your own instruction files and the repo's win where they disagree with what `standard` or `autonomous` lets go ahead.

At `guided`, [the drawer](../drawer/#autonomy-suggestion) suggests `standard` once your answers show you usually take the model's recommendation.

## Richness level

The richness level caps which sketches a reply may carry when its content has a shape.
Open `/config`, search for `richness`, and pick a value on the Richness level row. The setting's key is `katharsis.richness`.

| Level | What changes |
|---|---|
| `text` (default) | Nothing: the style carries no sketch rules, and the prompt hook adds nothing to the turn's context for this option. |
| `sketch` | A reply whose point is a shape that a numbered list or a table cannot show can carry an inline text sketch of at most 12 lines in all: a call tree that branches, a directory tree with depth, pseudocode with conditions or loops, or a `diff` sketch of an existing structure. A sketch is plain text that reads without a renderer, and its lines sit outside the type's word ceiling. A sketch your message asks for is drawn even when a list or a table could carry the shape. |
| `rich` | Everything `sketch` allows, and a shape too dense for 12 lines is rendered as a diagram instead of cut: `scripts/katharsis-artifact.sh` draws it with D2 (with the TALA layout when D2 lists it) or the Mermaid CLI, writes an HTML page under `~/.claude/katharsis-data/pages/`, and opens it. The reply carries the diagram's takeaway and the page's path. With neither renderer installed, or when a render fails, the reply draws the inline sketch. It also allows [Claude Motion](#claude-motion) animations when the session offers Motion and the Claude Motion option is on. Pages that ask a question, and video, are not built yet. |

At `sketch` and `rich`, the content decides whether a sketch appears: a reply whose point has no shape carries none, a shape that a numbered list or a table carries gets that list or table, the answer line stays prose, and a sketch never repeats a fact the prose states.
At `sketch` or `rich`, the prompt hook (`hooks/register.ts`) adds one line to each turn's context naming the level.
It also attaches the sketch rules in `styles/richness/sketches.md` on the first turn at either level, again after a compaction, whose summary drops them, and again when the level returns from `text`.
At `text`, the hook adds nothing for this option, and neither output style carries sketch rules at any level.

## Claude Motion

At the `rich` richness level, when the session offers a Motion artifact type, a reply can animate a change over time with Claude Motion: one that prose, a numbered list, a table, or a sketch cannot show, such as a TUI flow, or an animation you ask for.
Each animation publishes a private artifact and counts against your plan usage.
The option is on by default: open `/config`, search for `motion`, and turn off the Claude Motion row to keep Motion out of Katharsis replies. The setting's key is `katharsis.motion`.
With the option off, the prompt hook (`hooks/register.ts`) adds one line to each turn's context, at every richness level, saying no reply uses Motion, even one you ask for, and that a reply declining an animation says the option is off.
With the option on, the hook adds nothing, and with no Motion type offered, `rich` behaves as it does without the option.

## Mistakes the plugin shows you

The fourth Stop hook compares what the reply says with what the tools showed, and never holds the reply for it:

- Tests, a build, plugin validation, a linter, or CI said to pass when the last run failed, ran before a later code edit, or never ran. A command counts as a run only where it is the command, so `rg pytest` is not a test run. When no command the hook knows ran but some command's output reads like a check's result, the hook says nothing. A failed command with several steps counts against a check only when the check's output shows a failure or the check is the last step. When two different commands for the same check ended differently, only a claim about all of them, such as "the tests pass", is judged.
- A ticked checklist line in a PR body or commit, which counts as the same claim unless the line shows the check failing. A line in the file `--body-file` or `git commit -F` names is read only when that file has not changed since the call returned, and `--replay` reads no such file.
- A change the reply itself says it verified with nothing run after the last edit.
- A count whose only source is `grep -I`, `grep -c`, or `rg` without `-uu`, which skip files or count lines instead of matches. An exact count that printed the same number clears it, and a line count is not flagged when you asked for lines.
- A count of one literal word that `grep -r` or `rg` took under a folder and piped to `wc -l`, which the hook first recounts in every file under that folder, binary and hidden ones included. When its number differs and the files grep or rg skipped hold the whole difference, the notice names those files. When its number matches the reply's, skipped files are not reported. Otherwise, and at a symlink or special file, or past 5,000 files, 32 MiB, or 3 seconds, you get only the line above. `--replay` never recounts.

A PreToolUse and PostToolUse hook on Bash watches calls that replace a file no earlier call in the session named, and runs without the hooks module.
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
| A Bash call replaced a file the session never read, the first reply after it doesn't say so, and the file hasn't been restored | One line naming the loss and the saved copy |

Each hook exits 0 when it can't do its job, so a failing hook costs a ledger row, not a turn.
