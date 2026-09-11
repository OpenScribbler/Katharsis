# Prose headings, before and after

The pair check for [proposal 0002](../proposals/0002-prose-headings.md): eleven prompts, one per
exchange type, each answered under the current style and under the current style plus the
proposal's `## Prose headings` section and its item-order sentence. The proposal lands only when
the headed side reads at least as well on every pair, adds prose on none, and carries no theme
line that restates an item.

Status: all 22 cells run on 2026-09-11, one run each, replies saved under
`docs/evals/prose-headings/`. Added and Run are filled; Found, Order, Theme, and Note await the
author's read.

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
