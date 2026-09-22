Yes, it already works — the ledger captures bespoke codes with no edit, because `ledger-stop.sh:81-84` matches on shape (`[A-Z][A-Z-]{0,3}` plus digits) rather than against the stock list, and the stock set is only a `known: true|false` field on the record. I fed the hook a synthetic reply carrying `WV1` under a `## Wave Numbers` header; it wrote `WV1 known=false section="Wave Numbers" section_note="A wave is one batch of files rewritten together."` alongside `F1 known=true`.

The `section_note` field is the part that makes it usable a week later: the hook stores the first sentence under the header, so the definition you were required to write travels with the code and `kref WV1` answers with it. `kref.sh:147` sorts `known` codes first, so bespoke ones sort to the bottom rather than getting filtered out.

One limit to know about: the prefix cap is 4 characters, so a code like `WAVE1` is not captured at all — it fails the regex silently and never reaches the ledger.
