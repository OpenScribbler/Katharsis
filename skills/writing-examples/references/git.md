# Git writing examples

Pairs for the rules in `git-writing.md`. Each pair names its destination, because
a commit message and a PR body open the same way but differ in length, wrapping, and
structure. Each pair is followed by the reasoning that makes the "after" work, so the pair
teaches a test you can apply to a message these examples do not cover. These seven pairs are
constructed rather than audit-derived, unlike the pairs in `rules.md`.

A repo that states its own git convention overrides both the rules and these pairs. See the
precedence list in `git-writing.md`.

## Commit message

Commit messages should state why the change was made, not what the change was. The diff shows what changed, so the
commit message should explain why the change was necessary, what problem it solves, or what effect it has. The subject
line should be concise and descriptive, while the body can provide additional context or reasoning. This allows for
quick understanding when using commands like `git log --oneline` or deeper understanding using `git show`, and helps
future developers understand the rationale behind changes.

Every clause in the "before" body is recoverable by running `git show`, so the body tells
the reader nothing they did not already have. The subject names the two files, which
`git show --stat` already lists.

The "after" spends both parts on what the diff cannot show. Read the diff and you learn
which sections moved and which sentences went. You do not learn that the old ordering was
what forced those three sentences into existence, and that is the fact a future reader needs
before deciding whether the ordering is safe to change back.

Before:
> ```
> Update writing.md and SKILL.md
>
> Reordered the sections in both files, renumbered the headers 1 through 11, updated the inline cross-references, and removed three sentences.
> ```

After:
> ```
> Reorder writing rules into reply-construction order
>
> The eleven rules interleaved three stages of writing a reply, so the
> file spent three sentences reuniting rules that a better order places
> adjacent.
>
> The rules now run in the order a reply gets built: cut and verify,
> arrange the message, write the sentences. The writing-examples skill
> follows the same order, and the three repair sentences are gone.
> ```

The subject changed from the files touched to the effect of the change, so it survives being
read alone in `git log --oneline` a year from now. "Update writing.md and SKILL.md" tells a
bisecting reader nothing about whether this commit is the one they are hunting.

## Commit message, small change

Most commits need no body. The body earns its place only when a sentence in it survives the
`git show` test, and a one-line change rarely produces one.

The "before" fails on the subject alone. "fix typo in rule 9" describes the edit, and the
reader still has to open the diff to learn which separator, in which rule, changed to what.
The "after" names the effect, so the diff becomes optional rather than mandatory.

Before:
> ```
> fix typo in rule 9
> ```

After:
> ```
> Correct the separator in the Rule 5 item format
> ```

Adding a body here would restate the subject at greater length. Leave it off.

## Commit message, rejected alternative

This is the case where a body is worth writing. The next person to hit the same Vale errors
will reach for the file-level exception, because it is faster and it clears the same errors.
The commit body is the only place that decision gets recorded, since no diff can show a
change that was considered and not made.

Before:
> ```
> Fix Vale errors
>
> Ran vale on the changed files and fixed the 14 errors it reported.
> ```

After:
> ```
> Reword the passive constructions Vale flags in the SDK guide
>
> Vale's Docs/Passive rule fired on 14 sentences in the SDK guide. Each
> one now uses active voice.
>
> A file-level Vale exception would also clear the errors, and it would
> suppress the rule for every future edit to the file. Rewording keeps the
> rule live.
> ```

The "before" body narrates the process: which tool ran, and what it reported. Both facts sit
in the diff and the CI log. The count survives, because 14 tells a reader the scale of the
change before they open it, and the rule name survives, because it names the standard the
file now meets.

## PR body, code change

The "before" is the diff in prose. Every line of it is recoverable from the Files changed
tab, and none of it says why the change exists.

The "after" spends Situation on the failure the reviewer cannot see in the diff, because the
retries hid it. Target states the end state in one sentence that stays true under any
implementation, which is the test that keeps it from collapsing into Proposal. Proposal
names the method, then records the alternative someone will reach for later.

