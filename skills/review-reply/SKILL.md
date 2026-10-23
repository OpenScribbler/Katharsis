---
name: review-reply
description: Write a pull request review comment, or a reply to one, from the point the user makes. Follows the repo's own review convention when it has one, and otherwise opens with the change asked for, gives the file and line beside the claim, and marks a non-blocking comment last. Drafts only, unless the user asks to post it.
disable-model-invocation: true
argument-hint: "[PR number or URL] [file:line, or a comment URL to reply to] <your point> [and post it]"
---

# Katharsis review comment

You write one comment on a pull request: a review comment on a line, a reply to a review comment,
or a comment on the PR's conversation. Its reader is the PR's author or the reviewer you answer,
who reads it beside the diff and without this session, so everything it says comes from the user's
point and the code.

What the user typed after the command, empty when they typed nothing:

```
$ARGUMENTS
```

It holds the point to make and where to make it. Do only what it asks. When it does not ask to
post, draft the comment and stop: post nothing. When it holds no point, ask for one and stop.

## 1. Read the request

Take three things from what the user typed:

- **The PR.** A number such as `12` or `#12`, or a URL such as
  `https://github.com/<owner>/<repo>/pull/12`, whose owner and repo you use in every `gh api` path
  below in place of `{owner}/{repo}`. With none, run `gh pr view --json number -q .number` for the
  current branch. When that fails, the branch has no PR that `gh` can reach, and you draft from the
  local branch.
- **The target.**
  - `path:line` or `path:start-end` is a line or a range in the PR's diff: an inline comment.
  - A URL ending `#discussion_r<id>`, or a review comment's id, is a review comment: a reply in its
    thread.
  - A URL ending `#issuecomment-<id>` or `#pullrequestreview-<id>` is a comment on the PR's
    conversation or a review's summary. GitHub has no threaded reply to either, so the answer is a
    new comment on the conversation.
  - With no target, the comment goes on the PR's conversation.
- **The point**: the change the user asks for or the answer they give, and whether they call it
  non-blocking, such as "nit", "optional", or "non-blocking". Only the user makes a comment
  non-blocking.

## 2. Read the code

Read the lines the comment is about before you write a word about them.

With a PR, run `gh pr view <PR> --json headRefOid,baseRefName,url` and keep the head SHA, then
`gh pr diff <PR>`. Read the file at the head: `git show <head SHA>:<path>` when
`git cat-file -e <head SHA>` succeeds, else
`gh api "repos/{owner}/{repo}/contents/<path>?ref=<head SHA>" -H 'Accept: application/vnd.github.raw+json'`.

With no PR, read the local branch: `git diff <base>...HEAD` and the file at `HEAD`, where the base
is the branch the user named, else the remote's default, else `main` when it exists, else
`master`. The remote's default is what `git symbolic-ref --short refs/remotes/origin/HEAD` prints,
such as `origin/main`; when that command fails or prints nothing, there is none.

For an inline comment, find the target in the diff. A line the change added or kept is on the
`RIGHT` side, numbered as in the new file; a line it deleted is on the `LEFT` side, numbered as in
the base. A target outside every hunk can't take an inline comment: say so, and post nothing.

For a reply, read the comment and its thread:

```
gh api "repos/{owner}/{repo}/pulls/comments/<id>"
```

GitHub takes replies only on a thread's first comment, so when the comment has an
`in_reply_to_id`, that id is the thread's first comment. Read the thread with
`gh api --paginate "repos/{owner}/{repo}/pulls/<PR>/comments"`, keeping the first comment and
every comment whose `in_reply_to_id` is its id, and read the lines its `path` and `line` name.

When the first comment's `line` is null, the thread is outdated: a later commit changed the lines
it was on. Read the lines it was written against instead, `original_start_line` (when set) through
`original_line` of `path` at `original_commit_id`, with `git show <original_commit_id>:<path>` when
`git cat-file -e <original_commit_id>` succeeds, else the `contents` call above with
`ref=<original_commit_id>`. Then read what those lines hold now, in the head diff or at the commit
the user names. An outdated thread still takes a reply on the same `/replies` endpoint in step 6.

For a conversation comment or a review's summary, read it with
`gh api "repos/{owner}/{repo}/issues/comments/<id>"` or
`gh api "repos/{owner}/{repo}/pulls/<PR>/reviews/<id>"`.

