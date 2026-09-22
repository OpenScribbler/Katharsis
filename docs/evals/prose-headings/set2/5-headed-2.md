**`R` is already in `work-request.md`** — Shape slot 3 carries `## Risks` between Findings and Decisions, and the file's Reference codes line lists `R` among the codes the type sometimes takes. The state moved since we last talked about it, so there is nothing to add there.

In `factual-question`, a risk rides as a trailing clause on the answer rather than as an `R` group. The file already says so at Shape slot 3: "a trailing clause naming a risk, when the answer is true but fragile. Attach it to the answer rather than promoting it to a group." Its first Ambiguity is the worked case — *"Yes, the lint hook is enabled — it is in user settings, so any project that defines its own hooks block replaces it silently."* The hook being silently replaceable is a fact about the world that has not bitten yet, which makes it a risk under the README's split from `C`, and it still belongs inside the sentence: the ceiling is 40 words for a yes-or-no, so a `## Risks` header under a one-line answer buries the answer under its own scaffolding.

Where that gives out is a risk the user cannot act on from a clause, with a condition and a consequence that need their own sentence. The output style says a code is right whenever the reply holds content fitting its definition, so an `R` line is permitted there — but `factual-question.md`'s Reference codes line names only `C` and `Q`, which reads as though it is not. That is the one real gap your question surfaced.

## Questions

❓ **Q9** - **Should `factual-question.md`'s Reference codes line account for `R`?** - it currently omits `R` while Shape slot 3 tells you to handle risks as prose, so the file and the output style's general rule disagree on whether an `R` line is ever right here.

   a. add `R` to the list — one word, and Shape slot 3 still steers the common case to a clause
   b. leave it — the omission reads as a deliberate steer, and the output style's general rule already permits `R` when content fits
   c. name the split in the line — "a risk rides as a trailing clause here, and takes an `R` line only when its condition and consequence need their own sentence"

➡️ **c** - the trade-off is one extra sentence against an ambiguity a reader has to resolve by cross-checking two documents; (a) leaves them wondering why `R` appears in the code list when the Shape tells them to write prose, and this file's whole job is keeping the answer in the first line.
