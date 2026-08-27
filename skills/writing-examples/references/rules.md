# Rule examples

One before/after pair for each of the eleven rules in `writing.md`, numbered to
match. Every "before" is real, taken from the reference audit of 6,841 messages Claude wrote
to one reader over three months, except where a pair is labelled "Constructed". Follow the
method the pairs demonstrate, not a wordlist. Ticket keys, repo paths, and product names are
neutral stand-ins for the originals.

Every "after" obeys all eleven rules, including the ones its own example is not about.

## 1. Cut what the answer doesn't need

Delete the sentence rather than shorten it. This rule covers content that is true,
verified, and beside the point.

Before, real, the opening of a message answering a question about one dirty file:
> Green on 998ed624: go build ./... clean, go test -count=1 ./... only the two expected
> no-test-file lines (cmd/migrate_hooks, internal/contentformat), golangci-lint run ./...
> 0 issues. Nothing is failing.

After:
> (cut entirely)

Every clause there is accurate and every check ran. None of it bears on which of two
files to patch, so shortening it to "all gates passed" would still spend the reader's first
line on something they did not ask about.

A second case, real, from a stopping-point note:
> A note on scope. This session has run through the punt, the learnings extraction, the
> output style investigation, and three commits. The config work is a clean chunk to start
> fresh on, and everything so far is committed and pushed, so nothing is lost by stopping
> here.

After:
> Everything is committed and pushed, so stopping here costs nothing. The config work is a
> clean chunk to start fresh on.

The session inventory is a report of what you did. The reader is deciding whether to stop, and
only the last two facts touch that decision.

## 2. Write the thing you understood

Before:
> Now I have the full picture. Note lines 94–199: five nested ternaries producing four
> near-identical copies of the same `<ol>`. That duplication exists *because* the library
> couldn't express the changelog case (documented at lines 60–62). Building our own
> collapses both paths into one.

After:
> Lines 94–199 hold five nested ternaries that produce four near-identical copies of the
> same `<ol>`. The duplication exists because the library cannot express the changelog
> case, documented at lines 60–62. Building our own collapses both paths into one.

Deleting the first sentence cost nothing, because the second sentence was already the
finding.

The reference audit found 73 messages announcing comprehension in 67 different phrasings: "Now I
have the full picture", "Now the picture is clear", "Found it.", "Now I have the real
hole". A wordlist cannot catch this, because the wording is new nearly every time. The
worst one announced a nuance instead of stating it: *"Now I have the full picture — and
there's a nuance that decides this."*

## 3. Separate verified from assumed

Before:
> Branch is in sync with origin and the tree is clean. Resolving now.

After:
> `git status --porcelain` printed nothing and `git rev-list --count @{u}..HEAD` returned
> 0, so the tree is clean and the branch is in sync. Resolving now.

Same claim, same length. The first one asks the reader to trust you. The second one shows what
produced the answer, so the reader can also see when you ran the wrong command.

Where no check exists yet, name what will settle it. Real, from a PR where CI had never
run:
> `build.yml` triggers on `pull_request: branches: ['main']`, and 731 targets
> `doc-455-update-dependencies`, so Build, Vitest, and Deploy have never run on it. When
> 730 merges, GitHub retargets 731 to main and CI fires for the first time. Wait for that
> run to pass before merging.

That says why the claim could not be checked, names the run that settles it, and says when
it happens.

Stacked hedges are the other failure. Constructed:
> It could potentially be the case that the redirect might not fire, though it's possible
> this only affects some subset of the moved pages.

After:
> The redirect may not fire on the 3 pages that moved out of `/get-started/`. I have not
> checked the other 37, so treat that number as a floor.

One qualifier plus a named scope carries more doubt than four qualifiers over an unnamed
one. The stack reads as uncertainty about everything, which tells the reader nothing about
where to look.

## 4. Put the finding on its own line, first

