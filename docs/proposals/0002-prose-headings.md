# Proposal 0002: A heading over every idea in uncoded prose

Status: landed on 2026-09-21 as D23, D24, and D25 in `docs/design.md`, after the eval in Part C
passed its gate on round 3 in `docs/evals/prose-headings.md`. Settled in a grilling session on
2026-09-09 and 2026-09-10, amended on 2026-09-11 with two rules for coded groups (Q22 to Q30).
Depends on D1, D5, D17, D20, and D22.

The reference codes give coded content a fixed structure: a `##` group header, one line per
item, an address per line. Uncoded prose has none. The answer line, a position, an argument,
and a diagnosis body all run bare, and a reply with no codes has no structure at all. The
reader scans a coded reply by header and a prose reply by reading it, which is the one place
the style still asks for reading rather than scanning.

Coded groups have a smaller version of the same gap. The items under a header carry no order
rule, so the one that matters most lands wherever the work put it, and a group whose items all
trace to one cause never says so; the reader infers the cause from the list. The amendment adds
two rules for that: items run most important first, and a group with a shared cause the answer
line does not state opens with one sentence naming it.

| Part | Change | Depends on |
|---|---|---|
| A | The rule, as a new section in the styles README and both output-style files, plus the item-order sentence in their Reference codes paragraph, with the two lines the section contradicts rewritten and the Examples updated | Nothing |
| B | A capture-only count in `ledger-stop.sh`: headings per reply, the longest paragraph run under one heading, and theme lines per reply, to `telemetry/headings.jsonl` | Nothing |
| C | An eval page: one real prompt per type, answered under the current style and under the current style plus Part A's section, read as pairs | Part A's text, before Part A lands |

Part C runs before Part A lands. Part B ships with Part A, because the cap it measures is the
part of the rule the author trusts least.

## The problem

Two replies from the session that produced this proposal show the gap. The reply answering
the first six grilling questions carried its position and its consequences as two bare
paragraphs ahead of the question round, and the reader found the point about the harness
default by reading both. The reply answering the next five carried one `##` heading per item,
and each item was found by scanning. The difference is the first half of the proposal.

The second half comes from a read of every coded group with three or more items in the
author's transcripts on 2026-09-11: 524 groups across 126 project directories, each read in
full by a subagent under one rubric. In 138 of them the items shared one cause, rule, or blast
radius that no item stated and the answer line did not state. The condition was the same in
every group: audit and review findings at five or more items, decisions that silently applied
one rule, actions that propagated one rename. Checklists never qualified. Separately, the item
that mattered most sat below the first position in 117 of the 524, most often because the list
ran in the order the work happened; Next Actions buried it in 13 of 29. The two defects were
independent in every reader's judgment, and the corpus already showed the fix for the first:
in 49 of the 122 Findings groups with a real theme, the answer line stated it, and those
replies read best.

The existing rules push the other way in two places:

- `styles/diagnosis.md` corrects "four bold axis headings" as invented structure and says
  "use the coded groups or use paragraphs". Under this proposal the correction is right about
  the bold form and wrong about the paragraphs.
- `styles/work-request.md` says "reaching for headers on a one-file edit makes the user parse
  a structure to find a sentence". Under this proposal a one-file edit gets the answer line
  and, where a second sentence exists, one heading over it.

## Part A: the rule

### The section, verbatim

This text goes into `styles/README.md`, `output-styles/katharsis.md`, and
`output-styles/katharsis-coding.md`, as a `## Prose headings` section placed after "Craft
that holds in every type" and before "Reference codes".

> ## Prose headings
>
> A sentence that fits a reference code is a coded line. Uncoded prose that changes no next
> move is cut. What remains is prose the reader needs and no code holds, and every idea in it
> sits under its own `##` heading.
>
> The answer line is the one bare line. It opens the reply alone, with no heading above it,
> because the first line is already where the reader looks. Everything after it that is not a
> coded group is headed, with no size floor: a single paragraph after the answer line gets a
> heading.
>
> One heading covers at most two paragraphs. A third paragraph under one heading is a second
> idea, which gets its own heading, or padding, which goes.
>
> A heading names the topic of the prose beneath it, in sentence case, as a noun phrase or
> short clause, with no trailing period. It never reuses a code group's name: a prose section
> called Findings or Risks makes the reader expect coded lines and find paragraphs.
>
> Prose sections sit between the answer line and the first coded group. The coded groups
> follow in the type's Shape order, and Questions stays last. A prose section between two
> coded groups reads as a group missing its codes. The group theme line below is the one
> exception.
>
> The answer line states the shared cause when the reply has one. A group whose items are
> instances of one cause, rule, or blast radius is a reply about that cause, and the first line
> says so.
>
> A group of three or more items that share one cause, rule, or consequence which no item
> states and the answer line does not state opens with one bare sentence naming it, as the
> first line under the group header, ahead of the first coded item. The sentence names the
> relation among the items rather than the most important item, which item order already puts
> first. A group of independent steps or checks gets no theme line, and a sentence that would
> restate an item or paraphrase the list is cut. The theme line is prose and counts toward the
> ceiling.
>
> `##` is the only heading form. A bold lead-in line is not a heading and draws the same
> correction it draws today.
>
> A numbered or bulleted list item is a labeled block, so a list is already headed. Agenda
> items of one or two sentences stay a list under the agenda override. An item that runs past
> two sentences becomes a heading with paragraphs beneath it, under the same two-paragraph cap.
>
> The ceilings still count prose under headings. A heading adds a line the reader scans; it
> adds no words the ceiling forgives.

