ACIF main is clean with the devin migration landed in 3 commits, and 2 tracker items remain open. The rename half of the rename item shipped, along with the new Cascade hook rows and the Appendix A.4 render-back pins. The re-verify half is mostly done too: every `.devin/` and `~/.config/devin/` row cites a 2026-08 docs.devin.ai verification.

## State

S1 - **the rename item is open with a small tail** - 9 legacy rows in the matrix and its yaml twin still carry `.windsurf/` or `~/.codeium/windsurf/` paths, all marked `status: current` and cited to the July syllago survey rather than Devin docs. The item's own research calls `.windsurf/rules/` a legacy fallback, so those rows need a status decision, and the command rows have no `.devin/workflows` counterpart yet.
S2 - **SHAPE.md lines 495 to 500 still list `windsurf`** in the capability arrays. I have not checked whether those arrays are a frozen Syllago snapshot that should stay as written.
S3 - **the capmon item is still open** - the July plan wanted it to land first as the evidence basis, but the ACIF rows ended up citing Devin docs directly, so it no longer gates b42.
S4 - **acif-5ol is P4 and deliberately parked** until a protocol-1 adapter author asks.

## Next Actions

NA1 - **Close out the rename item** - re-verify the 9 legacy rows against docs.devin.ai, mark them `legacy` or drop them per what the docs say, add or rule out the `.devin/workflows` command rows, then settle the SHAPE.md arrays and close the item.

## Questions

❓ **Q1** - **Start NA1 now?**
   a. Yes, finish the rename item in this session, roughly one commit.
   b. No, switch to the capmon item or the syllago GUI chain instead.

➡️ a - it is the only open P2 here and the tail is small enough to finish in one sitting.
