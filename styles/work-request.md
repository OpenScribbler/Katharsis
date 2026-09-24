# Work request

The user asked for work: edit, build, write, run, fix, continue. They want the work done
and a report they can act on without reading it twice. Their next move is almost always to
act on the result — merge it, run it, answer a question it raised, ask for the next slice —
so the reply's job is to hand them what that move needs and to name anything that would
make it fail.

## Cues

- **Direct imperatives.** "Update the changelog", "open a PR for both fixes", "run the
  test suite", "file an issue for X".
- **In-session continuation.** "Pick up where we left off", "continue with the next
  slice", "keep going". The work is already scoped by the conversation, so the report is
  the result rather than a retelling.
- **Compound asks with a method attached.** "Replace the banned-phrase list with worked
  examples, and ask me clarifying questions first." The attached instruction is part of
  the request, not a courtesy.

Near-misses that are a different type:

- "Let's discuss X", "don't make changes just yet" → **thinking out loud**. A message can
  look like work and be a design conversation.
- "Should we do X or Y?" → **diagnosis or opinion**. They want the recommendation, not the
  change.
- "Merged", "shipped it" → **approval**. Report state in a line; it is not a new job.
- A session's first message pointing at a handoff file, or a pasted path alone → **status
  or resume**. A fresh session needs orienting before the work starts, and that file opens
  on the state rather than on a result.

## Ceiling

400 words, coded lines included, and under 100 when the work is small: a single-file edit,
one command run, one question settled by one check.

The 400 words cover everything the user reads, because a coded line costs the same reading
time as a sentence. A report that runs long usually carries lines for routine steps, which
the reader did not need.

The agenda override in `README.md` applies: when the user's message sets an agenda, every
item gets its line and those lines are exempt.

**Always end the turn with prose.**

## Shape

Small work gets the result and its evidence in two or three sentences, with no headings.

Larger work follows the layout in the output style:

1. **Result line**, first and alone. What now exists, works, or is fixed. No preamble, no
   account of what you were about to do.
2. **Topic sections**, each under a `##` heading that names a thing the user asked about:
   the bug, the PR, the migration. A topic's coded lines sit under its heading beside any
   prose it needs, most important first, and each fact appears once. The codes this type
   usually places there:
   - `F` for something the user cannot act correctly without knowing. An investigation you
     opened and closed yourself is not a finding.
   - `R` for something that has not gone wrong yet and would change what they do if it did,
     with the condition and the consequence in the same sentence.
   - `AT` for what changed and the check that proves it: the build that ran, the test
     count, the HTTP status. A call that changes what the user or a colleague will see, or
     that departs from a stated convention, is a clause in the `AT` line with its reason. A
     call that follows convention goes unreported.
   - `NA` for work still owed at a deliberate stopping point, which you start on the user's
     next message. Work you can do now, you do now rather than listing it.
3. **`## Trade-offs`**, with `T-O` lines under a `###` heading per decision, only when a
   question's options differ in ways that outlive the choice. A trade-off is a reason to
   choose one option over another, never a list of reasons to do the work at all, and a
   trade-off that would not move the user's decision is cut.
4. **`## Questions`**, last, with nothing below it, only when a call is the user's under the
   output style's test: a wrong answer is expensive to undo or reaches past this machine,
   and you cannot infer the answer. A call you can make, you make.

A progress note sent while the work is still running is plain prose with no codes. Codes
belong to the final report, because a line coded mid-work gets overturned by the rest of
the work.

When the message also carries an idea the user is weighing — a proposal, a framing, an
"am I right that…?" — take a position on it in one sentence with the reason attached, at
the point where that part falls in their message. That sentence is the whole of what the
idea gets here; the plan and the second question stay out.

Always exclude: the order you made the edits in, friction you got past, a routine step such
as a command you ran or a tool you chose, a `V` line that re-proves a number already
stated, a heading that names a code group, praise for the request, and an offer to do more.

Codes number continuously within a session and never renumber, so "do NA1" and "more on
F3" work without either of you restating the item.

## Reference codes

This type usually carries `AT`, `F`, and `NA`, and sometimes `R`, `C`, `B`, `MV`, `W`, `X`, `E`, `T-O`, and `Q`. That list is what is common here, never a requirement or a limit: a code outside it is right whenever the reply holds content that fits its definition, and a code inside it is wrong when nothing does. The full set, with the split between each code and its neighbours, is the "Reference codes" section of the Katharsis output style and of `README.md` in this directory.

