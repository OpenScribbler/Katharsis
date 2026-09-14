**`OpenScribbler/Katharsis` already exists and ships — Q27 picked the name of your own live repo.**

## Errata

E1 - **F33 undercounted what a script can catch: it is 9 of 11, not 7** - Rules 5 and 6 are structural, so a script detects them (three or more bolded findings with no codes; a question not on the final line). Only Rules 1 and 8 need to know what you asked for, which no regex supplies. Your Q25 answer holds for 9 rules, and those 2 fall to the Fable/Opus pass with the bespoke-rule discovery.

## Findings

F34 - **Katharsis is already the package this session set out to build** - 119 files under `~/.claude/katharsis`, MIT, `README` offering `/plugin marketplace add OpenScribbler/Katharsis`, plus `setup.sh`, `tests/`, `hooks/`, `CONTRIBUTING.md`, `SECURITY.md`, and an OpenSSF Scorecard badge. Working copy at `~/.local/src/katharsis-live`.

F35 - **`KatharsisAI` is free, bare `katharsis` is not** - `github.com/KatharsisAI` returns 404, so the handle is available; `github.com/katharsis` returns 200, held by katharsis-project's dormant Java JSON:API framework at 136 stars.

F36 - **The two overlap already** - the active style body's "Craft that holds in every type" section restates Rules 2, 4, 7, 9, 10, and 11 in compressed form, so shipping the rules as a separate package duplicates six of eleven.

## State

S1 - **`katharsis-live` has 4 uncommitted modifications** - `scripts/detect-reply.sh`, `scripts/packs/ask-phrases.txt`, `scripts/stop-verifier.sh`, `tests/test-detect-reply.sh`.

## Caveats

C1 - **I cannot say what a memory audit would read** - `autoMemoryEnabled` is `false` at `settings.json:241` and no memory store exists on this machine, so the on-disk location and format for an installer who has it enabled are unverified.

## Questions

❓ **Q29** - **Where the writing rules live relative to Katharsis** - F34 and F36 make this the call that blocks the other two.
   a. A module inside `OpenScribbler/Katharsis` — `rules/`, a setup skill, an audit skill, added to the existing plugin. One install, one marketplace entry, and the duplicate craft lines get resolved into one source.
   b. A separate `OpenScribbler/<name>` repo — Katharsis shapes replies, the rules govern sentences across chat, docs, git, and Jira, so a reader who wants the rules without the harness can take them.
   c. A `KatharsisAI` org holding Katharsis plus the rules repo as siblings, moving both off `OpenScribbler`.

➡️ (a). The rules already ship inside Katharsis in compressed form, and (b) leaves you maintaining two copies of Rules 2, 4, 7, 9, 10, and 11.

❓ **Q30** - **What splits the setup script from the setup skill, now that Q25 puts 9 rules in a script** - the re-ask of Q26.
   a. Skill interviews and discovers, script substitutes.
   b. One script does setup and the 9-rule deterministic pass; the skill exists only to drive the Fable/Opus pass for Rules 1 and 8 and for bespoke-rule discovery.
   c. Skill drives both and calls the script as a library.

➡️ (b). The deterministic detector is a script under either answer, and Katharsis already has `scripts/setup.sh` and `tests/` to extend rather than a new mechanism to invent.

❓ **Q31** - **How far the memory audit goes** - your new item, and C1 limits what I can design until it is verified.
   a. All three offerings you named: purge and start fresh, a checklist file of one-line summaries for keep-or-delete, or disable memory outright.
   b. The checklist and the disable path only, dropping bulk purge as a footgun with no undo.
   c. Scope it after I verify where Claude Code stores memory on a machine that has it enabled.

➡️ (c). I would be designing against a guess, and C1 says the guess is unconstrained.
