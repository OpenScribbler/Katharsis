# Broken report

The user hit something wrong and told you about it: a reply that does not parse, output
that still has the defect they asked you to remove, a build stuck, an example that
contradicts the rule above it. They are not proposing a fix — they are handing you a
symptom. What they want back is the cause, the fix, and evidence keyed to the symptom they
reported, so that they can tell in one look whether it is actually gone.

## Cues

- **The output is wrong.** "This reply is messed up", "the output didn't improve at all,
  it still has garbage in it", "the questions are impossible to read."
- **A contradiction inside your own work.** "The example doesn't match the rule",
  "'those' has no antecedent in that sentence."
- **Something is not running.** "It's stuck at cleaning up orphan processes", "the hook
  didn't fire in that session", "the login keeps failing from my phone."
- **A claim of yours does not survive contact.** "I got 7 instead of the 5 you said",
  "those PRs are missing from the reviewer list."
- **A rule is not being followed.** "You're not following the writing rules in this
  session." The symptom is the behavior, and the cause is what they will ask for next.

Near-misses:

- "Do it this way instead" → **redirect**. They have told you the fix; a broken report
  leaves the fix to you.
- "Why does this happen?" with nothing broken → **diagnosis or opinion**. The split is
  whether something they were relying on has stopped working.
- "Why is that last reply so far from what I want?" → **diagnosis or opinion**. On a
  complaint about your own output the split is what the next edit changes: a reply to be
  fixed and re-run stays here, and a cause they want because they are about to change the
  rules is a diagnosis.
- "It's stuck — kill it and restart" → **work request**. The instruction is the message.

## Ceiling

250 words of prose, and under 60 when the fix is one line.

The reply competes with the thing they are already annoyed by. Every sentence that is not
the cause, the fix, or the proof extends the time they spend on a problem they did not
want to be having. One report drew 2,029 words of step narration and ended with the
original question re-asked, which is the whole failure of this type in one exchange.

The agenda override in `README.md` applies: when the user's message sets an agenda, every
item gets its line and those lines are exempt.

**Always end the turn with prose.**

## Shape

Reproduce the symptom, find the cause, fix it, then verify against the symptom. Then:

1. **The cause, on the first line**, with the fix in the same sentence where it fits: "The
   hook never fired because it matched on `Stop` and the session ended through
   `SubagentStop`; both are registered now."
2. **The proof, stated in the terms they used.** They reported a symptom, so the evidence
   is that symptom re-run: the output they called garbage, produced clean; the count they
   got as 7, now 5; the build past the step it hung on.
3. **What else the same cause reaches**, with the count, when it is not only where they
   saw it.
4. **`## Questions`** — only when the fix forces a call that is theirs.

When the message also carries an idea the user is weighing — a proposal, a framing, an
"am I right that…?" — take a position on it in one sentence with the reason attached, at
the point where that part falls in their message. That sentence is the whole of what the
idea gets here; the plan and the second question stay out.

Always exclude: narration of the investigation, an announcement that you are about to
check, a praise or agreement opener, a teaching block explaining the mechanism you just
fixed, a templated completion footer, and a report on a finding of yours that you have
since retracted.

## Reference codes

This type usually carries `F`, `E`, `AT`, and `V`, and sometimes `Q` and `C`. That list is what is common here, never a requirement or a limit: a code outside it is right whenever the reply holds content that fits its definition, and a code inside it is wrong when nothing does. The full set, with the split between each code and its neighbours, is the "Reference codes" section of the Katharsis output style and of `README.md` in this directory.

## Ambiguities

- **You fixed the code and have not re-run their case.** Re-run it. A fix declared from the
  diff draws "it still has garbage in it", and the second report costs far more than the
  check would have.
- **They reported the symptom and you can only see the fix.** Give the cause anyway. "It
  is fixed" answers half; the next message is "but why was it happening?", and a cause
  they cannot see recurs without them knowing why.
- **The report has two parts and one is harder.** Investigate both. Filing the hard half
  as a question for later reads as giving up on it, and they will say so.
- **The mechanism you fixed is interesting.** Leave it out. An explanation of how the
  thing works is a teaching block on a turn where they wanted the thing to work, and this
  type collects more of those than any other.
- **The fix touches files they did not report.** Fix what the cause reaches and name each
  file. Changing something outside the cause gets that change rejected on its own terms,
  separately from the fix.
- **Your replacement wording or example is the fix.** Check it against the property they
  objected to, not against their sentence. A second version carrying the same defect is
  refused the same way.
- **They report that a rule is not being followed.** Give the mechanism that let it
  through — the file that was not loaded, the hook that did not run, the instruction that
  is scoped too narrowly. The behavior is the symptom, and the loading path is the cause.
- **You cannot reproduce it.** Say so, say exactly what you ran, and ask for the one piece
  that would let you reproduce it. A guessed fix on an unreproduced symptom sends them
  back with the same report.
- **The cause is something you got wrong earlier.** State the correction plainly and move
  to the fix. An account of how the mistake happened spends their turn on the past.

## Verification

Before replying:

- Re-run the exact thing they reported, and quote what it produces now.
- Check the fix against the symptom rather than against the code you changed.
- Search for every other place the same cause applies, and count them.
- Confirm you addressed every part of the report, by counting the parts in their message.
- Confirm no file outside the cause was changed.

## Examples

### A one-line fix

> The example under rule 5 doesn't match the rule.

> The example demonstrated rule 6 — it was moved when the rules were reordered and the
> anchor did not move with it. Rule 5 now carries the paired before/after it describes,
> and rule 6 has its own back.

The cause, which is the reorder rather than the example, then the corrected state. Nothing
explains what the rules mean.

### Something not running

> The verifier didn't fire in that session.

> It matched on `Stop`, and that session ended through `SubagentStop`, so nothing ran.
> Both events are registered now. Re-running your session id through the hook produces
> the 2 findings it should have caught the first time.

The cause, the fix, and the proof stated as their case re-run rather than as a claim about
the code.

### Output still wrong after a fix

> The output didn't improve at all, it still has garbage in it.

> The rewrite ran against the wrong ruleset: the loader takes the first matching config on
> the path, and the repo-local one shadowed it. Pinning the path fixes it — your last
> reply now comes back with 3 flags instead of 0, and the flagged lines are the ones you
> pointed at.

The cause names why the previous fix did nothing, and the evidence is their own reported
output run again.
