# Changelog

Every change an installer can see is listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). A release is the `katharsis--v<version>` tag whose
section this file carries. Tests, CI, and repo housekeeping are not listed.

## [Unreleased]

### Added

- A generic build of the rule files at `dist/rules/`, with every `{{PLACEHOLDER}}` already
  substituted: `READER_NAME` becomes "the user", and the rest take the defaults
  `rules/placeholders.yaml` declares. It serves distribution channels with no setup step, such
  as a cross-tool package manager or registry. `scripts/make-dist.sh` regenerates it, and the
  test suite fails when `rules/` and `dist/rules/` drift.

- Setup reports the installed Claude Code output style with measured guidance: Concise
  compounds with the rules, the default works as installed, and Explanatory or Learning
  re-add the narration the rules remove. The measurements are in `docs/output-styles.md`.

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
- `scripts/detect-prose.sh`, which counts all eleven failure modes in session logs with no
  model in the loop.
- A reversible install: every write lands in `.katharsis-install.json`, and
  `scripts/uninstall-rules.sh` and `scripts/settings-edit.sh` reverse only what it records.

[Unreleased]: https://github.com/OpenScribbler/Katharsis/compare/katharsis--v0.1.0...HEAD
[0.1.0]: https://github.com/OpenScribbler/Katharsis/releases/tag/katharsis--v0.1.0
