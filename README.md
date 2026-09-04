# Katharsis

**A Claude Code output style that classifies each message you send and shapes the reply to fit it.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/OpenScribbler/Katharsis/badge)](https://scorecard.dev/viewer/?uri=github.com/OpenScribbler/Katharsis)

A status check, an approval, a bug report, and a request for a diagnosis each want a different
reply. Claude Code answers all four with the same shape: a paragraph of narration, the answer
somewhere in the middle, and an offer at the end. Katharsis makes the model classify your message
into one of 11 exchange types before it writes, read a guidance file for that type, and shape the
reply to it: what opens the reply, what stays out, and how long it may run.

## What changes in your replies

- **The answer opens the reply.** Every type's guidance puts the finding, the result, or the state
  on the first line, and the reasoning after it.
- **The reply is sized to the ask.** A four-word status check gets a sentence and the one next
  step. A request for a diagnosis gets room to argue. Each type carries its own ceiling, and a
  reply that runs long because the subject felt rich is the failure the ceilings exist to stop.
- **Every item you might refer back to carries a code.** Findings, decisions, risks, actions taken,
  and next actions each get a code such as `F1` or `NA2`, numbered continuously through the
  session, so "do NA2" and "more on F3" are complete instructions.
- **Decisions come back to you as questions.** A reply that needs your input ends with a numbered
  question round, one decision each, options inside the question, and a recommendation on every
  one.
- **The codes survive the session.** A Stop hook records every coded item to a ledger on disk, and
  `kref` reads them back, so `F3` still resolves after a context compaction or in the next
  session.

## Install

```
/plugin marketplace add OpenScribbler/Katharsis
/plugin install katharsis@openscribbler
```

Then, in a Claude Code session:

```
/katharsis:setup
```

Setup does the one thing a plugin cannot do for itself. The style has the model run one script
per turn, and in default permission mode that Bash call prompts on first use in every session, so
setup adds one entry to `permissions.allow` in `~/.claude/settings.json`:

```
Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)
```

It writes nothing else outside `~/.claude/katharsis-data/`. The same script runs from a terminal as
`~/.claude/katharsis/scripts/setup.sh`, and `--dry-run` prints the change without writing it.

Last, pick the style. Open `/config`, choose Output style, and pick one of the two:

| Style | What it is |
|---|---|
| `katharsis:Katharsis` | The style alone. Claude Code's built-in software-engineering instructions are dropped, which is the default for any custom output style. |
| `katharsis:Katharsis coding` | The same style with those built-in instructions kept. |

The two share one body, and a test holds them identical below the frontmatter. `/config` saves
the choice to `.claude/settings.local.json` in the current project. Until you pick one, the
per-turn and Stop hooks stay silent and write nothing. The session-start hook runs regardless:
it makes the symlink, creates the data directory, and prints one line asking for setup until
setup has run.

### Requirements

Claude Code, bash, and python3. The routing script and the session-start hook are plain bash, so
the style works without python3. The two Stop hooks and `kref` shell out to python3 for JSON, so
without it the ledger is not written.

## How it works

1. **You send a message.** A UserPromptSubmit hook reads which output style is active and, when it
   is Katharsis, prints one reminder line into the model's context along with the next free code
   numbers from the ledger. Claude Code reinforces its built-in styles every turn and never a
   custom one, so this line is what keeps the style from fading over a long session.
2. **The model classifies the message** with the cue table in the style, then runs
   `scripts/katharsis-exchange-style.sh <type>`. The script prints the guidance file for that type,
   so running it is the read, and stamps the type for the Stop hook. It never classifies; that
   judgment stays with the model. An unknown type exits non-zero and prints the valid set.
3. **The model writes the reply** under that file's Shape, Ceiling, and Verification sections.
4. **Two Stop hooks run.** One checks the stamp and, when a turn skipped the classification step,
   appends one JSON line to `telemetry/gate-misses.jsonl` with no message text. The other parses
   every coded item out of the reply and writes it to `ledger/<project>/<session>.jsonl`. Neither
   hook ever blocks a reply or asks for a rewrite: the guidance shapes the reply before it is
   written, and the hooks count and record afterward.

Every hook exits 0 on every path. A hook that fails costs you a ledger row, never a turn.

### The exchange types

| Type | The message looks like | Ceiling |
|---|---|---|
| `factual-question` | "is X shipped?", "where does Y live?", "do these two rules conflict?" | 150 words |
| `status-and-resume` | "how's it going?", "let's continue", a handoff file, "773 merged" | 250 |
| `approval` | "1. a", "go ahead", "sounds good", "go ahead, but hold off on the second part" | 250 |
| `thinking-out-loud` | "let's discuss", "does that make sense?", "can we do X?" | 350 |
| `diagnosis` | "why does this happen?", "is this bad practice?", "what do you think?" | 500 |
| `redirect` | "do it this way instead", "stop hedging", "I deleted it on purpose" | 250 |
| `broken-report` | "this reply is messed up", "the hook didn't fire", "I got 7, not 5" | 250 |
| `work-request` | "update the changelog", "run the tests", "open a PR for both fixes" | 400 |
| `canned-review` | A script-sent review prompt naming a diff and a method | 300 |
| `harness-probe` | "answer in one line", "reply with only the token, or NONE" | the named form |
| `default` | Three or more types, a greeting, a pasted fragment | 250 |

Ceilings cover prose only. Coded items are exempt, because their count tracks the work rather
than the writing, and when your message sets an agenda every item on it gets a line. The
[styles/README.md](styles/README.md) has the shared rules, and each `styles/<type>.md` has that
type's cues, shape, ambiguities, and worked examples.

### Reference codes

Sixteen codes, each with a group header and one form:

```
F1 - **the claim** - the evidence, in the same sentence
```

`F` findings, `D` decisions, `A` assumptions, `R` risks, `C` caveats, `AT` actions taken, `V`
verified, `NA` next actions, `B` blocked, `MV` your move, `W` waiting, `X` excluded, `S` state,
`T-O` trade-offs, `E` errata, `Q` questions. Numbers never restart within a session. The model may
define a new code when none fits, and the ledger records it either way, because detection is by
shape rather than by an allowlist.

### kref

`kref` reads the ledger back. Inside Claude Code, bash mode runs it in your shell with no model
turn, once `kref` is on your PATH (the symlink command below does that):

```
! kref            this session's items, grouped by code, titles only
! kref F3         one item
! kref F          every F item this session defined, else every one on record
! kref -f NA      the same with each item's summary
! kref-h          the same result as an HTML page, with tabs, filters, and sorting
```

From your own terminal the plugin's `bin/` is not on PATH, so link the wrappers once:

```
ln -s ~/.claude/katharsis/bin/kref ~/.local/bin/kref
```

A query this session does not answer widens to every session on record, since the codes you ask
about by name are usually the ones that have left context.

## Where things live

| Path | Holds | Lifetime |
|---|---|---|
| `~/.claude/katharsis` | A symlink to the plugin's install directory, remade at every session start | Follows the plugin |
| `~/.claude/katharsis-data/ledger/` | One JSONL file per session, keyed by project | Yours; outlives the plugin |
| `~/.claude/katharsis-data/telemetry/` | `gate-misses.jsonl`, one line per skipped classification, no message text | Yours; outlives the plugin |
| `~/.claude/katharsis-data/kref-out/` | The HTML pages `kref-h` renders | Yours; outlives the plugin |

The symlink exists because a marketplace install lands in a versioned cache directory that moves
on every update, and neither the style file nor the model's Bash calls can expand the variable
that names it. The data directory is separate because that cache is read-only and replaced on
update. `KATHARSIS_DIR` and `KATHARSIS_DATA` override the two paths.

## Uninstall

```
/plugin uninstall katharsis@openscribbler
```

Then open `/config` and pick another output style, and remove the `permissions.allow` entry
setup added to `~/.claude/settings.json`. The symlink at `~/.claude/katharsis` and everything
under `~/.claude/katharsis-data/` stay behind: the ledger is yours to keep or delete.

## Upgrading from 0.2.x

0.2.x installed writing rules into your memory file through a managed block, and 0.3.0 removes
the rules and their uninstaller. Run 0.2.1's `scripts/uninstall-rules.sh apply` before
upgrading, which removes the block, the rule files under `~/.claude/katharsis/`, and any
settings edits it recorded. It refuses to delete a rule file you edited, a `promoted.md` with
content, or anything the audit wrote, and names each one it leaves. Read what remains under
`~/.claude/katharsis/` and remove the directory yourself, because it has to be gone before the
0.3.0 symlink can take its place, and the session-start hook says so when it is not. [CHANGELOG.md](CHANGELOG.md) has the
full list of what 0.3.0 removed.

## What's included

| Path | Kind | What it does |
|---|---|---|
| `output-styles/katharsis.md`, `katharsis-coding.md` | Output styles | The classification table, the reference codes, the question form. One body, two frontmatters. |
| `styles/*.md` | Guidance files | One per exchange type: cues, ceiling, shape, ambiguities, verification, examples. `README.md` holds the shared rules. |
| `scripts/katharsis-exchange-style.sh` | Script | Prints a type's guidance file and stamps the type. The model runs it once per turn. |
| `scripts/turn-reminder.sh` | Hook | UserPromptSubmit: the per-turn reminder, the active-session marker, the next free code numbers. |
| `scripts/stop-classify.sh` | Hook | Stop: consumes the stamp, records a miss to telemetry, never blocks. |
| `scripts/ledger-stop.sh` | Hook | Stop: writes every coded item in the reply to the ledger. |
| `scripts/session-link.sh` | Hook | SessionStart: remakes the `~/.claude/katharsis` symlink and asks for setup once. |
| `scripts/kref.sh`, `bin/kref*` | Script | Reads the ledger back in the terminal or as HTML. |
| `scripts/setup.sh`, `skills/setup/` | Setup | Adds the one permission entry and names the two styles. |
| `hooks/hooks.json` | Manifest | Wires the four hooks. |

## Provenance

This repo is a self-publishing [MOAT](https://openscribbler.github.io/moat/) registry, and every
item it ships is `Dual-Attested`, MOAT's highest trust tier. On every push to `main`, one workflow
hashes the setup skill, the output styles, and the guidance files, signs each hash with Sigstore,
and records it in the Rekor public transparency log; a second workflow verifies those entries,
signs the same hashes under its own identity, and publishes a signed registry manifest. The repo
holds no signing keys. [SECURITY.md](SECURITY.md#moat-attestation) says what the attestations
cover, what they leave out, and how to run the checks yourself.

## Why I created Katharsis

Katharsis started as a set of writing rules loaded from a memory file, with an audit that measured
them against my own transcripts. The rules worked less than the measurement said they should. A
60-day audit of my sessions found that the replies that succeeded were the ones that opened with
the answer and stayed under the length the question warranted, and that neither property comes
from a rule about sentences. It comes from knowing what kind of exchange you are in. A pass over 13
comparable projects found none that classified the ask before shaping the reply, so that became
the product.

## Documentation

- [docs/design.md](docs/design.md) is the durable record: what was decided and why.
- [docs/evals/](docs/evals/) holds the real-path check a release has to pass, and any measurement
  made since 0.3.0.
- [CHANGELOG.md](CHANGELOG.md) lists what each release changed.
- [CONTRIBUTING.md](CONTRIBUTING.md) says how to file an issue, how to get vouched for pull
  requests, and what a pull request has to pass.
- [SECURITY.md](SECURITY.md) says what the hooks touch on your machine, how the MOAT
  attestation works, and where to report a vulnerability.

## License

[MIT](LICENSE)
