Yes, and it already does: `ledger-stop.sh` detects codes by their shape instead of checking a list of the stock codes, so a code you make up gets recorded with no change to the script (`ledger-stop.sh:18-21`).

## How a made-up code gets recorded

The script records any line that opens with 1–4 uppercase letters, a number, and a separator. When the letters aren't one of the 16 stock codes (`ledger-stop.sh:75`), it tags the record `known: false`. It also saves the `##` header the line sits under. The first plain line under that header goes into a field called `section_note`, which is where your definition of the made-up code ends up (`ledger-stop.sh:166-167`).

## Caveats

C1 - **`/kref` never shows the definition it saved** - `kref.sh` reads the section header but never reads `section_note`, so the definition sits in the ledger file and never appears in the output.

C2 - **Some shorthand never gets recorded** - a code with more than 4 letters (`PHASE1`) or with no number ("Phase A") doesn't match the pattern at `ledger-stop.sh:89-91`, and the script skips it without warning.

## Questions

❓ **Q2** - **Make `/kref` show saved definitions?** - Fixing C1 changes what `/kref` prints in every session.
   a. Show the definition under the section heading, in both the terminal and the HTML output
   b. Leave it as is, and look up a made-up code's meaning in the ledger file by hand

➡️ a - without it, the definition gets saved but nobody can see it through `/kref`
