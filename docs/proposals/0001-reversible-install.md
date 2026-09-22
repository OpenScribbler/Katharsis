# Proposal 0001: A reversible install, with an optional syllago backend

> Superseded. This proposal describes the 0.2.x rules install, which 0.3.0 removed. The
> decisions it names are the 0.2.1 numbering, at the `katharsis--v0.2.1` tag; the current
> `docs/design.md` restarts at D1. It stays as the record of why the install was reversible.

Status: Parts A and B accepted and built as 0.2.x, landing as D14 through D21 in the 0.2.1
`docs/design.md`. Part C never built. Extends `docs/design.md`, and depends on D5, D8, D10,
and D12 there.

Katharsis can install itself and cannot remove itself. Every write except the memory purge is
one-way. This proposal closes that in three parts: a single delimited import block that keeps
Katharsis content out of the installer's memory file, a native manifest and uninstall script, and an
optional syllago backend for installers who want a package manager to own the bookkeeping.

| Part | Change | Depends on |
|---|---|---|
| A | One delimited import block, and every Katharsis-written rule in a Katharsis-owned file | Nothing |
| B | Atomic apply, an install manifest, and `scripts/uninstall-rules.sh` | Part A |
| C | Optional syllago backend, offered by the wizard | Parts A and B |

Part B ships whether or not Part C does. An installer with no syllago and no network still gets a
full uninstall.

## The problem

A reversibility audit of the current tree found nine defects. Two were reproduced against the live
script.

- **RV1** No uninstall path exists. The four scripts under `scripts/` install, detect, rewrite, and
  archive. `README.md` documents three install paths and no removal.
- **RV2** The install records nothing, so an uninstall cannot separate its own writes from the
  installer's. `scripts/setup-rules.sh:190` prints `import line already present` when the installer
  wrote that line themselves. Nothing on disk distinguishes that case from an append.
- **RV3** `apply` overwrites destination files with no backup. Reproduced by planting a file at the
  destination and running `apply`.
- **RV4** The failure path leaves a partially applied install behind, which the script's own header
  denies. `scripts/setup-rules.sh:158` claims that pre-validating the import target prevents this.
  Reproduced: `apply` exited 2 with `the install is incomplete` and left the broken file on disk.
- **RV5** Two settings edits run with no script behind them.
  `skills/katharsis-setup/SKILL.md:57` has the model add `"AskUserQuestion"` to `permissions.deny`.
  `skills/katharsis-audit/SKILL.md:121` has it set `"autoMemoryEnabled": false`. Both mutate global
  config with no backup and no reversal.
- **RV6** The tier-1 audit rewrites installed rule files with no way back to the reference counts.
  `scripts/audit-rewrite.sh:138` reads each original into memory and never persists it.
- **RV7** An approved derived rule enters the installed `writing.md` with no record.
- **RV8** The memory purge is reversible because it moves files rather than merging into them. The
  archive directory is its manifest.
- **RV9** The failure-path test asserts the message, not the property.
  `tests/test-setup-rules.sh:182` checks the exit code and the `UNSUBSTITUTED` line, and writes to a
  fresh destination, so it cannot observe the leftover file. D10 requires failure paths as tests,
  because fail-loudly is behavior a refactor drops silently.

## Part A: one delimited block, and Katharsis-owned rule files

### What the install writes today

The install already appends exactly one line. `scripts/setup-rules.sh` computes
`@~/.claude/katharsis/loader.md`, checks whether that line is already present, and appends it once.
The rule text itself lives under `~/.claude/katharsis/`, and `rules/loader.md` imports the three rule
files from there. The install path does not pepper the memory file.

### Where content does get peppered

The memory audit's Promote exit writes into the memory file directly.
`skills/katharsis-audit/SKILL.md:113` drafts a standing rule in the voice of the installer's memory
file and writes it there on approval. `docs/design.md:199` states the same. Each audit run can add
another entry, at whatever position the model picks, in the installer's own voice. Nothing marks
those lines as Katharsis output.

That is the write no uninstall can find. The rule text reads as the installer's own words, because
D8 makes writing it in their voice the point of the exit.

### The change

**D14 - Katharsis writes one delimited block into the memory file, and nothing else, ever.** The
block carries the import line and a comment naming the tool and the manifest path:

```
<!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->
@~/.claude/katharsis/loader.md
<!-- katharsis:end -->
```

The markers make removal an exact match instead of a guess, which closes RV2. An installer who reads
their memory file sees three lines and one owner. An installer who deletes the block by hand has
performed a complete uninstall of the memory-file side.

**D15 - Every rule Katharsis writes lands in a Katharsis-owned file that `loader.md` imports.**
Promote writes to `~/.claude/katharsis/promoted.md`. A derived rule from audit tier 3 continues to
land in the installed `writing.md`, which is already Katharsis-owned. `loader.md` gains one import
line for `promoted.md`, created empty at install so the import never dangles.

Promote keeps its behavior under D8. The rule still reads in the installer's voice, and the installer
still approves it. Only the destination changes, from their memory file to a file the manifest names.

### On writing the block at the top

