---
name: writing-examples
description: "Worked before/after examples for the Katharsis writing rules in writing.md and git-writing.md. Load when drafting prose the reader will read, such as a PR body, commit message, review comment, doc, ticket or wiki comment, or a chat answer carrying a finding, and the rule text alone leaves the call ambiguous."
---

# Writing examples

The rule files state the rules. This skill holds the worked pairs for when a rule leaves the
call ambiguous. Read only the reference you need.

| Reference | Holds | Read it when |
|---|---|---|
| `references/rules.md` | One pair per rule, numbered to match `writing.md` | Drafting a chat answer, a doc, or a ticket or wiki comment, and one rule is ambiguous. Jump to that rule's number rather than reading every rule. |
| `references/git.md` | Pairs for `git-writing.md`, each naming its destination | Writing a commit message, a PR body, or a review comment. |
| `references/prime-examples.md` | Three full messages rewritten end to end | A whole message reads wrong and no single rule accounts for it. |

Every "before" in `rules.md` is real, taken from the reference audit of 6,841 messages Claude
wrote to one reader over three months. The pairs in `git.md` are constructed. Follow the method
each pair demonstrates, not a wordlist. Ticket keys, repo paths, and product names in the pairs
are neutral stand-ins for the originals.

The `katharsis-audit` skill writes pairs built from your own transcripts to
`<install dir>/examples.md`. Those sit beside these, and their "before" side is your own prose.

When you add a pair, hold it to the same bar: the "after" obeys every rule, not only the one
it demonstrates, and a count appears only if an audit produced it.
