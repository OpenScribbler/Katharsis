"Holden" is out of the repo's prose. 12 occurrences now read "the user", across 4 files: `scripts/stop-verifier.sh` (5), `scripts/detect-reply.sh` (4), `scripts/packs/ask-phrases.txt` (2), `tests/test-detect-reply.sh` (1). The style guidance files under `styles/` were already clean.

Two of those lines carried a matching pronoun, so "questions back to him" is now "back to them" and "where he cannot answer it" is "where they cannot answer it".

## Actions Taken

`AT1` - **Replaced the 12 prose references and re-ran the detector suites** - `tests/test-detect-reply.sh` and `tests/test-stop-verifier.sh` both pass.

## Excluded

`X1` - **The 4 attribution hits stay** - `LICENSE` copyright, `plugin.json` and `marketplace.json` author fields, `.moat/registry.yml` operator. Those name the author rather than speak to the reader, and a public repo wants them.

## Findings

`F1` - **5 quoted cue phrases in the tables still use he/him** - "sent it, waiting on him" and "is he right?" in `styles/thinking-out-loud.md`, `styles/diagnosis.md`, and both output-style copies. They are verbatim examples of a user talking about a third party, not references to you, so the rename did not reach them.

## Questions

❓ **Q2** — **Neutralize the quoted cue phrases in F1?**
   a. Leave them — they read as real messages, which is what makes the cue table usable
   b. Rewrite to they/them — matches the style's own pronoun rule, at some cost to how natural the examples sound

➡️ **b** — the repo tells readers to default to they/them, and shipping examples that do otherwise is the kind of gap a reader notices first.
