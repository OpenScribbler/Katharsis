The top-level order already matches how I build a reply, so a wholesale rearrangement would cost more than it returns. Rules 1-3 decide what goes in, Rules 4-6 arrange it, Rules 7-11 write the sentences. That is the sequence I work in, and the three bookends inside the middle block (finding first, body, question last) are the shape of a reply read top to bottom.

Two things sit in the wrong phase.

The exchange classification fires before every other rule in the file, and it lives as a scoping sentence inside Rule 5 (`writing.md:66`). It decides whether Rules 4-6 apply at all: a status question gets prose with no codes, a work report gets the groups. So it governs the arrangement phase from inside one member of that phase. Anything gating three rules belongs ahead of them.

Evidence is one idea split across two phases. Rule 3 says the claim carries what settled it, Rule 8 says the evidence sits in that sentence, Rule 9 says the number is the evidence. Rule 5 has to forward-reference Rule 8 at line 105 because of the gap.

One thing the ordering question implies: the Katharsis output style carries its own code table naming 16 codes against Rule 5's 6, and that table is what shapes these replies. Reordering writing.md leaves the operative document untouched.

## Questions

❓ **Q1** - **Where does the exchange classification go?**
   a. promote it to the preamble, ahead of Rule 1, since it gates the whole arrangement block
   b. leave it in Rule 5 and accept that the gate reads after the rules it gates

➡️ a — the preamble already carries scope and precedence, which is what the classification is.

❓ **Q2** - **Do Rules 3, 8, and 9 consolidate?**
   a. merge 8 and 9 into one evidence rule and leave Rule 3 on verification alone
   b. leave all three, since the split survived the audit in this form

➡️ a — Rule 9 is the form Rule 8's evidence takes, and merging kills the forward reference.

❓ **Q3** - **Which document owns the code table?**
   a. writing.md owns it and the output style points at it
   b. the output style owns it and Rule 5 shrinks to the ordering and format rules
   c. leave both and treat the divergence as intentional

➡️ b — the output style is what actually reaches these replies, and subagents inheriting writing.md need the format rules more than the full 16-code set.
