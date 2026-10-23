---
title: Git skills
description: The skill you type to draft a pull request body that follows your repo's convention.
---

`/katharsis:pr` drafts a title and body for the pull request on the current branch.
Only you can run it, by typing it; the model never runs it on its own.

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
Asking it to open the PR also lets it run `git push -u origin HEAD` when the current branch has no upstream.
Nothing it writes holds a reference code, since a reviewer never saw your session.

## Letting the model run it

The skill's frontmatter sets `disable-model-invocation: true`, so the model can't run it.
Claude Code has no plugin option or setting that turns that back on.
The `skillOverrides` setting can hide a skill, but it can't lift a lock the skill's author set.

To let the model run the skill, copy it and remove the lock from your copy:

1. Copy `skills/pr/` from the installed plugin into `~/.claude/skills/pr/`, keeping both files.
2. Delete the `disable-model-invocation` line from the copy's `SKILL.md`.
3. Run the copy as `/pr`.

The copy doesn't change when Katharsis updates.
