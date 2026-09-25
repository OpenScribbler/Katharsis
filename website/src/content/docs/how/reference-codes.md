---
title: Reference codes
description: The codes a reply puts on items you might refer back to.
---

A reply codes each item you might act on or refer back to.
Every coded line has the same form:

```
F1 - **the claim** - why, in one sentence
```

| Code | Meaning |
|---|---|
| `F` | Finding |
| `A` | Assumption |
| `R` | Risk |
| `C` | Caveat |
| `AT` | Action taken |
| `V` | Verified |
| `NA` | Next action |
| `B` | Blocked |
| `MV` | Your move |
| `W` | Waiting |
| `X` | Excluded |
| `S` | State |
| `T-O` | Trade-off |
| `E` | Erratum |
| `Q` | Question |

Numbers never restart within a session.
The model can define a new code when none of these fits, and the ledger records it.

## Answer a question

Answer a question with its code and an option letter, such as `Q3 a`.
To give your own answer, use `z` followed by your answer, such as `Q3 z ship it Friday`.
To drop a question you no longer care about, use `x` or the word `dismiss` or `cancel`, such as `Q3 x` or `Q3 dismiss`.
