# Finding a repo's git-writing convention

The Katharsis git skills write text the repo's people read: a PR body, a commit message, a review
reply. Each one follows the convention the repo already has before it falls back on its own
default. This file is the lookup every one of them runs.

## What you are looking for

A destination is one kind of text: a PR title, a PR body, a commit message, or a review comment.
Look each one up on its own, since a source can cover one and say nothing about another. A PR
template shapes the body and not the title.

A source covers a destination when it states a shape or rules for that text: sections, headings,
a subject format, a required prefix or ticket key, a length. A source that only mentions the
destination, such as "open a PR when you're done", covers nothing.

## The order

Check the sources in this order and stop at the first one that covers the destination. Read every
file in a step before you decide the step covers nothing.

1. **A PR template.** `pull_request_template.md` or `pull_request_template.txt` in `.github/`,
   at the repo root, or in `docs/`, in any letter case, and any file in a
   `PULL_REQUEST_TEMPLATE/` folder in those same places. A template covers PR bodies only. With
   several templates in the folder, use the one whose name fits the change and say which you
   picked.
2. **A repo-local git skill.** A `SKILL.md` under `.claude/skills/` whose name or description is
   about git, commits, PRs, or reviews. Read it and every file it points to. It covers each
   destination it has a workflow or rules for.
3. **The repo's instruction files.** `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md`, and
   `CONTRIBUTING.md` (also under `.github/` or `docs/`), with every file they import with `@`.
   When one of them points at a template or a skill, that source is the convention.
4. **The recent history.** For PR titles and bodies, the last 10 merged PRs:
   `gh pr list --state merged --limit 10 --json title,body`. For commit messages, the last 20
   subjects and bodies on the default branch: `git log -20 --format='%s%n%b'`. History covers a
   destination only when one pattern repeats across most of them, such as the same headings, a
   `feat(scope):` prefix, or a ticket key. When `gh` cannot reach the remote, history covers
   commits only.

When nothing covers the destination, use the skill's default.

## Following what you found

- For a PR template, use its sections in its order, with its headings word for word. Leave out no
  section it has, and add none it lacks.
- For a git skill, an instruction file, or the history, follow the body format that source
  prescribes, such as the sections a rule requires or the headings the merged PRs repeat. The
  source's own headings, such as an `AGENTS.md`'s `## Development`, are not PR sections.
- A template's HTML comments are instructions to the writer. Write what each one asks for in its
  place, and drop the comment.
- Keep a template's checklist. Tick a box only for a check that ran and passed after the last
  change to the branch, and leave every other box unticked.
- What the user typed with the skill wins over every source here.

Tell the user in one line which source you followed, such as "Followed
`.github/PULL_REQUEST_TEMPLATE.md`", or that none covered it and you used the default.
