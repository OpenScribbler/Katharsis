# Prose headings, before and after

The pair check for [proposal 0002](../proposals/0002-prose-headings.md): eleven prompts, one per
exchange type, each answered under the current style and under the current style plus the
proposal's `## Prose headings` section. The proposal lands only when the headed side reads at
least as well on every pair and adds prose on none.

Status: prompts picked, no runs yet. Sample size when complete: one run per cell, 22 cells.

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
proposal's section through `--append-system-prompt-file`. The file is the blockquote from Part A
of the proposal with the `> ` prefix stripped:

```
sed -n '/^> ## Prose headings/,/^> adds no words the ceiling forgives\./p' \
  docs/proposals/0002-prose-headings.md | sed 's/^> \{0,1\}//' > /tmp/prose-headings-section.md
```

A forked prompt runs as:

```
claude -p --resume <session-id> --fork-session "<prompt>"
claude -p --resume <session-id> --fork-session \
  --append-system-prompt-file /tmp/prose-headings-section.md "<prompt>"
```

from the project directory the session belongs to. A fresh prompt drops `--resume` and
`--fork-session`. Each cell runs once, and its reply is saved under `docs/evals/prose-headings/`
as `<n>-bare.md` and `<n>-headed.md` before the read.

## The read

The author reads each pair and fills three columns. "Found" is which side let them find the
answer to the prompt faster, bare, headed, or same. "Added" is whether the headed side carries a
sentence the bare side does not, with the sentence quoted when it does. "Run" is the longest
count of paragraphs under one `##` heading on the headed side, where a blank line separates
paragraphs; the proposal's cap is 2.

| # | Type | Found | Added | Run | Note |
|---|---|---|---|---|---|
| 1 | `factual-question` | | | | |
| 2 | `status-and-resume` | | | | |
| 3 | `approval` | | | | |
| 4 | `thinking-out-loud` | | | | |
| 5 | `diagnosis` | | | | |
| 6 | `redirect` | | | | |
| 7 | `broken-report` | | | | |
| 8 | `work-request` | | | | |
| 9 | `canned-review` | | | | |
| 10 | `harness-probe` | | | | |
| 11 | `default` | | | | |

## The gate

Part A of the proposal lands when every row reads headed or same under Found, every row reads
no under Added, and no row exceeds 2 under Run. A row with a quoted sentence under Added names a
loophole the section did not close; the section is rewritten and that row reruns before the
gate is read again.

## What this page does not measure

Whether `--append-system-prompt-file` carries the same weight as the output-style body. A pair
that reads the same on both sides with no heading on the headed side is the section not landing,
and the first check is to confirm the appended text reached the model with prompt 10's method.
It also does not measure a week of live sessions, which is Part B's capture in
`telemetry/headings.jsonl`.
