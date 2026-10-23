---
name: pr
description: Draft a pull request title and body for the current branch. Follows the repo's own PR convention when it has one, and otherwise writes a visual Summary, before-and-after Evidence, and Merge Danger. Drafts only, unless the user asks to push or open the PR.
disable-model-invocation: true
argument-hint: "[base branch, issue, or what else to do, such as open the PR]"
---

# Katharsis PR body

You write the title and body of a pull request for the branch checked out in the current folder.
The reviewer reads it without this session's context, so everything it says comes from the
branch, the repo, and checks that ran.

What the user typed after the command, empty when they typed nothing:

```
$ARGUMENTS
```

It may name a base branch, an issue, or something more to do, such as pushing the branch or
opening the PR. Do only what it asks. When it asks for nothing beyond the body, draft and stop:
push nothing and open nothing.

## 1. Gather the change

Find the base branch and keep it in two forms. The bare name, such as `main`, is what
`gh pr create --base` takes: the branch the user named with any `origin/` prefix stripped, else
the remote's default from `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, else
`git symbolic-ref --short refs/remotes/origin/HEAD` with its `origin/` stripped, else `main` or
`master`, whichever exists. The remote-tracking form, `origin/<name>`, is what `git log` and
`git diff` compare against, so a stale local copy of the base doesn't add commits already merged.
Then read the change:

```
git log --format='%h %s%n%b' origin/<name>..HEAD
git diff --stat origin/<name>...HEAD
git diff origin/<name>...HEAD
```

The PR carries commits only. When `git status --porcelain` shows uncommitted changes, leave them
out of the body and tell the user they are not in it.

Find the issue the change answers: one the user named, a `#123` or ticket key in the commits or
the branch name. Read it with `gh issue view` when `gh` can reach it, for the problem in its own
words.

Find the evidence: checks that ran in this session after the last change, with their commands and
result lines. When none ran, run the checks the repo documents for a PR, such as its CI commands
or the commands in its template's checklist. A check you could not run is reported as not run,
never as passing.

Never check out, stash, reset, or switch branches to produce evidence, since that can move or lose
the user's work. The "before" result comes from checks that ran earlier in this session, the
issue's description of the failure, the commits, or CI results on the base (`gh run list`,
`gh pr checks`). When none of those has one, say the "before" wasn't measured.

When `git status --porcelain` shows uncommitted changes, any check run now tests that uncommitted
code, not the committed branch. Either say so beside each such result in the Evidence section, or
report those checks as not run for the committed branch.

## 2. Find the convention

Read `${CLAUDE_SKILL_DIR}/conventions.md` and run its lookup for two destinations: the PR body
and the PR title. Stop at the first source that covers each.

## 3. Write the body

When a source covers the body, follow it as `conventions.md` says, and fill each section from
what you gathered.

When nothing covers it, write these three sections in this order:

```
## Summary
## Evidence
## Merge Danger
```

- **Summary.** Open with the smallest sketch that makes the change clear, in a code block of at
  most 12 lines: a `diff` sketch of the structure that changed, a file tree with each file's job, a
  call flow, or an output before and after. Pick the one that matches the change's shape. Follow
  it with one or two sentences: the problem, then what the change does about it. Link the issue,
  such as `Closes #123`.
- **Evidence.** Before and after: what failed, was missing, or printed wrong before the change,
  and what the same check shows now. Give each command and its result line. Take the "before"
  only from the sources step 1 names, and say when it wasn't measured. Say plainly which checks
  did not run, and which results came from uncommitted code.
- **Merge Danger.** Say whether merging is a two-way door, which a revert undoes, or a one-way
  door, such as a data migration, a published release, a changed public API, or deleted data.
  Then the blast radius: who and what the change reaches once merged, such as every installer on
  the next update or one internal script.

Every section has content from this change. A section with nothing to say says so in one line
rather than filling space.

## 4. Write the title

Follow the convention the lookup found for titles. With none, write the title in the imperative,
under 72 characters, naming the effect on the user rather than the edit.

## 5. Check before showing

- **No reference codes.** The body and title hold no code this chat defined, such as `F3`, `AT2`,
  `NA2`, or `Q1`. Write what the item says in its place. Reviewers never saw this chat, so a code
  means nothing to them.
- **Every claim traces to the branch.** Each file, behavior, and number in the body is in the diff,
  the commits, the issue, or a check's output.
- **Ticks match runs.** A ticked checklist box names a check that ran and passed after the last
  change.

## 6. Hand it over

Show the title and the body in the reply, the body in one fenced `markdown` block so the user can
copy it, and the one line from `conventions.md` naming the source you followed. Make that fence
one backtick longer than the longest fence inside the body, so the body's own code blocks stay
intact.

When the user asked to open the PR, write the body to a file and run
`gh pr create --base <name> --title "<title>" --body-file <file>`, with the bare base name. A
request to open the PR also allows one push: when the current branch has no upstream
(`git rev-parse --abbrev-ref @{upstream}` fails), run `git push -u origin HEAD` first, since
`gh pr create` can't push without a terminal. Push nothing else, and push only when the user asked
to open the PR or to push. When the branch already has a PR (`gh pr view`), update its body with
`gh pr edit --body-file <file>` only when they asked to update it. Report the PR's URL.
