# Evals

What Katharsis does to a real reply, measured rather than asserted, and the check a release has to
pass. Every page names its sample size, so a reader can see how much weight a number carries.

## The pages

| Page | What it is |
|---|---|
| [The real-path check](style-path.md) | The manual procedure a release runs before it is tagged: install, set up, three turns, and what the hooks must have written. It records its own results. |

The 0.2.x evals measured the writing rules that 0.3.0 removed, and they are in this directory at
the `katharsis--v0.2.1` tag.

## How an eval here is run

Three requirements, so two pages can be compared:

1. **The same prompt on both sides.** A style-on reply and a style-off reply answer the same
   words, in the same repo, or the pair measures the prompt instead of the style.
2. **A prompt whose type is not in doubt.** The style's first act is classification, so a prompt
   that two readers would type differently measures the cue table rather than the shape. Pick a
   message that sits squarely in one row of the table, or say which two.
3. **The sample size in the page.** One run per cell is one run per cell. Say so in the page and
   in anything that quotes it.

## Adding an eval

Write the page under this directory, add a row to the table above, and link it from the README
when it changes what the README claims. A page that contradicts an earlier eval stays, and both
rows keep their dates, because a result that moved is itself a finding.
