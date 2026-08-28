---
name: katharsis-setup
description: Install the Katharsis writing rules. Discovers the installer's memory file, house style guide, and repo conventions on disk, asks only what discovery cannot answer, then substitutes the placeholder contract, writes the rule files, and wires the chosen load mode, either a memory import line or a launch wrapper with a shell alias. Use when the user asks to install, set up, or configure Katharsis.
---

# katharsis-setup

Katharsis ships three rule files plus a loader, and setup writes an empty `promoted.md` beside
them. The rule files carry five `{{PLACEHOLDER}}` slots that `rules/placeholders.yaml`
declares. This skill resolves each slot to the installer's own value and hands the
deterministic work to `scripts/setup-rules.sh`. Discovery and questions happen here;
substitution, verification, the managed block, and the install manifest happen in the script.

Write nothing by hand. Every write this skill causes goes through a script, so every write is
recorded in the manifest and can be reversed. That includes the settings edit in step 4.

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
- **The output style** (not a placeholder): read `outputStyle` from the first of
  `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.local.json`,
  `~/.claude/settings.json` that sets it, and treat an unset key as `default`. Step 4
  reports it with the guidance from `docs/output-styles.md`.

Never ask the user for a value a file on disk already answers. Present discovered values for
confirmation instead of asking cold.

## 4. Ask the rest

Ask in prose, one decision per question, the whole set in one round:

- **Which rule files** (required, default: all three). `writing.md` governs what to say and in
  what order, `technical-english.md` governs the sentences, and `git-writing.md` governs commit
  messages, PR bodies, and review comments. A user who wants fewer names them. The apply
  command in step 5 then passes `--select` with those names, so only those files land and
  the generated `loader.md` imports only those. Say two things before they decide. A
  placeholder that appears only in a file they leave out is never asked for. The
  `katharsis-audit` rewrite edits `writing.md` alone, so an install without it gets the
  memory audit only.
- **How the rules load** (required, default: the memory import). Two modes. The memory
  import writes one managed block into the memory file, so the rules load in every
  session. The system-prompt append writes no block: `apply --wrapper` generates an
  executable `kclaude` beside the rules, which concatenates the installed rule files plus
  `promoted.md` at every launch and execs `claude --append-system-prompt-file`, so the
  rules load only in sessions started through the wrapper. The concatenation happens at
  launch rather than at install, because the audit rewrites the rule files and the memory
  audit grows `promoted.md`, and the system prompt does not resolve `@` imports. The modes
  are alternatives. A user who explicitly asks for both gets both, and the apply then
  warns that the rule text loads twice and the context window grows by the size of the
  rule set.
- **The shell alias** (asked only in append mode; default: yes, named `kclaude`): whether
  to append one alias line for the wrapper to the shell profile, and to which file.
  Detect the profile from `$SHELL`, which maps bash to `~/.bashrc`, zsh to `~/.zshrc`,
  and fish to `~/.config/fish/config.fish`, and present it for confirmation. One line
  serves all three shells, because the alias points at the executable wrapper. The write
  runs through `scripts/profile-alias.sh` after step 5, which records the profile path,
  the appended line, and the pre-append hash in the manifest, so
  `scripts/uninstall-rules.sh` can reverse it. A user who declines the alias launches the
  wrapper by path.
- **READER_NAME** (required, no default): what the assistant should call the user.
- **DESTINATIONS** (required, default `docs`): a prose fragment that lands mid-sentence
  after "your chat answers", such as `the docs site` or `README files and design docs`.
- Confirmation of the discovered MEMORY_FILE and of each drafted note. A user who declines a
  note gets an empty string, which leaves that section stating the general rule with no
  specific case attached. That is a supported outcome, not a degraded one.
- **The output style** (a report, never a question): name the style step 3 found and give the
  matching line from `docs/output-styles.md`. Concise compounds with the rules, so tell a
  Concise user to keep it. The default works as installed, and Concise pairs well for shorter
  replies. Explanatory and Learning re-add the narration and teaching blocks the rules
  remove, so tell that user to expect longer replies and mixed structure. Changing the style
  is the user's own `/output-style` action, so Katharsis never writes it and the manifest
  never records it.
