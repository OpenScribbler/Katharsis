---
name: rules-check
description: Find the rules in a project's CLAUDE.md, AGENTS.md, and other instruction files that repeat or contradict the Katharsis style, and suggest an edit or a cut for each. Changes no file without the user's yes. Use when the user asks to check their instruction files against Katharsis, when setup offers it, or when replies seem pulled between Katharsis and a project rule.
---

# Katharsis rules check

The model receives the user's instruction files and the Katharsis style on every turn. A rule
that repeats the style spends context for nothing, and a rule that contradicts it leaves the
model to choose between them. This skill finds both and proposes an edit for each. It reads
freely and writes only what the user approves.

## 1. List the instruction files

```
~/.claude/katharsis/scripts/instruction-files.sh
```

The script prints one line per file Claude Code loads for the current folder, as
`<kind><TAB><path>`: the managed policy, the user's `~/.claude/CLAUDE.md` and rules, every
`CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` from the root down to this folder, the
project's `.claude/rules/`, `AGENTS.md` where Claude Code reads it, `CLAUDE.md` files in
subfolders, and every file those pull in with `@`. Read each file it lists. When it prints
nothing, say that no instruction files load here and stop.

## 2. Read the style the model receives

Read `~/.claude/katharsis/output-styles/katharsis.md` and `~/.claude/katharsis/styles/README.md`,
the installed copies, since those are the text the model gets. Open a guidance file under
`~/.claude/katharsis/styles/` only when a rule names that exchange type's situation, such as a
rule about answering questions or reporting status.

## 3. Sort every rule

Take each rule in each file and put it in one group:

- **Duplicate.** It says what the style already says: answer first, stop and ask only for a
  call that is expensive to undo, no headers on a short reply, a length limit the ceiling
  already sets. Suggest cutting it, and name the style's line that already covers it.
- **Conflict.** It asks for something the style forbids or shapes differently: end every reply
  with a summary, always list next steps, ask before any edit, never use headings. Say what each
  rule produces in a reply, and suggest which to keep and the edit that removes the conflict.
- **Unrelated.** Rules about code, tools, the repo, commands, or the domain. Leave them alone
  and report only their count per file.

A rule that only partly overlaps is a conflict when following both would change the reply, and
a duplicate otherwise. Quote each rule exactly as the file has it.

## 4. Report

Group the report by file, in the script's order, and within a file list the duplicates, then
the conflicts. Each item carries the quoted rule, the style's line it meets, and the suggested
edit as the exact text to remove or the replacement text. End with the count of unrelated rules
per file. A file with no duplicates and no conflicts gets one line saying so.

## 5. Apply only what the user approves

Change no file in this skill without the user's yes for that edit. Ask per file, and list the
edits for that file in the question so the yes covers exactly those. A file from the `user` or
`managed` kind, or any file outside the current project, reaches every project on the machine:
ask for it separately, and say that in the question. A `managed` file is usually not writable by
the user; report it and suggest they raise the conflict with whoever manages it.

After an approved edit, re-read the file and confirm the text changed as proposed.
