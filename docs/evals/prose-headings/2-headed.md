Main is clean and pushed, last commit 2026-08-27, and the rename item is the only live thread. Three of its commits landed the slug rename, the Cascade hook rows, and the Appendix A.4 render-back pins. What remains is the tail of its re-verify clause.

## State

S1 - **the rename item open, mostly landed** - 8 devin rows in the install-target matrix still cite windsurf paths with "syllago 2026-07 survey" provenance instead of a docs.devin.ai verification: 2 command rows, 2 legacy rule rows, and 4 skill rows including the two `.agents/skills` ones.
S2 - **SHAPE.md capability lists still name windsurf** - lines 495 to 500 list it under hierarchical_loading, cross_provider_recognition, auto_memory, and builtin_commands.
S3 - **the capmon item still open** - the plan named it as b42's evidence basis, but the hook rows were verified against docs.devin.ai directly, so that dependency no longer gates b42.
S4 - **acif-5ol open at P4** - the protocol-1 advisory warning, deliberately parked until an adapter author asks.

## Next Actions

NA1 - **Re-verify the 8 legacy windsurf-path rows against docs.devin.ai** - keep each as a legacy fallback with updated provenance, or drop it, then mirror the result into install-entry-points.yaml and the suite manifest note.
NA2 - **Resolve the SHAPE.md windsurf entries** - either rename to devin or mark the block as a frozen historical snapshot.
NA3 - **Close the rename item** - after NA1 and NA2 land in one commit.

## Questions

❓ **Q1** - **Start the the rename item close-out now?**
   a. Run NA1 through NA3 now, one commit, then close the item.
   b. Close the rename item as-is and file a follow-up item for the legacy rows.
   c. Hold until the capmon item lands in the capmon repo.

➡️ a - the hook rows already bypassed capmon as the evidence source, and the remaining rows are a short docs check.
