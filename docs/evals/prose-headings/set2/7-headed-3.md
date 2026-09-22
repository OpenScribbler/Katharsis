Almost nothing now, which is the intended outcome, because the Stop hook blocks 1.8% of replies and repairs each one by appending lines rather than demanding the reply again.

The reprint problem you are describing was measured and fixed on 2026-08-30. `stop-verifier.sh` now blocks only where added lines fix the defect and everything already on screen stays correct, which its header calls the D5 append test, and the blocking set is down to 2 rules from every rule the detector emits.

What that bought is visible when you separate the two rates. Across the 600 most recent captured replies, 211 still carry at least one detector hit (35%), which is no better than the 29% hit rate measured over the original 72. Only 11 carry a blocking hit (1.8%). So compliance did not improve at all; the cost of enforcement collapsed. That distinction matters for your proposal, because it says the pre-reply channel has not yet reduced violations, only the penalty for them.

Your pre-reply check also already exists. `turn-reminder.sh` runs on UserPromptSubmit and its header states your argument almost word for word, that "Verification cannot live at Stop: a Stop hook has no advisory path, so injecting there means exit 2 or {"decision":"block"}, both of which force a full reply reprint. Here it costs nothing and it arrives before the reply is written rather than after."

What it does not do is the cue matching you described. It emits the same 2 generic lines on every typed turn. I agree with adding cues, with one limit. Cue words should trigger a named failure mode, never stamp an exchange type. The classification table carries 11 splits (S1 through S11) precisely because cues collide, so "research" lands in work-request, thinking-out-loud, or factual-question depending on the sentence around it. A regex that picks one would misroute me with the hook's authority behind it, and a wrong guidance file is worse than none.

Against my verdict: r4-opening-narration fired 0 times in 600 replies, so you could argue the blocking set should shrink to 1 rule and the Stop hook should go entirely.

## Findings

F64 - **The blocking set is 2 rules, not the full detector.** `stop-verifier.sh:75-76` sets `BURIED = {"r4-opening-narration"}` and `UNASKED = {"r15-question-outside-round"}`, and every other rule captures to the corpus without blocking.

F65 - **Half the blocking set never fires.** r4-opening-narration appeared 0 times across the 600 replies, while r15-question-outside-round appeared 10 times, so the hook's entire live yield is buried decisions.

F66 - **The unenforced rules are the ones that actually drift.** r7-colon fired 95 times and r5-uncoded-list 59 times in the same 600 replies, which is the drift your cue idea would target and the Stop hook deliberately ignores.

F67 - **The corpus grew 52x and is the asset for testing cues.** It holds 3,743 payloads against the 72 available on 2026-08-30, so a cue rule can be scored against real replies before it ships.

## Trade-offs

### Cue matching that stamps a type against one that names a risk

T-O1 - **Stamping forecloses my classification judgment on every turn it touches.** A wrong stamp routes me to the wrong guidance file with the hook's authority, and the failure is silent because the reply looks well-formed for the type it was routed to.

T-O2 - **Undoing a stamp costs a session of confusing replies before you notice.** A risk reminder is additive, so a wrong one costs the words it occupies and nothing more.

T-O3 - **Stamping assumes cues determine type.** The 11 splits in the classification table are the standing counter-evidence, and each new type added to the table makes the regex more wrong rather than less.

## Questions

❓ **Q27** - **Which pre-reply cue design should I draft against the corpus?**
   a. Risk reminders only, where a cue names a failure mode and leaves classification to me
   b. Type stamping, where a cue picks the guidance file and the hook prints it
   c. Neither yet, and instead score how often I classify correctly today, since a cue layer aimed at a problem you have not measured may fix nothing

➡️ a - T-O1 and T-O3 rule out stamping, and F66 gives risk reminders a concrete target in the 95 colon hits and 59 uncoded-list hits that nothing currently guides.

❓ **Q28** - **Should the Stop hook keep r4-opening-narration in the blocking set given 0 hits in 600 replies?**
   a. Keep it, since 0 hits means the pre-reply layers are working and the gate is what keeps them honest
   b. Drop it, leaving r15-question-outside-round as the only blocking rule
   c. Drop it and capture instead, so the 0 rate stays measured

➡️ c - it keeps the measurement that would tell you if the rate ever moves, and it costs nothing, while option a defends a gate against a defect that has not occurred in 600 replies.
