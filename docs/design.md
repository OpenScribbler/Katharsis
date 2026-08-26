# Katharsis design

The durable record of what Katharsis is, what was decided, and why. Read this before changing the
contracts in `rules/placeholders.yaml` or `rules/audit-numbers.yaml`, because both are depended on by
code that does not exist yet.

## The problem

A style guide for an AI assistant is usually taste written down, and it fails the same way every
time: the reader cannot tell which rules earn their place, so the whole set gets ignored or followed
mechanically. The rule set Katharsis packages avoided that by starting from measurement. One reader
audited 6,841 messages an assistant had written to them over three months, asked what actually cost
reading time, and kept eleven failure modes with a count behind each one.

Sharing that set breaks the property that made it work. A stranger who installs it inherits eleven
conclusions and none of the evidence, and their assistant fails in a different distribution: heavy
announced comprehension and no punctuation problem, or tables everywhere and no hedging. The counts
in the text become claims about someone else's corpus.

Katharsis resolves that by shipping the rules and the method that produced them, so an installer can
replace borrowed evidence with their own.

## What it ships

Four deliverables, all built, plus the reference before/after pairs in `skills/writing-examples/`.

| Deliverable | State | What it does |
|---|---|---|
| The rule set | Built | Three rule files plus a loader, carrying five placeholders and two machine-readable contracts |
| The detector | Built | `scripts/detect-prose.sh`, counts all eleven failure modes in the installer's transcripts with no model in the loop |
| The setup skill | Built | Discovers what it can on disk, asks for the rest, substitutes placeholders, writes the files, appends one import line |
| The audit skill | Built | Drives the detector, `scripts/audit-rewrite.sh`, and `scripts/memory-inventory.sh`, and carries the pairs, the gated rule proposals, and the memory audit's four exits |

## Decisions

D1 - **A stranger installs the rules, the audit, and the method, not one of the three** - the rules
give a working default on install day, the audit replaces the borrowed counts with measured ones, and
gated derivation lets the installer's corpus add a rule the eleven do not name. Shipping only the
rules makes the provenance a claim about someone else. Shipping only the method leaves an empty file
on install day.

D2 - **The audit is opt-in, and base-only is a supported outcome** - an installer who wants the
defaults and nothing else keeps the reference counts, clearly labelled as the reference audit's.
Nothing degrades and no step is skipped.

D3 - **The counts stay in the prose as reference values rather than becoming empty holes** - a rule
whose evidence sentence reads `{{COUNT}}` is unreadable before setup runs, and these files are read
by both a person and an agent. `rules/audit-numbers.yaml` names the sentence holding each number, so
the audit rewrites prose it locates rather than filling a template.

D4 - **First person stays in `writing.md`** - the file is the installer's own standing instruction to
their assistant, and lines like "any work you leave undone lands on me" lose their force in the third
person. Only the reader's name is substituted, which makes the setup step necessary rather than
optional.

D5 - **The repo is a plain public repo that is also a Claude Code plugin marketplace** - `.claude-plugin/`
holds `marketplace.json` and `plugin.json`, so `/plugin marketplace add` works while the repo stays
readable to someone who uses neither Claude Code nor a package manager. A plugin cannot merge text
into a user's memory file declaratively, so the writing into `AGENTS.md` is the setup skill's job.

D6 - **The derivation gate is distinct surface forms, not hit count** - two of the eleven rules came
from patterns that fire in single digits on the reference corpus, and both are rules the author
extended rather than dropped. A frequency threshold would have deleted them. What separates a real
failure mode from an isolated annoyance is how many different ways the model expresses it, which the
rule set already states as its own evidence: 73 messages announcing comprehension in 67 phrasings.

D7 - **The audit never asserts that a rewrite is better** - it flags a sentence and proposes a
replacement, and the installer accepts or edits. The reference pairs had a human judge, and nothing in
a stranger's transcripts can stand in for them.

D8 - **The memory audit belongs here, because of the promote path** - inventorying and purging a
memory store is setup hygiene and fits an existing setup-audit tool. Promoting a memory into a
standing rule is a writing decision, and it is the offering that makes the memory store part of the
same system as the rule files.

D9 - **The rule-derivation pass needs a capable model; the detector needs none** - detection is
deterministic and runs in a shell. Proposing a rule from evidence is judgment, so it wants Claude
Fable or Opus, with Sonnet as the floor and Haiku excluded. An installer restricted to Sonnet gets
full weighting and pairs, and weaker proposals. That is documented degradation, not a blocker.

