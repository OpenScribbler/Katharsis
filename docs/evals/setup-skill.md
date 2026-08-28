# Setup skill: what the rules do to a skill's own output

Every other eval here measures what the rules do to a free-form answer, where cutting length is
most of the win. This one measures what they do to a skill, which separates the two things the
rules offer: a skill script already fixes what has to be said, so length is out of reach and only
the structural change is left. The skill under test is `katharsis-setup`, which makes this a
measurement of Katharsis against itself.

Both replies are stored verbatim under [captures/](captures/):
[rules off](captures/setup-skill-rules-off.md) and [rules on](captures/setup-skill-rules-on.md).
The GIF at `docs/media/setup.gif` replays the rules-off run.

## The setup

Three prompts, word for word the same on both sides, run through `claude -p --resume` so all
three turns share one session:

1. `Set up my writing rules`
2. `All three files. Memory import. Call me Holden. Besides chat: the docs site. Yes, deny AskUserQuestion. Top of the file. Show me the plan.`
3. `Go.`

Both runs used Claude Opus 5, the default output style, and a separate isolated `HOME` holding
one four-line `AGENTS.md` and nothing else, with the plugin installed into it from this repo. The
wizard therefore discovers a memory file, finds no house style guide and no repo convention, and
asks for the rest. Every write landed inside the sandbox.

The rules-on run added `--append-system-prompt-file` with the three files from `dist/rules/`
concatenated, so the rules were already loaded while the skill installed them. One run per side.

## What changed

| | Rules off | Rules on |
|---|---|---|
| Characters, three replies | 8,425 | 8,475 |
| Words | 1,268 | 1,187 |
| Em dashes | 21 | 2 |
| Coded findings and actions | 0 | 9 (F1-F4, AT1-AT5) |
| Questions with lettered options | 0 | 6 |
| Questions with a recommendation | 0 | 6 |

`scripts/detect-prose.sh` run against each sandbox's own transcripts:

| Detector rule | Rules off | Rules on |
|---|---|---|
| `r4-opening-narration` | 2 | 1 |
| `r5-uncoded-list` | 2 | 0 |
| `r7-dash` | 23 (21 em dashes) | 4 (2 em dashes) |
| `r11-synonym-drift` | 1 | 2 |

The rules changed what a reader can do with the reply. The rules-off run reported its
discoveries as a three-column table and asked its six questions as a numbered list, each one
sentence of prose with a stated default and no options, so deciding meant inferring the
alternatives. The rules-on run reported the same discoveries as four coded findings, then asked
the same six questions in the format `writing.md` specifies: lettered options, and a
recommendation on its own line under each. Its third turn opened with five coded actions taken,
where the rules-off run opened with a prose heading.

That difference is what the reply is for. A setup run exists to get six decisions out of the
reader, and the rules-on run put all six in one place, gave each one its alternatives, and told
the reader what to pick and why, so the reader can answer without reconstructing the options. It
also gave every finding and every action a handle, so "more on F2" or "reverse AT4" is a complete
instruction for the rest of the session. Neither is available in the rules-off run at any reading
speed.

Volume was never available here, which is the point of running this eval on a skill. 8,425
characters became 8,475, a 0.6% increase, because the skill dictates the placeholder table, the
command block, and the manifest path either way. Word count still fell 6.4% at flat character
count, so the rules tightened sentences rather than dropping content. Reading time is the
smaller of the two benefits the rules offer, and this eval is where the other one shows up
alone.

Asking `READER_NAME` shows the difference most plainly. Rules off asked "What should I call you?
Required, no default." Rules on asked the same thing, offered `Hewett (from your email address)`
as option a, and recommended neither: "Tell me the name you want; I will not guess a first name
from an email address."

## What did not change

Both runs discovered the same memory file, resolved all five placeholders to the same values,
chose the same commands, wrote the same five files at the same byte sizes, made the same settings
edit, and named the same reversal path. The skill's gates held on both sides: neither wrote
anything before showing the full plan and getting an explicit yes.

## What this says about the skill's own prose

The rules-off run wrote "a supported outcome, not a gap" and "**Output style — a report, not a
question**", which is the form `writing.md` Rule 10 bans outright, and it spent 21 em dashes.
`skills/katharsis-setup/SKILL.md` is the source of that wording, and the rules were not loaded
when it ran, so the skill's own prose breaks the rules it installs. Loading the rules cut the em
dashes to 2 and left one instance of the banned form.

That is a finding about this repo rather than about the rules, and it is the reason the README
says the setup GIF shows a run with the rules absent.

## Caveats

One run per side, one model, one prompt sequence, and the two runs produced different transcript
sizes for the detector to read: 9 assistant messages rules off against 6 rules on, so the detector
counts compare two corpora that are close rather than identical. `r11-synonym-drift` rose from 1
to 2, which on a corpus this small is noise rather than a result.

The rules-on run is self-referential by construction. Claude read `writing.md` as an instruction
while installing `writing.md` as a file, and no eval here can separate the rules' effect from any
effect of the file's subject matter being in front of the model.
