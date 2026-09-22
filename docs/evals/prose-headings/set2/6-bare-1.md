## Findings

F48 - **The audit's core numbers hold** - 1,366 triples and 837/383/146 success/mixed/failure match `audit-labeled-merged.jsonl` exactly.
F49 - **Long replies go with mixed outcomes in 10 of 12 types** - the audit said all 12, but broken-report and continue-resume go the other way.
F50 - **Most theme counts are estimates** - T2–T4 and T8–T11 come from 570 distinct free-text labels grouped by hand.
F51 - **Salvaging is rare** - 14 of 1,366 triples, and 7 of them are canned security reviews.
F52 - **Report structure misfires on conversation** - 41 triples, 15 of them factual questions, and almost none on work requests.
F53 - **21 of the 64 no-reply failures are resends** - you edited and re-sent your own message before I ran.
F54 - **You interrupt on my first tool call** - 12 interrupts, median 19 seconds, range 0.9 to 62.
F55 - **The interrupts follow a wrong first move** - 2 stopped a wrong approach, 3 added scope you had left out, and the slowest started with a broad `find` or `grep` across your home directory.
F56 - **None of the 12 interrupts support the Next Actions theory** - each one came before any reply existed.
F57 - **A personal identity touched a work repo** - on 2026-08-27 my first call in an Aembit ticket workspace was `gh auth switch -u holdenhewett`.

## Errata

E1 - **A writing rule does reach the no-reply turns** - 25 security reviews ran tools and wrote nothing, and a required closing verdict fixes those.

Several connectors need authorization before I can use them: Gmail, Google Calendar, Google Drive, the Atlassian plugin, and 3 Aembit tenant MCP servers.

## Questions

❓ **Q29** - **Check whether F57 left personal-identity commits or PRs in Aembit repos?** - read-only `git log` and `gh` search
   a. Check now
   b. Skip

➡️ a - a personal identity on an Aembit repo breaks your standing rule, and the check changes nothing.

❓ **Q30** - **Add one line stating my reading of the ask before the first tool call?** - this targets F55
   a. Add it to the work-request and status-and-resume guidance
   b. Leave the guidance as it is

➡️ a - it costs about 15 words and turns a 19-second interrupt into a one-line correction.