Before:
> Changes:
> - `token_cache.rs`: read TTL from the provider response
> - `refresh.rs`: replace the fixed interval with a computed deadline
> - `refresh_test.rs`: add three cases

After:
> ## Situation
>
> Token refresh runs on a fixed 60-second timer. A provider that returns a 30-second TTL
> leaves the token expired for half of every cycle. Callers see intermittent 401s that the
> retry layer absorbs, so the failure never reached a test.
>
> ## Target
>
> A cached token is replaced before it expires, whatever TTL the provider returns.
>
> ## Proposal
>
> Schedule the refresh at 80 percent of the reported TTL, falling back to the 60-second
> timer when a response omits one. Halving the fixed timer to 30 seconds covers the observed
> case as well, and it doubles refresh traffic against every provider to fix one. The
> response is already parsed, so reading the TTL costs nothing.

The rejected alternative is the sentence worth the most in six months. Without it the next
person to see a doubled refresh rate proposes the fixed 30-second timer, and nothing in the
repository tells them it was considered.

## PR body, docs change

Docs PRs fail the same way, with a different symptom. The "before" describes the edit, so a
reviewer has to read the diff to learn whether the page was wrong before.

The "after" gives the reviewer the one thing they can check without reading a word of the
diff: whether the page currently breaks for a reader on a current build.

Before:
> Updated the MCP gateway configuration page. Renamed three flags, removed one, and adjusted
> the surrounding prose to match.

After:
> ## Situation
>
> The MCP gateway configuration page documents the 1.4 flags. The 1.6 release renamed three
> of them and dropped a fourth, so a reader following the page against a current build hits
> an unknown-flag error on the first step.
>
> ## Target
>
> The page matches the flags a reader gets from a current install.
>
> ## Proposal
>
> Rename the three flags, remove the dropped one, and note the release where each changed. A
> version-switcher block covering 1.4 was the alternative, and the release notes already
> carry that history, so the page stays single-version.
>
> ## Review guide
>
> The gateway maintainer reviews the flag names against the 1.6 build. Everything else is
> prose wrapping.

The trailing section is the exception to keeping routing out of the body. A single line
naming who checks what is worth its permanence. A full signal-versus-noise breakdown, with
inline confidence markers, stays in a comment where it can go stale without polluting the
record.

## Review comment, short

The "before" uses the banned "X isn't Y, it's Z" form and describes the location in prose.
The "after" leads with the change, gives the file and line beside the claim, and states the
reason after it.

Before:
> This isn't a race condition, it's a missing await further up in the flush helper.

After:
> `session.ts:42` needs an `await` on `flush()`. Without it the write returns before the
> buffer drains, so the next read sees the stale value.

## Review comment, long

The "before" runs 172 words and asks for one change. It opens with praise, narrates the
review itself, hedges the finding twice, buries the ask in the middle, and closes with three
offers. The "after" is 20 words: the ask first, the file and line beside the claim, the
consequence after it, and the severity last.

Before:
> Great work on this page overall — I really like the direction you've taken with the
> restructure, and the new ordering makes a lot of sense to me. I was going through the auth
> section and spent some time thinking about how the terminology lands for a first-time
> reader, and I kept coming back to one thing. So I went and checked the glossary, and then I
> checked a few of the other pages to see how they handle it, and it seems like there might
> be some inconsistency here? On line 42 (and possibly elsewhere, I didn't check every page)
> we're using "agent credential" but I believe the lexicon says "workload credential" —
> although I could be wrong about this, so definitely push back if you disagree. It isn't a
> blocker by any means and I don't want to hold up the PR over terminology, but it might be
> worth a quick look if you have time. Happy to pair on it if that's easier! Let me know what
> you think.

After:
> `auth-flow.mdx:42` uses "agent credential" where `lexicon.md` defines "workload
> credential". Search relevance splits across both terms once the page indexes.
> Non-blocking.

The praise, the account of how the reviewer arrived at the finding, and the three closing
offers all delete without loss. "I could be wrong about this" goes because checking the
lexicon settles the claim, and the check was already run.
