# Changelog

Every change an installer can see is listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). A release is the `katharsis--v<version>` tag whose
section this file carries. Tests, CI, and repo housekeeping are not listed.

## [Unreleased]

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

[Unreleased]: https://github.com/OpenScribbler/Katharsis/compare/katharsis--v0.2.0...HEAD
[0.2.0]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.2.0
[0.1.0]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.1.0
