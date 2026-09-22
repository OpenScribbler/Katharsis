# Proposal 0003: Decide what is mine, and write the consequence before the proof

Status: implemented on 2026-09-22 as D27, D28, and D29, without a grilling round, under the
author's delegation of the judgment calls. Two departures from the text below: session close is
no standing question, because stopping is not a question on its own and a reply ends at a
deliberate stopping point with its next actions listed; and a spent question is carried on an
`Open:` line by code rather than restated. The same change added D30, errata that keep the
code, and D31, a per-family model note. It came from a two-week audit of the author's ledger and
transcripts, answering the complaint that the questions are low-value and the findings too
technical. Depends on D5, D17, D20, D21, D22, and D23.

The style asks a question for every call that is the user's and puts the evidence for every
claim in the claim's own sentence. Both rules are sound and both have a loophole the corpus
shows the model taking. On the questions side, one sentence in the Questions section makes a
question mandatory whenever the reply carries a next action, and the code table tells the
model to re-ask every open call in every reply, so the round fills with "Start NA1 now?" and
restatements. On the findings side, the evidence rule names no reader and no form, so the
model reaches for the strongest proof it has, which is a path, a line number, or a hash, and
the reader gets an address where the consequence belongs.

| Part | Change | Depends on |
|---|---|---|
| A | The Questions section loses the next-action sentence and gains two rules: a spent question reappears as a pointer, and session close is one standing question. The `Q` and `NA` rows in the code table change to match, and the five Shape lines that repeat the next-action sentence go | Nothing |
| B | "When a decision is mine" names craft calls and says they are made silently unless they depart from a stated convention. The `D` row and the approval Shape change to match | Nothing |
| C | A reader statement and an evidence form replace the "evidence in the same sentence" craft line: the title states what is now true for the reader, the body says why in words, and an address is a pointer that comes last, at most one per line | Nothing |
| D | A capture-only count in `ledger-stop.sh`: questions per reply, gate-shaped question titles, re-asked codes, `D` lines per reply, and addresses per coded line, to `telemetry/decisions.jsonl` | Nothing |
| E | An eval page on the 0002 pattern: real prompts, answered under the current style and under the current style plus Parts A to C, read as pairs | Parts A to C's text, before they land |

Part E runs before Parts A to C land. Part D ships with them, because the two numbers the
author trusts least, whether the model starts work the user meant to see first and whether
addresses come back, are only visible over weeks of real replies.

## The problem

The audit covered every ledger record written between 2026-09-08 and 2026-09-22: 5,193
records across 230 sessions and 40 project directories, and the 283 transcripts behind them.
Three subagents classified all 1,185 questions under the style's own test for whose call a
decision is, and a fourth read 350 findings and all 283 decisions under a rubric for whether
the line states a consequence or a mechanism.

**Questions.** 619 of the 1,185 were the user's call. 328 were permission gates on work the
user had already agreed to or that only one order made sense for: "Start NA1 now?", "Stop
here?", "Commit now?", "Which next action first?". 171 were calls the "When a decision is
mine" section already assigns to the model: a commit prefix, a branch description, rebase or
merge, which subagent, where a file sits, when to read a file. 23 were facts a lookup would
have settled and 44 were fragments the ledger's title pattern cut short, which the
2026-09-22 ledger fix addresses separately. 259 repeated a question already asked in the
same project, 34 of them near-verbatim, and 19 said so in their own body ("restating Q8",
"Q45 is still open").

The transcripts show what the round bought. The recommendation was present under 1,440 of
1,483 question lines. The user answered with a bare letter 456 times and picked the
recommended letter 406 times. On the gate questions alone the rate was 83 of 92. The 50
overrides were real, and most of them were redirects the options did not contain, such as
"NO, create a child Jira issue for all of it", which a question round cannot anticipate and a
next-action line would have drawn just as well.