### The item-order sentence, verbatim

This sentence goes into the Reference codes paragraph that begins "Codes number continuously
within a session", in the same three files, after the sentence ending "which stay last":

> Items inside a group run most important first, by what the reader loses by skipping the
> item, and never in the order the work happened or the order the items were found.

### The two rewrites

`styles/diagnosis.md`, the Ceiling paragraph beginning "Coded items are exempt from the
count". The correction on "four bold axis headings" stays; the closing sentence "Use the coded
groups or use paragraphs" becomes "Use the coded groups or `##` prose headings, and never a
bold lead-in".

`styles/work-request.md`, the Shape paragraph beginning "Small work gets prose". The sentence
"Reaching for headers on a one-file edit makes the user parse a structure to find a sentence"
goes. The paragraph keeps its point that small work is two or three sentences, and gains one:
the answer line runs bare and what follows it sits under one heading.

### The Examples

Every `## Examples` section whose sample reply carries prose past the answer line gets the
heading the rule requires, so the files stop contradicting the section. The count of quoted
lines per file, as of this proposal, is the size of that pass:

| File | Quoted lines |
|---|---|
| work-request | 30 |
| thinking-out-loud | 18 |
| approval | 16 |
| canned-review | 15 |
| default | 14 |
| broken-report | 13 |
| diagnosis | 13 |
| status-and-resume | 12 |
| harness-probe | 11 |
| redirect | 10 |
| factual-question | 8 |

Not every quoted line is a sample reply, and a sample whose body is one answer line stays as
it is. The pass touches only samples with prose after the answer line.

### What Part A does not change

The Shape files gain no pointer to the section. The rule is the same in all 11 types, and a
sentence repeated 11 times is the kind of line this style cuts. The verifier does not check
headings. Q6 in the grilling settled guidance only, and D5 blocks a reply only where the
repair is an appended line, which a missing heading is not.

## Part B: the capture

`ledger-stop.sh` already parses the final reply for coded lines and appends one record per
renumber to `telemetry/drift.jsonl` without blocking (D22). Part B adds a second capture in the
same hook, one record per reply, to `telemetry/headings.jsonl`:

```
{"ts": ..., "session_id": ..., "project": ..., "headings": N, "max_run": M, "bare": B, "themes": T}
```

`headings` is the count of `##` lines that are not code group names or Questions. `max_run` is
the longest run of paragraphs under one such heading before the next `##` line. `bare` is the
count of paragraphs after the first line that sit under no heading. `themes` is the count of
code group headers whose first non-blank line is prose rather than a coded item, which is the
theme line's position; it is there so the claim that the line fires rarely can be checked. No message text is
recorded (D17). A `max_run` above 2 is the Q13 cap failing; a `bare` above 0 is the rule
failing outright. Both are read back by hand after a week, and the proposal's status line
quotes them.

Capture only. The hook never blocks on either number, on the D22 precedent that a rule blocks
when the reader must reconstruct what the reply meant (D21), and a missing heading costs
scanning rather than meaning.

## Part C: the eval

Per `docs/evals/README.md`: the same prompt on both sides, a prompt whose type is not in
doubt, and the sample size in the page.

**Prompts.** Eleven, one per exchange type, pulled from the author's own Claude Code
transcripts under `~/.claude/projects/`, where each typed user turn is a `type: user` record
with a string `message.content`. The stamps the routing script writes are consumed per turn
and leave no type record, so the pull is by hand: read typed turns, pick one per row of the
cue table that two readers would type the same way, and record it in the page with its
source session. Prompts are the author's own words, so the page carries them verbatim.

**The two sides.** Both sides run the current style. The proposed side appends Part A's
section through `--append-system-prompt-file`, so the pair measures the section and nothing
else. Each prompt runs headless with `claude -p` in the repo it came from, once per side. A
prompt that depended on its session's earlier turns runs as a fork of that session with
`--resume <id> --fork-session`, so both sides see the same prior context; a prompt that stands
alone runs fresh. One run per cell, stated in the page.