- **The AskUserQuestion tool** (required, default: leave it available). The rules ask for
  questions in prose, numbered, one decision each, and the AskUserQuestion tool answers a
  different shape. Offer to deny the tool, which adds `"AskUserQuestion"` to the
  `permissions.deny` array in `~/.claude/settings.json` and removes the tool from the
  assistant's context. Never hand-edit that file. Run
  `scripts/settings-edit.sh apply --edit deny-askuserquestion` after step 5, which records the
  edit in the manifest and notes whether the value was already set, so
  `scripts/uninstall-rules.sh` can reverse a Katharsis write and leave the user's own alone.
  Print the command for the user to run when you cannot reach the settings file. A user who
  declines keeps the tool and the rule together, and the assistant follows the rule by
  choice.
- **Where the import block goes** (required, default: the top). The block lands at the top of
  the memory file, after YAML frontmatter when the file opens with it, so it stays visible and
  does not get lost under later additions. Pass `--position end` for a user who wants it
  appended. Position does not change which rules load.

Values must be single-line. A note that wants a second sentence still stays on one line.

## 5. Confirm, then apply

Show the user the full plan before writing: the rule files that will land, every placeholder
with its resolved value, the destination directory (default `~/.claude/katharsis`), the load
mode, the memory file receiving the managed block and where in that file the block lands (memory
import), the wrapper and the alias line with its profile file (append mode), and the exact
commands. Proceed only on an explicit yes.

Then run, from the root:

```
scripts/setup-rules.sh apply --dest ~/.claude/katharsis \
  --set READER_NAME=<name> --set MEMORY_FILE=<file> --set DESTINATIONS=<fragment> \
  --set HOUSE_STYLE_NOTE=<note or empty> --set REPO_CONVENTION_NOTE=<note or empty> \
  [--import-into <memory file path>] [--position top|end] \
  [--select writing,technical-english,git-writing] [--wrapper]
```

The memory import passes `--import-into`. Append mode passes `--wrapper` and no
`--import-into`. A user who explicitly asked for both passes both, and the script prints the
double-load note. Omit `--select` when the user keeps all three. The script verifies every substitution before
it writes anything, so a leftover placeholder leaves the destination untouched. It writes one
delimited block into the memory file, never loose lines, and inserts it only when it is not
already there. It archives any destination file it did not write, saves the memory file as it
was, and records all of it in `~/.claude/katharsis/.katharsis-install.json`, including the
chosen set under `rules`. A re-apply that narrows the set leaves the dropped file on disk and
says so, because the uninstall is the one removal path. On any nonzero exit, show its stderr
verbatim and stop.

Then, only for the choices the user accepted in step 4:

```
scripts/settings-edit.sh apply --edit deny-askuserquestion
scripts/profile-alias.sh apply --profile <profile file> [--alias <name>]
```

The alias apply runs after the setup apply, because it refuses when the wrapper is not on
disk. Omit `--alias` for the default name `kclaude`.

## 6. Verify and hand off

Show the managed block as it now reads in the memory file (memory import), the list of written
files, and the manifest path. Tell the user how the rules load. In the memory import they load
in the next session. In append mode they load only in sessions started through the wrapper, so
show the launch command: the alias name when one was written, or the wrapper path
`~/.claude/katharsis/kclaude` when the user declined the alias. The rule text still carries
the reference audit's counts, labelled as such; running the `katharsis-audit` skill later
replaces them with counts measured on their own transcripts.

Name the way out in the same breath as the way in:

```
scripts/uninstall-rules.sh plan     # names every action, writes nothing
scripts/uninstall-rules.sh apply    # executes it
```

Say what it will not remove: a rule file the user edited, a `promoted.md` carrying entries they
approved, a block that was already in the memory file, a settings value that predates the
install, and an alias line that was already in the profile. Each of those is reported and kept,
because the manifest records that Katharsis did not write it.
