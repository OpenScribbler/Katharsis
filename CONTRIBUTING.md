# Contributing to Katharsis

Katharsis is built around evidence: every rule it ships has a count behind it, and every script
has a test suite that asserts exact outcomes. Contributions work the same way. An issue that names
a measured pattern, or the exact refusal a script printed, is worth more than code. It needs no
code at all.

## Start with an issue

Every change starts as an issue, and the templates ask for what a maintainer needs to act:

- **Bug report** for a script, skill, or rule that does something other than what the README or
  the skill text says.
- **Feature idea** for something Katharsis should do and does not.
- **Rule proposal** for a failure mode your transcripts show that the eleven rules do not name.
  The template asks for the count, the corpus size, the distinct phrasings, and one before/after
  pair. The audit skill gates a rule on the same evidence.

A security problem in the setup, uninstall, or settings scripts goes to the email in
[SECURITY.md](SECURITY.md) and never to a public issue.

## Pull requests

Katharsis accepts pull requests from vouched contributors only. The repo uses
[Vouch](https://github.com/mitchellh/vouch), and a pull request from an unvouched author is closed
by a workflow with a note that explains this. To get vouched, open an issue, work it with a
maintainer, and a maintainer vouches for you by commenting `!vouch` on that issue. The comment
opens a pull request that adds you to [`.github/VOUCHED.td`](.github/VOUCHED.td), and a maintainer
merges it.

A small team handles design and implementation with an AI-augmented workflow. The vouch step is
how that team gets to know a contributor before reviewing code.

## What a pull request has to pass

CI runs three jobs on every pull request, and the ruleset on `main` requires all three:

```bash
bash tests/run-tests.sh                              # every suite under tests/
shellcheck -S warning scripts/*.sh tests/*.sh        # the scripts and the suites
claude plugin validate --strict .                    # the manifests and the skills
claude plugin tag --dry-run --force .                # plugin.json and marketplace.json agree
```

The tests need bash and python3 and nothing else. The validator ships with the
[Claude Code CLI](https://code.claude.com/docs/en/plugins).

Three contracts from [`docs/design.md`](docs/design.md) apply to every change:

- **D10.** Every script under `scripts/` has a suite under `tests/` that plants its own expected
  outcomes and asserts exact counts and exit codes. A new script arrives with its suite.
- **The two machine-readable contracts.** `rules/placeholders.yaml` and `rules/audit-numbers.yaml`
  are depended on by the setup and audit engines. A change to either records its reasoning as a
  new numbered decision in `docs/design.md`.
- **Reversibility.** Every write setup or the audit makes on an installer's machine is recorded in
  the install manifest, so `scripts/uninstall-rules.sh` can reverse it. A new write path records
  into the manifest before it writes.

## Prose in this repo

The plugin installs the rule files under `rules/`, and people and agents both read the README, the
skills, and the design doc. All of them follow the rules they ship:
[`rules/technical-english.md`](rules/technical-english.md) for the sentences, and
[`rules/writing.md`](rules/writing.md) for structure. The shortest check is the 25-word cap on a
sentence.

Commit messages and pull request bodies follow [`rules/git-writing.md`](rules/git-writing.md). The
pull request template carries the three sections it asks for.

## Releases

A release is a version bump in both `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, merged to `main`, then tagged from `main` with
`claude plugin tag --push`. The tag is `katharsis--v<version>`, which is the form Claude Code
resolves, and a ruleset protects those tags from update and deletion. Installers who pinned the
plugin get the new version on their next `claude plugin update`.

## Code of conduct

Contributors follow the [Code of Conduct](CODE_OF_CONDUCT.md).
