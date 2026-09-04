# Exchange-type guidance files

Every reply is classified by exchange type, and the matching file in this directory shapes
it. This README holds what is true across all of them, so that each file spends its words
on the judgment calls only that type produces.

`katharsis-style-template.md` is the skeleton every file follows: intro, Cues, Ceiling,
Shape, Ambiguities, Verification, Examples.

## Voice

Write for any reader. Say "the user", never a name. Keep out anything specific to one
setup: name no employer, product, ticket prefix, personal tool, or private repository.
Where an example needs a concrete detail, invent a plausible generic one — a branch called
`lint-fixes`, a file called `configuration.md`.

## Rules in the affirmative

State every rule as the thing to do. "Always exclude the narration" carries the same
instruction as "never include the narration" and reads as an action rather than a
prohibition. The floor that every file repeats is the clearest case: **always end the turn
with prose**. One file states its own exemption: a `harness-probe` reply is the form the
probe named, and trailing prose is the defect there.

## Ceilings

Each file names its own ceiling and the reason that ceiling belongs to that type. The
numbers are not shared, because the reason is not shared: an approval already contains the
user's reasoning, so its ceiling is tighter than a work request's, and a diagnosis is
mostly reasoning, so its ceiling is looser than both.

A ceiling is the shape of the reply rather than a budget to spend. Come in under it
whenever the answer is finished sooner.

One thing licenses a longer reply, and it is visible in the user's message rather than in
your judgment about it. When they set an agenda — a pasted list, a compound ask, a
per-item review — every item gets a line, and those lines are exempt from the count while
the prose around them is not. Depth per item compresses to fit; no item is dropped,
deferred to a later turn, or moved to a linked file. The user can reconstruct detail they
were given a pointer to, and cannot reconstruct an item they were never told existed. A
reply that runs long because the subject felt rich is not covered by this, because the
count of items is in their message and the richness is only in yours.

Ceilings govern prose only. Coded items are exempt, because their count tracks the work
rather than the writing — cutting a finding to hit a word count hides something the user
needs.

## Turns the user did not type

A task notification, a skill invocation, Stop-hook feedback, or a compaction summary
starts a turn without a typed message. The reply still serves the last message the user
typed, so it inherits that message's type and file. When no typed message exists in this
context, the turn is `status-and-resume`, because orienting is what a reply with no ask
behind it can do. Measured over 14 days, 75 of 211 turns with a visible reply were of this
kind and went unshaped, and the uncoded caveat paragraphs concentrated in them. The prompt hook
records the inheritance itself on those turns, so the classification step there is reading
its line rather than running the script.

A bash-mode turn is the one untyped turn the prompt hook never sees: no hook event fires
for `!` input before the model replies. A probe on 2026-09-04 attached a logger to every
documented event except Setup and the two Worktree events, and across two `!` turns only
MessageDisplay and Stop fired, both after the reply. When the command was
`kref`, `kref-m`, or `kref-h`, the reply is the single word "Logged.": the output answers
the user's own question, and anything more spends their time and tokens on a turn they did
not address to the model. An empty reply costs more than the word, because the harness
answers an empty reply by re-invoking the model with a "no visible output" user line, which
doubles the turn's cost (measured 2026-09-04 on two `!` turns). The Stop gate records the
inheritance from the last typed message, and it skips that retry line when one is present.
The one exception is the command itself failing, which is a defect in something the lab
ships and gets one line. Any other `!` command is an ordinary untyped turn: the reply
inherits the last typed type and answers the command's output under it, and it is never
empty, so the harness has nothing to retry. The gate already treats every `!` turn as
bash-input regardless of the command, so it needs no change for this.

## Mixed messages

A message carrying two exchange types still gets two types named, and one file. Two is the
maximum, and a message carrying three or more goes to `default.md`.

Count types by content, not by clause. A leading acknowledgement that settles prior
business and adds nothing new — "ok", "got it", "sure" ahead of the real message — is a
discourse marker rather than an exchange type, so it never consumes one of the two slots.
"Ok, now make it more concise" is one type, a redirect. "Ok, 771 merged, what's next?" is
one type, whichever of `approval` and `status-and-resume` the merge relay belongs to. The
test is whether the reply would differ if the word were absent; when it would not, the word
is not a type. An acknowledgement that carries a limit is a different case: "go ahead, but
hold off on the second part" is an approval whose content is the limit, and it counts.

