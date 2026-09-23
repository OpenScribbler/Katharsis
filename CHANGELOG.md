# Changelog

Every change an installer can see is listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). A release is the `katharsis--v<version>` tag whose
section this file carries. Tests, CI, and repo housekeeping are not listed.

## [Unreleased]

### Added

- Two GIFs in the README, rebuilt for the output style. The first replays one CI-triage prompt
  answered by Claude Opus 5.5 under Claude Code's default style and under Katharsis, side by side.
  The second continues the Katharsis session: the user answers its questions by code, and `kref`
  reads the ledger back. `demo/` holds the sandbox repo, the verbatim captures, the player, the
  tapes, and the steps to reproduce both.

### Changed

- The README, SECURITY.md, the design record, and the bug-report template now say that
  `ledger-stop.sh` can hold a reply as well as `stop-verifier.sh`, that the verifier runs whichever
  style is active, and that `drift.jsonl` records a coded line's title. The README also documents
  the model notes, `kref -c`, `kref -n`, and which parts need python3.
- The real-path check's headless variant writes the style to the project's settings file. The
  hooks never read `--settings`, so the variant as written passed only where
  `~/.claude/settings.json` already named Katharsis.

## [0.4.0] - 2026-09-22

### Added

- A model note per model family, in `styles/models/`. The prompt hook reads the active model and
  attaches the note for Fable, Opus, or Sonnet when the family changes and after a compaction,
  so each model gets the corrections Anthropic's prompting guide gives for its leans (D31).
- A decisions telemetry record per reply, `telemetry/decisions.jsonl`, counting questions,
  gate-shaped questions, re-asked questions, D lines, and lines carrying addresses. It holds
  counts only.