D10 - **Every script ships with tests that assert planted outcomes** - each script under `scripts/`
has a test file under `tests/` that runs it as a black box: build a synthetic corpus or workspace
where every expected hit was planted deliberately, run the script, and assert the exact counts,
output lines, and exit codes. Failure paths are tests too, because the fail-loudly requirement is a
behavior a refactor can silently drop. A test that only checks the script runs proves nothing and
does not count. Skill prose is exempt, because a SKILL.md has no executable behavior to assert; the
deterministic work a skill delegates to a script is where its tests live. Tests run with
`tests/run-tests.sh` and must pass before a slice is committed.

D11 - **The audit swaps whole sentences rather than the digits inside them** - a rule that reads "In
the reference audit, 675 messages opened by narrating" attributes its number to a named corpus.
Replacing 675 with the installer's count leaves that attribution in place and credits their own
measurement to a stranger's audit. Each numbered rule therefore carries a `measured` template that
restates the sentence in the installer's own terms, and the count and the attribution move together.

D12 - **The archive refuses a delete that would dangle a surviving entry's link** - the inventory
reads every link before anything moves, so the archive mode stops and names the referring entries. A
link that already dangles is reported and never blocks, because the delete did not cause it. An entry
whose frontmatter does not parse is counted and reported, because one malformed file must not hide
the other 167.

D13 - **The reference pairs name the reader as "the reader" and carry no placeholder** - setup
substitutes only `rules/*.md`, so a `{{READER_NAME}}` inside `skills/writing-examples/` would survive
install as a literal. The pairs keep the reference audit's counts under the same "reference audit"
label the rule files use. Ticket keys, repo paths, and product names in the pairs are neutral
stand-ins, and the "before" text is otherwise verbatim, because the rewrite is the evidence.

## The rule set

Three files under `rules/`, imported through `rules/loader.md`.

| File | Governs |
|---|---|
| `writing.md` | What to say and in what order: the finding first, evidence beside the claim, reference codes, one term for one thing, and the shape of a question the assistant asks the reader. Eleven numbered rules. |
| `technical-english.md` | The sentences: active voice, one idea, a 25-word cap, no figurative language, a three-word noun-cluster cap |
| `git-writing.md` | Commit messages, PR bodies, review comments, and the lookup order that lets a repo's own conventions override all three |

Precedence runs `writing.md` over `technical-english.md`, with `git-writing.md` winning for git
destinations and a repo's own stated convention winning over everything.

### The placeholder contract

`rules/placeholders.yaml` is the interface between the rule files and the setup skill. Each entry
names the placeholder, the question it answers, whether it is required, which files it appears in,
and a `discoverable` field listing paths where setup should look instead of asking.

Five placeholders: `READER_NAME`, `MEMORY_FILE`, `DESTINATIONS`, `HOUSE_STYLE_NOTE`, and
`REPO_CONVENTION_NOTE`. The last two default to an empty string, which leaves their sections stating
the general rule with no specific case attached.

Setup must verify that no `{{` remains after substitution. A consistency check over the rule files and
this contract should report zero undeclared placeholders, zero unused declarations, and no
file-location mismatches.

### The audit contract

`rules/audit-numbers.yaml` is the interface between the rule files and the audit skill. It opens with
a `corpus` block carrying the corpus size and the two sentence swaps that state whose audit produced
the counts, then one entry per rule carrying an `id`, a human-readable `name`, a `detector` id, a
prose `method`, the `file` the number lives in, and one of two anchors.

Five rules state a number today, and each pairs a `sentence` anchor with a `measured` template. The
other six carry `append_after`, which names the sentence a measured count is appended after. Every
rewritten number arrives with the corpus size that produced it, which is why `corpus` is a separate
block rather than a per-rule field.

Anchors match whitespace-normalized text, because the rule files hard-wrap and most anchors cross a
line break. Each anchor also matches its own already-measured form, so a second audit rewrites the
first audit's numbers rather than reporting a missing anchor. An anchor matching zero times or more
than once fails the run before any file is written.

## The detector

One shell script, eleven detectors, no model. Each detector reduces a rule to something countable in
the installer's session transcripts.

| Rule | Detector id | Method |
|---|---|---|
| R1 | `r1-unasked-status` | Assistant reports a build, test, lint, or gate result while the preceding user turn contains none of those words |
| R2 | `r2-comprehension` | Phrase family for announced comprehension, reporting hits and distinct surface forms |
| R3 | `r3-hedge-stack` | Two or more stacked hedges in one clause |
| R4 | `r4-opening-narration` | First non-empty line announces an intended action rather than stating a result |
| R5 | `r5-uncoded-list` | Three or more list items in a message carrying no reference code |
| R6 | `r6-buried-question` | Message contains a question mark and the last non-empty line does not |
| R7 | `r7-dash` | Em dashes and mid-sentence connector colons |
| R8 | `r8-evidence-section` | A heading matching Evidence or Verification, which separates evidence from its claim |
| R9 | `r9-vague-quantifier` | A vague quantifier before a countable noun, plus adverbs propping up weak verbs |
| R10 | `r10-negation-first` | The "X isn't Y, it's Z" construction |
| R11 | `r11-synonym-drift` | Synonym clusters for one concept, reporting statements and distinct phrasings |

