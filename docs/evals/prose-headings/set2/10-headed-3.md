Katharsis is free on GitHub, and the script can catch 9 of the 11 rules rather than 7.

## Errata

E1 - **F33's split was wrong: 9 rules are script-detectable, not 7** - Rules 5 and 6 are structural rather than semantic. Rule 5 compares the count of findings in a message against the count of codes, and Rule 6 compares the position of the question against the end of the message. Both are scriptable. Only Rule 1 (was this content requested?) and Rule 8 (does the evidence sit in the claim's sentence?) need the user's own prompt as context, so those two join bespoke-rule discovery in the LLM pass.

## Findings

F34 - **`KatharsisAI` is clear** - `github.com/KatharsisAI` returns 404, and GitHub search returns nothing for `KatharsisAI` or `katharsis-ai`. The only `katharsis` hit is `katharsis-project/katharsis-framework`, a dormant Java JSON:API library at 136 stars in an unrelated field. `github.com/katharsis` itself is taken at 200.

F35 - **`subtract` already audits memory, at a different altitude** - its SKILL.md description names memory among the things it verdicts, and `references/evidence-mining.md` measures capture-versus-digestion ratios for any memory system. It judges whether the system earns its place. It never triages individual memories into keep and delete, which is what you described.

F36 - **The memory audit has no corpus to test against here** - no `~/.claude/memory`, no `~/.claude/memories`, and no path under `~/.claude` matching `*memor*`. The rule audit has 720 transcript files to develop against; the memory audit would be written blind and verified on someone else's machine.

## Decisions

D1 - **The LLM pass routes to Fable, escalating to Opus** - your model routing sends taste-sensitive work to fable or opus, and proposing a rule from someone's prose is taste-sensitive. Fable is the default because the pass runs sampled and repeatedly.

## Questions

❓ **Q29** - **One script or two** - Q25 gives the audit a detection script covering 9 rules, which makes the setup script's substitution job small by comparison.
   a. Two purpose-named scripts — `scripts/mine-prose.sh` for detection, `scripts/setup.sh` for the interview handoff. Matches `subtract`, which ships one script named for its job.
   b. One `katharsis.sh` with `setup` and `audit` subcommands.

➡️ (a). Your Simplicity rule rejects abstractions built for one-time operations, and a dispatcher over two unrelated jobs is one.

❓ **Q30** - **Where the memory audit lives** - F35 says part of it already shipped.
   a. A skill inside this repo — it rides the same install, and it has nothing to do with writing rules, so it widens what the repo claims to be.
   b. A new skill in `subtract` — memory is already in subtract's scope, and this extends it from "does the system earn its place" to "which entries survive". One repo, one coherent claim.
   c. Its own repo.

➡️ (b). The triage you described is the missing second half of a measurement subtract already takes.

❓ **Q31** - **Is `KatharsisAI` the org or the repo** - Q18 put this under `OpenScribbler`, and F34 shows you checked an org-level URL.
   a. Repo `OpenScribbler/katharsis`, honoring Q18.
   b. New org `KatharsisAI`, with the repo under it. Splits your personal work across three GitHub homes.

➡️ (a). Nothing here needs its own org yet, and (b) stays available if the project outgrows one repo.

❓ **Q32** - **Slice, re-assessed** - the memory addition does not change the order.
   a. The rules — scrub, genericize, placeholder, README, LICENSE, `.claude-plugin/`, MOAT workflow.
   b. Setup skill and script.
   c. Audit skill, script, and LLM pass.

➡️ (a), unchanged. Both other slices write into placeholders the rule files define, so their contract does not exist yet. E1 does not move this, because it changes what the audit script covers rather than what it depends on.
