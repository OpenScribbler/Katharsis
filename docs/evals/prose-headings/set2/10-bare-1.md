`KatharsisAI` is clear on GitHub, and it collides with nothing in the writing or agent space.

## Errata

E1 - **F33's 7-to-4 split was wrong; it is 10 to 1** - Rules 5, 6, and 8 have deterministic structural proxies I did not credit: Rule 5 is "three or more findings with no `F1 -` pattern present", Rule 6 is "a `?` exists and is not in the final line", Rule 8 is "a pass or verification claim with no command, path, or number within the sentence". Only Rule 1 resists a script, because unrequested content cannot be judged without reading the user turn that preceded it. Your Q25 answer stands as written for 10 of 11 rules.

## Findings

F34 - **Memory is already off on this machine** - `~/.claude/settings.json:241` sets `"autoMemoryEnabled": false`, and no memory directory exists under `~/.claude`. The memory audit is a feature for installers rather than something you can dogfood here, so its checkmark file and purge paths need building against the documented layout rather than against your disk.

F35 - **`KatharsisAI` is unclaimed and `katharsis` is not** - GitHub search returns no repo for `KatharsisAI`, and `github.com/katharsisai` and `github.com/KatharsisAI` both return 404. Bare `katharsis` belongs to `katharsis-project/katharsis-framework`, a JSON:API Java library at 136 stars, and that org holds `github.com/katharsis`. A repo named `katharsis` inside your org reads clean; a top-level org named `katharsis` does not.

F36 - **The memory audit is a different product from the writing rules** - purging stale memory improves what the agent knows, and the rules govern how it writes. `OpenScribbler/subtract` already audits an installed Claude Code setup and already verdicts memory systems, so the memory work has a home that the writing repo does not naturally give it.

## Decisions

D1 - **Name settled as Katharsis, per your Q27** - I did not re-ask, since F35 confirms availability and the only open part is the path, which Q31 covers.

## Questions

❓ **Q29** - **Where the setup interview lives, now that Q25 gives the audit a script covering 10 rules** - the re-ask you asked for. Q26's option (b) assumed a thin setup script and a separate audit script; one script now does most of the work.
   a. Two scripts — `setup.sh` for identity and destinations, `mine-prose.sh` for counts. Duplicates argument parsing and the transcript walk.
   b. One script with `setup` and `audit` subcommands, the skill calling whichever it needs.
   c. Setup skill owns the whole interview and calls `mine-prose.sh` directly, so one script exists and it only ever counts. The skill writes files; the script never does.

➡️ (c). It keeps the file writes in one place, and a script that only reads and counts is the one you can hand a stranger to run before they trust the package with their `AGENTS.md`.

❓ **Q30** - **Where the Claude Memory audit ships** - F36 says it fits the writing repo poorly.
   a. A fourth tier inside the Katharsis audit skill.
   b. Its own skill in the Katharsis repo, with the three offerings you named: purge and start fresh, a checkmark file of one-line summaries to keep or delete, or disable memory entirely via `autoMemoryEnabled`.
   c. Build it into `subtract`, which already audits installed setups, and have Katharsis setup recommend running it.
   d. (b) now, and move it to `subtract` later if it outgrows the repo.

➡️ (c). Memory has nothing to do with how prose reads, and subtract already has the inventory, verdicts, and rollback machinery the checkmark file wants. If you want it in Katharsis anyway, (b) over (a), since a memory audit should be runnable without touching the writing rules.

❓ **Q31** - **Repo path** - Q18 settled the org as OpenScribbler; your Q27 answer reads like an org name.
   a. `OpenScribbler/katharsis` — sits beside syllago, moat, and subtract, and the org already carries your identity.
   b. A new `KatharsisAI` org with `KatharsisAI/katharsis` inside it — a home if Katharsis grows past one repo.

➡️ (a). One repo does not need an org, and F35 shows the name is safe either way, so this stays reversible.

❓ **Q32** - **Which slice this session** - the re-assessment you asked for, after E1 and Q25.
   a. The rules, as Q28 proposed — scrub, genericize, placeholders, README, LICENSE, `.claude-plugin/`, MOAT workflow.
   b. `mine-prose.sh` first — write and test the 10 detectors against your 150,406 transcript lines, because the counts they produce decide which placeholders the rule files need.
   c. Rules and script together.

➡️ (b), which is a change from my Q28 recommendation. E1 says the script now defines the placeholder contract rather than the other way round, and you have the only corpus large enough to test 10 detectors against. The rules slice gets cheaper once the script tells us what it can actually count.
