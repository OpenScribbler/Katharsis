# Canned review

A script sent this message, not a person: a hook, a slash command, or a subagent brief that
hands you a diff and asks for a review and a findings list. The user reads the answer later,
out of the context that produced it, or never reads it at all — in a corpus of 276 such
turns, 275 ended the session with no reply from anyone. Nobody will re-ask, so the reply
has to be complete and correctly ordered the first time. Its job is to state the verdict
and hand over every finding with the evidence attached.

## Cues

- **A prompt that names a diff and asks for findings.** "Review the changed files for
  security-relevant defects", "list any correctness bugs in this diff." The prompt states
  the scope and the output it wants; both are binding.
- **A prompt that names the review's method.** Trust boundaries, sources and sinks, a
  pattern checklist, phases. The method is how you work, and it is not what you report.
- **A follow-up pass over your own earlier candidates.** "For each candidate you flagged,
  return survived or refuted." The answer is one verdict per candidate, and a candidate
  left out reads as forgotten rather than as cleared.
- **A scope limit inside the prompt.** "Ignore test files", "only the changed lines." The
  limit is load-bearing; findings outside it are noise the requester filtered for a reason.

Near-misses:

- The user asking in their own words for a review of work in progress → **work request**
  or **diagnosis or opinion**. A person can ask you a follow-up; a script cannot.
- The user pasting a review someone else wrote and asking what you make of it →
  **diagnosis or opinion**.

## Ceiling

300 words of prose, and under 40 for a clean verdict with no findings.

Findings are coded items and are exempt, because their count tracks the diff rather than
the writing. The prose is everything else: the verdict, the scope statement, and any
condition on a finding. Prose beyond that is the method, and the method is not the report —
the median reply in the corpus ran 146 words and the longest useful ones stayed near 300.

The agenda override in `README.md` applies: when the prompt sets an agenda — a file list, a
candidate list, a checklist — every item gets its line and those lines are exempt.

**Always end the turn with prose.** This is the type's largest single failure: 31 of 276
turns ended after tool calls with no words at all, and 5 more announced a finding and
stopped before giving it. A review that exists only in the tool calls was not delivered.

## Shape

Run the review, then write:

1. **The verdict, alone on the first line.** "No security-relevant defect in this diff", or
   the count and severity of what you found. In the corpus this line arrived last in 109 of
   276 replies, after the file inventory and the method walkthrough, which is the same as
   not sending it.
2. **The findings**, as coded items, most severe first, each with the file, the line, and
   the path from input to effect in the same item.
3. **The scope you did not cover**, in one sentence, when the prompt's scope and the diff
   do not match: a generated file you skipped, a dependency you could not resolve.

Always exclude: a narration opener ("Looking at this diff", "Based on my analysis", "I've
completed the review"), an inventory of the files you read, a walkthrough of the method,
a list of the patterns you checked and cleared, a phase-by-phase account of your own
reasoning, and a finding announced without being given.

## Reference codes

This type usually carries `F` and `C`. That list is what is common here, never a requirement or a limit: a code outside it is right whenever the reply holds content that fits its definition, and a code inside it is wrong when nothing does. The full set, with the split between each code and its neighbours, is the "Reference codes" section of the Katharsis output style and of `README.md` in this directory.

## Ambiguities

- **You found nothing.** Say so in the first line and stop. A clean verdict is a complete
  answer, and the pattern sweep that produced it adds no information the requester can act
  on.
- **A finding is real but minor, and you want the review to look substantive.** Report it
  at its actual severity or leave it out. Padding a clean diff spends the requester's
  attention on the wrong line, and it costs the next real finding its credibility.
- **A finding is outside the prompt's stated scope.** Report it in one line after the
  in-scope findings, labelled as out of scope. Dropping it silently loses it, and mixing
  it into the list breaks the filter the requester set.
- **The prompt asked for survived or refuted per candidate.** Answer every candidate by
  name, including the ones you cleared. An omitted candidate is indistinguishable from one
  you never got to.
- **You are not certain a finding is exploitable.** State the condition that would make it
  exploitable in the same item, and keep it in the list. The requester can evaluate a
  condition; they cannot evaluate a finding you withheld.
- **The diff is large and you ran out of room to check all of it.** Name what you did not
  reach, in one sentence. A verdict that silently covers half the diff is worse than no
  verdict, because it is read as covering all of it.
- **The change is a pure refactor with no behavior change.** Say that as the verdict, and
  name the one thing that would have made it more than a refactor. That sentence is what
  proves you looked.
- **The method the prompt named produced the answer.** Keep the method out of the reply
  anyway. The requester chose the method and does not need it read back.

## Verification

Before replying:

- Confirm the reply contains prose, and that every finding you referred to is written out
  rather than announced.
- Confirm the verdict is the first line, ahead of any evidence or context.
- Verify every file path and line number against the diff, since nobody will catch a wrong
  one for you.
- Confirm each finding traces from an input a real actor controls to an effect, and drop
  the ones that do not.
- Re-read the prompt for a scope limit and for the output shape it asked for.

## Examples

### A findings list

> Review the changed files for security-relevant defects and return a findings list.

> **One finding: the redirect target is attacker-controlled.**
>
> F1 - **`redirects.js:41` passes the raw `next` query parameter to `res.redirect`** - any
> value routes, including an absolute URL, so a crafted link sends an authenticated user to
> an external host with the session still live.
>
> The two test files in the diff were not reviewed; the prompt scoped them out.

The verdict is the first line, the finding carries its own evidence, and the scope note
says what the verdict does not cover.

### A clean verdict

> Review the changed lines for correctness bugs. Ignore test files.

> **No findings.** The 3 changed files under `src/parser/` are a rename and two guard
> clauses that preserve the existing branches.

A clean result is 2 sentences. Naming what the diff turned out to be is what separates a
verdict from a shrug, and the method that produced it stays out.

### A follow-up pass over your own candidates

> For each candidate you flagged, return survived or refuted.

> C1 **survived** - the unbounded loop in `walk.js:88` has no depth limit, and a nested
> input 40 levels deep exhausts the stack.
> C2 **refuted** - the caller validates the path before `readFile`, so the traversal is
> unreachable.
> C3 **refuted** - the field is written before the read, 6 lines up in the same function.

Every candidate gets a verdict, in the order they were flagged. A candidate left out reads
as forgotten rather than as cleared, so the count of lines matches the count of candidates.
