The wordlist bans live in `technical-english.md`, and that file has no example reference at all. Building one, then converting the lists into property tests that point at it.

`technical-english.md`'s wordlists are now property tests, and the strings they listed moved into a new worked-pairs reference.

## Actions Taken

AT1 - **New `skills/writing-examples/references/technical-english.md`, 232 lines, 9 construction classes** - negation for emphasis, announced comprehension, self-assessment, the inflated verb, the abstract noun, rhythm lists, the dash carrying a relation, the trailing -ing clause, the closing summary. Each section states the property, shows the loophole forms the ban produced, and gives a test I can run on a draft.

AT2 - **Converted 5 wordlists across `core/technical-english.md` and `core/writing.md`** - the 12-word abstract-noun list became a grep test, the 4-verb list became an is/has substitution test, utilize/facilitate became a meaning-change test, Rule 2's 6 phrases became "strike everything before the first concrete noun", and Rule 10's single banned form became the property plus its 6 rephrasings named as one sentence.

AT3 - **Rule 10 gained the carve-out** - naming X is correct when you already believe X and are about to act on it, tested by whether X is a live belief of yours or an alternative I introduced so I could reject it.

AT4 - **Registered the reference in `SKILL.md`** - the row states that every construction in it survived a ban on its wording, so string-matching is not the check.

## Findings

F1 - **None of this loads today** - `core/AGENTS.md` lines 8-11 comment out the `writing.md`, `guidance.md`, and `technical-english.md` imports for an experiment dated 2026-08-31, leaving Katharsis as the only reply shaping. Katharsis covers your chat replies and does not reach Agent-tool subagents or Jira, Confluence, and docs prose; `git-writing.md`, which is imported, opens by saying both files "apply here in full."

## Questions

❓ **Q1** - **Restore the three commented-out imports in AGENTS.md?** - your ask was that AGENTS.md always sees this, and F1 is the reason it does not.
   a. Restore all three — full coverage, and `guidance.md` overlaps Katharsis on exchange shaping.
   b. Restore `technical-english.md` only — sentence rules reach subagents and docs, no overlap with Katharsis.
   c. Leave the experiment running.

➡️ b - it closes the dangling reference in `git-writing.md` and covers subagents, without re-running the classification table that Katharsis already owns.

❓ **Q2** - **Commit these four files?** - the repo has 6 unrelated modified files already, including `hooks/security-validator.ts` and `settings/settings.base.json`.
   a. Commit my four only, named explicitly.
   b. Leave the tree alone.

➡️ a, after you answer Q1, so the import change rides in the same commit.
