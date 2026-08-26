# Prime examples

Three full messages rewritten end to end, each breaking several rules at once. Rule numbers
refer to `writing.md`.



### Example 1 - State the correction plainly

This example comes from a real reply Claude sent the reader. It violates rules 2, 4, 5, 6, 7, and 10.

Before:
> Writing it up made me re-measure against merged main, and the numbers I gave you earlier were wrong in a way that
> changes the recommendation. It is not 7 files in two directories. It is 179 files across roughly 45 directories, about
> 11,000 changed lines. Every one of the five *-tracking directories fails, along with src/utils/tutorial (42 files),
> the tutorial wizard (24), src/components top level (17), and src/styles. The two directories I flagged were just the
> ones #764 happened to touch.
>
> The part that makes it worth fixing rather than ignoring is lint-staged:
>
> "lint-staged": { "*.{ts,tsx,astro,md,mdx,json,sh}": "prettier --write" }
>
> CI never gates on prettier, so none of this blocks a merge. But that hook runs on every commit, so anyone editing one
> of those 179 files gets the whole file reformatted and re-staged underneath them. #764 only escaped a 334-line
> reformat on the nav-tracking test because it used --no-verify for the beads hazard, which skipped lint-staged as a
> side effect. The issue also raises the question worth settling first: the 179 files consistently use single quotes and
> the config wants double, so flipping the config is a one-line change instead of an 11,000-line one.

After:

> The correct scope is 179 files across roughly 45 directories, about 11,000 changed lines. My earlier count of 7 files
> in two directories was wrong, and the larger number changes the recommendation.
>
> ## Findings
>
> F1 - **The failures cover most of the source tree** - all five *-tracking directories fail, as do src/utils/tutorial
> (42 files), the tutorial wizard (24), the top level of src/components (17), and src/styles. The two directories I
> flagged earlier are only the ones PR #764 happened to touch.
>
> F2 - **The cost lands on lint-staged rather than CI** - CI never gates on prettier, so nothing here blocks a merge.
> The hook config is:
>
> "lint-staged": { "*.{ts,tsx,astro,md,mdx,json,sh}": "prettier --write" }
>
> That hook runs on every commit, so anyone editing one of those 179 files gets the whole file reformatted and re-staged
> underneath them.
>
> F3 - **#764 escaped its reformat by accident** - it avoided a 334-line reformat on the nav-tracking test because it
> used --no-verify for the beads hazard, which skipped lint-staged as a side effect.
>
> ## Questions
>
> ❓ **Q1** - **Flip the config or reformat the files?** - the 179 files use single quotes consistently and the config
> wants double.
>    a. flip the prettier config to single quotes - a one-line change
>    b. reformat the 179 files - an 11,000-line change
>
> ➡️ a - one line against eleven thousand

What changed, against the rules:

- Rule 2 — framing clauses like "The part that makes it worth fixing rather than ignoring
  is" are gone, since the content beneath them makes the same point.
- Rule 4 — the original opened with process narration, "Writing it up made me
  re-measure". The corrected count now sits on the first line.
- Rule 5 — three independent findings now sit under a `## Findings` header as F1, F2, and
  F3, each led by a bold label because each runs past one sentence. There is no Next Actions
  group because one question resolves all three findings at once, which is the case Rule 5
  lets the closing question cover. Add the group the moment a finding needs an answer that
  question does not give.
- Rule 6 — the before closed on "Settle this before any reformatting", which names a
  decision without asking for one. The rewrite closes on a Questions block whose options
  carry the trade-off, so either letter answers it as written.
- Rule 7 — "so" and "because" now carry the relations that dashes and sentence breaks
  left implicit, notably the link between the missing CI gate and where the cost falls.
- Rule 10 — "It is not 7 files in two directories. It is 179 files" is the banned
  negation. The rewrite gives 179 first, then states plainly that the earlier count was
  wrong.



### Example 2 - Be direct and concise

This one breaks rules 1, 5, and 6 at once. It opens with a status dump the reader did not
ask for, renders a table that compares nothing, and buries the question in a
recommendation paragraph. The reader asked which of two fixes to apply, and the reply made
them work to find the question.

