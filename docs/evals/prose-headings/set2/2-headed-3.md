It already works, and it was designed to. `ledger-stop.sh` detects by shape rather than by an allowlist — `CODE_RE` takes any 1–4 character uppercase prefix plus digits, and the stock set is only a `known: true|false` field on the record, never a filter (`~/.claude/katharsis/scripts/ledger-stop.sh`, the `KNOWN` constant and the `"known": prefix in KNOWN` line).

I ran a reply through the hook defining `WV1` under a `## Wave Numbers` header. It captured `code: WV1`, `known: false`, `section: "Wave Numbers"`, and `section_note: "A wave is one batch of files rewritten together and reviewed as a unit."` — so the definition sentence rides along with the code, which is exactly what the "define it in its own section" price buys. `kref WV1` then returned it under its own header.

## Findings

F1 - **`kref` never displays `section_note`, so the definition the ledger captured is unreachable from the command** - `grep -n section_note ~/.claude/katharsis/scripts/kref.sh` returns nothing, and `--full WV1` prints the title and summary but not the defining sentence. A bespoke code a week later reads back as "WV1  Wave one covers the eight style files" with no statement of what a wave is — the one case bespoke capture exists for.

## Questions

❓ **Q1** - **Fix F1 now, or leave it?** - it is a display change in `kref.sh` only; the data is already on disk, so every ledger written so far gets the benefit retroactively.
   a. print `section_note` under the section header, once per section — cheapest, and it reads like the definition block the reply had
   b. print it only under `--full`, keeping the default terse
   c. leave it; the section header plus title is usually enough to recall the code

➡️ **a** - the note is one line per section and only present when a header had prose under it, so the default stays terse in practice while the bespoke case stops being a dead end.