- A hooks module, `hooks/register.ts`, that Claude Code loads where function hooks are enabled
  (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` on 2.1.278; the surface is early access and off by
  default). It takes over the per-turn reminder from `scripts/turn-reminder.sh`: the active style
  is read from the settings the engine runs under, and an untyped turn is told from the prompt's
  origin rather than from marker strings. The script exits at once when the module is loaded, and
  every other build runs the script alone as before.
- A Stop hook, `scripts/stop-verifier.sh`, that holds a reply once when it asks a decision from
  outside the Questions round, or opens by narrating the intended action. Its reason asks for an
  errata line plus the missing section, never for the reply again.
- `scripts/detect-reply.sh` and the word packs under `scripts/packs/`, which run the writing
  rules over a single reply and print one fix line per hit.
- The ledger hook, `scripts/ledger-stop.sh`, now holds a reply once when it gives a reference code
  a different claim than the one already on file for that session and carries no errata line
  naming that code. Its reason asks for an errata line plus the new claim under a fresh code,
  never for the reply again. A code renumbered across turns is recorded to
  `telemetry/drift.jsonl` in the data directory instead.
- The prompt hook now links a handoff chain. A prompt naming a `/tmp/punt-*.md` file whose
  contents carry a `Ledger parent: <id>` line records that pair under `ledger/chains/`, so the
  reference codes in the new session continue the parent's numbering instead of restarting at 1.

- A `## Prose headings` section in the styles README and both output styles: every idea in
  uncoded prose after the answer line sits under its own `##` heading, at most two paragraphs
  per heading, and a coded group of three or more items sharing a cause the answer line does not
  state opens with one sentence naming it. Items inside a group run most important first. The
  ledger hook records the per-reply heading counts to `telemetry/headings.jsonl`, counts only.

### Changed

- A correction keeps its code. The corrected line is restated under the original code ending
  with its erratum's code, and the E line holds the wording as first written, so one item never
  carries two codes (D30). The drift check passes such a restatement, and the verifier's repair
  texts ask for this form.
- Next actions start on the user's next message, so a reply no longer asks whether to start one,
  and an open question is asked once and then carried by code (D27).
- Craft calls that follow convention are made silently, and a D line holds only a call the user
  or a colleague would see (D28).
- A coded line states what is now true for the reader, and a path, hash, or command comes last as
  a pointer (D29).
- `scripts/turn-reminder.sh` no longer prints "<style> output style is active". Claude Code attaches
  that sentence itself on every turn of a custom style (seen on 2.1.278), so the line arrived twice.
  The hook is now silent for every style but Katharsis.
- The Questions form puts a blank line after the question line and after each option. Without
  them a markdown renderer folds the options into the question's paragraph, which is how the
  round read in clients that draw markdown rather than raw text.
- Every exchange type now carries a `## Questions` slot, including the three whose shape listed
  none, and the reference codes state when a decision is the user's to make rather than the
  model's.

### Fixed

- The ledger keeps a hyphen or colon inside a coded line's title. The unbolded title used to stop
  at the first one, so "Is ATD-1274 done for this session?" was stored as "Is ATD" and a line
  opening with a ticket key was stored as a code. The title now ends only at a dash with a space
  on both sides or a colon followed by a space, and a code prefix is letters with at most one
  inner hyphen. The verifier's code detector takes the same prefix.

The [real-path check](docs/evals/style-path.md) ran on 2026-09-22 against Claude Code 2.1.280,
headless, on the release branch before the tag. The hook and ledger rows passed; the two bash-mode
rows are not yet run.

## [0.3.0] - 2026-09-04

Upgrading from 0.2.x: run 0.2.1's `scripts/uninstall-rules.sh apply` before installing this
version. 0.3.0 removes the rules, the managed block, and the uninstaller that reverses them, and
the `~/.claude/katharsis/` directory 0.2.x wrote has to be gone before 0.3.0 can put its symlink
there. The 0.2.1 scripts are at the
[`katharsis--v0.2.1`](https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.2.1)
tag.

### Added

- Two output styles, `katharsis:Katharsis` and `katharsis:Katharsis coding`, with one body: the
  model classifies each message into one of 11 exchange types, reads the guidance file for that
  type, and shapes the reply to its ceiling, opening line, and exclusion list. The second style
  keeps Claude Code's built-in software-engineering instructions.
- `styles/`, one guidance file per exchange type, each with cues, a ceiling, a shape,
  ambiguities, a verification list, and examples, plus the `README.md` that holds the rules
  shared by all of them.
- `scripts/katharsis-exchange-style.sh`, which prints a type's guidance file into the model's
  context and stamps the type. The model runs it once per typed turn.
- Four hooks, wired by `hooks/hooks.json`: a SessionStart hook that points `~/.claude/katharsis`
  at the plugin, a UserPromptSubmit hook that prints the per-turn reminder and the next free code
  numbers, and two Stop hooks, one that records a skipped classification to telemetry and one
  that writes every reference-coded item in the reply to a ledger. No hook blocks a reply.
- `kref`, which reads the ledger back by code or prefix, in the terminal or as an HTML page, so
  `F3` resolves after a compaction or in a later session. `bin/kref`, `kref-m`, and `kref-h` wrap
  it for bash mode.
- `/katharsis:setup` and `scripts/setup.sh`, which add the one `permissions.allow` entry the
  routing script needs and name the two styles.
- `~/.claude/katharsis-data/`, where the ledger, the telemetry, and the stamps live. It outlives
  the plugin.

### Removed

- The rule files under `rules/`, the loader, and the two machine-readable contracts.
- The pre-substituted build under `dist/`.
- `katharsis-setup` in its rules form, `katharsis-audit`, and `writing-examples`.
- `scripts/setup-rules.sh`, `uninstall-rules.sh`, `settings-edit.sh`, `profile-alias.sh`,
  `detect-prose.sh`, `audit-rewrite.sh`, `memory-inventory.sh`, and `make-dist.sh`, with their
  test suites.
- The managed block in the memory file, the install manifest, and the `kclaude` launch wrapper.
- `demo/`, the two README GIFs, and the evals that measured the rules: `ci-triage.md`,
  `ci-triage-compared.md`, `setup-skill.md`, `output-styles.md`, and the captures behind them.
- `docs/uninstall.md`. Uninstalling is `/plugin uninstall katharsis@openscribbler`, and the
  README says what stays behind.
- The rule-proposal issue template.

The [real-path check](docs/evals/style-path.md) ran on 2026-09-04 against Claude Code 2.1.261,
headless, after the tag. The hook and ledger rows passed; the two bash-mode rows are not yet run.

## [0.2.1] - 2026-08-28

### Added

- A side-by-side demo GIF at the top of the README, replaying one CI-triage prompt answered by
  Claude Opus 5 with the rules and without them. `docs/evals/ci-triage.md` records the method and
  the numbers, `docs/evals/captures/` holds both replies verbatim, and `demo/` holds the sandbox
  repo, the prompt, and the tooling to reproduce both captures and rebuild the GIF.
- `docs/evals/`, an index of every measurement behind the README's claims, with the rules that
  keep two evals comparable. `docs/output-styles.md` moved to `docs/evals/output-styles.md`.
- `docs/evals/ci-triage-compared.md`, which pairs the two CI-triage replies part by part as text,
  because a GitHub-rendered GIF cannot be paused. Both replies appear in full.
- A second GIF in the README's Install section, replaying one real `katharsis-setup` run from
  discovery through the plan to the files written. `demo/capture-setup.txt` is the abridged
  script the GIF replays, and `demo/README.md` says what the abridgement cut.
- `docs/evals/setup-skill.md`, which runs `katharsis-setup` end to end with the rules loaded and
  without them. A skill fixes what has to be said, so the eval isolates the structural half of
  what the rules do: six bare questions became six carrying lettered options and a recommendation
  each, nine findings and actions gained a reference code, and 21 em dashes fell to 2, at a reply
  length that did not move. Both runs are stored verbatim under `docs/evals/captures/`.

### Changed

- The README leads with what changes in your replies rather than an inventory, and a new "Choices
  setup offers" section says what each setup decision does, why it exists, and when to pick it.
  The inventory stays, lower down, as "What's included".
- Prose across the repo names the shipped rules "the built-in rules" instead of counting them, so
  adding a rule does not leave a stale number in a dozen files.
- The README no longer says the audit rewrites the reference counts in the rule text, because that
  byproduct raised more questions than it answered. The audit's measurement, its before/after
  pairs, its gated rule proposals, and the memory inventory are unchanged.
- `demo/player.sh` reads the prompt from the replay file rather than carrying one prompt in the
  script, so one player serves both GIFs. A line starting with `> ` prints as a dimmed user turn,
  and code-fence lines are dropped.

## [0.2.0] - 2026-08-28

### Added

- A generic build of the rule files at `dist/rules/`, with every `{{PLACEHOLDER}}` already
  substituted: `READER_NAME` becomes "the user", and the rest take the defaults
  `rules/placeholders.yaml` declares. It serves distribution channels with no setup step, such
  as a cross-tool package manager or registry. `scripts/make-dist.sh` regenerates it, and the
  test suite fails when `rules/` and `dist/rules/` drift.

- Setup reports the installed Claude Code output style with measured guidance: Concise
  compounds with the rules, the default works as installed, and Explanatory or Learning
  re-add the narration the rules remove. The measurements are in `docs/evals/output-styles.md`.

- A system-prompt append mode: `setup-rules.sh apply --wrapper` writes a `kclaude` launch
  wrapper that concatenates the installed rule files plus `promoted.md` at every launch and
  execs `claude --append-system-prompt-file`, so the rules load only in sessions started
  through it. `scripts/profile-alias.sh` appends one alias line for the wrapper to a shell
  profile, records the profile path, the line, and the pre-append hash in the manifest, and
  the uninstall reverses both. The manifest version is now 2, and older uninstallers refuse
  a version-2 manifest rather than orphaning the alias line.

## [0.1.0] - 2026-08-27

### Added

- A MOAT attestation for the rule set: `.moat/publisher.yml` declares `rules/` as the
  `katharsis-rules` item, so every push to `main` signs it beside the three skills.
- A MOAT registry: `.github/workflows/moat-registry.yml` verifies the publisher attestation,
  signs each item under its own identity, and publishes a signed `registry.json` to the
  `moat-registry` branch, so every item is `Dual-Attested`. `SECURITY.md` documents what the
  attestations cover and how to check them.
- Three rule files under `rules/`, a loader, and the five-placeholder contract in
  `rules/placeholders.yaml`.
- `katharsis-setup`, which discovers the installer's memory file and conventions on disk,
  asks which rule files to install, substitutes the placeholders, generates a `loader.md` that
  imports the chosen files, and writes one managed block.
- `katharsis-audit`, which rewrites the reference counts from the installer's own transcripts,
  builds before/after pairs, gates rule proposals on evidence, and audits the memory store.
- `writing-examples`, with one worked pair per rule and three full-message rewrites.
- `scripts/detect-prose.sh`, which counts one failure mode per built-in rule in session logs with no
  model in the loop.
- A reversible install: every write lands in `.katharsis-install.json`, and
  `scripts/uninstall-rules.sh` and `scripts/settings-edit.sh` reverse only what it records.

[Unreleased]: https://github.com/OpenScribbler/Katharsis/compare/katharsis--v0.4.0...HEAD
[0.4.0]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.4.0
[0.3.0]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.3.0
[0.2.1]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.2.1
[0.2.0]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.2.0
[0.1.0]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.1.0
