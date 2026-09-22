**Interrupts (12 cases, from your own conversations)**

- F1 - **You interrupt at a median of 19 seconds** - range 0.9s to 62s, so the "long silent tool run" theory I floated is dead.
- F2 - **You react to my first tool call, not to silence** - it is the first visible evidence of how I read your ask.
- F3 - **2 are interpretation kills** - "Instead of 'banning' exact phrases... create actual examples" at 38s, and "reply after loading the /unslop skill" at 10s.
- F4 - **3 are you adding what you left out** - the STP ask came back with a blog URL, "14. a" with an extra page move, "16 b" after 0.9s with a paragraph.
- F5 - **2 are identical resends, 4 ended with nothing or "continue"**.
- F6 - **Interrupts cluster on broad exploratory first moves** - the 62s one opened with `find` across your home directory, the 31s one with `grep -rli` over three trees taking 24s to return.
- F7 - **Your Next Actions theory does not explain these** - you interrupted before any reply existed in all 12.

**The audit's own numbers**

- F8 - **T1 is overstated** - "mixed is longer in every ask type" fails in 2 of 12: broken-report 542 vs 440, continue-resume 698 vs 580.
- F9 - **T8's 64 is inflated** - 21 are you editing and resending your own message, the same artifact the audit already excluded 26 of. Real count is about 25 plus a handful.
- F10 - **T2, T3, T4, T9, T10, T11 are soft** - derived from a free-text field with 570 distinct strings, so they are floors rather than measurements. T5, T6, T7 are boolean and exact.
- F11 - **You were right about the class** - 25 canned reviews ran 3 to 18 tool calls and ended with no prose, which a mandated closing section fixes.

**Unrelated**

- R1 - **`gh auth switch -u holdenhewett` ran inside an Aembit ticket workspace** - against your standing rule on personal identity in work repos.

## Questions

❓ **Q1** - **What next?**
   a. Check whether that `gh auth switch` produced commits or PRs under the personal identity
   b. Take the per-type mapping into the guidance file
   c. Fix T1, T8, and the soft-count caveats in `conversation-audit.md` first

➡️ a - it is the only item with a consequence outside this project, and it is a two-minute check.
