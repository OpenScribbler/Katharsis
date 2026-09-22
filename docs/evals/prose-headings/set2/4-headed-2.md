The audit holds, and its ceilings survive a re-check in the units they actually govern.

I went in expecting the opposite. The audit reports whole-reply word counts, the style files govern prose only with coded items exempt, so the two had never been compared in the same units. I joined `audit-inventory.jsonl` to the 16 shards on `ask_uuid`, stripped headers, fences, tables, and coded lines, and recomputed the median successful reply per type.

Five of seven ceilings sit above what succeeded: work-request 248 against 400, approval 185 against 250, redirect 188 against 250, diagnosis 442 against 500, thinking-out-loud 177 against 350. So a reply that lands on its ceiling in those types is already longer than the replies that worked, and the ceiling is a backstop rather than a target.

T1 gets stronger in prose units, which is the part that matters most. thinking-out-loud runs 177 words for success against 488 for mixed, factual-question 204 against 460, diagnosis 442 against 711. Stripping the coded lines widens the gap the audit found instead of explaining it away, so length is the right lever and the audit picked it correctly.

The case against leaning on any of this: the corpus runs 2026-07-10 through 08-30, entirely before these style files existed. It validates the direction of the ceilings and cannot score them. Only replies written under the system can do that, and the days since then are the first corpus that holds any.

## Findings

F48 - **factual-question's 150-word ceiling sits below the prose median of replies that succeeded** - 204 words across 66 successes, the only type where a solid n puts the ceiling under what worked.

F49 - **broken-report is the one type where successful replies ran longer than mixed ones** - 344 prose words against 281, reversing the rationale in `broken-report.md:5`, though on 7 successes against 17 mixed.

F50 - **salvaging is correctly absent from the system** - the audit refuted it at 14 of 1,366 triples, and nothing under `~/.claude/katharsis` mentions it.

## Questions

❓ **Q29** - **Raise factual-question's ceiling from 150 to 200 words?** - F48 is the one ceiling the data puts under what worked, on the largest clean sample of any conversational type.
   a. Raise it to 200, matching the measured prose median.
   b. Leave it at 150, treating the gap as intentional pressure on a type whose failures were the report-scaffolding ones.

➡️ b - what forecloses differently is enforcement reach: 150 stays a number I come in under, and raising it to the observed median makes the median the target for every future reply, including the 44 mixed ones that sat at 460.

❓ **Q30** - **Re-run the audit's method over the replies written since the style files shipped?** - the existing corpus cannot score the system, and F49 rests on 7 successes that more data would settle either way.
   a. Re-run now over the days since 09-01, reusing the extraction script.
   b. Wait until the post-system corpus is larger, and keep F49 open.

➡️ a - the script and shard pipeline already exist, so the cost is one run rather than a rebuild, and it answers whether the ceilings changed anything rather than whether they match old replies.
