# Katharsis

Writing rules for AI assistants, kept honest by measurement against your own transcripts.

Most style guidance for AI assistants is taste written down. This one started as an audit: 6,841
messages an assistant had written to one reader over three months, read for what actually cost the
reader time. Eleven rules came out of it, each with a count behind it and real before/after pairs
from the corpus. The counts are why the rules hold.

That provenance is also the problem with sharing them. A stranger installing someone else's audit
inherits the conclusions without the evidence, and their assistant fails differently. So Katharsis
ships the rules and the audit both: install the rule set to get working defaults, then run the audit
to replace every count with one from your own transcripts, keep the rules your evidence supports, and
add the ones your corpus shows and this set does not name.

## What you get

**The rules.** Three files under `rules/`, imported through one loader.

| File | Governs |
|---|---|
| `writing.md` | What to say and in what order: the finding first, evidence beside the claim, reference codes, one term for one thing, and the shape of a question an assistant asks you |
| `technical-english.md` | The sentences themselves: active voice, one idea, 25-word cap, no figurative language |
| `git-writing.md` | Commit messages, PR bodies, review comments, and how repo conventions override all three |

**The way out.** `scripts/uninstall-rules.sh` removes what setup installed and refuses to remove
anything it cannot prove Katharsis wrote. `scripts/settings-edit.sh` makes and reverses the two
settings edits the skills offer. Both read one manifest that every write path records into.

**The detector.** `scripts/detect-prose.sh` counts all eleven failure modes in your transcripts with
no model in the loop. It reads your session logs, reports a count and a corpus size per rule, and
exits nonzero when it cannot find the logs rather than reporting silent zeros. It runs on its own,
without Claude, which is also how you check the rules against a corpus that is not the author's.

**The audit.** A skill that runs the detector, rewrites the counts inside the rule text through
`scripts/audit-rewrite.sh`, pulls your own offending sentences into before/after pairs, and proposes
rules the eleven do not cover. Rule proposals arrive with an evidence line and require your
approval, because a rule needs a real pattern behind it and not three annoying messages.

**The memory audit.** Assistant memory stores grow entries that are written far more often than they
are read. The audit inventories yours, hands you a checklist built from each entry's own one-line
description, and offers three exits: promote what earns it into a standing rule, delete the rest with
a rollback path, or turn the memory feature off. `scripts/memory-inventory.sh` does the reading, the
link resolution, and the archive move, and it refuses a delete that would leave a surviving entry
pointing at nothing.

## Install

As a Claude Code plugin:

```
/plugin marketplace add OpenScribbler/Katharsis
/plugin install katharsis@openscribbler
```

Then run setup, which asks what it cannot find on disk and writes the rules into place:

```
Set up my writing rules
```

Or install by hand: copy `rules/` to `~/.claude/katharsis/` and add one delimited block to the
top of your `AGENTS.md` or `CLAUDE.md`:

```
<!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->
@~/.claude/katharsis/loader.md
<!-- katharsis:end -->
```

That block is the only thing Katharsis ever writes into your memory file. Rules the audit
promotes go to `~/.claude/katharsis/promoted.md`, which the loader imports, so nothing
accumulates through the file you wrote yourself.

The rule files carry `{{PLACEHOLDER}}` markers. `rules/placeholders.yaml` lists all five, what each
one asks, and which of them setup reads from disk instead of asking. Substitute them yourself if you
install by hand.

## Uninstall

Setup records what it wrote in `~/.claude/katharsis/.katharsis-install.json`, and the uninstall
reads that manifest and nothing else:

```
scripts/uninstall-rules.sh plan     # names every action and every refusal, writes nothing
scripts/uninstall-rules.sh apply    # executes it
```

An install followed by an uninstall returns your memory file and your settings file byte for
byte, formatting included, when you have not edited them since the install. A file you edited
in between gets the managed content spliced out and keeps your edits.

What it will not remove, because the manifest records that Katharsis did not write it:

- A rule file you edited after the install. The hash no longer matches, so the file is yours.
- `promoted.md` once anything has been promoted into it, and any file the audit created, such
  as `examples.md`.
- A displaced file whose archived original has gone missing, because deleting it would leave
  you with nothing.
- A `katharsis:begin` block that was already in your memory file.
- A settings value that was already set before the install, such as `autoMemoryEnabled` you
  had turned off yourself.

The first three are reported and kept, and the manifest survives so a later run retries them.
The last two were yours before the install, so leaving them in place is the reversal: the run
reports them and still completes. With no manifest the script refuses outright and names what
a manual removal would touch, because a guessed uninstall is worse than none.

The two settings edits the skills offer go through their own script, so they reverse the same
way:

```
scripts/settings-edit.sh status
scripts/settings-edit.sh reverse --edit all
```

## Model requirements

The detector needs no model. The audit's rule-derivation pass reads a sample of your prose and
proposes rules from it, which is judgment work: use Claude Fable or Opus. Sonnet is the floor and
produces weaker proposals. Do not use Haiku for this pass at all.

## Where this came from

The reference audit was real, and the eleven rules are the eleven failure modes it found. Some of the
counts are large: 8,862 dashes standing in for a stated relation, 675 messages that opened by
narrating an intended action instead of stating the result, 446 statements that the checks had passed
written 60 different ways. Others are small, and small on purpose. Two of the rules came from
patterns with single-digit hit counts, which is why the audit gates rule derivation on how many
distinct surface forms a pattern takes rather than on how often it fires. One phrase 73 times is a
reader's annoyance. Seventy-three messages in 67 phrasings is a habit of the model.

The evidence-mining approach, the archive-with-rollback discipline in the memory audit, and the gates
pattern all come from [subtract](https://github.com/OpenScribbler/subtract), which audits a Claude
Code setup the same way.

## Design

[`docs/design.md`](docs/design.md) is the durable record: every decision and its reasoning, the two
machine-readable contracts the unbuilt pieces depend on, the eleven detectors, and the alternatives
that were rejected. Read it before changing `rules/placeholders.yaml` or `rules/audit-numbers.yaml`.

## Contributing

Issues are the contribution that matters most, and the templates ask for the evidence a rule or a
bug needs. Pull requests come from vouched contributors, and [CONTRIBUTING.md](CONTRIBUTING.md) says
how to get vouched and what a pull request has to pass. [SECURITY.md](SECURITY.md) says what the
scripts touch on your machine and where to report a vulnerability.

## License

MIT
