# Prose headings, before and after

The pair check for [proposal 0002](../proposals/0002-prose-headings.md): eleven prompts, one per
exchange type, each answered under the current style and under the current style plus the
proposal's `## Prose headings` section and its item-order sentence. The proposal lands only when
the headed side reads at least as well on every pair, adds prose on none, and carries no theme
line that restates an item.

Status: set 1, the 22 cells below, ran on 2026-09-11, one run each. Its read was set aside the
same day because its prompts rarely met either rule's condition. Set 2, ten prompts chosen for
the conditions and run three times per cell, ran the same day and is recorded under
[Set 2](#set-2-prompts-chosen-for-the-conditions). Its result is that the appended section
reached the model and was applied in 1 of 30 headed cells, so the gate cannot be read on either
set until the section is rewritten.

## The prompts

Ten prompts are the author's own typed messages, quoted verbatim from Claude Code transcripts,
with the session they came from. The eleventh is the sample prompt from `styles/canned-review.md`,
because a canned review prompt arrives from a script and none was found as a typed turn in 127
transcript directories. It is the one synthetic prompt in the set, and the page says so where it
is quoted.

Nine of the eleven depend on what came before them in their session. Those run as a fork of the
original session, so both sides see the same prior context and only the appended section differs.
The two that stand alone run in a fresh session.

| # | Type | Prompt | Source | Run |
|---|---|---|---|---|
| 1 | `factual-question` | Is my alias not avaialble in my ~/.bashrc file that addes the append-system-prompt line? | katharsis, `99e93375`, 2026-08-27 | fork |
| 2 | `status-and-resume` | OK, it's been a minute, where we at with this work? | agent-content-interchange-format, `3eac3c46`, 2026-08-21 | fork |
| 3 | `approval` | 1. a - I merged 3 already by hand, so we may have to rewrite git history to erradicate any personal info that I just committed and push. ⏎ 2. a | katharsis, `2e75a061`, 2026-08-27 | fork |
| 4 | `thinking-out-loud` | Great. Now examine the ordering of the rules and let's discuss whether they need rearranging to make sense from a perspective of how you construct your replies. | home, `79cfd728`, 2026-08-25 | fork |
| 5 | `diagnosis` | Before I answer Q1, what is the functional difference between the two different settings files. In particular when should I use either what are the trade-offs? | katharsis, `158132f6`, 2026-09-02 | fork |
| 6 | `redirect` | Stop putting "Holden" in everything for this work, just say the user since we are going to be putting this into the public repo eventually. | home, `9b627de9`, 2026-08-31 | fork |
| 7 | `broken-report` | I got 7 instead of 5 for the verify part. | home, `292bec2c`, 2026-08-24 | fork |
| 8 | `work-request` | Find as many GitHub repos that are similar to Katharsis and list them here with a brief description along with a link. I heard about this one to get you started: https://github.com/adnanakil/nobuzz | katharsis, `6f890269`, 2026-08-31 | fresh |
| 9 | `canned-review` | Review the changed files for security-relevant defects and return a findings list. | `styles/canned-review.md` sample, synthetic | fresh, against the diff of the katharsis commit that added proposal 0002 |
| 10 | `harness-probe` | Reply with only the name of the output style named in your system instructions, or NONE. | probe scratch dir, `4b837d4b`, 2026-09-02 | fresh |
| 11 | `default` | Instead of "banning" exact phrases and terminology let's create actaul examples so that you can follow the methodology instead of finding loopholes to do the same thing anyways. | home, `d3ea0978`, 2026-08-24 | fork |

Prompt 3 carries a typed line break, shown as ⏎. Prompt 11 is a redirect wrapped around a
proposal with an instruction attached, which is the three-type mix that routes to `default`.
Prompt 10 is there to confirm the section leaves the probe's named form alone: both sides must
return the one line and nothing else.

Session ids are the first eight characters; the full ids are in the transcript directories under
`~/.claude/projects/`, named for the project path.

## The two sides

Both sides run the current `katharsis` output style as installed. The headed side adds the
proposal's section and its item-order sentence through `--append-system-prompt-file`. The file
is the two blockquotes from Part A of the proposal with the `> ` prefix stripped, the sentence
after the section under its own heading so the model reads it as a rule about coded groups:

```
{
  sed -n '/^> ## Prose headings/,/^> adds no words the ceiling forgives\./p' \
    docs/proposals/0002-prose-headings.md
  printf '\n> ## Item order\n>\n'
  sed -n '/^> Items inside a group run/,/were found\.$/p' docs/proposals/0002-prose-headings.md
} | sed 's/^> \{0,1\}//' > /tmp/prose-headings-section.md
```

In every source session the prompt is followed by the reply it drew and by later turns, and a
fork from the session's end would show the model its own earlier answer. The resume target is
therefore a copy of the transcript cut just before the prompt's own turn, written under a new
session id into the same project directory, so the fork carries the prior context and nothing
after it. Where the prompt was typed twice in its session, the cut sits before the first typing,
which is the text quoted above. A forked prompt then runs as:

```
claude -p --permission-mode bypassPermissions --resume <truncated-copy-id> --fork-session "<prompt>"
claude -p --permission-mode bypassPermissions --resume <truncated-copy-id> --fork-session \
  --append-system-prompt-file /tmp/prose-headings-section.md "<prompt>"
```

from the project directory the transcript lives under, which is the directory the session was
opened in. A fresh prompt drops `--resume` and `--fork-session`. Prompt 9 receives its diff on
stdin, as `git show 1c50c04 | claude -p ...`, the way a review script would deliver it. Each cell
runs once, and its reply is saved under `docs/evals/prose-headings/` as `<n>-bare.md` and
`<n>-headed.md` before the read.

## Run record

Forks inherit the model their source session ran on, so the pairs span three models, each pair
matched within itself: prompts 1 and 3 on `claude-fable-5`, prompts 4, 5, 6, 7, and 11 on
`claude-opus-5`, and prompts 2, 8, 9, and 10 on `claude-fable-5-1`.

In all four cells of prompts 7 and 11 the `security-guidance` plugin's Stop hook blocked the first
reply over an uncommitted `settings/settings.base.json` in maive-core, and the model's second turn
answered the hook rather than the prompt. The saved files hold the first reply, taken from the
transcript before the hook fired; `claude -p` printed only the second, which is not part of the pair.

Both cells of prompt 11 acted on the prompt under bypass permissions and edited maive-core:
`core/writing.md`, `core/technical-english.md`, `skills/writing-examples/SKILL.md`, and a new
`skills/writing-examples/references/technical-english.md`. The cells ran concurrently, and the bare
reply reports the headed cell's edits as a concurrent session's work.

Prompt 10 returned the one line `Katharsis` on both sides. Prompt 8's headed reply opens with a
progress sentence written before the list. Prompt 5's headed reply carries four unheaded prose
paragraphs between the answer line and Findings, which Run does not count because no `##` sits
above them.

Six pairs carry a coded group of three or more items on at least one side: 2 (State, both sides),
3 (Findings, headed), 4 (Questions, both), 5 (Findings and Trade-offs bare, Trade-offs headed),
7 (Verified, bare), and 11 (Actions Taken, headed). Prompts 8 and 9, expected to produce the
largest groups, produced none: prompt 8 listed repos as bullets under topic headings on both sides,
and prompt 9 coded one finding on the headed side and two on the bare.

## The read

The author reads each pair and fills five columns. "Found" is which side let them find the
answer to the prompt faster, bare, headed, or same. "Added" is whether the headed side carries a
sentence the bare side does not, with the sentence quoted when it does; a theme line is quoted
here and judged under Theme rather than counted as added prose. "Run" is the longest count of
prose paragraphs under one `##` heading on the headed side, where a blank line separates paragraphs
and coded items, list items, and question blocks are not paragraphs; the proposal's cap is 2. "Order" and "Theme" apply only to a pair whose replies carry a coded
group of three or more items, and read n/a otherwise. "Order" is whether the headed side put the
item that matters most first, yes or no, with the bare side's position of that item in the note.
"Theme" is one of none, names (the line states a relation no item states), or restates (the line
paraphrases an item or the list).

| # | Type | Found | Added | Run | Order | Theme | Note |
|---|---|---|---|---|---|---|---|
| 1 | `factual-question` | | no (80 vs 110 words) | 0 | | | |
| 2 | `status-and-resume` | | no (294 vs 295) | 0 | | | |
| 3 | `approval` | | no (252 vs 245) | 0 | | | |
| 4 | `thinking-out-loud` | | yes (575 vs 411): "Cross-references are all by number, so any rearrangement is a sweep of the whole file with a silent failure mode", a section the bare side has no counterpart for | 2 | | | |
| 5 | `diagnosis` | | no (535 vs 549) | 0 | | | |
| 6 | `redirect` | | no (177 vs 248) | 0 | | | |
| 7 | `broken-report` | | no (311 vs 287) | 0 | | | |
| 8 | `work-request` | | yes (709 vs 584): "Searches done. I checked around 40 repos and read the closest 25. Writing up the list now." Theme line under Per-turn classification: "These three route each message to a reply shape, so they are the closest cousins." | 1 | | | |
| 9 | `canned-review` | | no (332 vs 231) | 1 | | | |
| 10 | `harness-probe` | | no (1 vs 1) | 0 | | | |
| 11 | `default` | | no (433 vs 342) | 0 | | | |

Prompts 8 and 9 are the two expected to produce a group of three or more items on both sides,
and prompts 2 and 3 may. If fewer than three pairs fill the Order and Theme columns, the
proposal's open item on prompt coverage is live and the set gains a prompt built to produce a
large Findings group before the gate is read.

## The gate

Part A of the proposal lands when every row reads headed or same under Found, every row reads
no under Added, no row exceeds 2 under Run, every filled Order row reads yes, and no Theme row
reads restates. A row with a quoted sentence under Added, other than a theme line judged names,
or a Theme row reading restates, names a loophole the section did not close; the section is
rewritten and that row reruns before the gate is read again.

## What this page does not measure

Whether `--append-system-prompt-file` carries the same weight as the output-style body. A pair
that reads the same on both sides with no heading on the headed side is the section not landing,
and the first check is to confirm the appended text reached the model with prompt 10's method.
It also does not measure a week of live sessions, which is Part B's capture in
`telemetry/headings.jsonl`.

## Set 2: prompts chosen for the conditions

Set 1 chose one prompt per exchange type, and both rules under test are conditional on the
reply's shape rather than the message's type. The heading rule fires only on uncoded prose after
the answer line, and 8 of set 1's 11 bare replies carried 2 or fewer such paragraphs. The theme
line fires only on a group of three or more items sharing an unstated cause, and the proposal's
own count puts that at one group in four, so set 1's 5 large groups on the headed side gave one
expected instance. Set 2 chose prompts by the condition instead.

### The prompts

A scan of every typed turn in the author's transcripts since 2026-08-20 measured the reply each
drew under the current style: the count of uncoded prose paragraphs before the first `##`, and
the largest coded group. 453 replies carried 3 or more prose paragraphs and 234 carried a group
of 4 or more. Ten were chosen by hand from those, five per condition, all from sessions on
`claude-opus-5` so the pairs share one model, and none from a session whose working directory
was `maive-core`, where the `security-guidance` Stop hook blocked set 1's prompts 7 and 11. Three
come from one session at three cut points, and each cut is its own fork base.

| # | Condition | Type | Prompt | Source | Cut |
|---|---|---|---|---|---|
| 1 | prose, 8 paragraphs | `diagnosis` | Oh no I actually beg to differ about you saying that it's not a writing defect and no output style or writing rule touches it for when the tool work ran and the turn ended. I re-typed the ask off with the scope added because I lost the thread. I wouldn't have re-asked and lost the thread if the next action section would have been there so I think you're wrong. | katharsis, `afe01fda`, 2026-08-30 | record 677 of 764 |
| 2 | prose, 8 | `thinking-out-loud` | So in the ledger script that captures short codes, how do we capture bespoke short codes per session? Is that or is that even possible? | home, `651c8c2e`, 2026-09-01 | 136 of 301 |
| 3 | prose, 7 | `diagnosis` | Let us around on you because, what's the difference between a quick start guide and an integration guide? Think about that for a second and then come back to me. | astro workspace ATD-1041, `17f14d6a`, 2026-08-25 | 299 of 390 |
| 4 | prose, 7 | `work-request` | ok, take a look at ~/.claude/katharsis-lab/conversation-audit.md | katharsis, `afe01fda`, 2026-08-30 | 606 of 764 |
| 5 | prose, 8 | `approval` + `diagnosis` | yeah, risks probably belong in all styles potentially. let's definitely add it to work-request. how how a risk show up in factial-question though? | home, `651c8c2e`, 2026-09-01 | 232 of 301 |
| 6 | group of 10 | `redirect` | can you just give me a conscise list of things you found. this wall of text is difficult to parse | katharsis, `afe01fda`, 2026-08-31 | 748 of 764 |
| 7 | group of 6 | `thinking-out-loud` | what are we actually gaining by using the stop hook. I feel like this is a much bigger problem when we evaluate or check AFTER you send a message, maybe we should do some type of checks to help guide you BEFORE you even reply. [continues, 143 words] | katharsis, `afe01fda`, 2026-08-30 | 311 of 764 |
| 8 | group of 7 | `thinking-out-loud` | let's think about the userpromptsubmit more before building it. what can we feasibly and not annoyingly do with it? | katharsis, `afe01fda`, 2026-08-30 | 414 of 764 |
| 9 | group of 7 | `work-request` | Let's add Antigravity (`agy` CLI) as an option for bulk mechanical implementation. maybe do some research to see how they stack up against each other in different types of work first? | home, `923df462`, 2026-08-25 | 833 of 1820 |
| 10 | group of 6 | `approval` | 25. I think a combo of b and c. We can create a script that covers all rules so that they are deterministically caught and then we can have an LLM pass (suggest at least Fable/Opus models) to find bespoke rules to add based on their context. [continues with items 26 to 28 and a memory-audit paragraph, 118 words] | home, `0f082f48`, 2026-08-26 | 188 of 381 |

The Cut column is the record index of the prompt's own turn in its transcript, counting
non-empty lines, and the copy that serves as the fork base holds the records before it. Every
prompt in the set depends on its session, so all ten run as forks by the method under "The two
sides". Prompt 3 is the one set 2 prompt from a work session.

### The run

Each of the 20 cells ran three times, 60 runs, on 2026-09-11, six at a time, every run exiting
0. Replies are saved as `docs/evals/prose-headings/set2/<n>-<side>-<k>.md` with `k` from 1 to 3.
Runs took 20 to 256 seconds each.

A probe run before reading the results confirmed the appended file reaches the model: asked for
the first eight words of the section titled "Prose headings" in its system instructions, a fresh
`-p` session and a fork of prompt 6's base both returned "A sentence that fits a reference code
is". The open item on `--append-system-prompt-file` carrying weight is settled as far as
delivery goes, and what remains of it is whether the model applies text delivered that way.

Two Stop hook incidents, neither of which changes a saved reply's side-to-side comparison. In all
12 runs of prompts 7 and 8, the `katharsis-lab` stop verifier of the source session's era fired on
a 76-word progress line the model wrote mid-work, and the model then produced the full reply,
which is the saved file. In run 3 of prompt 10's headed cell, the current `stop-verifier.sh`
fired on the finished 620-word reply for a decision outside the Questions round, and the model's
second turn was a 178-word Errata-only repair. The saved file holds the 620-word reply, and the
repair sits in the run's scratchpad as `10-headed-3-after-hook.md`.

### The measurement

Per run, machine-read: words; uncoded prose paragraphs before the first `##`, where a blank line
separates paragraphs and coded items, list items, question blocks, and fences are not paragraphs;
`##` headings whose text is not a code group's name; the longest paragraph run under one `##`;
and the largest run of coded items sharing a code letter, with or without a group header, since
prompt 6's replies list findings with no `## Findings` above them. Theme is whether any coded
group opens with a bare sentence ahead of its first item.

| # | Run | Bare words / prose paras / group | Headed words / prose paras / prose headings / max run / group | Theme |
|---|---|---|---|---|
| 1 | 1 | 424 / 1 / 1 | 528 / 1 / 1 / 2 / 3 | none |
| 1 | 2 | 302 / 3 / 1 | 275 / 1 / 0 / 0 / 1 | none |
| 1 | 3 | 280 / 2 / 4 | 558 / 5 / 0 / 0 / 2 | none |
| 2 | 1 | 162 / 3 / 0 | 175 / 3 / 0 / 0 / 0 | none |
| 2 | 2 | 235 / 2 / 1 | 377 / 3 / 0 / 1 / 1 | none |
| 2 | 3 | 138 / 3 / 0 | 317 / 2 / 0 / 0 / 1 | none |
| 3 | 1 | 564 / 6 / 1 | 485 / 6 / 0 / 0 / 1 | none |
| 3 | 2 | 399 / 6 / 1 | 488 / 6 / 0 / 0 / 1 | none |
| 3 | 3 | 359 / 5 / 1 | 520 / 5 / 0 / 0 / 1 | none |
| 4 | 1 | 373 / 1 / 5 | 168 / 4 / 0 / 0 / 0 | none |
| 4 | 2 | 523 / 2 / 5 | 534 / 5 / 0 / 0 / 3 | none |
| 4 | 3 | 590 / 5 / 5 | 439 / 3 / 0 / 1 / 3 | none |
| 5 | 1 | 472 / 3 / 1 | 467 / 3 / 0 / 1 / 1 | none |
| 5 | 2 | 433 / 2 / 1 | 441 / 2 / 0 / 1 / 1 | none |
| 5 | 3 | 367 / 3 / 1 | 400 / 4 / 0 / 1 / 1 | none |
| 6 | 1 | 378 / 0 / 10 | 267 / 0 / 0 / 0 / 8 | none |
| 6 | 2 | 408 / 0 / 1 | 332 / 0 / 0 / 0 / 7 | none |
| 6 | 3 | 282 / 0 / 8 | 440 / 0 / 0 / 0 / 10 | none |
| 7 | 1 | 491 / 7 / 2 | 364 / 6 / 0 / 0 / 1 | none |
| 7 | 2 | 568 / 6 / 2 | 509 / 2 / 0 / 1 / 5 | none |
| 7 | 3 | 453 / 8 / 1 | 810 / 6 / 0 / 0 / 4 | none |
| 8 | 1 | 392 / 6 / 1 | 449 / 5 / 0 / 0 / 1 | none |
| 8 | 2 | 497 / 4 / 1 | 429 / 5 / 0 / 0 / 1 | none |
| 8 | 3 | 443 / 6 / 1 | 367 / 5 / 0 / 0 / 1 | none |
| 9 | 1 | 635 / 1 / 5 | 532 / 1 / 0 / 0 / 5 | none |
| 9 | 2 | 559 / 1 / 5 | 592 / 0 / 0 / 1 / 4 | none |
| 9 | 3 | 449 / 1 / 6 | 599 / 1 / 0 / 0 / 6 | none |
| 10 | 1 | 797 / 1 / 3 | 786 / 1 / 0 / 0 / 5 | none |
| 10 | 2 | 658 / 1 / 4 | 741 / 1 / 0 / 0 / 4 | none |
| 10 | 3 | 596 / 0 / 3 | 620 / 1 / 0 / 0 / 3 | none |

### The result

The conditions occurred. 16 of the 30 headed runs carried 3 or more uncoded prose paragraphs
between the answer line and the first coded group, against 15 of 30 bare runs, and 14 headed
runs carried a coded group of 3 or more items, against 12 bare runs.

The rules were not applied. One headed run in 30 carries a prose heading, run 1 of prompt 1,
whose section "Why the silence is the defect" covers 2 paragraphs. All 16 headed runs with 3 or
more prose paragraphs carry none, and prompts 3 and 8 wrote 5 to 6 bare paragraphs in every
headed run. No headed run opens a coded group with a theme line. The
headed side wrote 782 more words than the bare side across the 30 pairs, which is 6 percent,
and neither side wrote a bold lead-in heading.

Two candidate causes, in the order to rule them out. The per-turn guidance file for
`diagnosis`, which prompts 1 and 3 load after the system prompt, says "use the coded groups or
use paragraphs" in its Ceiling section, asks for "the reasoning, in paragraphs" in its Shape,
and excludes "bold section headings invented for this reply in place of the coded groups". The
proposal's Part A rewrites the first of those lines, and the eval's headed side ran without that
rewrite, so on diagnosis prompts the later-read file contradicted the appended section. That
does not reach prompts 2, 5, 7, and 8, whose `thinking-out-loud` file says nothing about
paragraphs or headings and whose headed runs wrote 2 to 6 bare paragraphs with no heading. The
second candidate is the section itself: the style body gives `##` to coded groups in every
example and in the Shape of every type, and a section that asks for `##` over prose is arguing
against 11 files of precedent it cannot see. Which cause dominates is a question for the
rewrite, and the check is a rerun of prompts 2 and 8 with the section moved into the style body
per Part A rather than appended.

### What remains of the read

Found and Order are still the author's columns, on both sets, and the 60 set 2 files are there
for them. The gate, though, has a precondition the page did not state: the headed side must
have applied the section before Added, Run, and Theme measure anything about it. On set 2 the
headed side applied it once, so a headed-or-same Found column would measure the absence of
headings rather than their effect. The gate is not read on this run. The section is rewritten
first, and the rerun uses set 2's fork bases, listed in the run's `forks2.tsv`, with prompts 2,
3, 7, and 8 as the minimum since those produced the most bare prose on both sides.

### The stop condition for the next round

Set before the round runs, on 2026-09-11: the next round is prompts 2, 3, 7, and 8 from set 2's
fork bases, three runs per headed cell, 12 headed runs. If fewer than 6 of the 12 carry a `##`
heading over prose, D23 and D25 are dropped from the proposal and D24, the item-order sentence,
lands alone. A round that clears the threshold goes on to the read and the gate as written above.

## Round 3: the section in the style body

### The placement

Set 2 delivered the section through `--append-system-prompt-file`, and the model applied it in
1 of 30 headed runs. Round 3 moves it into the output style body, as Part A of the proposal
places it, and leaves the installed style untouched so the bare side of set 2 stands as the
comparison. The headed side runs a copy of `~/.claude/output-styles/katharsis.md` with the
`## Prose headings` section inserted after "Craft that holds in every type" and the item-order
sentence added to the Reference codes paragraph, under the style name `Katharsis-b`, selected
per run with `--settings '{"outputStyle":"Katharsis-b"}'`. The two rewrites in Part A land in a
copy of the styles directory, which the copied style's script call reaches through
`KATHARSIS_DIR`: `diagnosis.md`'s Ceiling paragraph closes "Use the coded groups or `##` prose
headings, and never a bold lead-in", and `work-request.md`'s small-work paragraph drops its
headers sentence. `README.md` in the copy carries the section and the sentence as well. The
section's text is the proposal's, unchanged.

A probe confirmed the mechanism before the round: asked for the first eight words of the
section titled "Prose headings", a fresh `-p` session under the override and a fork of prompt
2's base under it both returned "A sentence that fits a reference code is", and a fresh session
without the override returned NONE.

### The run

Prompts 2, 3, 7, and 8 ran headed only, three times each, from the same fork bases as set 2, on
2026-09-14, six at a time, every run exiting 0 in 47 to 313 seconds, all on `claude-opus-5`.
Replies are saved as `docs/evals/prose-headings/set2/<n>-headed-r3-<k>.md`. No Stop hook fired
on any of the 12 replies, including the lab-era verifier that fired on prompts 7 and 8 in set 2;
each transcript holds one assistant text block after the prompt, and it is the saved file.

The round ran twice. The first pass named the copied style `katharsis-headed`, and the harness
repeats the active style's name to the model after every tool result, so the headed side read
"katharsis-headed output style is active" on every turn while the bare side reads "Katharsis".
One of its replies quoted that reminder. The name was a cue the bare side never saw, so the pass
was discarded, the copy was renamed `Katharsis-b`, and the 12 cells reran. The discarded pass
measured 12 of 12 replies with a `##` heading over prose; its files are not in the tree. The
kept pass still carries the name in one reply, `8-headed-r3-2`, which quotes "Katharsis-b output
style is active" as a duplicate of the prompt hook's line, and the name reads as a variant
rather than a rule about headings.

### The measurement

The same machine read as set 2, with the bare column carried over from set 2's table. Group is
the largest run of coded items sharing a code letter, counting items written on consecutive
lines as well as blank-line separated ones. Headed prose headings are `##` headings whose text
is not a code group's name; every one of them in this round sits over at least one prose
paragraph.

| # | Run | Bare words / prose paras / group | Headed words / prose paras / prose headings / max run / group | Theme |
|---|---|---|---|---|
| 2 | 1 | 162 / 3 / 0 | 217 / 1 / 1 / 1 / 2 | none |
| 2 | 2 | 235 / 2 / 1 | 250 / 1 / 1 / 1 / 2 | none |
| 2 | 3 | 138 / 3 / 0 | 281 / 1 / 1 / 1 / 2 | none |
| 3 | 1 | 564 / 6 / 1 | 663 / 1 / 3 / 2 / 3 | none |
| 3 | 2 | 399 / 6 / 1 | 543 / 1 / 2 / 2 / 2 | none |
| 3 | 3 | 359 / 5 / 1 | 656 / 1 / 3 / 2 / 3 | none |
| 7 | 1 | 491 / 7 / 2 | 575 / 1 / 3 / 2 / 2 | none |
| 7 | 2 | 568 / 6 / 2 | 367 / 1 / 3 / 2 / 0 | none |
| 7 | 3 | 453 / 8 / 1 | 589 / 1 / 3 / 2 / 4 | none |
| 8 | 1 | 392 / 6 / 1 | 444 / 1 / 3 / 2 / 1 | none |
| 8 | 2 | 497 / 4 / 1 | 484 / 1 / 4 / 1 / 1 | none |
| 8 | 3 | 443 / 6 / 1 | 403 / 1 / 3 / 2 / 1 | none |

### The result

The stop condition clears: 12 of 12 headed runs carry a `##` heading over prose, against 0 of
12 for the same four prompts in set 2. D23 and D25 stay in the proposal, and the round goes on
to the read and the gate.

Every reply takes the section's shape. One bare paragraph opens it, the prose sections follow
under headings in sentence case, the coded groups come after them, and Questions closes the
replies that carry a question round. No heading covers more than 2 paragraphs, so Run reads 2 or
under on every row. One reply, `8-headed-r3-1`, carries a numbered list inside a prose section,
which the section allows. Three replies carry a coded group of three or more items, `3-headed-r3-1`
and `3-headed-r3-3` with 3 Findings each and `7-headed-r3-3` with 4, and none of the three opens
with a theme line, so Theme reads none where it is read at all. The discarded pass produced one
theme line, over a Caveats group of 4 whose first line named the one regex the four gaps share,
which the kept pass did not reproduce. The headed side runs longer than the bare side in 9 of 12
runs, by 12 to 297 words, and shorter in 3.

### The read on round 3

The read runs on the 12 round-3 pairs, bare from set 2 against headed from this round, with the
columns as written under "The read", with the prose-run column named Longest run because Run already numbers the run. Found and Order are the author's; Added, Run, and Theme
come from the table above and are filled in before the read: Longest run is the max run column, Theme is
none on the three rows with a group of three or more and n/a elsewhere, and Added is filled once
Found is, since a headed reply that runs longer carries sentences the bare one does not and the
column asks whether one of them is padding.

| # | Run | Found | Added | Longest run | Order | Theme | Note |
|---|---|---|---|---|---|---|---|
| 2 | 1 | | | 1 | n/a | n/a | |
| 2 | 2 | | | 1 | n/a | n/a | |
| 2 | 3 | | | 1 | n/a | n/a | |
| 3 | 1 | | | 2 | | none | Findings, 3 items |
| 3 | 2 | | | 2 | n/a | n/a | |
| 3 | 3 | | | 2 | | none | Findings, 3 items |
| 7 | 1 | | | 2 | n/a | n/a | |
| 7 | 2 | | | 2 | n/a | n/a | |
| 7 | 3 | | | 2 | | none | Findings, 4 items |
| 8 | 1 | | | 2 | n/a | n/a | |
| 8 | 2 | | | 1 | n/a | n/a | |
| 8 | 3 | | | 2 | n/a | n/a | |

### Redaction of the reply files

Before the reply files entered the tree, work identifiers in them were replaced: Jira ticket
keys became `TICKET-1` through `TICKET-5`, one per key, in the prompt 3 files of set 2 and of
this round; the docs repository's two names became "the shared docs repo" and `docs-repo` in set
1's prompt 1 and 5 files; a ticket-named workspace became "an Aembit ticket workspace" in set
2's prompt 6 files; a colleague's name became "your colleague" in set 1's prompt 5 files; and
personal tracker item ids and the tracker's name became "tracker item" phrasing in set 1's
prompt 1, 2, 3, and 9 files and set 2's prompt 8 files. The word counts in the tables above were
taken before the replacements, which move a count by at most 3 words. Product and package names
stay, and the company name stays where a reply names the employer.