When the code doesn't say what the user's point says it does, such as a line that already handles
the case they name, tell the user what the line holds, and draft nothing until they answer.

## 3. Find the convention

Read `${CLAUDE_SKILL_DIR}/../pr/conventions.md` and run its lookup for one destination: the review
comment. A PR template shapes PR bodies only, and the history step reads PRs and commits only, so
for a review comment the sources that can cover it are a git or review skill under
`.claude/skills/` and the repo's instruction files. Such a source covers review comments when it
states how a comment is written, such as a tag that opens it, a required section, or a length.

When a source covers it, follow it as `conventions.md` says. Each rule it states replaces the
matching default in step 4, and the defaults it says nothing about still hold.

## 4. Write the comment

These are the defaults. A rule the convention from step 3 states replaces the matching default, and
the defaults it says nothing about still hold:

- **Open with the change.** The first words are the change you ask for, or for a reply, your answer
  to the comment, such as what changed and in which commit. The reason follows it.
- **Write the right thing.** State the correction as what the code should do, such as "Return
  `0.0` for an empty list", rather than as what the code wrongly does.
- **Give the file and line beside the claim.** An inline comment's own line needs no naming. Any
  other line the comment points to gets its `path:line` beside the claim, and so does every claim
  in a reply or a conversation comment.
- **Cut what the reader doesn't act on**: praise, how the problem was found, and closing offers
  such as "happy to discuss".
- **One change, one or two sentences.** A comment asking for one change is one or two sentences
  long. A comment asking for more gives each change its own sentence or list item.
- **Say non-blocking last.** When the user called it non-blocking, the comment says so in its last
  words, such as "Non-blocking." Otherwise it says nothing about blocking. A convention that tags
  each comment's severity, such as `[must]` or `[nit]`, replaces this default: use its
  non-blocking tag only when the user called the comment non-blocking, and its blocking tag
  otherwise.

## 5. Check before showing

- **No reference codes.** The comment holds no code this chat defined, such as `F3`, `AT2`, `NA2`,
  or `Q1`. Write what the item says in its place. The reader never saw this chat.
- **Every claim traces to the code.** Each line, name, and behavior the comment states is in the
  diff, the file, or the thread you read.
- **The shape holds**, for each of these unless the convention says otherwise: the first sentence
  is the change or the answer, a comment asking for one change runs one or two sentences, and
  nothing follows the non-blocking note. A convention rule such as "explain the impact first, then
  request the change", or a `[nit]` tag that opens the comment, wins over the matching check.

## 6. Hand it over

Show where the comment goes in one line, such as "Inline on `src/stats.py:5` (`RIGHT`) in #12",
"Reply in the thread on `src/stats.py:5` in #12", "Reply in the outdated thread on
`src/stats.py:5` in #12", or "Conversation comment on #12". With no PR, name the branches and say
it is not posted, such as "Inline on `src/stats.py:6`, drafted from the local branch `fix-mean`
against `main`; not posted". Name the side, `RIGHT` or `LEFT`, only when there is a PR to post to.
Then show the comment in one fenced `markdown` block, one backtick longer than the longest fence
inside it, and the one line from `conventions.md` naming the source you followed.

Post only when the same command asks, such as `... and post it`. Posting needs a PR: with none, say
so and post nothing. Write the comment to a file from `mktemp`, never in the work tree, then post
with the command for its target:

- **Inline on one line**, with the head SHA from step 2:

  ```
  gh api "repos/{owner}/{repo}/pulls/<PR>/comments" -F body=@<comment file> -f commit_id=<head SHA> -f path=<path> -F line=<line> -f side=<RIGHT or LEFT>
  ```

  For a range, add `-F start_line=<start> -f start_side=<RIGHT or LEFT>`, with `line` set to the
  range's last line.
- **A reply in a review thread**, to the thread's first comment:

  ```
  gh api "repos/{owner}/{repo}/pulls/<PR>/comments/<first comment id>/replies" -F body=@<comment file>
  ```

- **A conversation comment**, including an answer to a conversation comment or a review's summary:

  ```
  gh pr comment <PR> --body-file <comment file>
  ```

  When it answers a comment, tell the user it lands as a new comment, not in a thread.

Add `-q .html_url` to a `gh api` post, and report the URL it prints, or the one `gh pr comment`
prints. When GitHub refuses the post, report its message and post nothing else.