Position does not change behavior. Claude Code resolves an `@` import wherever it appears in the
file, so a block at the end loads the same rules as a block at the start.

Position does change two other things. A block at the top is what a human finds first when they open
their memory file and ask what is in it. A block at the top also requires rewriting the whole file
rather than appending to it, which is the riskier byte operation.

Decided: the block goes at the top by default, and `--position end` appends instead. Consistency
across installs won the call, and a block at the top cannot be buried by rules the installer adds
later. Part B's pre-write backup makes the prepend safe, and the manifest records which position was
used so the removal is exact either way.

## Part B: native reversibility

**D16 - `apply` becomes atomic.** Substitute into a temporary directory, verify that no `{{`
survives, then move the files into place. The verification runs before anything reaches the
destination, so RV4 closes. The move can save what it displaces, so RV3 closes with it.

**D17 - `apply` writes a manifest at the destination.** `~/.claude/katharsis/.katharsis-install.json`
records what the install did and what it found already in place:

```json
{
  "version": 1,
  "installed_at": "2026-08-27T00:00:00Z",
  "dest": "~/.claude/katharsis",
  "files": [
    {"name": "writing.md", "sha256": "...", "state": "created"},
    {"name": "loader.md", "sha256": "...", "state": "displaced",
     "archived_to": "~/.claude/katharsis/.katharsis-displaced/loader.md"}
  ],
  "memory_file": {
    "path": "~/AGENTS.md",
    "block": "appended",
    "position": "end",
    "sha256_before": "..."
  },
  "settings": [
    {"path": "~/.claude/settings.json", "key": "permissions.deny",
     "op": "array_append", "value": "AskUserQuestion", "was_present": false}
  ],
  "placeholders": {"READER_NAME": "...", "MEMORY_FILE": "~/AGENTS.md"}
}
```

Three fields carry the reversibility: `state` distinguishes a file Katharsis created from one it
displaced, `block` distinguishes an append from a line already present, and `was_present`
distinguishes a settings key Katharsis added from one already set. Each is the distinction RV2 says
an uninstall cannot make today.

The audit appends to the manifest rather than writing its own store. `audit-rewrite.sh apply` saves
each pre-rewrite file under `.katharsis-displaced/` and records the swap, which closes RV6. An
approved derived rule records its own entry, which closes RV7.

**D18 - `scripts/uninstall-rules.sh` ships with `plan` and `apply` modes**, mirroring the purge's
`impact` and `archive` split. `plan` writes nothing and names every action. `apply` executes.

The refusals matter more than the removals:

- A destination file whose hash no longer matches the manifest is reported and kept. The installer
  edited it, so it is theirs now.
- An import block the manifest records as `already present` is reported and kept. Katharsis did not
  write it.
- A settings key recorded as `was_present: true` is reported and kept.
- A missing manifest stops the run. The script names what a manual removal would touch and writes
  nothing, because a guessed uninstall is worse than none.

**D19 - The settings edits move into a script.** RV5 is the highest-risk write in the product and the
only one with no deterministic engine. A `settings` mode under the uninstall script, or a small
`scripts/settings-edit.sh`, applies and reverses both edits with the manifest recording each. The
skills keep the offer and the print-for-the-user fallback, and hand the write to the script.

**D20 - The failure paths get tests that assert the property.** Per D10, `tests/test-uninstall.sh`
asserts that a refused uninstall left every file byte-identical, and `tests/test-setup-rules.sh`
gains a case asserting that a failed `apply` left the destination untouched. RV9 closes.

## Part C: syllago as an optional backend

### Why syllago fits

Syllago is a package manager for exactly this content class, and it already implements every
mechanism Part B specifies natively.

| Katharsis need | Syllago mechanism |
|---|---|
| An install manifest | `installstore.Record`, with a content hash, a library path, and placements (`cli/internal/installstore/store.go:57`) |
| Distinguish appended text from the user's own | `MechanismRuleAppend` placements carry the target path and key (`store.go:34`) |
| Remove an appended block exactly | `UninstallRuleAppend` searches the full version history, requires exactly one match, and refuses otherwise (`cli/internal/installer/rule_append.go:150`) |
| Detect a file the user edited after install | The Clean and Modified state model, with `--on-clean` and `--on-modified` flags naming each outcome (`cli/cmd/syllago/install_cmd_append.go:23`) |
| Undo an update, not just an install | `PreviousVersion` one-step rollback and `syllago rollback` (`store.go:80`) |
| Hold a file against overwrite | `Pinned` on the record |
| Verify what a registry served | MOAT trust tiers, Sigstore signatures, and Rekor lookups |

Two further points make the path cheap rather than speculative. Katharsis already publishes MOAT
attestations through `.github/workflows/moat-publisher.yml`, so the registry side exists and signs
on every push. Syllago is the reference MOAT implementation, so it consumes that output with no new
work on either side.

Syllago also closes an item `docs/design.md` defers. Its provider table maps monolithic rule files
across six tools, including `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.clinerules`, and
`.windsurfrules` (`cli/internal/provider/monolithic.go:6`). The cross-tool registry the design doc
calls a later step becomes a backend choice instead of a build.