Before:
> Green on 998ed624: go build ./... clean, go test -count=1 ./... only the two expected no-test-file lines (cmd/migrate_hooks, internal/contentformat), golangci-lint run ./... 0 issues. Nothing is failing.
>
> C1 — Two of five dirty paths are mine. .beads/interactions.jsonl (one added line) and .beads/last-touched (syllago-11bqt → syllago-vxb7), written by this session's bd show and bd close.
>
> The other three carry mtimes older than this session: .syllago/moat-lockfile.json at 2026-08-22 16:33 with fetched_at: 2026-08-22T23:33:28Z, .ship/gui-v1.json at 2026-07-12, panel/ at 2026-05-10.
>
> C2 — The close never reached the tracked export. .beads/issues.jsonl still has "status":"open" for syllago-vxb7. A full bd export rewrites all 2404 records:
>
> ┌───────────────────────────────────┬───────────────────────────────────────────────────────────────┐
> │               Field               │                        Records changed                        │
> ├───────────────────────────────────┼───────────────────────────────────────────────────────────────┤
> │ _type                             │ 2404 (new field, absent from the export committed 2026-07-20) │
> ├───────────────────────────────────┼───────────────────────────────────────────────────────────────┤
> │ updated_at                        │ 1580                                                          │
> ├───────────────────────────────────┼───────────────────────────────────────────────────────────────┤
> │ dependencies                      │ 356                                                           │
> ├───────────────────────────────────┼───────────────────────────────────────────────────────────────┤
> │ comments                          │ 4                                                             │
> ├───────────────────────────────────┼───────────────────────────────────────────────────────────────┤
> │ status / close_reason / closed_at │ 1 — syllago-vxb7, mine                                        │
> └───────────────────────────────────┴───────────────────────────────────────────────────────────────┘
>
> Recommendation: patch the single syllago-vxb7 line to its exported form, commit alone as chore(beads): close syllago-vxb7, matching existing chore(beads): history. Truthful export, no month of unrelated churn. Or say the word for the full regen.

The reader's response:
> what are you asking me? There's so much noise in your replies. Just state the problem and state your question for me to answer.

After:
> ## Findings
>
> F1 - **The tracked export still says syllago-vxb7 is open** - I closed it in the bd database, and .beads/issues.jsonl
> does not reflect that. Regenerating the file rewrites all 2404 records, because it has been stale since 2026-07-20.
>
> ## Questions
>
> ❓ **Q1** - **Patch or regenerate?** - either clears F1.
>    a. patch just the one syllago-vxb7 line
>    b. regenerate the whole file
>
> ➡️ a - the export stays truthful without a month of unrelated churn

What changed, against the rules:

- Rule 1 — the green-build opener went entirely. Every check in it ran and passed, and
  none of it bore on which file to patch. The five-row table went with it, because it
  compared nothing the reader was choosing between, and the one figure it carried, 2404
  records, moved into a clause.
- Rule 5 — the before coded C1 and C2 and then left the real ask uncoded below them, so
  the codes marked the background and not the decision. The after codes the one item that
  changes what the reader does next: the lone finding takes F1 under its own header, because
  the rule has no count threshold, and Q1 stands in for the Next Actions group because
  answering it resolves F1.
- Rule 6 — the ask now closes the message as a Questions block, phrased so one letter
  answers it. The original split it between a "Recommendation:" paragraph and a trailing
  "Or say the word for the full regen."
- Rule 7 — "because it's been stale since 2026-07-20" names the relation the original left
  for the reader to infer from a `_type` row buried in the table.


### Example 3 - Separate what you did from what you propose

This example comes from a real reply Claude sent the reader at the end of a session. It violates
rules 1, 5, 6, and 7. Every item in it is accurate, and the message still fails, because
completed work and proposed work read the same.

Before:
> **acif-b42 is landed and closed.**
>
> - Commit `bbaa4b4` — 10 files, +169/−72, pushed to `origin/main`. Tree clean, in sync, nothing stranded.
> - Selftest re-verified before commit: exit 0, zero `not ok`, all four sync checks + suite manifest + sabotage.
> - No `bd dolt push` (remote deliberately removed), no `git add -A`, `.beads/` untouched.
>
> One thing worth noting: my first delegation had `git pull --rebase` ahead of staging, which can't run on a dirty tree. The subagent stopped and reported rather than stashing on its own — correct call. Reordered to commit → rebase → push; the rebase found nothing new upstream.
>
> Two follow-ups unblocked by the close, both P2:
> - `acif-qkm` (Class B) — devin's post-compaction event name sits under no provider in `[ACIF-HOOK]` A.1, so A.2 validity rejects it today. Needs the Class B batch window.
> - `acif-43b` (Class A) — devin carries two simultaneously live native hook event surfaces (Cascade snake_case, CLI PascalCase); A.3's tiebreaker only covers the opposite direction.
>
> Harness state to surface, not act on: `/develop` still has a stale workflow parked at stage "Write Plan" for `acif-b42`. The bead is closed now, so that workflow is dead state — clear it when convenient.
>
> Natural next bead per the cross-repo plan is **`capmon-p14`**: capmon still has `recognize_windsurf.go` and `docs/provider-formats/windsurf.yaml` with no `devin.yaml`. Carry the correction into it — it records Cascade as EOL 2026-07-01, but `docs.devin.ai/desktop/cascade/hooks` was verified live 2026-08-21 with no deprecation banner and its full event set intact. Also, `OpenScribbler/capmon` issue #56 (the bd v23→v53 repair) is still open and uncommented; it can be closed.

