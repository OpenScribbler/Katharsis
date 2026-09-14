Yes, and it's already built. `ledger-stop.sh` recognizes a code by its shape instead of checking it against a list of stock codes. A bespoke code gets recorded in the session's ledger file with `known: false`, and `/kref` lists it after the stock codes.

## How it's captured

`ledger-stop.sh:89-91` records any line shaped like a code: 1 to 4 uppercase letters (hyphens allowed), then a number, then a separator and the title. The `##` header above that line is saved as `section`. The first line under the header is saved as `section_note`. So when you define a code in its own section, as the style asks, the definition is stored with every item that uses it. `test-ledger.sh:103-104` tests this with a `Z2` code under `## Waves`.

## Caveats

C1 - **Only letters followed by a number are captured** - "Wave 1", "Phase A", lowercase prefixes and prefixes longer than 4 letters never match, so an invented code has to use a form like `WV2`.

C2 - **Ticket keys get captured as codes too** - the live ledger holds 3,565 records, 26 of them bespoke, and 18 of those 26 are Jira keys like `ATD-123`.

## Questions

❓ **Q2** - **Should the ledger skip ticket keys?** - they clutter `/kref` results, and a careless filter would also drop hyphenated codes like `T-O`.
   a. Skip any prefix that ends in a hyphen. That drops `ATD-` and keeps `T-O`.
   b. Leave it as is. 18 stray records cost little, and `/kref` already lists them last.

➡️ a - in a ticket key the hyphen is the prefix's last character, while `T-O` has a letter after its hyphen, so the rule can't drop a real code.
