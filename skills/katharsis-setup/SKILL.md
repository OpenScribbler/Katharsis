---
name: katharsis-setup
description: Install the Katharsis writing rules. Discovers the installer's memory file, house style guide, and repo conventions on disk, asks only what discovery cannot answer, then substitutes the placeholder contract, writes the rule files, and appends one import line. Use when the user asks to install, set up, or configure Katharsis.
---

# katharsis-setup

Katharsis ships four writing-rule files plus a loader, carrying five `{{PLACEHOLDER}}` slots
that `rules/placeholders.yaml` declares. This skill resolves each slot to the installer's own
value and hands the deterministic work to `scripts/setup-rules.sh`. Discovery and questions
happen here; substitution, verification, and the import append happen in the script.

Write nothing until the confirmation gate in step 5.

## 1. Locate the Katharsis root

The root is the directory holding `rules/` and `scripts/`. When this skill runs from an
installed plugin, that is `${CLAUDE_PLUGIN_ROOT}`. When it runs from a checkout, it is two
directories above this file.

## 2. Check the contract

Run `scripts/setup-rules.sh check` from the root. A nonzero exit means the rule files and
`rules/placeholders.yaml` disagree, so stop, show the `CHECK FAILED` lines, and tell the user
the package is broken rather than guessing values.

## 3. Discover before asking

Read `rules/placeholders.yaml`. For each placeholder whose `discoverable` field names paths,
look there before asking anything:

- **MEMORY_FILE**: take the first of `~/AGENTS.md`, `~/CLAUDE.md`, `./AGENTS.md`,
  `./CLAUDE.md` that exists. Note which others exist too, so the user can redirect.
- **HOUSE_STYLE_NOTE**: look for `STYLE.md`, `.vale.ini`, `.textlintrc`, and
  `docs/style-guide*` in the current project. When one exists, read it and draft one or two
  sentences naming the guide, how to load it, and any linter rule with a numeric limit.
- **REPO_CONVENTION_NOTE**: look for `.github/PULL_REQUEST_TEMPLATE.md`,
  `.github/PULL_REQUEST_TEMPLATE/`, and `CONTRIBUTING.md`. When one states a PR body or
  commit format, draft the note naming that live case.

Never ask the user for a value a file on disk already answers. Present discovered values for
confirmation instead of asking cold.

## 4. Ask the rest

Ask in prose, one decision per question, the whole set in one round:

- **READER_NAME** (required, no default): what the assistant should call the user.
- **DESTINATIONS** (required, default `docs`): a prose fragment that lands mid-sentence
  after "your chat answers", such as `the docs site` or `README files and design docs`.
- Confirmation of the discovered MEMORY_FILE and of each drafted note. A user who declines a
  note gets an empty string, which leaves that section stating the general rule with no
  specific case attached. That is a supported outcome, not a degraded one.
- **The AskUserQuestion tool** (required, default: leave it available). The rules ask for
  questions in prose, numbered, one decision each, and the AskUserQuestion tool answers a
  different shape. Offer to deny the tool in the user's Claude Code settings: add
  `"AskUserQuestion"` to the `permissions.deny` array in `~/.claude/settings.json`, which
  removes the tool from the assistant's context. Write the entry when you have access to the
  settings file, and print the exact edit for the user to make when you do not. A user who
  declines keeps the tool and the rule together, and the assistant follows the rule by
  choice.

Values must be single-line. A note that wants a second sentence still stays on one line.

## 5. Confirm, then apply

Show the user the full plan before writing: every placeholder with its resolved value, the
destination directory (default `~/.claude/katharsis`), the memory file getting the import
line, and the exact command. Proceed only on an explicit yes.

Then run, from the root:

```
scripts/setup-rules.sh apply --dest ~/.claude/katharsis \
  --set READER_NAME=<name> --set MEMORY_FILE=<file> --set DESTINATIONS=<fragment> \
  --set HOUSE_STYLE_NOTE=<note or empty> --set REPO_CONVENTION_NOTE=<note or empty> \
  --import-into <memory file path>
```

The script verifies no `{{` survives substitution and appends the import line only when it
is not already present. On any nonzero exit, show its stderr verbatim and stop.

## 6. Verify and hand off

Show the appended import line and the list of written files. Tell the user the rules load in
their next session. The rule text still carries the reference audit's counts, labelled as
such; running the `katharsis-audit` skill later replaces them with counts measured on their
own transcripts.
