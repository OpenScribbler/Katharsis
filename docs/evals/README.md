# Evals

What the Katharsis rules do to a real reply, measured rather than asserted. Every claim the
README makes about shorter or cleaner replies traces to a page in this directory, and every page
here names its sample size, so a reader can see how much weight a number carries.

## The evals

| Eval | Date | What it measured | Headline |
|---|---|---|---|
| [CI triage](ci-triage.md), [both replies compared](ci-triage-compared.md) | 2026-08-28 | One CI-triage prompt answered twice by Claude Opus 5, rules on and rules off, against a sandbox repo with a real bug | The rules cut the reply from 3,801 to 2,677 characters, removed all 14 em dashes, and turned an open-ended offer into 8 coded items and 2 questions with recommendations, without changing the technical answer |
| [Output styles](output-styles.md) | 2026-08-27 | One prompt across three Claude Code output styles, rules on and rules off, six sessions | The rules cut the default style's reply from 4,746 to 3,833 characters and its narration blocks from 9 to 2, and no rules-off run produced coded findings at all |

## How an eval here is run

Four requirements, so two pages can be compared:

1. **The same prompt on both sides.** A rules-on reply and a rules-off reply answer the same
   words, in the same repo, or the pair measures the prompt instead of the rules.
2. **A prompt that can fail.** The reply has to carry numbers, a correction of a false premise,
   findings, and a decision handed back, because those are what the rules govern. A prompt that
   only asks for a fact cannot show a difference.
3. **`scripts/detect-prose.sh` for the counts.** The detector counts one failure mode per
   built-in rule with no model in the loop, so the numbers do not depend on a model's judgment of
   its own output.
4. **The sample size in the page.** One run per cell is one run per cell. Say so in the page and
   in anything that quotes it.

## Adding an eval

Write the page under this directory, add a row to the table above, and link it from the README's
results section when it changes what that section claims. A page that contradicts an earlier eval
stays, and both rows keep their dates, because a result that moved is itself a finding.
