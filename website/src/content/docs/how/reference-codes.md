---
title: Reference codes
description: The fifteen codes a reply puts on the items you might refer back to.
---

Fifteen codes, each with one form:

```
F1 - **the claim** - the evidence, in the same sentence
```

| Code | Holds |
|---|---|
| `F` | Findings |
| `A` | Assumptions |
| `R` | Risks |
| `C` | Caveats |
| `AT` | Actions taken |
| `V` | Verified |
| `NA` | Next actions |
| `B` | Blocked |
| `MV` | Your move |
| `W` | Waiting |
| `X` | Excluded |
| `S` | State |
| `T-O` | Trade-offs |
| `E` | Errata |
| `Q` | Questions |

Numbers never restart within a session. The model may define a new code when none fits, and the
ledger records it either way, because detection is by shape rather than by an allowlist.

## Answering a question

A question lists its options by letter and ends with a recommendation. Answer it by code and
letter, such as `Q3 a`. The letter `z` on any question means your own answer, in the words that
follow it: `Q3 z ship it Friday`.
