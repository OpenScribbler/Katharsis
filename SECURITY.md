# Security policy

## What Katharsis does on your machine

Katharsis is a Claude Code plugin, and a plugin executes with your privileges. Installing it copies
this repo into `~/.claude/plugins/cache/`, and `hooks/hooks.json` runs the shell and Python
scripts under `scripts/` at session start and after every reply. Where function hooks are enabled
(`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`), Claude Code also loads `hooks/register.ts` into its own
process, and it runs on every message you send and draws the drawer. `kref` runs only when you call
it. The setup skill runs one more script when you ask it to. Together they:

- create the symlink `~/.claude/katharsis`, pointing at the plugin's directory
- write under `~/.claude/katharsis-data/`: stamp and marker files per session, a ledger of the
  reference-coded lines in each reply, a link file under `ledger/chains/` when a session opens
  from a handoff file, a record per session under `sessions/` holding its folder, branch, times,
  Katharsis versions, transcript path, and a model-written title, the answers you gave to
  questions under `answers/` as codes and letters, the HTML pages `kref --html` writes, and the
  telemetry files under `telemetry/`
- read the reply Claude Code hands each Stop hook to find those lines; the session transcript's
  folder under `~/.claude/projects/` for the project name, and its last 400 KB for what kind of
  turn started the reply; and a `/tmp/punt-*.md` handoff file when your message names one. `kref`
  also reads `~/.claude/history.jsonl` and the end of a transcript to name a session recorded
  before session records existed. None of them makes a network request; the one model call they
  trigger is described below
- add one entry to `permissions.allow` in `~/.claude/settings.json` when you run
  `/katharsis:setup`, so the routing script runs without a prompt

A ledger row holds one reference-coded item from a reply: its code, its bold title, the paragraph
that follows it, the heading it sat under, and for a question its lettered options and
recommendation. Nothing you type reaches it, and reply prose outside a coded item does not either. The
telemetry holds types, codes, counts, and timestamps, and no text from either side. The scripts make no network requests. The drawer module asks the model, through Claude Code's own
model call, for a short session title on turn 3 and every 15 turns after; that request carries the
conversation like any turn. Two hooks can hold a reply. `stop-verifier.sh` holds one once, at
most, when it opens by narrating the intended action and buries the finding. `ledger-stop.sh` holds a reply once when it gives a code a different claim than the one
on file with no errata line naming it. Each reason asks for a few appended lines rather than the
reply again. Every other hook exits 0 on every path, and so do those two on every path where
they cannot help, including a malformed payload.

Signature verification proves origin and integrity, and never that a script is safe. Read
`scripts/` before you run setup, the same way you would read any hook.

## Scope

Vulnerabilities we want to hear about:

- **Write outside the declared paths.** A hook or the setup script writing outside
  `~/.claude/katharsis`, `~/.claude/katharsis-data/`, and the one `permissions.allow` entry in
  `~/.claude/settings.json`. A crafted session ID, a crafted project path, and a symlink planted
  where the data directory goes are the likely routes.
- **Text reaching the ledger or the telemetry that the design keeps out.** Anything you typed in
  a ledger row, a reply's uncoded prose in one, or any reply or message text at all in a telemetry
  row. Both outlive the session.
- **Settings injection.** `setup.sh` writing any key other than the one entry it adds, or removing
  or reordering an entry that was there before.
- **A hook that holds when it should not.** Any input under which a hook other than
  `stop-verifier.sh` and `ledger-stop.sh` exits non-zero, under which any hook hangs, or under
  which either of those two holds twice on one turn, since Claude Code reads a non-zero Stop hook
  as a reason to hold the reply.
- **Data leaving the machine.** Any path by which a script sends transcript content, ledger rows,
  or settings to a network destination.

Out of scope, by design:

- The style changing what a model writes. That is the product, and a reply the model shaped
  wrong is a bug report.
- The guidance files' content. They are prose the model reads, and a change to what they say
  is a design discussion.
