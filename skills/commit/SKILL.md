---
name: commit
description: Write a commit message for the staged change. Follows the subject convention the repo's history or instruction files set, and otherwise writes an imperative subject under 72 characters with a body that says only what the diff cannot show. Writes the message only, unless the user asks to commit.
disable-model-invocation: true
argument-hint: "[what the change is for, or what else to do, such as commit it]"
---

# Katharsis commit message

You write the commit message for the change staged in the current repo. The reader runs
`git log` months from now with the diff beside the message and without this session, so the
message spends its words on what the diff cannot show.

What the user typed after the command, empty when they typed nothing:

```
$ARGUMENTS
```

It may say why the change was made, or ask for something more, such as committing it. Do only
what it asks. When it asks for nothing beyond the message, write the message and stop: commit
nothing.

## 1. Gather the change

The message covers the staged change only. Read it:

```
git diff --cached --no-relative --stat
git diff --cached --no-relative
git write-tree
```

`--no-relative` keeps a `diff.relative` setting from hiding staged files outside the current
folder, which `git commit` still commits. Pass it to every `git diff` here.

`git write-tree` prints the hash of the index's tree. Keep it: step 6 compares it before any
commit. When it fails, such as when the index has unmerged paths, write no message: show its
error, say the conflict must be resolved first, and stop.

When `git diff --cached --no-relative --quiet` exits 0, nothing is staged. Write no message: show
the user `git status --short`, say that nothing is staged and that the skill stages nothing, and
stop. Never stage files to have something to describe.

When `git status --porcelain` also shows unstaged or untracked changes, leave them out of the
message and tell the user they are not in it.

Find why the change was made. The diff shows what changed; the reason comes from what the user
typed after the command, this session's conversation, or an issue that a `#123` or ticket key in
the branch name or in what the user typed points to, read with `gh issue view` when `gh` can reach
it.
When none of those gives a reason, write none: a motive you inferred from the diff is a guess.

## 2. Find the convention

Resolve the comparison ref for the history, the default branch, from the first of these that gives
one:

1. `git symbolic-ref --short refs/remotes/origin/HEAD`, such as `origin/main`.
2. The remote's default branch from `git ls-remote --symref origin HEAD`, whose
   `ref: refs/heads/main` line names `main`, read as `origin/main` when that ref exists.
3. `origin/main` or `origin/master`, whichever exists.
4. The local `main` or `master`, whichever exists.
5. `HEAD`, the checked-out branch's own history.

A command that fails, such as exiting 128 with `fatal:` in a repo with no remote, or prints
nothing, gives no ref. Check that a ref exists with `git rev-parse --verify --quiet <ref>`. When
the repo has no commits yet, the history covers nothing.

Read `${CLAUDE_SKILL_DIR}/../pr/conventions.md` and run its lookup for one destination: the
commit message. Look up its subject and its body on their own, the way `/katharsis:pr` looks up
the title and the body, and stop at the first source that covers each. A source can cover one part
and say nothing about the other, such as a `CONTRIBUTING.md` that says "explain why in the body"
or "sign off every commit" and names no subject format; then that part follows the source, and the
lookup goes on to the later sources for the other part. A part no source covers follows the
default. A history whose commits all have empty bodies does not cover the body, since an empty
body is an absence rather than a rule.

## 3. Write the subject

When a source covers the subject, match it. A history whose subjects mostly start with a
`type(scope):` prefix, a ticket key, or an `[area]` tag gets the same form, with the type and
scope chosen from the ones the history already uses for this kind of change and this part of the
repo. A rule that names its own form, length, or mood wins over the history.

When the convention uses a ticket key, the key comes only from what the user typed, the branch name, or the issue step 1 read.
When none of those names one, leave the key out and say so in the reply. Never copy a key from
another commit.

Where the convention says nothing, the subject is in the imperative mood, under 72 characters
including any prefix, with no trailing period, and names the effect rather than the edit: "Stop
the parser dropping the last line", not "Update parser.py".

## 4. Write the body

When a source covers the body, follow it, and follow the default for whatever the source does not
say, such as a rule that asks only for a sign-off. The default body says only what the diff cannot
show: what users or callers hit before the change, as the reason sources in step 1 tell it, such as the failure or its cost, rather than
the old code, which `git show` already shows; why that was wrong; and why this fix rather than the
obvious alternative. Test every sentence: if the reader could recover it by running `git show`,
cut it. Never list the changed files, count lines, or narrate the order of the edits.

When every sentence fails that test, the commit has no body: the message is the subject alone.

A body is separated from the subject by one blank line, is written in complete sentences, and
wraps at 72 characters.

Add a trailer only when the convention requires one, such as a ticket key or `Signed-off-by:`.
A `Signed-off-by:` trailer takes its name and email from `git config user.name` and
`git config user.email`. Never add a `Co-Authored-By:` trailer.

## 5. Check before showing

- **No reference codes.** The message holds no code this chat defined, such as `F3`, `AT2`,
  `NA2`, or `Q1`. Write what the item says in its place. The reader of `git log` never saw this
  chat.
- **Every claim traces to the change.** Each behavior the message names is in the staged diff,
  and each reason comes from the sources step 1 names.

## 6. Hand it over

Write the message to a file from `mktemp`, never in the work tree, so it never lands in a later
`git add`. Show the message in the reply in one fenced `text` block, then the file's path and
one line of your own naming the source each part followed, such as "Subject follows the
history's `fix(scope):` prefix; body follows the default", or saying that none covered it and you
used the default.

Commit only when what the user typed asks for it, such as `/katharsis:commit and commit it`.
First run `git write-tree` again; when its hash differs from the one step 1 recorded, the staged
change moved under the message, so commit nothing and say so. Otherwise commit what is staged
with the file:

```
git commit -F <message file>
```

Stage nothing: never `git add`, and never `git add -A` or `git add .`. Never pass `--amend`,
`--no-verify`, or `--allow-empty`, and never push. When the commit fails, such as when a
pre-commit hook rejects it, show the hook's output and the message file's path, and stop. When it
succeeds, remove the message file and report `git log -1 --format='%h %s'`; the reply then says the file was removed and gives no path.