The reader asked where a new identifiers page should live. Before, 65 words, answer in the
last sentence:
> Now I can see the shape clearly. `identification/` is a flat taxonomy of ~35
> *identification methods* (hostname, source-ip, k8s-namespace) — the three-UUID problem
> spans CLI flags, env vars, annotations, and provider configs, so it isn't an
> identification method and doesn't belong there. `reference/` is small and
> lookup-oriented: Overview, Support Matrix, CLI Reference. A top-level
> `reference/identifiers.mdx` slots in beside Support Matrix with one explicit sidebar
> entry.

After, 55 words, answer on line one:
> **`reference/identifiers.mdx`, top level, beside Support Matrix, one explicit sidebar
> entry.**
>
> The page does not go in `identification/`, because that directory is a flat taxonomy
> of ~35 identification methods like hostname and source-ip, and the three-UUID problem
> spans CLI flags, env vars, annotations, and provider configs. `reference/` is small and
> lookup-oriented, so a lookup page fits.

Same facts, reordered and split. The reader can stop after line one and still have the answer.

## 5. Structure for scanning

Codes and headers carry the sorting the reader would otherwise do by hand. Two jobs sit inside
that. Deciding which items earn a code at all comes first, and separating what you already
did from what you are proposing next comes second. The pair below shows the first job doing
most of the cutting.

Before, real, a status message at the end of a migration session. Every item is accurate
and the paragraphs are in a sensible order, so the cost is invisible until you try to act on
it:
> Both PRs for DOC-456 are now open and the follow-ups are captured.
>
> **PR #737, the Astro 7 upgrade, is fully green.** Build 4m12s, Deploy 2m3s, Vitest 1m34s,
> gate and merge-gate all pass. That is the migration itself: Astro 7.2.4, Starlight 0.41.7,
> and the `sharp` 0.35 bump that takes the lockfile from 7 vulnerabilities to 0.
>
> **PR #738 tracks the six follow-ups.**
> https://github.com/example-org/docs-site/pull/738, one file, net six beads. CI watch is
> running in the background.
>
> I filed less than planned, on purpose. A dedup pass showed the prettier-debt
> generalization I intended to write was already `doc-123-y2ll`, and the
> `compatibilityOverrides` warning was already `doc-123-weeu`, so neither got a duplicate.
>
> Two claims I had been carrying turned out to be wrong, and I verified rather than filed.
> `astro check` is not broken on Astro 7. It runs to completion over all 346 files and
> reports 127 errors, no `convertToTSX` failure anywhere in the output, so my earlier note
> that the function was unimplemented in `@astrojs/compiler-rs` is retracted on
> `doc-123-bg5` along with the real count. The HTML-entities-in-props hazard has zero live
> instances, 0 in `.astro` props and 0 in MDX component props, so `doc-123-6gur` asks for a
> vitest guard rather than a cleanup.
>
> The finding worth your attention is `doc-123-6096`. Astro 7 forks the dev server and the
> foreground process exits 0, which breaks `scripts/dev-filtered.js` in the worst direction:
> it prints `Dev server exited (code 0)` while `astro dev status` simultaneously reported
> `pid 54286, uptime 14s, background` on port 4322. Anyone running `npm run dev` locally
> loses the URL banner and leaves a daemon behind they have no reason to stop. CI is
> unaffected because it runs `npm run build`.
>
> I also confirmed the RSS path leak precisely. `dist/changelog/rss.xml` is the only file in
> the entire built site containing an absolute on-disk path, one occurrence, the site base
> URL concatenated with the builder's `node_modules` path inside escaped `content:encoded`.
> Zero HTML pages leak it, and it is identical on the Astro 6 baseline, so it is pre-existing
> rather than a migration regression.
>
> On the beads commit I applied the `doc-123-c0ta` guard deliberately, since that hook
> silently deleted 7 beads in an earlier session. The export was diffed against the tracked
> file in both directions before promotion, the hook's exec bit was cleared for the commit
> and restored after, and each of the six ids was confirmed present individually. Something
> did stage `.beads/issues.jsonl` behind me during the export, which I caught as an `MM`
> status and unstaged before it could ride into anything.
>
> One thing I left alone: the `ship-adr-handler` hook fired again about 2 Accepted ADRs
> sitting unpromoted in `.plans/v1-gap-closure/adr/`. That is a separate workstream from
> DOC-456 and the hook wants a per-feature decision from you, so I did not touch it.

