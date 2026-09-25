---
title: How a turn works
description: What the prompt hook, the model, and the Stop hooks do in each turn.
---

1. You send a message.
   The prompt hook adds the classification instruction and the next free code numbers to the model's context.
   When the model family changes, or after a compaction, the hook also adds a short note for that model family.
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
| A code's claim changed with no erratum | An `E` line and the corrected claim |
| A decision appears outside the questions section | An `E` line and the questions section |
| The reply opens by describing what it's about to do | The finding on its own line |

Each hook exits 0 when it can't do its job, so a failing hook costs a ledger row, not a turn.
