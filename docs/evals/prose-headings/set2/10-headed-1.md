`OpenScribbler/Katharsis` is already the shipped package, and the name you picked is its name.

## Findings

F34 - **The repo exists, is public, and is further along than the proposal** - `OpenScribbler/Katharsis`, MIT, pushed 2026-09-11, carrying `.claude-plugin/{plugin.json,marketplace.json}`, `scripts/setup.sh`, hooks, `tests/`, `docs/`, CHANGELOG, SECURITY, CODE_OF_CONDUCT, an OpenSSF Scorecard badge, and 26 merged PRs. `~/.claude/katharsis` and the new working directory `~/.local/src/katharsis-live` are two checkouts of it, and katharsis-live has 4 modified files uncommitted: `scripts/detect-reply.sh`, `scripts/packs/ask-phrases.txt`, `scripts/stop-verifier.sh`, `tests/test-detect-reply.sh`.

F35 - **Katharsis ships reply shape, not the sentence rules** - it holds 11 exchange types, the code table, and the ceilings, and it has no `rules/` directory, so `writing.md`, `technical-english.md`, and `git-writing.md` still have no published home. That is the actual gap the punt describes.

F36 - **The deterministic half of the audit is already built** - `scripts/detect-reply.sh` emits rule ids `r2-comprehension`, `r3-hedge-stack`, `r4-opening-narration`, `r5-uncoded-list`, `r6-buried-question`, `r7-dash`, `r7-colon`, `r8-evidence-section`, `r9-vague-quantifier`, `r10-negation-first`, `r12-slop-term`, `r13-plain-word`, `r14-consistency`, `r15-question-outside-round`, backed by 102 lines of phrase packs. Pointing it at `~/.claude/projects/*.jsonl` instead of at the current reply is the whole of Q25's script half.

F37 - **`KatharsisAI` as a GitHub org is free, and unhelpful** - the API returns 404 for `KatharsisAI` and `Katharsis-AI`, and the `katharsis` user exists with 0 repos. The nearest repos are `katharsis-project/katharsis-framework` at 136 stars, a dormant Java JSON:API library. Nothing blocks the name; what blocks it is that your own project already holds it.

F38 - **You already run the strongest memory option** - `~/.claude/settings.json:241` sets `"autoMemoryEnabled": false`, so the purge-or-audit-or-disable offering is advice for installers rather than for you, and there is no memory store on this machine to audit.

## Errata

E1 - **F33's split was wrong** - I said 7 of 11 rules were script-detectable and Rules 1, 5, 6, and 8 needed an LLM pass. F36 shows the shipped detector already covers 5, 6, and 8. Only Rule 1, unrequested content, resists a script, because it needs the request to compare against. Q25's "script covers all rules" is therefore nearly free rather than the larger half of the work.

## Questions

❓ **Q29** - **Where the writing rules live, given F34** - the name question is now a home question.
   a. Inside `OpenScribbler/Katharsis` as a `rules/` directory plus a setup skill, extending `scripts/setup.sh`. MOAT tier-1 discovery picks `rules/` up with no config, the install path already exists, and the two halves ship as one thing a stranger installs once.
   b. A separate `OpenScribbler/<name>` repo that Katharsis depends on, so the sentence rules stand alone for people who do not want the output style.
   c. A separate repo with no dependency, duplicating what overlaps.

➡️ (a). Katharsis's own style file already restates `writing.md` as its "Craft that holds in every type" section, so a separate repo means maintaining one rule set in two places, and (c) guarantees drift.

❓ **Q30** - **The setup split, re-asked under Q25(b+c) and F34** - `scripts/setup.sh` already exists and handles the permission grant and the style pick.
   a. Extend `setup.sh` with the rule-file stages, and add one setup skill that discovers the installer's glossary, PR template, and ticket prefix before the script runs.
   b. Leave `setup.sh` alone and add a second script for rules, so the output style and the rules install independently.
   c. Skill-only for rules, no script changes.

➡️ (a). One install path is the reason F34's package works, and a second script asks the installer to know which one they need.

❓ **Q31** - **This session's slice, re-assessed** - F34 and F36 moved the cheapest work.
   a. Land the 4 uncommitted files in katharsis-live first, then stop. They are in flight and block a clean branch for anything else.
   b. The rules slice: scrub `writing.md`, `technical-english.md`, `git-writing.md`, and the `writing-examples` pairs Aembit-clean, placeholder the seven numbers, and land them under `rules/`.
   c. The audit slice, since F36 says the detector is most of it.

➡️ (a) then (b). I will not touch the working tree until you answer, and the uncommitted files are yours to describe before I stage them.

❓ **Q32** - **Where the memory audit belongs** - it is an audit of a Claude Code setting, not of prose.
   a. `OpenScribbler/subtract`, which already audits installed Claude Code items with KEEP/FIX/TRIAL/ADOPT/CUT verdicts and an archive-with-rollback path. The three offerings you named map onto its existing verdict and wave model.
   b. The Katharsis audit skill, so an installer gets the memory recommendation in the same pass that measures their prose.
   c. Both, with subtract owning the method and Katharsis linking to it.

➡️ (a). Memory hygiene shares no evidence source with the prose audit, and subtract's README already reports a memory system with 1,100+ entries read back 7 times, so the finding and the tooling are both there.
