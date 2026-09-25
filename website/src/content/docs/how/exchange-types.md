---
title: Exchange types
description: The 11 exchange types, the messages that match each, and each type's word ceiling.
---

The model assigns each message one of these types.

| Type | Example messages | Ceiling |
|---|---|---|
| `factual-question` | "is X shipped?", "where does Y live?" | 150 words |
| `status-and-resume` | "how's it going?", "let's continue", "773 merged" | 250 |
| `approval` | "Q1 a", "go ahead", "go ahead, but hold off on the second part" | 250 |
| `thinking-out-loud` | "let's discuss", "does that make sense?", "can we do X?" | 350 |
| `diagnosis` | "why does this happen?", "is this bad practice?" | 500 |
| `redirect` | "do it this way instead", "I deleted it on purpose" | 250 |
| `broken-report` | "the hook didn't fire", "I got 7, not 5" | 250 |
| `work-request` | "update the changelog", "open a PR for both fixes" | 400 |
| `canned-review` | A review prompt that a script sends | 300 |
| `harness-probe` | "answer in one line", "reply with only the token" | The requested form |
| `default` | A greeting, a pasted fragment, or a mix of three or more types | 250 |

Ceilings count prose only.
Coded items don't count toward the ceiling.
Each type's cues, shape, and examples are in [`styles/`](https://github.com/OpenScribbler/Katharsis/tree/main/styles).