After:

> acif-b42 is landed and closed at `bbaa4b4`, pushed to `origin/main`, and the tree is clean.
>
> ## Findings
>
> F1 - **Closing acif-b42 unblocked two P2 beads** - `acif-qkm` (Class B) covers devin's
> post-compaction event name, which sits under no provider in `[ACIF-HOOK]` A.1, so A.2
> validity rejects it today. `acif-43b` (Class A) covers devin's two simultaneously live
> native hook event surfaces, Cascade snake_case and CLI PascalCase, where A.3's tiebreaker
> only handles the opposite direction.
>
> F2 - **capmon records Cascade as EOL 2026-07-01, and Cascade is live** - I verified
> `docs.devin.ai/desktop/cascade/hooks` on 2026-08-21 with no deprecation banner and its
> full event set intact, so that date is wrong.
>
> F3 - **`/develop` holds a dead workflow for acif-b42** - it is parked at stage "Write
> Plan" for a bead that is now closed.
>
> ## Actions Taken
>
> AT1 - **Committed the close as `bbaa4b4`** - 10 files, +169/−72, pushed to `origin/main`,
> tree clean and in sync with nothing stranded.
>
> AT2 - **Re-ran the selftest before committing** - exit 0, zero `not ok`, with all four sync
> checks, the suite manifest, and sabotage passing.
>
> AT3 - **Withheld the outward-facing steps** - no `bd dolt push`, because the remote is
> deliberately removed, no `git add -A`, and `.beads/` untouched.
>
> ## Next Actions
>
> NA1 - **Take `acif-qkm` and `acif-43b`, the two beads F1 unblocked** - `acif-qkm` needs
> the Class B batch window, and `acif-43b` needs A.3's tiebreaker extended.
>
> NA2 - **Carry the F2 correction into `capmon-p14`** - capmon still ships
> `recognize_windsurf.go` and `docs/provider-formats/windsurf.yaml` with no `devin.yaml`.
> This is the next bead in the cross-repo plan.
>
> NA3 - **Close `OpenScribbler/capmon` issue #56** - the bd v23 to v53 repair it tracks is
> done, and the issue is still open and uncommented.
>
> NA4 - **Clear the dead `/develop` workflow from F3** - nothing depends on it.
>
> ## Questions
>
> ❓ **Q1** - **Start `capmon-p14` now?** - it is the next bead in the cross-repo plan, and
> NA2 carries the correction into it.
>    a. start it now
>    b. stop here
>
> ➡️ b - the close is committed and pushed, so this is a clean stopping point

What changed, against the rules:

- Rule 1 — the delegation-ordering paragraph went entirely. That my first subagent put `git
  pull --rebase` ahead of staging, and stopped rather than stashing, is friction I got past.
  It earns no code and no sentence, and the commit is in AT1 either way.
- Rule 5 — the before mixes three categories under no header at all. AT3 and NA2 are the
  clearest case: both concern something not done, one by deliberate choice and one still
  owed, and in the before they are a bullet and a trailing clause that read identically.
  Splitting Actions Taken from Next Actions is what tells the reader which list they are
  accountable for.
- Rule 5 again — the before's last paragraph bundles three separate asks into one blob:
  capmon-p14, the EOL correction, and closing issue #56. They are now NA1, NA2, and F2.
- Rule 6 — the before never asks anything. "Natural next bead is `capmon-p14`" and "clear it
  when convenient" are both asks wearing statements, so the reader has to decide what they are
  being asked before they can answer it.
- Rule 5 a third time — every finding now lands in an action group. F1 carries NA1, F2
  carries NA2, and F3 carries NA4, so Next Actions reads as the complete list of what is
  still owed. In the before, F1's two unblocked beads sat in a bullet list that named no
  owner and asked for nothing.
- Rule 7 — "because the remote is deliberately removed" in AT3 names the relation the
  before left inside a parenthesis, and "so that date is wrong" in F2 states the conclusion
  the before left the reader to draw from a "but".
