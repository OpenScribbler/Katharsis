# Security policy

## What Katharsis does on your machine

Katharsis is a Claude Code plugin, and a plugin executes with your privileges. Installing it copies
this repo into `~/.claude/plugins/cache/`, and the two skills run the shell and Python scripts under
`scripts/` when you ask them to. Those scripts:

- write rule files under `~/.claude/katharsis/`
- write one delimited block at the top of the memory file you name, such as `~/AGENTS.md` or
  `~/.claude/CLAUDE.md`
- offer two edits to `~/.claude/settings.json`, each of which you approve first
- read your session logs under `~/.claude/projects/` to count failure modes, and never send them
  anywhere themselves
- move memory entries you choose to delete into an archive with a rollback path

Every write is recorded in `~/.claude/katharsis/.katharsis-install.json`, and
`scripts/uninstall-rules.sh` reverses only what that manifest records, and
[docs/uninstall.md](docs/uninstall.md) lists what it refuses. The scripts make no network
requests. The audit skill shows the model a sample of your own prose from those logs, inside the
Claude Code session you are already running.

Signature verification proves origin and integrity, and never that a script is safe. Read
`scripts/` before you run setup, the same way you would read any hook.

## Scope

Vulnerabilities we want to hear about:

- **Write outside the declared paths.** Setup, the audit, or a settings edit writing outside
  `~/.claude/katharsis/`, the named memory file, and `~/.claude/settings.json`. A placeholder
  value, a symlink, and a crafted memory file are the likely routes.
- **Uninstall removing what Katharsis did not write.** A crafted manifest or a race that makes
  `uninstall-rules.sh apply` delete or truncate a file it cannot prove it wrote.
- **Settings injection.** `settings-edit.sh` writing any key other than the two it offers, or
  changing a value that was set before the install.
- **Marker injection.** A placeholder value or a promoted rule that closes the managed block early
  or inserts an `@` import the installer did not ask for.
- **Data leaving the machine.** Any path by which a script sends log content, memory entries, or
  settings to a network destination.

Out of scope, by design:

- The rules changing what a model writes. That is the product, and a rule the model ignores is a
  bug report.
- Content you type into a placeholder or promote into a rule. The scripts guard the file
  structure, and the text is yours.
- Claude Code itself. Report those to Anthropic.

## Release integrity

- Every release is a `katharsis--v<version>` tag on a commit that reached `main` through a pull
  request. A ruleset blocks force pushes to `main` and any update or deletion of those tags.
- CI runs the test suites, ShellCheck, and `claude plugin validate --strict` on every pull
  request. The ruleset on `main` requires all three to pass.
- Every GitHub Action the repo runs is pinned to a full commit SHA, and every workflow carries an
  explicit least-privilege `permissions:` block. The repository setting requires SHA pinning.
- Pull requests come from vouched contributors only, and every path the plugin executes has code
  owners.
- The `moat-attestation` branch carries a [MOAT](https://github.com/OpenScribbler/moat)
  attestation, written by `.github/workflows/moat-publisher.yml` on every push to `main`. It holds
  a Sigstore-signed content hash and a Rekor log index for each skill and rule set. A MOAT verifier
  such as [syllago](https://github.com/OpenScribbler/syllago) checks that the content it installs
  matches what this workflow signed.

## Reporting a vulnerability

**Email:** openscribbler.dev@pm.me

Subject line: `[SECURITY] katharsis -- <brief description>`

Please include the affected script, the reproduction steps, and the `version` from
`.claude-plugin/plugin.json`. We acknowledge within 48 hours and target a fix or mitigation within
7 days. This is an open source project with no bug bounty program.

Please do not open a public issue for a vulnerability. We prefer coordinated disclosure and credit
reporters in the advisory unless they prefer to stay anonymous.

## Safe harbor

We support good-faith security research. If you follow this policy, we will not pursue legal
action. Test only against machines and accounts you own, avoid destroying data, and give us
reasonable time to fix the problem before you publish.
