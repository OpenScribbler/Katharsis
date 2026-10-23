---
title: Git skills
description: The skills you type to draft a pull request body or a commit message that follows your repo's convention.
---

`/katharsis:pr` drafts a title and body for the pull request on the current branch.
Only you can run it, by typing it; the model never runs it on its own.
`/katharsis:commit` writes a commit message for the staged change, and [the commit skill](#the-commit-skill) section
covers it.

## What it reads

The skill reads the branch's commits and its diff against the base branch.
The base is the branch you name after the command, or else the remote's default branch, or else `main` or `master`.
It also reads the issue a commit or the branch name points to, when `gh` can reach it.
For evidence, it uses the checks that ran in the session after the last change, and runs the repo's documented checks
when none did.
A check it couldn't run is reported as not run.
It never checks out, stashes, resets, or switches branches to get a "before" result.
The "before" comes from earlier checks in the session, the issue's description of the failure, the commits, or CI
results on the base, and the skill says when none was measured.
When your tree has uncommitted changes, it says which results tested that uncommitted code.

## How it finds the convention

The skill looks for the repo's own PR convention and stops at the first source that covers the body:

1. A PR template: `pull_request_template.md` or `pull_request_template.txt` in `.github/`, the repo root, or `docs/`,
   in any letter case, or a file in a `PULL_REQUEST_TEMPLATE/` folder in one of those places.
2. A git or PR skill under the repo's `.claude/skills/`.
3. The repo's `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md`.
4. The last 10 merged PRs, when they share one shape.

A template's sections are used in its order, with its headings word for word.
A skill, an instruction file, or the history gives the body format it prescribes, and its own headings don't become PR
sections.
A template's checklist stays, and a box is ticked only for a check that ran and passed.
The title gets its own lookup, since a template shapes only the body.
The skill tells you which source it followed.
The lookup lives in `skills/pr/conventions.md`.

## The default body

With no convention, the body has three sections:

- **Summary** opens with the smallest sketch that makes the change clear, such as a `diff` sketch, a file tree, or a
  call flow, in at most 12 lines, then the problem and the fix in a sentence or two.
- **Evidence** shows the checks before and after the change, with each command and its result.
- **Merge Danger** says whether merging is a two-way door that a revert undoes or a one-way door, such as a data
  migration or a published release, and how far the change reaches.

## What it does with the draft

The skill shows the title and body and stops.
It pushes the branch or opens the PR only when you ask in the same command, such as `/katharsis:pr open the PR`.
Asking it to open the PR also lets it push the current branch: `git push -u` when the branch has no upstream, or
`git push` when it has commits its upstream lacks.
It never force-pushes.
When the branch already has a PR, the skill reports its URL and edits the body only when you ask it to update the PR.
The skill is told to leave your session's reference codes out of what it writes, since a reviewer never saw the
session.

## Letting the model run it

The skill's frontmatter sets `disable-model-invocation: true`, so the model can't run it.
Claude Code has no plugin option or setting that turns that back on.
The `skillOverrides` setting can hide a skill, but it can't lift a lock the skill's author set.

To let the model run the skill, copy it and remove the lock from your copy:

1. Copy `skills/pr/` from the installed plugin into `~/.claude/skills/pr/`, keeping both files.
2. Delete the `disable-model-invocation` line from the copy's `SKILL.md`.
3. Run the copy as `/pr`.

The copy doesn't change when Katharsis updates.

## The commit skill

`/katharsis:commit` writes a commit message for the staged change.
Only you can run it, by typing it; the model never runs it on its own.

### What it reads

The message covers only what is staged.
When nothing is staged, the skill says so, shows `git status --short`, and stops, since it never stages files itself.
When you also have unstaged or untracked changes, it tells you they aren't in the message.
The reason for the change comes from what you typed after the command, the session, or an issue that the branch name
or the change names.
With none of those, the message gives no reason rather than guessing one from the diff.

### How it finds the convention

The skill runs the same lookup as `/katharsis:pr`, from `skills/pr/conventions.md`, for the commit message:
a git or commit skill under `.claude/skills/`, then the repo's instruction files, then the last 20 non-merge commits
on the default branch.
A PR template covers a commit message only when an instruction file points the commit at it.
The subject and the body are looked up on their own: when the first source covers only one of them, such as a
`CONTRIBUTING.md` that asks for a sign-off, the lookup goes on to the later sources for the other.
Recent commits whose bodies are all empty don't set a no-body rule, so the body follows the default.
When most recent subjects share a `type(scope):` prefix, a ticket key, or an `[area]` tag, the subject takes the same
form, with a type and scope the history already uses.
The skill tells you which source each part followed.

### The default message

With no convention, the subject is in the imperative mood, under 72 characters, with no trailing period, and names
the effect rather than the edit.
The body says only what the diff can't show: what users or callers hit before the change rather than the old code,
why that was wrong, and why this fix over the obvious alternative.
A sentence the reader could recover with `git show` is cut, and when no sentence is left, the message is the subject
alone.
The body wraps at 72 characters.
The message carries no reference codes from your session and no `Co-Authored-By` trailer.

### What it does with the message

The skill writes the message to a temporary file outside the work tree, shows it, and stops.
It commits only when you ask in the same command, such as `/katharsis:commit and commit it`, and then runs
`git commit -F` with that file.
Before committing, it compares the index's tree hash from `git write-tree` with the hash it recorded when it read the
staged change, and commits nothing if they differ.
It never stages, amends, skips hooks with `--no-verify`, or pushes.
When a hook rejects the commit, the skill shows the hook's output and the message file's path.

### Letting the model run it

The commit skill carries the same lock as the PR skill.
To lift it, copy both `skills/commit/` and `skills/pr/` from the installed plugin into `~/.claude/skills/`, since the
commit skill reads `pr/conventions.md`, delete the `disable-model-invocation` line from the commit copy's `SKILL.md`,
and run it as `/commit`.