### What Katharsis keeps either way

Placeholder substitution stays Katharsis's job. The rule files carry five `{{PLACEHOLDER}}` slots
that `rules/placeholders.yaml` declares, and setup resolves them from the installer's own disk. No
package manager can do that, because the values are per-installer and the substituted result is not
shareable content.

That fixes the division of labor. Katharsis substitutes into a local library entry, and syllago
installs and tracks that entry. Syllago models a local-library item as a record whose `Registry` is
empty, so this needs no new content type. The tracked content hash then covers the substituted copy,
which is the copy that exists on disk and the one an uninstall has to verify.

The signed registry stays useful for discovery. An installer browses and verifies the unsubstituted
rules from the MOAT registry, and installs the substituted copy from their library.

### The wizard offer

Setup gains one question, asked once, before any write:

1. **Syllago found on PATH.** Offer it as the recommended backend, and name what it adds: uninstall,
   rollback, drift detection, and install into other tools. Native stays available.
2. **Syllago not found.** Offer to install it, showing the exact command and its source. Offer the
   native path as the default. An installer who declines gets Part B and loses nothing that Part B
   covers.
3. **Either way.** Record the chosen backend in the manifest, because an uninstall must use the same
   backend the install used.

Never install syllago without an explicit yes. Never make the syllago path the only path.

**D21 - The native path is the floor, and the syllago path is an upgrade.** Every reversibility
property in Part B holds without syllago. Syllago adds cross-tool install, signature verification,
update rollback, and drift reporting.

### Constraints, stated plainly

- **Syllago is pre-1.0.** `VERSION` reads 0.14.0. Its record schema is at version 1 and can change.
  The manifest records the syllago version used, and the uninstall refuses a backend version it
  cannot read.
- **The syllago path adds a binary dependency.** That is the cost of the offer, which is why the
  native path stays the default when syllago is absent.
- **Scope needs checking.** Syllago resolves an append record's scope from the target path against
  the home and project roots. The Katharsis install is global, so the wizard must pass the home
  scope explicitly rather than rely on a project root discovered from the working directory.
- **Syllago refuses an edited target, and that is correct.** The wizard must tell the installer this
  in advance, so a refusal at uninstall time reads as the designed behavior rather than a failure.
- **Two tools must not both own the block.** The manifest names one backend per install. Switching
  backends means uninstall with the old one, then install with the new one.

## Rejected alternatives

- **Prepending the block with no manifest.** Position alone does not make removal exact. An
  installer who moves the line, or a second tool that rewrites the file, leaves the uninstall
  guessing again. The markers do the work, not the position.
- **Making syllago the only install path.** It adds a binary dependency to a repo whose manual path
  works in any tool, and it strands an installer with no network. D5 keeps the repo readable to
  someone who uses neither Claude Code nor a package manager.
- **Letting the audit keep its own backup directory.** A second store repeats RV2 at a smaller
  scale. One manifest, appended to by every write path.
- **Reversing the settings edits from the skill prose.** RV5 exists because a model writes global
  config with no engine behind it. Prose describing the reversal has the same defect.
- **Dropping Promote to avoid the peppering.** Promote is the offering D8 rests on. Part A changes
  its destination and keeps its behavior.

## Decisions taken

1. **Block position.** Top by default, `--position end` available.
2. **Promote's destination.** `~/.claude/katharsis/promoted.md`, imported by `loader.md`.
3. **Uninstall scope.** Manifest-listed files only. Anything else is reported and left alone.
4. **The settings edits.** Their own script, `scripts/settings-edit.sh`.
5. **The audit's one-way writes.** Fixed in the same pass, through `audit-rewrite.sh` and the new
   `setup-rules.sh reseal` mode.
6. **The syllago offer.** A follow-up slice, on top of a native path with tests passing.

## What Parts A and B ship

| File | State |
|---|---|
| `scripts/katharsis_manifest.py` | New. The manifest schema and the managed-block splice, shared by every writer so four scripts cannot drift. |
| `scripts/katharsis_settings.py` | New. The two settings edits and their reversals. |
| `scripts/uninstall-rules.sh` | New. `plan` and `apply`, and eleven refusals. |
| `scripts/settings-edit.sh` | New. `status`, `apply`, and `reverse`. |
| `scripts/setup-rules.sh` | Verification before any write, the managed block, the manifest, and a `reseal` mode. |
| `scripts/audit-rewrite.sh` | Saves each file as it read before the audit and keeps the manifest's hash in step. |
| `tests/test-uninstall.sh` | New. 20 cases, refusals included. |
| `tests/test-settings-edit.sh` | New. 19 cases. |
| `tests/test-setup-rules.sh` | Cases for the block, the manifest, `reseal`, and the property that a failed apply writes nothing. |

Two bugs surfaced only because the tests assert properties rather than messages. A settings edit
over a key holding a different value silently did not write, because `was_present` conflated "the
key exists" with "the key already holds our value". A second `apply` overwrote the record of which
containers the first `apply` created, so a later reversal would have left empty scaffolding behind.
