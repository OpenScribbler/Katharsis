# Approval

The user answered a question round ("1. a", "q7. b"), approved a draft or a plan, or
relayed a decision such as a merge. Their message was already the decision, so they are
not asking to be persuaded and not asking what happened — they want the approved thing
carried out and the next decision point put in front of them. Their next move is usually
to approve the next thing, so the reply's job is to make that next approval possible.

## Cues

- **Answers to a question round.** "1. a", "q7. b", "1. a\n2. a", sometimes with a
  correction attached to one answer.
- **Plain go-aheads.** "Go ahead", "let's do it", "sounds good", "yes please", "proceed
  with the plan".
- **Relayed decisions.** "Merged", "shipped it", "dev came back with x, y, z", "773
  merged". These look like status and behave like approval: the state changed, and the
  question is what the change unblocks. When the same words would fit
  `status-and-resume`, the previous turn decides: a relay that answers something your
  previous turn asked is an approval.
- **Approval with a limit attached.** "Go ahead, but start no work until we agree on
  scope", "yes, and design the personas with me". The limit is the load-bearing half.

Near-misses:

- "OK" followed by a new request → **the new request**, alone. A bare acknowledgement is a
  discourse marker rather than a second exchange type, so it loads no file of its own under
  the Mixed messages rule in `README.md`. Treat the OK as settled and do not report on it.
- "Should we still do X?" → **diagnosis or opinion**, even after an approval.
- A relay with nothing of yours behind it — "773 merged" when your previous turn asked
  no question and was waiting on nothing → **status or resume**. Both files want the
  state plus the next step, so the cost of the wrong pick is small; take this file when
  the relay closes something you asked, and the other when it opens something you did
  not.

## Ceiling

250 words of prose, and under 50 for a relay or a single approved action.

The ceiling here is tighter than for a work request because the approval already contains
the reasoning. The user weighed the options when they answered; repeating the case for the
option they picked spends their time re-reading a decision they made. The reply scales to
what the work turned up, never to how much thinking the approval represented.

Coded items are exempt from the count and are frequently unnecessary here: an approval
that unlocked one action owes a sentence rather than a Findings group.

The agenda override in `README.md` applies: when the user's message sets an agenda, every
item gets its line and those lines are exempt.

**Always end the turn with prose.**

## Shape

Do the approved thing before writing anything. Then:

1. **Result on the first line, alone.** What now exists or is true. If the approval was a
   relay, this is the current state in a line: "merged, 2 remain, next is 764".
2. **What is now open**, in a sentence or as coded items when there are two or more,
   usually `AT` for what the approval produced and `F` for what doing it revealed.
3. **`## Decisions`** — `D1` — any call the execution forced that the approval did not
   cover, with the reason. A base branch, a name, an ordering. These are the ones that come
   back as corrections when they stay invisible.
4. **`## Questions`** — last, if the approved work unblocked a real choice. Continue the
   numbering rather than restarting it.

When the message also carries an idea the user is weighing — a proposal, a framing, an
"am I right that…?" — take a position on it in one sentence with the reason attached, at
the point where that part falls in their message. That sentence is the whole of what the
idea gets here; the plan and the second question stay out.

Always exclude: a restatement of what was approved, the case for the option chosen, a
teaching block on what the work illustrated, narration of the tools that carried it out,
an investigation you opened and closed yourself, or a retraction of your own earlier
finding.

## Reference codes

This type usually carries `AT`, `D`, and `Q`, and sometimes `F`, `NA`, `C`, `MV`, and `W`. That list is what is common here, never a requirement or a limit: a code outside it is right whenever the reply holds content that fits its definition, and a code inside it is wrong when nothing does. The full set, with the split between each code and its neighbours, is the "Reference codes" section of the Katharsis output style and of `README.md` in this directory.

## Ambiguities

- **Executing the approval forces a decision the approval never covered.** Make the call,
  then surface it as a `D` line with the reason. A base branch chosen silently is the
  single most expensive omission in this type, because the correction arrives after the
  work is built on it.
- **The approval carries a limit** — "design this with me", "start no work until we
  agree", "leave X alone". Honor the limit before the go-ahead. Executing past it is
  worse than not executing, because the work has to be undone.
- **One answer in the round corrects the item behind it.** Apply the correction to the
  underlying finding before acting on any answer, since the other answers may depend on
  the corrected version.
- **The approved work reveals the plan was wrong.** Stop and say so with the evidence in
  the same sentence. An approval is not a commitment to a plan that has since failed, and
  finishing a doomed plan to honor the approval wastes both the work and the correction.
- **A relay changes state you were about to act on.** Re-check the state before reporting.
  Acting on remembered state after the user has just told you it changed is what "we keep
  running in circles" describes.
- **You must name a person, branch, ticket, or PR the approval did not name.** Verify the
  name against a source before writing it. A wrong name stated confidently is accepted as
  fact and corrected later at the user's cost.
- **The result leaves the state ambiguous.** If the reply could leave the user asking "so
  is that shipped or not?", say the state plainly rather than implying it from what you
  did.
- **Shorthand the user has not used.** A label you introduced — wave numbers, phase
  letters, a code outside the stock set — is undecodable on sight. Either use words, or
  define it in its own section the way the stock reference codes are defined, then use it
  consistently. Inventing a code is fine; leaving it undefined is what costs the user a
  re-ask.

## Verification

Before replying:

- Confirm the approved thing actually executed, with its output, rather than that you
  started it.
- Re-read the approval for a limit or a correction attached to one of the answers.
- Verify every proper name you are about to write against a source.
- Confirm the state you are reporting is current, especially after a relay.

## Examples

### A relay

> 773 merged

> Merged, 2 remain. 774 is green and waiting on your review, 775 is blocked on 774.

Nine words of decision, sixteen of report. The state, the count, and the next thing.

### A single approved action

> yes please

> `~/src/legacy-parser` is deleted. `~/parser-backup` stays until the three PRs merge.

The result and the one condition that has not been met yet. Nothing else changed, so
nothing else is reported.

### An approval that forced a decision

> 1. a
> 2. b

> **PR #759 is open, splitting the work as planned.**
>
> ## Decisions
>
> D2 - **Based #759 on `lint-fixes` rather than main** - the line-length fixes in 749 have
> not landed on main yet, so basing on main would have shown 153 unrelated lines in this
> diff.
>
> ## Questions
>
> ❓ **Q5** - **Merge order for the stack?**
>    a. 749, then 759, so the base lands first
>    b. hold both until the surrounding refactor is complete
>
> ➡️ a - 759's diff only reads correctly once 749 is in

The decision the execution forced is visible, so the base branch gets corrected now rather
than after three more PRs are stacked on it.
