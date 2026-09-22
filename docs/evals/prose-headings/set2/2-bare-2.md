Yes, and it already works — `ledger-stop.sh:90` matches any `[A-Z][A-Z-]{0,3}\d+` prefix by shape rather than against a list, so a code invented mid-session captures with no edit to the script. `KNOWN` at line 75 holds the 16 stock codes and becomes a `known: true|false` field at line 155 instead of a filter, and `kref.sh:147` sorts on `not known` so stock codes print first and bespoke ones fall below under the reply's own header (`kref.sh:158` falls back to `section` and then "Other codes"). Per-session scoping is free, since the ledger is already one file per session.

One gap: `ledger-stop.sh:159` captures `section_note`, the sentence under the header where the definition block sits, and `kref.sh` never reads that field. The definition is on disk and nothing prints it back, so `kref XY1` shows a bespoke code's title without the definition that makes it decodable.

## Questions

❓ **Q2** - **Fix kref to print `section_note`?** - it's the half that makes a bespoke code readable a week later, and the data is already stored.

   a. print it for `known: false` rows only, so stock codes stay uncluttered
   b. print it for every row under `--full`, matching how `summary` already behaves
   c. leave it; the title usually carries enough

➡️ **a** - the note exists to decode a code the reader doesn't know, which is exactly the `known: false` case; b prints a redundant line under all 16 stock codes.
