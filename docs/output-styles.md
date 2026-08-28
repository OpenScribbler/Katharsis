# Output styles and the rules

Claude Code applies one output style per session, chosen with `/output-style` and stored as
`outputStyle` in a settings file. The style and the Katharsis rules both shape the same
replies, so this page records how each built-in style interacts with the rules, measured
rather than guessed. `katharsis-setup` reads the installed style and quotes the guidance
below.

## The measurement

One prompt, six sessions on Claude Code 2.1.250 (2026-08-27): the three styles crossed with
rules on and rules off. The prompt asked for a timed test-suite run, a coverage check seeded
with one false premise, and a yes-or-no CI decision, so a reply had to carry numbers, a
correction, findings, and a question back. `scripts/detect-prose.sh` then counted the eleven
failure modes in each transcript.

| Style | Rules | Reply size | Narration blocks | Dash hits | Structure |
|---|---|---|---|---|---|
| Concise | on | 2,384 chars | 5 | 2 | findings and next actions coded; skipped the closing question block |
| default | on | 3,833 | 2 | 7 | the full contract: findings, risks, next actions, and a closing question with options and a recommendation |
| Explanatory | on | 4,986 | 3 | 4 | full contract, with a `★ Insight` teaching block inserted into it |
| Concise | off | 2,071 | 3 | 5 | numbered sections; no codes, no closing question |
| default | off | 4,746 | 9 | 12 | prose with tables; step-by-step narration between tool calls |
| Explanatory | off | 11,116 | 22 | 32 | two `★ Insight` blocks, self-narrated measurement detours, one banned negation-form header |

Narration blocks counts the separate text messages the reply arrived in, so it measures
play-by-play between tool calls. Dash hits is the detector's `r7-dash` count for the
transcript. One caveat: the Explanatory rules-off run was a re-send inside the same session
after a mislabeled first attempt, so it ran with warm context, but an 11,116-character reply
is not a warmth artifact.

## What the numbers say

The rules carry the structure and the style sets the volume. Rules on, every style produced
coded findings; rules off, none did. Concise alone was 313 characters shorter than Concise
with rules, because the rules spend characters on the codes, the evidence, and the closing
question, which is the part worth paying for.

Concise compounds with the rules. The pair gave the shortest reply and the cleanest detector
line of the six, and its one lapse was deciding the CI question itself in place of the
closing question block.

Explanatory fights the rules, and the rules mostly win. They compressed it from 11,116 to
4,986 characters, but it still ran 30% longer than default with rules, kept a teaching block
inside the coded structure, and produced the rules-on set's only comprehension-announcement,
uncoded-list, and synonym-drift hits. Learning shares Explanatory's teaching insertions, so
the same guidance applies to it, unmeasured.

Opening narration survived all six conditions: every reply opened with a line naming what it
was about to do, because the harness instructs that directly, so no style choice removes it.

## The guidance setup gives

- **Concise**: keep it, it compounds with the rules.
- **default**: works as installed; Concise pairs well for shorter replies.
- **Explanatory or Learning**: the style re-adds the narration and teaching blocks the rules
  remove, so expect longer replies and mixed structure.

Setup reports and advises only. Changing the style is the user's own `/output-style` action,
so it is never written to a settings file by Katharsis and never appears in the install
manifest.
