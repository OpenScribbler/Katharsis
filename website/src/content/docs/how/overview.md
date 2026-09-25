---
title: The turn, step by step
description: What the prompt hook, the model, and the three Stop hooks each do in one turn.
---

1. **You send a message.** The prompt hook reads which output style is active and, when it
   is Katharsis, prints the classify-then-read instruction into the model's context along with the
   next free code numbers from the ledger. Claude Code names the active style itself on every turn,
   and this instruction is what keeps the classification step from fading over a long session.
   When the model family changes, and after a compaction, the hook also attaches a short note for
   Fable, Opus, or Sonnet from `styles/models/`, correcting the leans Anthropic's prompting guide
   names for that model.
2. **The model classifies the message** with the cue table in the style, then runs
   `scripts/katharsis-exchange-style.sh <type>`. The script prints the guidance file for that type,
   so running it is the read, and stamps the type for the Stop hook. It never classifies; that
   judgment stays with the model. An unknown type exits non-zero and prints the valid set.
3. **The model writes the reply** under that file's Shape, Ceiling, and Verification sections.
4. **Three Stop hooks run.** One checks the stamp and, when a turn skipped the classification
   step, appends one JSON line to `telemetry/gate-misses.jsonl` with no message text. The second
   parses every coded item out of the reply and writes it to `ledger/<project>/<session>.jsonl`,
   and holds the reply once when it gives a code a different claim than the one on file with no
   `E` line naming that code. The third reads the finished reply and holds it once when it opens by
   narrating the intended action and buries the finding.

## What a hold asks for

No hook ever asks for a reply to be written again. A hold asks only for the lines that were
missing: an `E` line and the corrected claim for a drifted code, an `E` line plus the Questions
round for a misplaced decision, or the finding on its own line for a buried opening. The reply
you already read stands and only the added lines are new. A rule with no such repair records the
reply and lets it through.

Every hook exits 0 on every path where it cannot help, so a hook that fails costs you a ledger
row, never a turn.
