# CI triage: one prompt, rules on and rules off

The eval behind the README's demo. One prompt about a failing test suite, answered twice by
Claude Opus 5, once with the Katharsis rules loaded and once without. Both replies are stored
verbatim under [captures/](captures/), and the GIF at `docs/media/demo.gif` replays them.

## The setup

Both runs answered the same prompt, in the same repo, on the same day:

> CI has been flaky and slow on this repo. I'm pretty sure the fixed sleep in `orders/retry.py`
> is what's causing the test failures. Run the test suite, tell me what is actually failing and
> why, how long the suite takes and where that time goes, and whether we should bump the CI
> timeout to 30 minutes or split the suite into two jobs. Explain your reasoning.

The prompt is built to be answerable wrongly. It plants a false premise, because the fixed sleep
is the whole runtime and causes none of the failures. It asks for numbers, so the reply has to
carry evidence. It offers two options that are both wrong, so the reply has to hand a decision
back rather than pick one. And it ends with "Explain your reasoning", which invites the exact
narration the rules cut.

The repo it runs against is [`demo/sandbox/`](../../demo/sandbox), a small order-pricing package
with a real bug: `orders/pricing.py` uses Python's `round()`, which rounds half to even, while
two tests state that finance rounds half up. Its suite runs 10 tests in 4.0 seconds, fails 2, and
spends 4.0 of those seconds in `time.sleep` inside the retry tests.

Both runs used `claude -p` with Claude Opus 5, the default output style, and an isolated `HOME`
carrying no memory file, so the rules-off run is a genuine baseline rather than a run with other
instructions loaded. The rules-on run added `--append-system-prompt-file` with the three files
from `dist/rules/` concatenated, which is the shipped generic build. One run per side.

## What changed

| | Rules off | Rules on |
|---|---|---|
| Characters | 3,801 | 2,677 |
| Words | 597 | 410 |
| Em dashes | 14 | 0 |
| Coded items | 0 | 8 |
| Closing question | none; an open offer to look at more logs | 2 numbered questions, each with options and a recommendation |

The rules cut the reply by 30% and removed every em dash. The structure is the larger change:
the rules-on reply carries five coded findings, one coded decision, and two coded questions, so
every claim has a handle and every open decision sits in one place. The rules-off reply spreads
the same material across six prose headings and closes by offering to keep looking.

## What did not change

Both replies got the technical answer right. Both identified banker's rounding at
`orders/pricing.py` as the cause of the two failures, both corrected the false premise about the
retry sleep, both measured the 4-second runtime and attributed it to eight sleeps, and both
rejected the timeout bump and the suite split for the same reason. The rules changed the shape of
the answer and the reading time it costs. They did not change whether the answer was correct.

## Caveats

One prompt, one run per side, one model. The GIF replays the captured text rather than
re-rendering a live session, and the terminal replay shows markdown fences and tables as source,
which flatters neither side. `demo/README.md` says how to reproduce both captures.
