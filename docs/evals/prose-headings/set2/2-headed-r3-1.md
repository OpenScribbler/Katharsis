Yes, it already captures them: `ledger-stop.sh` detects codes by their shape, with no list of allowed codes, so a code you invent gets recorded like any stock code, just tagged `known: false`.

## How it works

The pattern at `scripts/ledger-stop.sh:89-91` matches 1 to 4 capital letters, a number, and a separator (`-`, `—`, `–`, or `:`) at the start of a line. The `##` heading above the code and the first sentence under that heading get saved with it, so the definition section you write for an invented code is stored alongside it. `/kref` lists stock codes first, and invented ones still turn up in lookups. `tests/test-ledger.sh:103-104` covers this with an invented code, `Z2`, and the suite passes 63 of 63 tests. The copies in `~/.claude/katharsis` and `katharsis-live` are identical, both at commit `12fa179`.

## Caveats

C1 - **Only the coded form gets captured** - "wave 2", "Phase B", a lowercase code, or one longer than 4 letters won't match. The output style's rule to define a new code "in the form above" is what keeps a label like that recordable, for example `WV2 - **claim** - evidence`.

C2 - **Only definitions get recorded** - the pattern needs the code at the start of a line, so a mention like "do NA1" in a sentence is skipped.
