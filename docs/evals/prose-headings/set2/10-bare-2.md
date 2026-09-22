**`OpenScribbler/Katharsis` already exists and is live — it is the output style shaping this reply.**

Q25 accepted: deterministic script across all rules, Fable or Opus for the bespoke pass. Q27 is where it breaks.

## Findings

F34 - **Katharsis is a shipped OpenScribbler repo, not a free name** - `~/.claude/katharsis` is a git checkout of `github.com/OpenScribbler/Katharsis`, MIT, with `styles/`, `skills/`, `hooks/`, `docs/`, `tests/`, `bin/`, an OpenSSF Scorecard badge, and 26 merged PRs.

F35 - **The GitHub names are free, so the collision is internal** - `github.com/katharsisai` returns 404, `OpenScribbler/KatharsisAI` returns 404, and the only real hit is `katharsis-project/katharsis-framework`, a dormant Java JSON:API library at 136 stars. The `github.com/Katharsis` user is held by Ken Denzel with 0 public repos.

F36 - **Katharsis already restates writing.md** - its "Craft that holds in every type" section carries finding-first, evidence in the same sentence, one qualifier, plain corrections, and one term per concept. Two repos means that text lives in two places and drifts.

F37 - **`OpenScribbler/subtract` already audits memory systems** - its README lists memory systems in the inventory and reports a system with 1,100+ entries read back 7 times, and its deliverable is exactly purge-or-keep staged with rollback.

On Claude Memory: I disagree that it belongs here. Purge, review, and disable are ablation decisions about a stored corpus, which is subtract's deliverable, and a writing-rules audit that also offers to wipe memory is two products.

On Q25's script scope: 9 of the 11 rules mechanize, not 7. Rules 5 and 6 are structural checks — codes present when three or more findings exist, question on the last line. Rules 1 and 8 need a judgment about what you asked for, so they fall to the LLM pass.

## Questions

❓ **Q29** - **Is this a new repo or a module of Katharsis?** - F34 and F36 make this the question Q27 and Q28 both hang on.
   a. Module — `rules/`, `skills/nutgraf-setup/`, `skills/nutgraf-audit/` land inside `OpenScribbler/Katharsis`. Reuses the LICENSE, tests, hooks, and Scorecard, kills F36's duplication, and ships the rules to everyone who installs the style.
   b. New repo `OpenScribbler/KatharsisAI` — separate install, and F36's craft text has to be deduplicated by hand or left to drift.
   c. New repo under a different name, with Katharsis importing its rules as a dependency.

➡️ (a). The rules and the style are the same subject split across two files, and a stranger who installs Katharsis already gets a compressed copy of writing.md whether you ship the full one or not.

❓ **Q30** - **Where the setup interview splits from the setup script** - re-asked from Q26 now that Q25 puts a deterministic script in the audit too.
   a. Skill interviews and writes everything; no setup script.
   b. Skill discovers what is on disk and interviews, then calls two scripts: substitution plus the `AGENTS.md` import using wizard's `template.sh` gates, and the audit counter.
   c. One script does setup and audit end to end; the skill only runs the LLM pass.

➡️ (b). It keeps discovery where the agent beats a prompt, puts the file writes on wizard's tested template, and gives the audit counter one caller rather than two.

❓ **Q31** - **Where the Claude Memory audit goes**
   a. `OpenScribbler/subtract`, as a new section of its existing inventory and ablation waves.
   b. Here, as a fourth job of the audit skill.
   c. Its own thing, later.

➡️ (a). F37 says subtract already has the inventory, the verdict vocabulary, and the rollback path this needs.

❓ **Q32** - **First slice** - re-asked from Q28, contingent on Q29.
   a. Scrub and genericize the rule files, plus the MOAT publisher workflow. Lands wherever Q29 sends it.
   b. Reconcile Katharsis's craft section against writing.md first, so the rules have one home before anything imports them.
   c. The audit script, since Q25 now defines it precisely.

➡️ (a) if Q29 is (b) or (c); (b) if Q29 is (a), because the duplication decides what the rule files even contain.
