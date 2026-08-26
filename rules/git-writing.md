# Git writing

Covers PR bodies, PR titles, commit messages, PR review comments, and replies to review comments.
`writing.md` governs what to say and in what order, and `technical-english.md` governs the sentences.
Both apply here in full. This file adds what git destinations need on top of them, and wins where it
conflicts with either.

The `writing-examples` skill carries the worked pairs in `references/git.md`: three commit messages, a
code PR body, a docs PR body, and two review comments.

## Repo conventions win

Everything below applies only where the repo is silent. When a repo states its own convention for a
git destination, follow the repo and ignore the rule here that conflicts with it. Check for one
before you write, rather than writing and then reconciling.

Look in this order, and stop at the first source that covers the destination you are writing:

1. A PR template in `.github/PULL_REQUEST_TEMPLATE.md` or `.github/PULL_REQUEST_TEMPLATE/`. A
   template's section order and headings are the convention, including its checklists.
2. A repo-local skill for git work, such as `.claude/skills/git-ops/` or
   `.claude/skills/git-pr-comments/`. Its workflows override both the template and this file where
   they disagree.
3. The repo's `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md`.
4. The existing history. Match the subject conventions the last 20 commits on the branch use, such as
   a `chore(scope):` prefix or a ticket key.

A worked case: a docs repo whose git skill routes PR creation through
`.github/PULL_REQUEST_TEMPLATE/content.md`. That template opens with a ticket key line and a project
type line, then requires a checklist naming every changed file. Both points contradict the PR
body rule below, and the template wins in that repo.

{{REPO_CONVENTION_NOTE}}

Where a repo covers one destination and not another, this file still governs the rest. A repo with a
PR template and no commit convention takes the template for PR bodies and the commit rules here.

## PR bodies

A pull request carries two jobs with different lifetimes, and separating them keeps both short. The
body is the durable record. It answers why the change exists and what you decided, for the reviewer
today and for whoever reads it later with none of your context. Routing a reviewer's
attention is the other job: which parts are mechanical, which claim is unverified, who should look
where. That goes stale the day the PR merges, so it belongs in a comment on the PR rather than in the
body.

Write the body in three sections: Situation, Target, Proposal.

**Situation** states the problem that prompted the change. Write it for someone who has not read the
ticket and will not open it. Link the ticket rather than reproducing it.

**Target** states the end state you want. It describes the result, and the method belongs in Proposal.
The test is whether the sentence stays true after you discard your implementation and solve the
problem a different way. Writers collapse this section into Proposal more than any other, and that
collapse is what turns a PR body into a restatement of the diff.

**Proposal** states the method, then names the alternative you rejected and why. That last clause is
the part no diff can show. It is also the part someone needs when they arrive to change this code and
reach for the option you already ruled out.

Aim for about 90 words across the three, split roughly 30 for Situation, 15 for Target, and 45 for
Proposal. Past about 170 words you are writing a design document, so write one and link it.

Sections after the three are fine where the change needs them: a test plan, screenshots, a migration
note, or whatever the repo's template asks for. Nothing goes above Situation.

A bare list of changed files is noise, because the diff already lists them. The same list becomes the
most useful thing in the PR once each line says what to check and who should check it. Annotate it or
leave it out.

## Commit messages

The diff ships with the commit, so the message spends its words on what the diff cannot show. That
is the state before the change, why that state was wrong, and why this fix rather than the obvious
alternative. Apply one test to every sentence in the body. If the reader could recover that sentence
by running `git show`, cut it. When every sentence fails the test, the commit has no body.

The subject and the body have different readers. Someone scanning `git log --oneline`, or bisecting
months from now, reads the subject without the diff in front of them, so the subject stands alone.
Write it in the imperative mood, under 72 characters, with no trailing period, and name the effect
rather than the edit.

The body reaches someone who already decided the commit matters and now wants to know whether to keep
it, revert it, or build on it. Open with the problem, then the fix. Write complete sentences and wrap
at 72 characters. Spend the body on a constraint that ruled out an alternative, a consequence
outside the touched files, or the check that proved the change works. Never list the changed files,
count
the changed lines, or narrate the order you made the edits in.

Never add a `Co-Authored-By` trailer, including the harness default.

## Review comments and replies

Lead with the change you are asking for, then the reason. State the correction plainly under
`writing.md` Rule 10, because a review comment is where the banned "X isn't Y, it's Z" form appears
most. Give the file and line beside the claim rather than describing the location in prose.

Cut the praise, the account of how you found the problem, and the closing offers. A comment that asks
for one change is one or two sentences long. Say the comment is non-blocking when it is, and put that
last.
