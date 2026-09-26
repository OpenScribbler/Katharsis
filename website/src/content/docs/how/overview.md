---
title: How a turn works
description: What the prompt hook, the model, and the Stop hooks do in each turn.
---

1. You send a message.
   The prompt hook adds the classification instruction and the next free code numbers to the model's context.
   When your message answers a question, the hook records the answer, and it names the questions still open.
   When the model changes to one that takes a different note, or after a compaction, the hook also adds a short note for that model, from a note for its version when one exists and otherwise for its family.
   After a compaction, it also lists each owed item the ledger still has open, the oldest 12, with its body and a question's options and recommendation, each shortened to 200 characters, so the resumed turn does not depend on the summary's account of what was owed.
1. The model classifies your message and runs `katharsis-exchange-style.sh <type>`.
   The script prints the guidance file for that type.
1. The model writes the reply that the guidance file describes.
1. Three Stop hooks run:
   - The first records a turn that skipped the classification step.
   - The second writes each coded item to the ledger.
   - The third checks that the reply opens with its finding.

## Held replies

A Stop hook can hold a reply once and ask for the missing lines.
It never asks for a rewrite.

| Problem | The hook asks for |
|---|---|
| A code's claim changed with no erratum | A line saying the code stands as on file, the corrected line with an `E` line, or the new item under a fresh code |
| The reply opens by describing what it's about to do | The finding on its own line |

Each hook exits 0 when it can't do its job, so a failing hook costs a ledger row, not a turn.