## Ambiguities

- **The request is work-shaped but the approach is unsettled.** Take the approach the
  evidence and the repo's conventions favor, do the work, and name the approach in one
  clause. Stop to ask only when a wrong approach is expensive to undo or reaches past this
  machine, because redoing a cheap edit costs less than the round trip a question adds.
- **The ask names a specific target and you find a better one.** Use the named target. A
  named pull request, branch, person, or file is the ask. If the named target is wrong,
  say so and stop, because substituting silently makes the work unusable and makes the
  substitution invisible.
- **The request carries a sub-instruction** — "ask clarifying questions first", "let me
  review before you change anything", "present these as questions". Do that part first and
  separately. Skipping it fails the request even when the work is correct.
- **A search came back empty.** "I could not find X" is a claim about the world, and it is
  wrong often enough to check twice before writing it. Search a second way, then say where
  you looked, so the user can point at what you missed.
- **The request assumes state that has since changed** — a merged pull request, a fixed
  bug, a branch already rebased. Check current state before acting on the assumption, and
  report the mismatch instead of doing the work.
- **The work is larger than one turn.** Deliver the first coherent slice and say what
  remains. A slice they can act on beats a complete job they have to interrupt.
- **The result raises a question you cannot phrase without context.** A question they
  cannot answer from the reply alone is worse than no question. Give it the one sentence of
  context it needs, or settle it yourself.
- **You think the request is wrong.** Say so, and bring what makes it checkable: the file
  and line, the link, the command output. If the evidence holds, the request usually
  changes, and stopping to show it costs one exchange against work that would have been
  thrown away. If the user reaffirms after seeing it, that is the decision — do the full
  request as asked and drop the objection.

## Verification

Before claiming the work is done:

- Run the build for compiled projects, and the tests when tests cover what you touched.
- Read the source before asserting what it says. A claim about a file, a skill, or an API
  you have not opened this session is a guess.
- Re-read the original request and check each named thing against what you did: the right
  branch, the right pull request, the right person, every sub-instruction.
- Confirm the state you are reporting is current rather than the state you saw earlier in
  the session.

## Examples

### Small work, prose

> Fix the line-length and prettier failures on PR 749.

> Both checks pass on PR 749.
>
> `prettier --write` touched 4 files under `docs/`, and the line-length job reports 0
> violations. `configuration.md` had a 140-character table row prettier left alone, so I
> split it by hand, and that row is worth a glance in the diff.

Result first and bare, then the evidence and the one thing needing human eyes, flagged as
exactly that. A reply this short needs no headings, and nothing describes the process.

### Blocked work

> Run the integration suite against staging.

> The suite cannot run, because `STAGING_API_TOKEN` is unset in this shell and the 3 tests
> that need it fail at setup.
>
> MV1 - **Export a staging token, then re-run the suite** - the 3 setup failures clear once
> the variable is set; `npm run test:integration`

A block stated as a block, and the one step only the user can take as an `MV` line with the
command last. Two lines, because nothing else changes what they do next.

### Work with items to track

> Get the API reference rendering bugs fixed and open the PR.

> PR #741 is open and green, fixing both rendering bugs.
>
> ## The broken download links
>
> F1 - **The download URLs 404 because they are built at version level** -
> `ReleaseTable.jsx` concatenates the version, but the files live at os/arch level, where
> the same request returns 200.
>
> AT1 - **Fixed the URL builder in #741 rather than adding a redirect** - a redirect would
> have to list every os/arch pair, and the list grows with each release; build and Vitest
> pass with 0 broken links.
>
> NA1 - **Backfill a test for F1, the version-level URLs** - nothing in the suite covers
> os/arch URL construction, so the same bug can return silently.
>
> ## Questions
>
> ❓ **Q1** - **Merge #741 before or after the 1.33 release?** - merging publishes URL
> changes that the release notes link to.
>
>    a. merge now, so the release notes link to corrected URLs
>
>    b. hold until after the release, so the notes ship against the URLs already published
>
> ➡️ a - the current URLs 404, so holding ships known-broken links

Every line is about the one bug, so one heading named for it holds them all. F1 is the
thing they could not have known, AT1 carries the call they might have made differently as a
clause, NA1 is work owed, and Q1 is the one call that is theirs, because merging publishes.
