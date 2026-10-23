---
title: Git skills
description: The skills you type to draft a pull request body, a commit message, or a review comment that follows your repo's convention.
---

`/katharsis:pr` drafts a title and body for the pull request on the current branch.
Only you can run it, by typing it; the model never runs it on its own.
`/katharsis:commit` writes a commit message for the staged change, and [the commit skill](#the-commit-skill) section
covers it.
`/katharsis:review-reply` writes a pull request review comment or a reply to one, and
[the review-reply skill](#the-review-reply-skill) section covers it.

## The PR skill

### What it reads

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

### How it finds the convention

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

### The default body

With no convention, the body has three sections:

- **Summary** opens with the smallest sketch that makes the change clear, such as a `diff` sketch, a file tree, or a
  call flow, in at most 12 lines, then the problem and the fix in a sentence or two.
- **Evidence** shows the checks before and after the change, with each command and its result.
- **Merge Danger** says whether merging is a two-way door that a revert undoes or a one-way door, such as a data
  migration or a published release, and how far the change reaches.

### What it does with the draft

The skill shows the title and body and stops.
It pushes the branch or opens the PR only when you ask in the same command, such as `/katharsis:pr open the PR`.
Asking it to open the PR also lets it push the current branch: `git push -u` when the branch has no upstream, or
`git push` when it has commits its upstream lacks.
It never force-pushes.
When the branch already has a PR, the skill reports its URL and edits the body only when you ask it to update the PR.
The skill is told to leave your session's reference codes out of what it writes, since a reviewer never saw the
session.

### Letting the model run it

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
or what you typed names.
With none of those, the message gives no reason rather than guessing one from the diff.

### How it finds the convention

The skill runs the same lookup as `/katharsis:pr`, from `skills/pr/conventions.md`, for the commit message:
a git or commit skill under `.claude/skills/`, then the repo's instruction files, then the last 20 non-merge commits
on the default branch, or on the checked-out branch when no default branch resolves.
A PR template covers a commit message only when an instruction file points the commit at it.
The subject and the body are looked up on their own: when the first source covers only one of them, such as a
`CONTRIBUTING.md` that asks for a sign-off, the lookup goes on to the later sources for the other.
Recent commits whose bodies are all empty don't set a no-body rule, so the body follows the default.
When most recent subjects share a `type(scope):` prefix, a ticket key, or an `[area]` tag, the subject takes the same
form, with a type and scope the history already uses.
A ticket key comes from what you typed, the branch name, or its issue, and never from another commit.
A `(#123)` suffix and `* subject` bullet bodies that a squash merge adds don't count as the convention.
When an instruction file points commits at a PR template, the template gives only the order of the body's paragraphs,
with no headings or checklist.
The skill tells you which source each part followed.

### The default message

With no convention, the subject is in the imperative mood, under 72 characters, with no trailing period, and names
the effect rather than the edit.
The body says only what the diff can't show: what users or callers hit before the change rather than the old code,
why that was wrong, and why this fix over the obvious alternative.
A sentence the reader could recover with `git show` is cut, and when no sentence is left, the message is the subject
alone.
The body wraps at 72 characters.
The skill is told to leave your session's reference codes and a `Co-Authored-By` trailer out of the message.

### What it does with the message

The skill writes the message to a temporary file outside the work tree, shows it, and stops.
It commits only when you ask in the same command, such as `/katharsis:commit and commit it`, and then runs
`git commit -F` with that file, then removes the file.
Before committing, it compares the index's tree hash from `git write-tree` with the hash it recorded when it read the
staged change, and commits nothing if they differ.
It never stages, amends, skips hooks with `--no-verify`, or pushes.
When a hook rejects the commit, the skill shows the hook's output and the message file's path.

### Letting the model run it

The commit skill carries the same lock as the PR skill.
To lift it, copy both `skills/commit/` and `skills/pr/` from the installed plugin into `~/.claude/skills/`, since the
commit skill reads `pr/conventions.md`, delete the `disable-model-invocation` line from the commit copy's `SKILL.md`,
and run it as `/commit`.

## The review-reply skill

`/katharsis:review-reply` writes one pull request review comment, or a reply to one, from the point you make.
Like `/katharsis:pr`, only you can run it.

### What it reads

Type the PR, where the comment goes, and your point, such as `/katharsis:review-reply 12 src/stats.py:5 return 0.0 for an empty list`:

- A `path:line` or `path:start-end` makes an inline comment on that line of the diff.
- A review comment's URL, ending `#discussion_r<id>`, makes a reply in its thread. The skill reads what the commented
  lines held from the diff hunk GitHub stores with the comment, on the side of the diff the comment is on, and reads
  the whole file for a comment on a file. When the thread is outdated, it also reads what those lines hold now and says
  the thread is outdated.
- A conversation comment's or a review summary's URL makes a new comment on the PR's conversation, since GitHub has no
  threaded reply to either.
- With no target, the comment goes on the PR's conversation.

Without a PR, the skill drafts from the current branch's diff against the branch you name, else `origin`'s default
branch, else `main`, else `master`, and says the draft is not posted.
It reads the lines the comment is about before it writes, and when the code doesn't say what your point says, it tells
you what the line holds instead of drafting.

### How it finds the convention

The skill runs the same lookup as `/katharsis:pr` for the review comment.
A PR template shapes only PR bodies, and the history step reads only PRs and commits, so a git or review skill under
`.claude/skills/` or the rules in `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md` can cover it.
A source covers it when it says how a comment is written, such as a tag that opens it or a required section.
Each rule the source states replaces the matching default, and the defaults it says nothing about still hold.
A severity tag such as `[must]` or `[nit]` replaces the non-blocking default: the comment takes the blocking tag unless
you called it non-blocking.
The skill tells you which source it followed.

### The default comment

With no convention, the comment:

- opens with the change you ask for, or for a reply, your answer, then gives the reason
- states the correction as what the code should do
- gives the file and line beside each claim about a line other than the one it sits on
- leaves out praise, how the problem was found, and closing offers
- runs one or two sentences when it asks for one change
- says it is non-blocking, in its last words, only when you called it that

### What it does with the comment

The skill shows where the comment goes and the comment itself, and stops.
It posts only when you ask in the same command, such as `... and post it`, and only to a PR.
It writes the comment to a temporary file outside your work tree and posts it with `gh`:

| Target | Request |
|---|---|
| A line or range in the diff | `POST /repos/{owner}/{repo}/pulls/{number}/comments` on the PR's head commit, with the path, line, and side |
| A review comment | `POST /repos/{owner}/{repo}/pulls/{number}/comments/{id}/replies` to the thread's first comment, since GitHub takes replies only there, outdated or not |
| The PR's conversation | `gh pr comment --body-file` |

It reports the posted comment's URL, or GitHub's message when GitHub refuses the post.
The skill is told to leave your session's reference codes out of the comment.

### Letting the model run it

To let the model run it, copy both `skills/review-reply/` and `skills/pr/` into `~/.claude/skills/`, since the skill
reads `pr/conventions.md`.
Delete the `disable-model-invocation` line from the review-reply copy's `SKILL.md`, and run it as `/review-reply`.
