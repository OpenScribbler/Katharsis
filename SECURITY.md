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
- Every push to `main` publishes a MOAT attestation. The [MOAT attestation](#moat-attestation)
  section below says what it covers and how to check it.

## MOAT attestation

Katharsis is a [MOAT](https://openscribbler.github.io/moat/) publisher. MOAT is a protocol for
publishing AI agent content through signed registries, and its Publisher Action lets a source repo
sign its own content so a registry and an installer can verify it independently.

### What the attestation covers

On every push to `main`, `.github/workflows/moat-publisher.yml`:

- discovers four content items: the skills `katharsis-setup`, `katharsis-audit`, and
  `writing-examples` under `skills/`, and the rule set `katharsis-rules`, which
  `.moat/publisher.yml` declares as the `rules/` directory
- computes one SHA-256 content hash per item over every file in that item's directory, using
  MOAT's normative
  [`moat_hash.py`](https://github.com/OpenScribbler/moat/blob/main/reference/moat_hash.py)
  algorithm
- signs each hash with Sigstore keyless signing, where the identity is the GitHub Actions OIDC
  token for this repo and workflow, so the repo holds no signing keys
- records each signature in the [Rekor](https://rekor.sigstore.dev) public transparency log, which
  no one can edit, and writes the hash, the Rekor log index, and the commit SHA per item into
  `moat-attestation.json` on the `moat-attestation` branch

A registry that indexes Katharsis and finds those Rekor entries lists the items as
`Dual-Attested`, MOAT's highest trust tier, because the registry and this repo attested the same
hash in separate log entries. A conforming client surfaces that tier before install and fails an
install whose bytes do not hash to what was signed.

### What it does not cover

- `scripts/`, `tests/`, and `docs/` are not attested items, because MOAT's content type registry
  has no type for them. The `katharsis--v<version>` tag, the ruleset on `main`, and CI are the
  integrity story for the whole tree, and a Claude Code install copies the whole tree.
- Safety. The attestation proves the bytes you hold match the bytes this workflow signed at a
  named commit, and proves nothing about what those bytes do. Read `scripts/` before you run
  setup.

### Check it yourself

Read the attestation:

```
git fetch origin moat-attestation
git show origin/moat-attestation:moat-attestation.json
```

Recompute an item's hash from a checkout of that item's `source_ref` commit, and compare it to the
recorded `content_hash`:

```
python3 moat_hash.py rules      # moat_hash.py is in the moat repo under reference/
```

Confirm the Rekor entry: fetch
`https://rekor.sigstore.dev/api/v1/log/entries?logIndex=<rekor_log_index>` and compare its payload
hash against the SHA-256 of `{"_version":1,"content_hash":"<content_hash>"}`. The
[MOAT publisher guide](https://openscribbler.github.io/moat/guides/publishers/) carries a script
for this check.

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