**Findings and decisions.** 119 of 350 finding titles and 223 of 283 decision titles named a
mechanism or a location rather than what the reader now knows or must do differently. 154
finding bodies led with a path, a code span, or two or more `path:line` references. The
sample carried 161 `path:line` references and 37 commit hashes. 57 findings ended with a call
the model had made or an offer it was extending ("so I left it", "say the word and I will
reword it"), which is `D` or `Q` content wearing an `F` code. 100 of the 283 decisions
recorded craft: a branch name, a commit prefix, rebase versus merge, a staging method, which
subagent ran what. 102 lines read only with the session's numbering in memory ("F15 is a
fourth claim", "W1b's Lambda row").

The existing rules push the model toward each of these:

- `styles/README.md`, the Questions section, and both output-style files: "Whenever the
  reply carries at least one next action, one of the questions is which next action to take,
  and where there is exactly one, that question is whether to start it now." This sentence
  alone produces the largest gate family.
- The `Q` row of the code table: "Every open call gets its own question, in every reply that
  has one." This produces the restatements.
- The `D` row: "A call the work forced and I made, with the reason: a base branch, a name, an
  ordering." The section that follows says those calls are mine to make; nothing says they
  are mine to make quietly, so they are made and then reported.
- `styles/approval.md`, Shape item 3: "A base branch, a name, an ordering. These are the ones
  that come back as corrections when they stay invisible." The corpus shows the opposite: 100
  craft decisions reported and, on a read of the transcripts that followed, none corrected.
- The craft line: "Evidence sits in the same sentence as its claim." With no reader named and
  no form given, the address is the evidence the model finds easiest to state.
- The verifier's block on a decision voiced outside the Questions round (D21) makes asking
  the path of least resistance. The block is right; it needs the other rules to stop
  manufacturing decisions for it to catch.

## Part A: the Questions round

D20 stands. Every type takes the round, and a call whose effect outlives the turn reaches it.
What changes is the two sentences that fill the round with questions D20 never asked for.

### The Questions section, as it would read

This replaces the first paragraph of the `## Questions` section in `styles/README.md`,
`output-styles/katharsis.md`, and `output-styles/katharsis-coding.md`. The paragraphs that
follow it in the section stay.

> Every call that is the user's gets a question here, with no exception for how small the
> call is or how short the reply is. One question per decision, so a reply leaving two calls
> open carries two questions. A decision that surfaces anywhere else in the reply, inside a
> next action, a finding, a caveat, or a closing sentence, is a defect rather than a shortcut.
>
> A next action is work I can start, so it is never the subject of a question. When the reply
> carries next actions I start the first one after the reply goes out, in the order the group
> gives, and the user redirects by naming a code. Work I must not start without the user's
> word is a question rather than a next action, and the question says what makes it theirs.
>
> A question the user has not answered is asked once. In later replies it reappears as one
> line under `## Questions`, "Open: Q5, Q7", with no restatement, until it is answered or
> withdrawn under `E`. A question whose answer the work has since settled is dropped with a
> line saying which finding settled it.
>
> Session close is not a question. When every owed action is done or blocked, the reply says
> so on its answer line and stops; when work remains, the next action is what happens next.

### The `Q` and `NA` rows, as they would read

> | `Q` | Questions | A call only the user can make, with options and a recommendation. Asked once, in the reply that opens it; later replies carry its code on the Open line. | `D`: settled and reported, against open and handed over. `MV`: a step to take, against a choice to make. `NA`: a next action is startable, so "start it?" is never a question. |

> | `NA` | Next Actions | Work owed that I can start now without input, and will start once the reply goes out, first item first. Every piece of work I owe appears here. A next action never contains a question, an offer, or a condition on the user's reply. | `W`: startable, against already running. `B` and `MV`: nothing outside the session has to happen first. `Q`: needs no answer first, so work I could do but must not start without the user's word is a question. |

### The five Shape lines

`factual-question.md` line 67, `default.md` line 46, `thinking-out-loud.md` line 62,
`broken-report.md` line 60, `approval.md` line 63, and `status-and-resume.md` line 74 each
carry "including which next action to take whenever the reply carries any" or its variant.
The clause goes from all six, leaving "one question per open call".

### What Part A does not change

The round stays mandatory and stays last. Outward actions keep their question: posting to a
colleague, filing a ticket, pushing, opening a PR, deleting something, and any change to what
a shared check enforces are the user's under the existing test, and the pointer rule means the
question is asked once rather than never. The verifier's block on a decision outside the round
stays and gains nothing to check, because a pointer line carries no decision.

## Part B: craft decisions

### The addition to "When a decision is mine", verbatim

This paragraph goes after the paragraph ending "and nothing outside this change ever saw it",
in the same three files.

> A craft call is one of these: a branch or file name, where a file sits, the shape of a
> commit, rebase against merge, what to stage, which tool or subagent runs a step, the order
> of my own work, and whether to commit work that has reached a stopping point. I make craft
> calls without reporting them, because a reader who did not do the work gains nothing from
> knowing which way they went. A craft call is reported as a `D` line only when it departs
> from a convention the repo or the user has stated, because that is the one case where a
> correction comes back if it stays invisible.

### The `D` row, as it would read

> | `D` | Decisions | A call I made that changes what the user or a colleague will see, or that departs from a stated convention, with the reason in terms of what it changes for them. A craft call that follows convention is made and not reported. | `A`: a decision is inside execution; an assumption is about what was asked. `Q`: settled and reported, against open and handed over. |

### The approval Shape rewrite

`styles/approval.md`, Shape item 3, currently "any call the execution forced that the approval
did not cover, with the reason. A base branch, a name, an ordering. These are the ones that
come back as corrections when they stay invisible." becomes "any call the execution forced
that changes what the user will see, or that departs from a convention the repo states, with
what it changes for them. A craft call that follows convention stays out." The Ambiguities
entry at line 83 and the example at line 169 that use a base branch as the illustration take
a departure from convention as the illustration instead.

## Part C: the reader and the evidence form

### The craft lines, as they would read

In `styles/README.md` "Craft that holds in every type" and the matching section of both
output-style files, the line "Evidence sits in the same sentence as its claim, and the number
goes in the sentence: "3 files", rather than "several files"" becomes three lines:

> - The reader is a technical writer who runs many sessions at once and did not do this work.
>   A coded line is written for them: the title states what is now true and what it changes
>   for them, and the body says why in one sentence of words.
> - A path, a line number, a hash, a command, or a fragment of output is a pointer rather than
>   evidence. It comes last in the body, in a code span, at most one per line, and only when
>   the reader would go there. A claim that needs more than one address to stand goes with its
>   addresses in a fenced block below the group, or stays out.
> - The number goes in the sentence: "3 files", rather than "several files".

### The form line, as it would read

In the Reference codes section of the same three files, the form

```
F1 - **the claim** - the evidence, in the same sentence
```

becomes

```
F1 - **what is now true, for the reader** - why, in one sentence; where to look, last
```

### Two more sentences in the Reference codes paragraph

After the item-order sentence D24 added, in the same three files:

> A coded line refers to another code with the code and a two-or-three-word gloss, "F15, the
> keytab claim", so the line reads without the ledger. A finding ends where the fact ends: a
> fix applied is an `AT` line, a call made is a `D` line, and an offer is a `Q` line.

### What Part C does not change

The claim still carries its own support, and the number still goes in the sentence. What
moves is the kind of support and its position: a reason in words first, the address last and
singular. `V` and `AT` lines keep their check and its result, because "the build passed, 0
errors" is a consequence rather than an address.

## Part D: the capture

`ledger-stop.sh` already parses the final reply for coded lines and writes one record per
reply to `telemetry/headings.jsonl` (D23). Part D adds a second per-reply record to
`telemetry/decisions.jsonl`:

```
{"ts": ..., "session_id": ..., "project": ..., "questions": N, "gates": G, "reasked": R, "decisions": D, "addressed": A, "multi": M}
```

`questions` is the count of `Q` definition lines. `gates` is the count of those whose title
matches the gate shapes the audit found: an opening "Start", "Stop here", "Commit", "Push",
"Keep going", "Anything else", "Which next action", or a title ending "now?". `reasked` is
the count of `Q` codes in the reply whose number is below the session's highest `Q` already on
file, which is a restatement under the current rule and a defect under Part A. `decisions` is
the count of `D` definition lines. `addressed` is the count of `F` and `D` lines carrying at
least one `path:line` reference, 7-to-40-character hex run, or `path/with/slash.ext` span in
the body, and `multi` the count carrying two or more. No message text is recorded (D17).

Capture only. `gates` and `reasked` after Part A lands should approach zero; `addressed`
should fall and `multi` should reach zero. The hook never blocks on any of these, on the D21
line: a manufactured question or an address costs the reader words, and the reader can still
tell what the reply meant.

## Part E: the eval

Per `docs/evals/README.md`: the same prompt on both sides, a prompt whose type is not in doubt,
and the sample size in the page.

**Prompts.** Eight, pulled from the author's transcripts under `~/.claude/projects/` by hand
as 0002's were, chosen for the conditions the parts change rather than one per type: three
`work-request` prompts whose reply under the current style carried a next action and a
start-now question; two `approval` prompts whose reply carried craft `D` lines; two
`diagnosis` or `canned-review` prompts whose reply carried three or more findings with
addresses; and one `status-and-resume` prompt at a session's end whose reply asked "Stop
here?". Each is recorded verbatim with its source session.

**The two sides.** Both run the current style. The proposed side appends Parts A to C through
`--append-system-prompt-file`. Each prompt runs headless with `claude -p` in the repo it came
from, forked from its session with `--resume <id> --fork-session` where it depended on prior
turns, once per side. One run per cell, stated in the page.

**The read.** The author reads each pair and records six things: whether the proposed side
dropped any question that was the user's call under the test; whether it carried any
gate-shaped question; whether it carried any `D` line recording a craft call that followed
convention; for each `F` and `D` line on both sides, whether the title states a consequence
and how many addresses the body carries; whether the proposed side's finding bodies read
without opening a file; and which side the author would rather have received. The page holds
the tally and the per-pair notes.

**The gate.** Parts A to C land when the proposed side drops no user's-call question on any
pair, carries no gate-shaped question and no convention-following craft `D` on any pair, has
no `F` or `D` body with two or more addresses, and is the side the author would rather have
received on at least seven of eight. A dropped user's-call question is the failure that
matters most, because it is the one Part A could cause and the reader would not see; one
instance sends Part A's text back for rewriting before the eval reruns.

## D26, D27, and D28, as they would read

D26 - **A next action is started rather than asked about, and an open question is asked once
and then pointed to** - 328 of 1,185 questions in the two weeks to 2026-09-22 were gates on
work the user had already agreed to, produced by the sentence that made "which next action"
a mandatory question, and 259 restated a question already open, produced by the `Q` row's
"in every reply that has one". The user took the recommendation on 83 of 92 gate questions
answered by letter. A next action is startable by definition, so asking whether to start it
hands the user a decision the code already made; the redirect the gate occasionally caught
arrives as well against a next-action line. D20's round and its decision test stand unchanged.

D27 - **A craft call is made silently unless it departs from a stated convention** - 100 of
283 `D` lines recorded a branch name, a commit shape, a staging method, or a subagent choice,
and 223 of 283 titles named the mechanism rather than what changed for the reader. The
"decision is mine" test already assigned those calls to the model; the `D` row and the
approval Shape then asked for them to be reported on the ground that invisible calls come back
as corrections. In the corpus none did, and the one shape that does draw a correction, a call
that departs from a convention the repo states, is the case the rule keeps.

D28 - **A coded line is written for a reader who did not do the work: consequence in the
title, the reason in words, one address at most and last** - 154 of 350 finding bodies led
with an address or carried two or more, 119 titles named a mechanism, and 57 findings ended
in a decision or an offer, under a craft rule that asked for evidence in the sentence and
named neither reader nor form. Proof by address answers "where did you look", which the
reader did not ask; the reason in words answers "why does this matter", which they did. The
address stays as a pointer because the reader sometimes goes there, and stays singular because
two addresses is an argument, which belongs in a fenced block or in the file.

## Rejected alternatives

- **Making the Questions round optional again.** D20 measured the omission of the slot turning
  into permission to leave a call unasked. The round is the container; the manufactured
  question is the defect, and the container is not what produced it.
- **A verifier block on gate-shaped titles.** "Start NA11 now?" drew "NO, file a child Jira
  issue" once in the corpus, so the shape is not always empty, and a block on the wording
  would teach the model to reword rather than to start. Capture first, under D21.
- **Acting on the recommendation whenever the acceptance rate is high.** The test for whose
  call a decision is stays blast radius, not the odds the user agrees. An 89% acceptance rate
  on a question about posting to a colleague is still a question.
- **Asking outward-facing questions as a batch, once per session.** A standing "post anything
  as drafted" hands over decisions the user has not seen. The pointer rule already removes the
  repetition without removing the question.
- **Banning addresses from coded lines.** The reader goes to the file sometimes, and a finding
  with no pointer sends them searching. One address, last, keeps it findable without making it
  the sentence.
- **A second, plain-language line under each finding.** It doubles the group's length and
  leaves the first line as it was. The defect is the order and register of one line, and the
  fix is to that line.
- **Dropping `D` altogether.** A decision that changes what a colleague sees, or that departs
  from a stated convention, is exactly the line the user needs and no other code holds.
- **Restricting Part C to `F` lines.** `D` titles were worse than `F` titles by every measure,
  and the reader rule is about the reader rather than the code.
- **Citing the user's own global instructions on commits and pushes in the style.** The style
  is public and the instructions are private. The decision test already makes an unpushed
  commit a craft call and a push an outward one, so the style needs no reference to say so.

## Open items

- Whether starting the first next action without asking ever begins work the user meant to
  see first. The telemetry cannot see it; the sign is a redirect of the form "stop, I wanted
  to look at that", and the first two weeks after landing are read for it.
- Whether "one address per line" is countable well enough for `addressed` and `multi` to be
  trusted. `path:line` and hex runs are; a JSON fragment or a command is only partly, and the
  eval read is the check on the count.
- Whether the Open line should carry each question's title in two or three words as well as
  its code, for a user reading a reply after a compaction. The proposal says code only, on the
  ground that `kref` resolves it; the eval read may show otherwise.
- Whether the `D` row's "departs from a stated convention" is tight enough. A repo with no
  stated conventions leaves every craft call silent, which is the intent, and a model that
  reads "convention" loosely reports everything again. The `decisions` count is the check.
- Whether the verifier's r15 block still fires at the same rate once Part A lands. It should
  fall, because fewer decisions are manufactured; a rise means Part A moved the questions
  rather than removing them.