Two requirements on the script. It reports a count and the corpus size together, because a count
without its denominator cannot be compared to the reference audit's. It fails loudly with a nonzero
exit and explicit not-found lines when it cannot locate session logs, rather than reporting zeros that
read as a clean corpus.

R2 and R11 report two numbers each, hits and distinct surface forms, because D6 makes the form count
the one that gates derivation.

## The audit

Three tiers, each matched to what its evidence supports.

1. **Weighting.** Run the detector, report per-rule frequency against the corpus size, and rewrite the
   five rules that state a number. The six with `append_after` get a measured count appended.
   `scripts/audit-rewrite.sh` does all of it, so this tier needs no model, and it is the whole audit
   for an installer who stops here.
2. **Pairs.** Pull the sentences the detectors flagged, propose a rewrite for each, and present them
   for acceptance or editing under D7. The result is a reference set the installer recognizes, because
   the "before" side is their own prose.
3. **Derivation.** A sampled pass over the installer's assistant messages looks for a failure mode the
   eleven rules do not name. A proposal ships with its distinct-form count, two pairs, and an
   unconfirmed marker, and enters the rule file only on explicit approval.

## The memory audit

An assistant memory store accumulates entries written far more often than they are read. The audit
inventories the store, then offers four exits:

- **Promote.** Turn an entry that has earned it into a standing rule in the memory file, which is the
  offering D8 rests on.
- **Review.** Hand over a checklist built from each entry's own frontmatter description, with a keep
  or delete mark per line. No model call is needed, because the description field is already a
  one-line summary written when the entry was created.
- **Purge.** Delete with an archive move and a named rollback path.
- **Disable.** Turn the memory feature off in settings.

Entries cross-reference each other with wiki-style links, so any delete path has to resolve or report
the links left dangling in the survivors. A purge that silently breaks references is worse than no
purge.

`scripts/memory-inventory.sh` carries every part of that with no model in the loop. Its `list` mode
prints one line per entry with the entry's own description, its size, and how many links point in and
out, which is the checklist Review hands over. Its `links` mode marks each link exact, normalized, or
dangling. Its `impact` mode names the links a proposed delete would break and writes nothing. Its
`archive` mode moves the entries, saves the index as it was, prunes the index lines that named them,
and prints the command that puts everything back.

A link resolves to a filename first, then to a filename with case and separators folded, because the
store's own links disagree with its filenames on both. In the live store of 168 entries, 79 links
resolve exactly, 35 resolve only after folding, and 19 resolve to nothing.

## Distribution

The repo is the unit of distribution and carries three paths.

- **Manual.** Copy `rules/` and add one import line. Works anywhere, including tools that are not
  Claude Code.
- **Claude Code plugin.** `/plugin marketplace add` followed by `/plugin install`, then the setup
  skill writes the files.
- **Signed registry.** `.github/workflows/moat-publisher.yml` is the MOAT Publisher Action, which
  signs each content item with Sigstore keyless OIDC on push and writes attestations to a
  `moat-attestation` branch. It discovers content from the canonical root directories `skills/`,
  `agents/`, `rules/`, and `commands/`, which this layout already uses, so no discovery config is
  needed. It exits nonzero on a private repository, so the repo must be public before the workflow
  can pass, and the trigger's branch list must match the repo's default branch name.

A cross-tool registry that installs the same rules into Cursor, Gemini CLI, Copilot, and others is a
later step, gated on testing the registry content end to end before anyone else consumes it.

## Rejected alternatives

- **A Claude Code plugin as the only shape.** Nothing in a plugin manifest targets a user's memory
  file, so the merge has to happen in a skill either way, and a plugin-only repo is unreadable to
  anyone outside Claude Code.
- **A shell script that conducts the setup interview.** The interesting answers, such as where the
  installer's glossary and PR template live, are findable on disk, so a prompt that asks for them is
  worse than an agent that looks.
- **A frequency threshold as the derivation gate.** See D6. It deletes two rules the reference audit
  kept.
- **Full derivation, where the audit writes proposed rules directly into the file.** A thin corpus
  produces a confident bad rule, and the approval step is the only place a human judge enters the
  process.
- **Neutralizing the first person to "the reader".** See D4.

## Open items

None. Publishing needs the repo public under the `OpenScribbler` org and the `moat-publisher.yml`
branch trigger matched to `main`, both covered in Distribution.
