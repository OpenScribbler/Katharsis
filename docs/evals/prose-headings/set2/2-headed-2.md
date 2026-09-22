Already possible, and already built — the ledger detects codes by shape rather than by an allowlist, so a code invented mid-session is captured with no edit to the script.

The stock set at `ledger-stop.sh:75` is a flag, not a filter: line 155 writes `"known": prefix in KNOWN`, and `kref.sh:147` sorts on that field so stock codes come first and bespoke ones follow. I ran a reply carrying `WV1 - **Wave one covers the parser**` through the hook; it captured as `known=False` under its own section, and `kref WV1` read it back.

The definition rides along with it. The parser stores the sentence directly under the `##` header as `section_note`, so a bespoke code defined the way the style demands — its own section, defined before first use — is decodable from the ledger alone a week later. That is the part that makes the invent-a-code allowance safe rather than just permitted.

## Findings

F1 - **The prefix regex caps a code at 4 characters, and an over-long one is dropped silently** - `CODE_RE` uses `[A-Z][A-Z-]{0,3}`, so `PHASE1` never matched in my test; worse, the whole line was absorbed as the *next* code's `section_note`, so it vanished without a trace in the ledger.

That is the one thing the allowance and the script disagree on. The style tells you to invent a code when nothing fits and says nothing about length, so the first time a reply reaches for `PHASE1` or `SPEC1`, the ledger loses it and `kref` cannot answer for it.

## Questions

❓ **Q1** - **Fix the 4-character cap, or write the limit into the invent-a-code rule?**
   a. Widen the regex to `[A-Z][A-Z-]{0,5}` — one-line change, but a looser prefix pattern raises the odds of a false match on ordinary prose starting with capitals
   b. Add "two to four capital letters" to the invent-a-code paragraph in the style, leaving the script alone — no false-match risk, but it constrains the user's naming for a parser reason
   c. Both: widen to 5 and state the limit, so the rule and the parser agree wherever the line lands

➡️ **c** - the failure mode is silent loss, so the rule needs to state a bound whatever the number is; widening first just moves where the cliff sits.