- Claude Code itself. Report those to Anthropic.

## Release integrity

- Every release is a `katharsis--v<version>` tag on a commit that reached `main` through a pull
  request. A ruleset blocks force pushes to `main` and any update or deletion of those tags.
- CI runs the test suites, ShellCheck, `claude plugin validate --strict`, and
  `claude plugin tag --dry-run --force` on every pull request. The ruleset on `main` requires
  all four to pass.
- Every GitHub Action the repo runs is pinned to a full commit SHA, and every workflow carries an
  explicit least-privilege `permissions:` block. The repository setting requires SHA pinning.
- Pull requests come from vouched contributors only, and every path the plugin executes has code
  owners.
- Every push to `main` publishes a MOAT attestation. The [MOAT attestation](#moat-attestation)
  section below says what it covers and how to check it.

## MOAT attestation

Katharsis is a self-publishing [MOAT](https://openscribbler.github.io/moat/) registry. MOAT is a
protocol for publishing AI agent content through signed registries, and this repo runs both of its
workflows: the Publisher Action signs the content as its source repo, and the Registry Action
indexes and signs the same content as a registry. The two signatures come from two distinct OIDC
identities, one per workflow file, so every item reaches `Dual-Attested`, MOAT's highest trust
tier.

### What the publisher attestation covers

On every push to `main`, `.github/workflows/moat-publisher.yml`:

- discovers three content items: the skill `setup` under `skills/`, and the two directories
  `.moat/publisher.yml` declares: `katharsis-output-style` for `output-styles/` and
  `katharsis-styles` for `styles/`
- computes one SHA-256 content hash per item over every file in that item's directory, using
  MOAT's normative
  [`moat_hash.py`](https://github.com/OpenScribbler/moat/blob/main/reference/moat_hash.py)
  algorithm
- signs each hash with Sigstore keyless signing, where the identity is the GitHub Actions OIDC
  token for this repo and workflow, so the repo holds no signing keys
- records each signature in the [Rekor](https://rekor.sigstore.dev) public transparency log, which
  no one can edit, and writes the hash, the Rekor log index, and the commit SHA per item into
  `moat-attestation.json` on the `moat-attestation` branch

### What the registry manifest adds

`.github/workflows/moat-registry.yml` runs after every Publisher Action run and on a daily
schedule. It reads `.moat/registry.yml`, verifies the publisher's Rekor entries, signs each
content hash again under its own OIDC identity, and publishes a signed `registry.json` to the
`moat-registry` branch at the `manifest_uri` a client adds:

```
https://raw.githubusercontent.com/OpenScribbler/Katharsis/moat-registry/registry.json
```

The manifest carries `self_published: true`, because the same repository is publisher and
registry. Self-publishing proves integrity and tamper evidence through two independent OIDC
identities, and it does not prove organizational independence: one account with push access to
this repo sits behind both workflows, and a conforming client surfaces the `self_published` flag
so you can weigh that. A conforming client also surfaces the trust tier before install and fails
an install whose bytes do not hash to what was signed.

### What it does not cover

- `scripts/`, `hooks/`, `cli/`, `bin/`, `tests/`, and `docs/` are not attested items, because MOAT's
  content type registry has no type for them. The `katharsis--v<version>` tag, the ruleset on
  `main`, and CI are the integrity story for the whole tree, and a Claude Code install copies the
  whole tree.
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
python3 moat_hash.py styles     # moat_hash.py is in the moat repo under reference/
```

Confirm the Rekor entries: fetch
`https://rekor.sigstore.dev/api/v1/log/entries?logIndex=<rekor_log_index>` and compare its payload
hash against the SHA-256 of `{"_version":1,"content_hash":"<content_hash>"}`. Each item has two
entries, one index in `moat-attestation.json` and one in `registry.json`, over the same payload.
The [MOAT self-publishing guide](https://openscribbler.github.io/moat/guides/self-publishing/)
carries the full five-step verification, including `cosign verify-blob` for the manifest
signature.

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
