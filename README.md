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

**The rules.** Four files under `rules/`, imported through one loader.

| File | Governs |
|---|---|
| `writing.md` | What to say and in what order: the finding first, evidence beside the claim, reference codes, one term for one thing |
| `technical-english.md` | The sentences themselves: active voice, one idea, 25-word cap, no figurative language |
| `git-writing.md` | Commit messages, PR bodies, review comments, and how repo conventions override all three |
| `questions.md` | The shape of a question an assistant asks you, and the rule that one question carries one decision |

**The detector.** `scripts/detect-prose.sh` counts all eleven failure modes in your transcripts with
no model in the loop. It reads your session logs, reports a count and a corpus size per rule, and
exits nonzero when it cannot find the logs rather than reporting silent zeros. It runs on its own,
without Claude, which is also how you check the rules against a corpus that is not the author's.

**The audit.** A skill that runs the detector, rewrites the counts inside the rule text, pulls your
own offending sentences into before/after pairs, and proposes rules the eleven do not cover. Rule
proposals arrive with an evidence line and require your approval, because a rule needs a real pattern
behind it and not three annoying messages.

**The memory audit.** Assistant memory stores grow entries that are written far more often than they
are read. The audit inventories yours, hands you a checklist built from each entry's own one-line
description, and offers three exits: promote what earns it into a standing rule, delete the rest with
a rollback path, or turn the memory feature off.

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

Or install by hand: copy `rules/` to `~/.claude/katharsis/` and add one import line to your
`AGENTS.md` or `CLAUDE.md`:

```
@~/.claude/katharsis/loader.md
```

The rule files carry `{{PLACEHOLDER}}` markers. `rules/placeholders.yaml` lists all five, what each
one asks, and which of them setup reads from disk instead of asking. Substitute them yourself if you
install by hand.

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

## License

MIT
