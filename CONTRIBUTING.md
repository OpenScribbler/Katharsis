# Contributing to Katharsis

Katharsis is built around evidence: every ceiling in a guidance file came out of an A/B run, and
every script has a test suite that asserts exact outcomes. Contributions work the same way. An
issue that pastes the message you sent and the reply you got, with the exchange type you expected,
is worth more than code. It needs no code at all.

## Start with an issue

Every change starts as an issue, and the templates ask for what a maintainer needs to act:

- **Bug report** for a hook, a script, the setup skill, or the style doing something other than
  what the README or the guidance file says. A reply that came out the wrong shape is a bug
  report, and the template asks for the message, the reply, and the type you expected.
- **Feature idea** for something Katharsis should do and does not. A proposal for a new exchange
  type, or a change to a ceiling, goes here with the messages that motivate it.

A security problem in the hooks or the setup script goes to the email in
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

Three decisions from [`docs/design.md`](docs/design.md) apply to every change:

- **D5.** No hook blocks a reply. Every hook exits 0 on every path, including a missing data
  directory, a malformed transcript, and a missing python3. A hook test plants each of those.
- **D12.** The two output styles share one body. The test in `tests/test-exchange-style.sh`
  fails when the bodies differ, so a change to the style lands in both files.
- **D15.** Every script under `scripts/` has a suite under `tests/` that plants its own expected
  outcomes and asserts exact outputs and exit codes. A new script arrives with its suite.

A change to a ceiling, a cue, or a type's shape records its evidence as a new numbered decision
in `docs/design.md`, or as a page under `docs/evals/`.

## Prose in this repo

People and agents both read the README, the guidance files, and the design doc, and all of them
follow what the style asks of a reply: the answer first, one term per concept, and complete
sentences. The shortest check is whether the first line of a section stands alone.

Commit messages and pull request bodies follow the pull request template's three sections. A
commit body says what the diff cannot show, and has no body when there is nothing of that kind
to say.

## Releases

Every pull request that changes what an installer sees adds a line under `[Unreleased]` in
[CHANGELOG.md](CHANGELOG.md): a guidance file, the style body, a hook, a script, a manifest, or a
documented behavior. A change to tests, CI, or repo housekeeping adds nothing. The pull request checklist asks for the
entry, and a reviewer treats a missing one as a missing test.

A release runs [the real-path check](docs/evals/style-path.md) first and records the result in
the changelog entry. Then it is one pull request. It bumps the version in both `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, renames `[Unreleased]` to `[<version>] - <date>`, and opens
a new empty `[Unreleased]` above it. Once that lands on `main`, tag it with
`claude plugin tag --push`. The tag is `katharsis--v<version>`, which is the form Claude Code
resolves, and a ruleset protects those tags from update and deletion. Then create a GitHub
Release on that tag with the changelog section as its body, so the Releases page and
`claude plugin update` agree. Installers who pinned the plugin get the new version on their
next `claude plugin update`.

## Code of conduct

Contributors follow the [Code of Conduct](CODE_OF_CONDUCT.md).