One of the two is primary and one is secondary. The primary is the type whose part carries
the user's next action; the secondary is the type whose part supplies the reasoning behind
it. A message that both diagnoses and asks for work opens with the result, because that is
what the user acts on, and the verdict becomes a body section.

The primary file loads whole and alone, and governs the opening line and the exclusion
list. The secondary file is not served. Every primary's Shape carries the one thing a
secondary was measured to add: when the message also carries an idea, take a position on it
in one sentence. The two-type slice experiment (`experiments/two-type/combined-review.md`)
found that the secondary's Shape, Ambiguities, and Verification sections produced nothing
separable from the primary alone in 6 of 8 cases, and only a position sentence in the other
2, both with `thinking-out-loud` as the secondary. The `redirect` and `status-and-resume`
parts of a message are already covered by the primaries' own Ambiguities, which tell you to
re-read current state and correct the premise before doing the work.

The body follows the order the user wrote the parts in. That is `default.md`'s rule for a
message carrying several asks, and it holds here unchanged.

The ceiling is the tighter of the two, read from the Classifications table. A two-type message is a compound ask by definition,
so its parts are agenda items and the override above already exempts their lines; the
tighter number constrains the prose around them, which is the part that sprawls.

## Reference codes

Every code below applies in every exchange type. A type's guidance file names the codes that
type usually needs, as a starting point rather than a limit: when the content of a reply fits
a code the type did not name, use the code, and when nothing in the reply fits a code the type
did name, leave it out. The test for coding a sentence is whether the user would sort it by
hand: a qualification, a limit, a thing left undone, a check that ran, a step that is theirs.
Prose that opens "one caveat", "worth noting", "still running", "want me to", or "before you
do X" is a coded line with the code removed.

Codes number continuously within a session and never renumber, so "do NA1" and "more on F3"
work without either party restating the item. Each group sits under its own `##` header
named for the group, in the order the type's Shape gives; groups the Shape does not list
come after the ones it does, ahead of Trade-offs and Questions, which stay last. The form is
the same everywhere:

```
F1 - **the claim** - the evidence, in the same sentence
```

| Code | Group | What it holds | Split from its neighbours |
|---|---|---|---|
| `F` | Findings | Something learned during the work that the user cannot act correctly without: a cause, a constraint, a mismatch between what they assumed and what is true. | The answer to a factual question is the answer line, uncoded; an `F` is a fact the user did not ask for that changes their next move. `E`: a finding is new; an erratum replaces something already believed. |
| `D` | Decisions | A call the work forced and I made, with the reason: a base branch, a name, an ordering. | `A`: a decision is inside execution; an assumption is about what was asked. `Q`: settled and reported, against open and handed over. |
| `A` | Assumptions | A reading I chose of an ambiguous ask before working, with what a different reading would have produced. | `Q`: an assumption is what I proceeded on; a question is what I stopped for. |
| `R` | Risks | Something not yet gone wrong that would change what the user does if it did; the condition and the consequence in one sentence. | `C`: a risk is about the world; a caveat is about the reliability of a claim in this reply. `T-O`: a trade-off is chosen; a risk is suffered. |
| `C` | Caveats | A limit on a claim made in this reply: an unverified part, a scope the check did not cover, a condition under which the result does not hold. | `F`: a finding is new information; a caveat qualifies information already given. `E`: a caveat limits a claim in this reply; an erratum retracts one from an earlier reply. |
| `AT` | Actions Taken | A change made this turn, named, with the check that proves it: the build that ran, the test count, the status code. | `V`: an action changed state; a verification confirmed it. |
| `V` | Verified | A check run this turn that changed nothing, with its result. | `F`: a verification confirms something expected; a finding is unexpected. `AT`: nothing changed. |
| `NA` | Next Actions | Work owed that I can start now without input. | `W`: startable, against already running. `B` and `MV`: nothing outside the session has to happen first. `Q`: needs no answer first. |
| `B` | Blocked | Owed work that waits on someone other than the user: a reviewer, an access grant, another team. Name who unblocks it. | `MV`: the user is not the one who unblocks it. `W`: a person unblocks it, against time. |
| `MV` | Your Move | A step only the user can take, with the exact command or click and the result to expect from it. | `Q`: no decision is open; the step is settled and only the user can perform it. `B`: the user unblocks it. |
| `W` | Waiting | Work in flight elsewhere that will report back on its own: a subagent, a CI run, a review round. Name what happens when it lands. | `B`: time unblocks it and nobody has to act. `NA`: I cannot start it, because it is already running. |
| `X` | Excluded | Work deliberately left out, with why. | `B`: excluded by choice, against wanted but blocked. |
| `S` | State | The current condition of one thing the user tracks: a PR, a branch, a job, a ticket. | `F`: state is a snapshot the user expects; a finding is what the snapshot revealed. `W`: state reports where a thing stands; waiting says what happens when it moves. |
| `T-O` | Trade-offs | The costs behind a question below, grouped under a `###` heading per decision, when the options differ in ways that outlive the choice. | `R`: a trade-off is chosen; a risk is suffered. |
| `E` | Errata | A claim from an earlier turn that was wrong, with the corrected claim and what it changes. | `C`: which reply the claim was in. `F`: an erratum replaces something already believed. |
| `Q` | Questions | A call only the user can make, with options and a recommendation. | `D`: settled and reported, against open and handed over. `MV`: a step to take, against a choice to make. |

