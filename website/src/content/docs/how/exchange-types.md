---
title: Exchange types
description: The 11 exchange types, the messages that match each, and each type's word ceiling.
---

The model assigns each message one of these types.

| Type | Example messages | Ceiling |
|---|---|---|
| `factual-question` | "Is the new endpoint deployed?"<br>"Where is the retry limit set?" | 150 words |
| `status-and-resume` | "Where are we?"<br>"Let's continue."<br>"The PR merged." | 250 |
| `approval` | "Q1 a"<br>"Go ahead."<br>"Go ahead, but skip the migration for now." | 250 |
| `thinking-out-loud` | "Let's talk through the caching options."<br>"Does this plan make sense?"<br>"Can we run this in CI instead?" | 350 |
| `diagnosis` | "Why does the build fail on Windows?"<br>"Is this a good way to handle retries?" | 500 |
| `redirect` | "Use the existing helper instead."<br>"I removed that file on purpose." | 250 |
| `broken-report` | "The test still fails."<br>"I get 7 results, not 5." | 250 |
| `work-request` | "Add a test for the parser."<br>"Open a PR with both fixes." | 400 |
| `canned-review` | A review prompt that a script sends | 300 |
| `harness-probe` | "Answer in one line."<br>"Reply with only the token." | The requested form |
| `default` | A greeting, a pasted fragment, or a mix of three or more types | 250 |

Ceilings count prose only.
Coded items don't count toward the ceiling.
Each type's cues, shape, and examples are in [`styles/`](https://github.com/OpenScribbler/Katharsis/tree/main/styles).