**The two sides** also differ in the item-order sentence, which the appended file carries after
the section, so the pair measures the amendment as a whole.

**The read.** The author reads each pair and records, per pair, five things: which side was
found faster, whether the headed side added any prose the bare side did not have, whether the
headed side's `max_run` exceeded 2, and, for a pair whose replies carry a group of three or more
items, whether the headed side's item order put the item that matters most first and whether
any theme line it carries restates an item. The page holds the tally and the per-pair notes.

**The gate.** Part A lands when the headed side reads at least as well on every pair, adds
prose on none, and carries no theme line that restates an item. A pair where the headed side
added prose or restated is a loophole the section did not close, and the section is rewritten
before the eval reruns. A theme line is not added prose when it names a relation no item
states; the Added column quotes it and the Theme column judges it.

## D23, D24, and D25, as they would read

D23 - **Every idea in uncoded prose sits under a `##` heading, with the answer line bare, no
size floor, and at most two paragraphs per heading** - coded content is scannable by header
and uncoded prose was scannable only by reading, so a reply with no codes had no structure.
The floor was rejected because a paragraph count is a loophole for a few large paragraphs;
the cap exists because "one idea" is the loophole that remains. A sentence that fits a code
is a coded line first, which keeps the headed prose from restating the groups. Guidance only:
the verifier checks nothing here, and `ledger-stop.sh` captures heading counts to
`telemetry/headings.jsonl` on the D22 pattern so the cap can be quoted after a week.

D24 - **Items inside a coded group run most important first, never in work order or discovery
order** - the item that mattered most sat below first position in 117 of 524 groups read on
2026-09-11, and in Next Actions in 13 of 29, because lists ran in the order the work happened.
Guidance only, on the same grounds as D23.

D25 - **A group of three or more items sharing one cause the answer line does not state opens
with one bare sentence naming the relation** - 138 of 524 groups left a shared cause for the
reader to infer, and the condition held in every group type, so the rule names the condition
rather than a list of groups. The answer line states the cause first when the reply has one,
because the 49 groups whose answer line did so read best; the group line is for a theme the
answer line does not carry. Item order was rejected as the sole fix because the two defects were
independent in every reader's judgment. Guidance only, with a per-reply count in
`telemetry/headings.jsonl`.

## Rejected alternatives

- **A paragraph floor below which prose runs bare.** Rejected in grilling Q7: a floor of two
  paragraphs invites two large paragraphs, and the reader is back to reading.
- **A fixed heading vocabulary per type.** Rejected in Q4. `## Cause` tells the reader less
  than the topic does, and the gain was verifier-checkable headings under a rule that is
  guidance only anyway.
- **`###` for prose, `##` for groups.** Rejected in Q3. Prose sections and groups are peers in
  reading order, and `###` implies a parent that does not exist.
- **Bold lead-ins as a lighter form.** Rejected in Q9. Two heading forms is two things to
  learn, and the no-floor rule already covers the light case.
- **A heading per agenda item regardless of length.** Rejected in Q14. A list item is already
  labeled, and the headed form doubled the lines of a one-sentence item and added nothing.
- **A pointer sentence in each Shape.** Rejected in Q12. One sentence eleven times.
- **Landing directly and reverting on a bad week.** Rejected in Q15. The eval method already
  exists and asks for exactly this pair.
- **A theme line in place of prose headings.** Rejected in the 2026-09-11 round before Q22. The
  two cover different content: headings structure uncoded prose, and a theme line lives inside
  a coded group, so a reply with no codes gets nothing from it.
- **Item order alone, with no theme line.** Rejected in Q23 on the corpus read. Ordering fixes
  the buried item and leaves the shared cause unstated; the readers found the two defects in
  different records.
- **A theme line for Findings and Risks only.** Rejected in Q26. Decisions had the highest miss
  rate of any group, 13 of 34, and the condition already excludes the checklist groups, so a
  named list is a second rule that drifts.
- **A four-item threshold.** Rejected in Q27. Half the three-item Decisions groups had a real
  theme, and the "no item states it" condition carries the exclusion a count was meant to.
- **A coded form for the theme line.** Rejected in Q28. The line is prose about the items, and
  a code would invite "do TH1", which means nothing.

## Open items

- Whether `--append-system-prompt-file` reaches the model with the same weight as the
  output-style body. If a pair reads the same on both sides, the first thing to rule out is
  the section not landing.
- Whether `max_run` can be counted without a paragraph definition the parser and the writer
  share. A blank line is the working definition; a wrapped paragraph with no blank line
  counts as one.
- Whether the eleven eval prompts produce enough groups of three or more items to exercise D24
  and D25. The pairs that do are the ones that test them, and the eval page records which.
- Whether the theme line restates. A count cannot detect a sentence that paraphrases the list,
  so the restating loophole is read by hand in the eval and after a week of telemetry.