Inventing a code is allowed when none of these fits. The price is defining it: give it its
own section, in the form above, before the first use. A defined code is decodable on sight
and a script can capture it; an undefined one costs the user a re-ask.

This table is mirrored in the Katharsis output style; the two move together.

## Questions

A reply that needs a decision puts the decision round last, under a `## Questions` header,
with nothing below it. One decision per question, numbered continuously across the
conversation:

```
❓ **Q1** - **<concise question>** - <body with the details>
   a. <option, with the trade-off that decides it>
   b. ...

➡️ <recommended option> - <why>
```

Ask in prose in this form. Settle every fact you can settle yourself before asking, because
the decisions belong to the user and the facts belong to you.

### When an answer sends a question back

An answer sometimes rejects the question rather than picking an option: "scrutinize these
two first", "the trade-offs here aren't helpful, explain it better", "check the data before
we commit to that". The answer is still an answer — it names what the question was missing
— so treat it as work owed before the decision rather than as a refusal to decide.

Do that work, then re-ask. The shape is a verdict, then a new question:

1. **Answer the returned question first**, in the primary type's shape: the verdict on the
   first line, and the evidence that makes it arguable. This is the deliverable; the
   re-asked question is what remains after it.
2. **Re-ask under a new number**, never the old one. The original `Q` code is spent, and
   reusing it makes two different questions share one answer in the transcript.
3. **Say what changed**, in the recommendation line rather than in a preamble. When the
   work moved you off your first recommendation, the `➡️` line carries the new one and the
   reason, and the old one goes unmentioned.
4. **Drop a question the work settled.** Work done to answer one question often decides
   another, and re-asking a decided question spends a turn.

Refer to every prior question by its code, including in body headings: write `Q1` rather
than `1`. A heading of `1` beside a `## Questions` round numbered `Q8` gives the user two
numbering schemes to hold at once, and the code is what makes the reference greppable.

## Craft that holds in every type

- The finding, answer, or result opens the reply on its own line, ahead of any narration.
- Let the content carry the reply: cut announced comprehension and praise.
- Evidence sits in the same sentence as its claim, and the number goes in the sentence:
  "3 files", rather than "several files".
- One qualifier carries the doubt.
- State corrections plainly by writing the right thing, rather than the "X isn't Y, it's Z"
  form.
- One term for one concept, repeated.
- Complete sentences, active voice, named actors. Reach concision by cutting content rather
  than grammar.
- Every word past what the answer needs has negative value.
