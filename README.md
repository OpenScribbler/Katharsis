# Katharsis

**A Claude Code plugin that makes Claude's answers shorter, clearer, and scannable.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/OpenScribbler/Katharsis/badge)](https://scorecard.dev/viewer/?uri=github.com/OpenScribbler/Katharsis)

After install, an answer opens with the finding, puts the evidence beside the claim, and ends
with the one question you have to decide. Findings, risks, actions taken, and next actions each
carry a short code such as `F1` or `NA2`, so you can scan a reply and refer back to any item by
its code. The filler goes: no "Great question", no "Now I understand", no narration of what the
assistant is about to do, no hedges stacked three deep.

Install gives you the rule set as it stands. An optional audit then reads your own session
history, counts how often each rule was broken, keeps the rules your history supports, and
proposes new ones from patterns it finds. You approve every proposal.

## Install

```
/plugin marketplace add OpenScribbler/Katharsis
/plugin install katharsis@openscribbler
```

Then, in a Claude Code session:

```
Set up my writing rules
```

Setup finds your memory file and repo conventions on disk, asks only what it cannot find, and
writes one managed block at the top of your `AGENTS.md` or `CLAUDE.md`:

```
<!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->
@~/.claude/katharsis/loader.md
<!-- katharsis:end -->
```

That block is the only thing Katharsis writes into a file you own. To install by hand, copy
`rules/` to `~/.claude/katharsis/`, add the block yourself, and substitute the five
`{{PLACEHOLDER}}` markers that `rules/placeholders.yaml` lists.

## What you get

| Name | Kind | What it does | How you use it |
|---|---|---|---|
| `katharsis-setup` | Skill | Discovers your setup, substitutes the placeholders, writes the rules and the managed block, records every write in a manifest | "Set up my writing rules" |
| `katharsis-audit` | Skill | Runs the detector, rewrites the counts from your logs, builds before/after pairs from your own prose, proposes rules you approve, and audits your memory store | "Audit my writing rules", "Audit my memory store" |
| `writing-examples` | Skill | Worked before/after pairs for every rule | Loads on its own when a rule leaves a call ambiguous |
| `rules/writing.md` | Rules | What to say and in what order: the finding first, evidence beside the claim, reference codes, the shape of a question | Imported by the loader |
| `rules/technical-english.md` | Rules | The sentences themselves: active voice, one idea, 25-word cap, no figurative language | Imported by the loader |
| `rules/git-writing.md` | Rules | Commit messages, PR bodies, review comments, and how repo conventions override all three | Imported by the loader |
| `scripts/detect-prose.sh` | Script | Counts the eleven failure modes in your transcripts, no model needed | `bash scripts/detect-prose.sh --days 30` |
| `scripts/uninstall-rules.sh` | Script | Reverses every write the manifest records and refuses the rest | `plan`, then `apply` |
| `scripts/settings-edit.sh` | Script | Makes and reverses the two settings edits the skills offer | `status`, `reverse --edit all` |

## How it works

1. Setup writes the rule files to `~/.claude/katharsis/` and one managed block to your memory
   file. The rule text carries the reference audit's counts, labelled as such.
2. The detector reads your session logs under `~/.claude/projects/` and reports a count and a
   corpus size per rule. It exits nonzero when it cannot find the logs, so a missing corpus never
   reads as a clean one.
3. The audit rewrites the counts inside the rule text from that run and pulls your own
   offending sentences into before/after pairs. It also proposes rules the eleven do not cover,
   and a proposal needs a measured pattern behind it and your approval.
4. The memory audit inventories your assistant's memory store. Each entry gets one of three
   exits: promote it into a standing rule, archive it with a rollback path, or turn the feature
   off.
5. The uninstall reads the install manifest and reverses only what it records.

A real detector run on the author's logs, trimmed:

```
$ bash scripts/detect-prose.sh --days 30
katharsis detect-prose
root: /home/hhewett/.claude   window: last 30 days (since 2026-07-28)
corpus: files=911 jsonl_lines=173080 assistant_messages=10007 text_blocks=10007

r2-comprehension     hits=124 forms=58
r4-opening-narration hits=441
r7-dash              hits=14174 emdash=12224 colon=1950
r9-vague-quantifier  hits=90
r11-synonym-drift    hits=565 forms=90

Every hits= value above is comparable only against this corpus line.
Spot-check at least two counts by hand before trusting any of them.
```

## Uninstall

```
scripts/uninstall-rules.sh plan     # names every action, writes nothing
scripts/uninstall-rules.sh apply    # executes it
```

The uninstall reverses only what the install manifest records and refuses the rest.
[docs/uninstall.md](docs/uninstall.md) has the details.

## Model requirements

The detector and every script need bash and python3 and no model. The audit's rule-derivation
pass reads a sample of your prose and proposes rules from it, which is judgment work: use Claude
Fable or Opus. Sonnet produces weaker proposals, and Haiku is not suitable for this pass.

## Where this came from

One audit read 6,841 messages an assistant wrote to one reader over three months and found
eleven failure modes, each with a count behind it. Those are the eleven rules. A stranger who
installs someone else's audit inherits the conclusions without the evidence, so Katharsis ships
the method as well as the rules. [docs/design.md](docs/design.md) holds the full account,
every decision, and the alternatives that were rejected.

## Documentation

- [docs/design.md](docs/design.md) is the durable record. Read it before changing
  `rules/placeholders.yaml` or `rules/audit-numbers.yaml`.
- [docs/uninstall.md](docs/uninstall.md) says what the uninstall reverses and what it refuses.
- [CHANGELOG.md](CHANGELOG.md) lists what each release changed.
- [CONTRIBUTING.md](CONTRIBUTING.md) says how to file an issue, how to get vouched for pull
  requests, and what a pull request has to pass.
- [SECURITY.md](SECURITY.md) says what the scripts touch on your machine and where to report a
  vulnerability.

## License

[MIT](LICENSE)
