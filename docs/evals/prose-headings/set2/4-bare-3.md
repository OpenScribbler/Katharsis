The audit delivered in full, and your live styles implement it almost one-for-one, so the one thing it cannot tell you is whether any of it worked.

Coverage is complete rather than sampled: 559 of 559 transcript files parsed with 0 failures, 1,392 triples extracted and 1,392 labeled with 0 left unclassified, and all three artifacts on disk (the 11.8 MB inventory, 16 shards, the document). The three unclassified triples are quoted in full, one of them the typo `eixt`, which is the residue bucket behaving as specified.

Two of your three hypotheses held and one did not. The mapping then survived into `~/.claude/katharsis/styles/` with two edits, since status-update and continue-resume merged into `status-and-resume`, and canned-learning-extraction was dropped, which a median reply of 1 word earns.

What the audit cannot reach is the present. Its window closes 2026-08-30, which is the day it was written and before the styles existed, so every count in it measures the behavior the styles were built to change. 317 transcripts and 287 MB have landed since, and `extract_triples.py` plus the shard pipeline already exist, so the re-run is mostly compute rather than design.

The case against re-running now: the styles changed continuously through 09-08, so a second pass measures a moving target and cannot attribute a shift to any one version. That argues for treating the re-run as one aggregate before-and-after on T1's success-against-mixed medians rather than as a per-rule verdict.

## Findings

F1 - **Narration before the result is the largest labeled failure mode at 207 triples, and you had not named it** - it opens 14 of the 20 worst-rated replies, and T5 shows it is what the buried conclusion gets buried under.

F2 - **Buried conclusion generalizes hardest, 396 triples at 29%** - present in every type including 90 of 276 canned reviews.

F3 - **Report structure on conversation is real but concentrated, 40 triples** - 15 factual-question, 13 approval, 5 thinking-out-loud, near-zero in work types, which is the evidence that justified a type map over tighter rules.

F4 - **Salvaging is refuted, 14 of 1,366** - 7 sit inside canned security reviews and only 2 in conversational types, so the session you saw it in was local.

F5 - **64 turns ended with no prose at all, the biggest raw failure source, and it is not a writing defect** - the live style's "always end the turn with prose" and its one-word bash-mode reply already answer it.

## Caveats

C1 - **The audit's word counts and the styles' ceilings are not directly comparable, so four ceilings that look too tight may not be** - broken-report serves at a 542-word median against a 250 ceiling, factual-question 318 against 150, approval 378 against 250, and redirect 345 against 250, but the audit counted whole replies while the ceilings count prose with coded items exempt, and nobody has checked whether the gap closes.

## Questions

❓ **Q1** - **Re-run the audit on the 317 transcripts since 2026-08-30?** - it is the only way to learn whether the styles moved T1, and it would settle C1 at the same time.
   a. Full re-run on the new window, same pipeline, then compare success-against-mixed medians per type against this document
   b. Leave it and keep building, accepting that the styles are unmeasured
   c. Narrow re-run over the conversational types only, dropping canned-review and the machine asks

➡️ a - the pipeline exists so the cost is compute, and the per-type medians in this document are the ready-made baseline that makes the comparison meaningful rather than impressionistic.