After:
> ## Findings
>
> F1 - **Astro 7 forks the dev server and the foreground process exits 0** - so
> `scripts/dev-filtered.js` prints `Dev server exited (code 0)` while `astro dev status`
> reports `pid 54286, uptime 14s, background` on port 4322. Anyone running `npm run dev`
> locally loses the URL banner and leaves a daemon behind. CI runs `npm run build`, so it is
> unaffected.
>
> ## Actions Taken
>
> AT1 - **Opened PR #737, the Astro 7 upgrade, fully green** - Build 4m12s, Deploy 2m3s,
> Vitest 1m34s, gate and merge-gate all passing, carrying Astro 7.2.4, Starlight 0.41.7, and
> the `sharp` 0.35 bump that takes the lockfile from 7 vulnerabilities to 0.
>
> AT2 - **Opened PR #738 with six follow-up beads** - one file, net six beads, including
> `doc-123-6096` for F1.
>
> ## Next Actions
>
> NA1 - **Land the `dev-filtered.js` fix that `doc-123-6096` tracks for F1** - the script
> needs to poll `astro dev status` rather than wait on `child.on('close')`, because an exit
> code cannot distinguish a healthy shutdown from an orphaned daemon.
>
> ## Questions
>
> ❓ **Q1** - **Promote the 2 Accepted ADRs?** - the `ship-adr-handler` hook fired again
> about 2 Accepted ADRs sitting unpromoted in `.plans/v1-gap-closure/adr/`, and it wants a
> per-feature call. This sits outside DOC-456, so I left it untouched.
>    a. promote them now
>    b. leave them to their own workstream
>
> ➡️ b - they belong to a workstream this session never opened

Twelve paragraphs became five coded items, and most of what went was findings that had no
business being findings. Three of them were investigations closed before the message was
written: `astro check` turned out to run fine, the HTML-entities hazard turned out to have
no live instances, and the RSS path leak turned out to predate the migration. Each one was
verified, each one was interesting to run, and none of them left the reader anything to do. The
two beads corrected as a result went with them, since correcting your own retraction is not
an action the reader asked for. So did the beads-commit guard, which worked.

What survives is one finding the reader cannot act on without being told, two PRs the reader
needs to know exist, and one decision waiting on the reader. The ADR call is that decision, and
it sits in the Questions block rather than in Next Actions, because a Next Action is work you
carry out without further input, and this item waits on the reader's answer. F1 carries NA1 because nothing
fixed it, and AT2
names the bead that tracks it, so the open work and the filed work point at each other.
Every finding lands in exactly one of the two action groups, which is what makes the Next
Actions group readable as the complete list of what is still owed.

The codes also survive the message. The reader can reply "more on F1" or "do NA1" without
either of us restating the item, and F1 stays F1 for the rest of the conversation.

## 6. End with the question, alone

Before, real, the close of a long status message. The ask is buried in a recommendation
and then split in two:
> Recommendation: patch the single cli-321-vxb7 line to its exported form, commit alone as
> chore(beads): close cli-321-vxb7, matching existing chore(beads): history. Truthful
> export, no month of unrelated churn. Or say the word for the full regen.

The reader's reply:
> what are you asking me? There's so much noise in your replies. Just state the problem
> and state your question for me to answer.

After, closing the message, with nothing below it:
> ## Questions
>
> ❓ **Q1** - **Patch or regenerate?** - the tracked export still says cli-321-vxb7 is open.
>    a. patch just the one cli-321-vxb7 line
>    b. regenerate the whole file
>
> ➡️ a - the export stays truthful without a month of unrelated churn

The recommendation is not the problem. Hiding a decision inside it is. "Or say the word
for the full regen" is the second option pretending to be a footnote, so the reader has to
assemble the choice before answering it. The rewrite gives the recommendation
its own ➡️ line after the options, so it informs the choice without hiding it.

## 7. Do the assembly work before you send

