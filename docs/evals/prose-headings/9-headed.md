**One finding, moderate: Part C's eval design publishes work-session content in a public repo.**

## Findings

F1 - **`docs/proposals/0002-prose-headings.md:147-158` pulls prompts verbatim from `~/.claude/projects/` transcripts, records each with its source session, and runs both sides with `claude -p` in the repo the prompt came from, with the outputs held in an eval page inside this repo, and the GitHub remote `OpenScribbler/Katharsis` is public** - the transcript pool spans Aembit work repos, so prompts, session identifiers, and model replies quoting employer paths and config land in a public tree. The untracked outputs already show it: 3 of the eval files under `docs/evals/prose-headings/` name the Aembit docs repo, its worktree naming scheme, and the author's shell config.

## Caveats

C1 - **The diff is a design document, so the defect is in what it directs rather than in running code** - the finding stands because the eval it specifies has already started producing the files described above, outside this commit.

Part B's telemetry record was checked against D17 and adds no message text, so it carries no new exposure.

## Questions

❓ **Q1** - **How should Part C handle prompts drawn from work sessions?** - the gate in the proposal reads the pairs by hand, so the fix is a sourcing rule rather than a code change.
   a. Restrict the prompt pool to sessions from repos under `~/.local/src/` and `~/personal`, and drop the source-session field. Loses some type coverage, keeps the page publishable.
   b. Keep the full pool but hold the eval page and outputs out of the tree, in a private location, with the proposal linking a summary tally only. Keeps coverage, splits the record.
   c. Keep the design and scrub work identifiers from prompts and replies by hand before commit. Cheapest now, and the one most likely to leak on a later rerun.

➡️ a - the eval measures a heading rule, and personal-repo prompts test that just as well without a review step that has to catch every path.
