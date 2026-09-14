Katharsis is already yours and already public, so Q27 became a question about where the rules live rather than what to call them.

## Findings

F34 - **`OpenScribbler/Katharsis` exists and shipped** - public, 4 stars, last pushed 2026-09-11, described as "A Claude Code output style that classifies each message you send and shapes the reply to fit it." `~/.claude/katharsis` is a checkout of it: 119 files, with `styles/` holding 11 exchange-type files, `skills/setup`, `hooks/`, `scripts/`, and 10 test scripts under `tests/`. It does not carry `writing.md` or `technical-english.md` — one file, `docs/proposals/0001-reversible-install.md`, mentions them.

F35 - **`KatharsisAI` is free, bare `katharsis` is not** - `github.com/KatharsisAI` returns 404 and no repo carries the name. `katharsis-project/katharsis-framework` is a dormant Java JSON:API library at 136 stars, and `github.com/Katharsis` returns 200.

F36 - **10 of 11 rules are scriptable, not 7** - structural proxies cover the three I called uncountable: Rule 5 as three or more findings without codes, Rule 6 as a question outside the last line, Rule 8 as a verification verb with no number or command in the same sentence. Rule 1 needs what the user asked for, which lives in the preceding user turn, so it stays with the LLM pass.

F37 - **`subtract` already audits memory, and your ask exceeds it** - its SKILL.md description names memory, and `references/evidence-mining.md` measures capture-versus-digestion ratios for any memory system. Your machine holds 40 memory directories and 197 files, 192K under syllago alone. Purging, a keep-or-delete checklist, and switching memory off all write, and subtract's README states it is read-only with archive moves only.

## Questions

❓ **Q29** - **Where the writing rules live, now that Katharsis is a shipped public repo** - F34 makes a fresh repo a sibling to a thing that already does half the job.
   a. Inside `OpenScribbler/Katharsis`, as a root `rules/` directory — MOAT tier-1 discovery reads `rules/` and `skills/` from the root, and Katharsis already has `skills/`, so one Publisher Action covers both. The styles say how to shape a reply; the rules say what to say and in what order. Installed apart, each is half a system.
   b. A new repo under a new `KatharsisAI` org, with Katharsis moved into it — you like the name, and F35 says it is free.
   c. A new repo beside Katharsis under `OpenScribbler`, under a different name.

➡️ (a). The two install to different targets but fail separately, and splitting them means every installer has to find the second half.

❓ **Q30** - **How many entry points the installer meets** - Q26 re-asked, with Q25 settled as a deterministic script plus a Fable or Opus pass.
   a. One — the setup skill interviews, discovers what is on disk, writes the files, and calls the detection script itself when the installer opts into the audit.
   b. Two — setup and audit are separate skills, and the installer runs the audit whenever they choose, including months later.
   c. Three — setup skill, detection script run directly, audit skill for the LLM pass.

➡️ (b). The audit is worth re-running after their rules change, and (a) buries it behind an install step they only perform once.

❓ **Q31** - **Where the memory audit goes** - F37 says the capability half-exists in the wrong repo.
   a. Extend `subtract` — it already inventories memory, and the addition is a write mode with the archive-and-rollback discipline it already defines for skills and hooks.
   b. Put it in the writing package — it shares the transcript-mining script but nothing else, since memory content is not prose the rules govern.
   c. Its own repo.

➡️ (a). Purging memory and pruning dead skills are the same job on different content, and subtract already has the staged-wave and rollback machinery that makes a destructive option safe.

❓ **Q32** - **Which deliverable first** - Q28 re-assessed, with the memory audit now a fourth item and Katharsis as a possible home.
   a. The rules — scrub, genericize, placeholder, into whichever home Q29 picks. Nothing else has a contract until the placeholders exist.
   b. The detection script — it is the piece both the audit and any future linting depend on, and F36 says its scope is now clear.
   c. The memory audit in subtract — unrelated to the rest, so it can land any time.

➡️ (a). The setup skill writes into the placeholders and the audit script writes into them too, so both are guesses until the rule files name them.