Before, 42 words, 4 dashes, relations left to the reader:
> The screenshots we **can** automate — our own UI, via the `product-ui-screenshots` and
> `screenshot-updater` skills — are the ones with the **least** value. The screenshots
> with **real** value — third-party consoles — are the ones we **can't** automate and
> that rot fastest.

After, 36 words, 0 dashes, relations stated:
> We can automate screenshots of Acme's UI using the `product-ui-screenshots` and
> `screenshot-updater` skills. Unfortunately, Acme UI screenshots have the least value.
> Third-party console screenshots are more valuable, but we cannot automate them and they
> rot faster.

"using" attaches the tooling to the claim. "Unfortunately" and "but" carry the contrast,
which is the whole finding. "Acme's UI" names the entity where "our own UI" gestures at
it, and "them" and "they" are unambiguous because their antecedent is in the same
sentence.

One fact per sentence is the wrong fix. An earlier draft tried it and produced 41 words
in five sentences:
> We can automate screenshots of our own UI. The `product-ui-screenshots` and
> `screenshot-updater` skills do that. Screenshots of our own UI have the least value.
> The valuable screenshots show third-party consoles. We cannot automate third-party
> console screenshots, and those screenshots rot fastest.

One word shorter than the original and harder to read, because five separate sentences
make the reader rebuild the contrast that is the finding. Fewer words is the result of
assembling, not the target.

The mid-sentence colon fails the same way the dash does. Constructed:
> Vale runs on changed files only: the full-repo scan takes 4 minutes.

After:
> Vale runs on changed files only, because the full-repo scan takes 4 minutes.

The colon set the two facts side by side and left "because" for the reader to supply. A colon
introducing a list or an example is fine and this rule does not touch it.

## 8. Evidence sits next to the claim

Before:
> All gates passed: full vitest, CI vitest config, and the production build.

After, the same claim from a different session:
> All gates passed: the build passed with 0 broken links, Vale passed 0/0/0, Vitest passed
> 87 files and 1412 tests.

Both are one line. The reader can check the second one and has to take the first one on faith.

For a claim about behavior, the measurement goes in the same breath as the mechanism:
> **Checksum URLs fail.** `VerifyReleases.astro` builds them at version level,
> but the files live at os/arch level. Confirmed: version-level returns `403`, os/arch
> level returns `200`.

## 9. Put the number in the sentence

Before:
> The validator caught most of the affected links.

After:
> The validator flagged 7 links: the 6 `/_llms-txt/*` URL changes plus `/llms-small.txt`.
> That is the same set I derived by hand from `llm-resources.mdx`.

An adverb is where the missing number hides. Constructed:
> The incremental build significantly improves CI time.

After:
> The incremental build cut CI from 4m12s to 1m38s.

Where no number exists, the adverb means the verb is wrong: "Vale runs quickly" becomes
"Vale takes 6 seconds on changed files."

## 10. State the correction plainly

The hardest case is when the reader proposed the wrong thing, and the rule still holds
there. Before, real, where the reader had proposed raising the timeout:
> The fix isn't a longer timeout. It's removing the need to explore. Embed the code under
> review directly in the prompt so verification requires zero tool calls.

After:
> Embed the code under review directly in the prompt, so verification needs zero tool
> calls. A longer timeout will not help, because the time goes to exploring the repo
> rather than to the check itself.

The correction survives and lands harder. "A longer timeout will not help" says it once,
instead of building to it.

## 11. Use one term for one thing, every time

The reference audit found 446 statements that the checks passed, written 60 different ways: "build
passes", "checks green", "suite green", "gates pass", "all checks green", "build clean".
One outcome, sixty names for it.

Before, real, three words for one result in a single sentence:
> Verification: all gates passed (vitest, CI vitest config, production build), Prettier
> clean, and the Sonnet visual review came back CLEAN across dark/light/mobile.

After:
> Verification: vitest passed, the CI vitest config passed, the production build passed,
> Prettier passed, and the Sonnet visual review passed in dark, light, and mobile. Browser
> checks passed on all 5 product dropdowns, 115px card height, Escape and outside-click,
> and mobile overflow.

The second one is duller and scannable, because "passed" five times means the reader never
stops to ask whether "clean" and "green" are the same result.
