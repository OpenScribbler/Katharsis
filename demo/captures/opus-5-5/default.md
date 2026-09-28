> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

Neither yet. The tests assert a business rule nobody actually agreed on, so the answer has to come from finance, not from us.

Here's where things stand now:

- `orders/pricing.py:8` and `:14` use Python's built-in `round()`. It uses banker's rounding: exact halves go to the nearest even number, so 502.5 → 502 and 1354.5 → 1354.
- 2 of the 6 tests fail: `test_half_cent_rounds_up` and `test_half_cent_tax_rounds_up`. Their comments say "finance rounds half up," but from what you're saying, that claim is made up.

**Why not just pick one:**
- **Changing the code** changes what customers get charged. About half of all exact-half-cent cases would go up by 1¢. That's a billing change, and it needs sign-off.
- **Changing the tests** makes banker's rounding the official rule, and also without sign-off. It's easier to defend as "keeping current behavior," but it's still a guess.
- Both are reasonable rules. Half-up is common on invoices and is what most people expect. Banker's rounding avoids a small upward drift across many transactions. Which one is right depends on finance, and possibly on tax or regulatory rules.

**What I'd do:**
1. **Ask finance** one concrete question: "When a line or tax amount lands exactly on a half cent, like 502.5¢, do we round to 503 or 502?" Tell them production currently does 502 (round-half-to-even).
2. **Until they answer**, keep the code as it is, since it's what's live. Mark the two tests `@unittest.expectedFailure` (or skip them) with a note that the rule is pending with finance. Remove the "finance rounds half up" comments, because they're false.
3. **Once they answer**, make the rule explicit whichever way they choose. Use `Decimal` with `ROUND_HALF_UP` or `ROUND_HALF_EVEN` instead of `round()` on a float. That documents the decision in the code. It also avoids float surprises if the discount or tax rates ever become non-integers like 7.25%. With today's whole-number rates, the float math happens to be exact.

I can do step 2 now, or write the `Decimal` version with the rounding mode as a single constant, so switching later is a one-line change once finance decides.

> go with what you recommend

I marked the two half-cent tests as expected failures and left `pricing.py` alone, so production still rounds the way it does today. The suite now passes: 8 passed, 2 expected failures.

In `tests/test_pricing.py`:
- `test_half_cent_rounds_up` and `test_half_cent_tax_rounds_up` are now marked `@unittest.expectedFailure`.
- Each has a comment saying the rounding rule is waiting on finance. The comment also notes that `round()` sends exact halves to the nearest even number (502.5 → 502) while the tests expect half-up (503).
- I removed the false "finance rounds half up" comments. The comments about the math (e.g. "exactly 502.5 cents") are still there.

**Next step is yours:** ask finance whether an exact half cent like 502.5¢ should become 503 or 502, and tell them production currently gives 502.

- **If they say 503 (half-up):** switch `pricing.py` to `Decimal` with `ROUND_HALF_UP` and remove the two `expectedFailure` markers.
- **If they say 502 (current behavior):** change those two tests to expect 502 and 1354, and ideally switch to `Decimal` with `ROUND_HALF_EVEN` so the rule is written down in the code.

The markers also act as a tripwire: if someone changes the rounding before finance decides, the suite will report those tests as unexpectedly passing.
