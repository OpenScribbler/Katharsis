---
name: katharsis-audit
description: Measure the installed Katharsis rules against the user's own transcripts. Runs the detector, rewrites the reference counts through scripts/audit-rewrite.sh, builds before/after pairs from the user's own prose, proposes rules the eleven do not cover, and audits the assistant memory store through scripts/memory-inventory.sh. Use when the user asks to audit, measure, or re-measure their writing rules or their memory store.
---

# katharsis-audit

The rule files installed by `katharsis-setup` carry the reference audit's counts, labelled as
such. This skill replaces them with counts measured on the user's own transcripts, and it
carries the parts no script can do: the before/after pairs, the gated rule proposals, and the
memory audit's judgment calls. The deterministic work belongs to three scripts.
`scripts/detect-prose.sh` counts, `scripts/audit-rewrite.sh` rewrites, and
`scripts/memory-inventory.sh` reads and archives the memory store.

Write nothing until the confirmation gate in step 4. The detector, the `check` mode, and every
memory-inventory mode except `archive` are read-only, so run them freely.

## 1. Locate the Katharsis root

The root is the directory holding `rules/` and `scripts/`. When this skill runs from an
installed plugin, that is `${CLAUDE_PLUGIN_ROOT}`. When it runs from a checkout, it is two
directories above this file.

## 2. Confirm the install

The audit edits installed rule files, default `~/.claude/katharsis`. When that directory does
not exist and the user names no other, stop and point them at the `katharsis-setup` skill,
because there is nothing to rewrite.

## 3. Measure

Run the detector and save its output, because `audit-rewrite.sh` reads it as a file:

```
scripts/detect-prose.sh > <temp file>
```

`--root` defaults to `~/.claude` and `--days N` narrows the window; start with all
transcripts unless the user already named a window. A nonzero exit means the corpus is
unmeasured, not clean, so show the `NOT FOUND` lines verbatim and stop.

The detector's closing lines ask for a spot check. Do it: pull two flagged sentences from the
transcripts under `<root>/projects`, confirm each is a real hit, and say so. A detector
miscounting on this corpus is worth knowing before its numbers enter the rule files.

Then resolve the contract without writing:

```
scripts/audit-rewrite.sh check --counts <temp file> --dir <install dir>
```

Show the user each measured count beside the reference count it would replace, and the
planned rewrites the check prints. On a nonzero exit, show its stderr verbatim and stop,
because a failed anchor means the installed files and the contract disagree.

## 4. Ask, confirm, then apply

Ask in prose, one decision per question, the whole set in one round:

- **The window**: keep the measured window, or re-run the detector with `--days N`.
- **The rewrite**: apply the planned rewrites to the installed rule files.
- **Pairs** (step 5) and **derivation** (step 6): both are opt-in, and stopping after the
  rewrite is a supported outcome.
- **The memory audit** (step 7): also opt-in, and independent of the prose audit.

Proceed only on an explicit yes, then run:

```
scripts/audit-rewrite.sh apply --counts <temp file> --dir <install dir>
```

On any nonzero exit, show its stderr verbatim and stop. A later re-audit is safe, because
every anchor also matches its own measured form. The script saves each file as it read before
this audit under `<install dir>/.katharsis-displaced/`, so the reference counts stay
recoverable, and it updates the install manifest so the rewritten files stay Katharsis's.

## 5. Pairs

The detector reports counts, not sentences, so pull the sentences yourself. For each rule
that fired, search the transcripts for the pattern its `method` in
`rules/audit-numbers.yaml` describes, and take up to two sentences the assistant actually
wrote. Propose a rewrite for each. Never assert the rewrite is better: show before and after,
and the user accepts, edits, or drops each pair.

Write the accepted pairs to `<install dir>/examples.md`, grouped by rule, after the user
confirms the file and its contents. Then run
`scripts/setup-rules.sh reseal --dest <install dir> --note "accepted pairs"`, which records the
new file as content the user owns so an uninstall reports it and keeps it. The result is a reference set whose "before" side is the
user's own prose. The reference audit's pairs stay in the `writing-examples` skill, so the
two sets sit side by side and neither overwrites the other.

## 6. Derivation

Proposing a rule is judgment, so this step wants Claude Fable or Opus, with Sonnet as the
floor and Haiku excluded. When the session model is below the floor, say so and skip this
step rather than producing weak proposals.

Sample assistant messages across the corpus and look for a failure mode the eleven rules do
not name. The gate is distinct surface forms, not hit count: a pattern expressed one or two
ways is an annoyance, and a pattern the assistant keeps reinventing new phrasings for is a
rule. Every proposal ships with an evidence line stating its hit count, its distinct-form
count, and the corpus size, plus two before/after pairs and an `unconfirmed` marker.

A proposal enters the installed `writing.md` only on explicit approval, appended as the next
numbered rule with its evidence line and marker intact. A declined proposal is dropped
without record.

After appending an approved rule, run
`scripts/setup-rules.sh reseal --dest <install dir> --note "derived rule approved"`. The reseal
saves the file as it read before the append and brings the manifest's hash back in step. Skip
it and the manifest still holds the pre-append hash, so an uninstall reads the approved rule as
the user's own edit and keeps the whole rule file for ever.

## 7. The memory audit

`scripts/memory-inventory.sh` does all the reading. `--root` defaults to `~/.claude`, entries
live under `projects/*/memory/`, and `--project SLUG` narrows to one project. Offer the four
exits and let the user pick per entry; mixing exits in one pass is normal.

- **Review**: run `list` and hand its lines over as a keep-or-delete checklist. Each line
  already carries the entry's own description, size, and link degrees, so no model reading is
  needed.
- **Promote**: for an entry the user wants as a standing rule, draft the rule in the voice of
  their memory file, show the draft and the destination, and write it only on yes. The
  destination is `~/.claude/katharsis/promoted.md`, which `loader.md` imports, never their
  memory file itself. The rule reads the same either way, and keeping it here means the memory
  file holds one delimited block instead of entries accumulating through it with every audit.
  `scripts/uninstall-rules.sh` reports and keeps `promoted.md` once anything has been promoted
  into it, because those rules are the user's own.
- **Purge**: run `impact --delete NAME...` first, which writes nothing and names every link a
  surviving entry would lose. Then, on an explicit yes, run
  `archive --delete NAME... --to DIR` with an empty destination directory, and show the user
  the rollback command it prints. The script refuses a delete that would dangle a surviving
  entry's link and refuses a destination that already exists; show those refusals verbatim
  rather than working around them.
- **Disable**: turn auto memory off by setting `"autoMemoryEnabled": false` in
  `~/.claude/settings.json`, or in a project's `.claude/settings.json` to disable it for that
  project alone. Never hand-edit that file. Run
  `scripts/settings-edit.sh apply --edit disable-auto-memory`, adding
  `--settings <path>` for a project file, which records whether the value was already set so a
  later uninstall reverses a Katharsis write and leaves the user's own alone. Print the command
  for the user to run when you cannot reach the settings file. Existing entries stay on disk
  either way, so the other three exits still apply to them.

## 8. Verify and hand off

Show the user which sentences the apply rewrote and the corpus line their new counts are
measured against. Tell them the rule files now state their own numbers, and that re-running
this skill later re-measures and rewrites them again, because the anchors match their own
measured forms.
