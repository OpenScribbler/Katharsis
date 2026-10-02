> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

**Don't change either one yet.** The rounding rule is finance's decision, so get their answer first. If you have to move before they reply, change the code to round half up and leave the tests alone.

## What actually differs

V1 - **2 of the 6 pricing tests fail, and both failures are exact half-cent amounts** - Python's `round()` rounds a half to the nearest even number, so 502.5 becomes 502 and 1354.5 becomes 1354; the other 4 tests pass. `python3 -m unittest tests.test_pricing`

So the two versions differ by 1 cent, and only when an amount lands exactly on half a cent. That can happen at both steps: after the line discount and after tax.

## Why I'd change the code

Finance didn't choose either behavior. The tests at least write down someone's stated intent ("finance rounds half up"). The two `round()` calls look like Python's default rather than a decision: no comment or `Decimal` rounding setting names a rule. Most invoice and sales-tax rules also round half up, so that's the more likely answer.

Whichever rule wins, write it out explicitly with `decimal.ROUND_HALF_UP` or `ROUND_HALF_EVEN`. Then the code states the rule instead of picking it up from Python's default. `orders/pricing.py:8`

C1 - **Changing the code changes totals for orders that are already billed** - if production has been charging with round-half-to-even, old and new totals would differ by a cent on half-cent orders, which affects reconciliation and refunds. This is the strongest reason to wait for finance rather than choose.

## Who settles it

B1 - **Waiting on finance to confirm the half-cent rule** - the question is: "When a discounted line or a tax amount lands exactly on half a cent, does it round up or to the nearest even cent?" The code also rounds each line before adding tax, so ask them to confirm that order too.

Until finance answers, you can mark the 2 tests as expected failures with a note pointing to the open question. CI stays accurate and nobody has to decide the rule early.

> go with what you recommend

The pricing tests pass now. The 2 half-cent tests are marked as expected failures, and `pricing.py` is unchanged.

AT1 - **Marked the 2 half-cent tests as expected failures until finance answers** - I left the code alone because changing it would shift totals on orders already billed. A comment on each test names the open question. `python3 -m unittest tests.test_pricing`: 4 pass, 2 expected failures.

Once finance answers B1, the half-cent rule, the change is small either way. If they say round half up, change the code to use `Decimal` with that rule and remove the 2 markers. If they say round half to even, rewrite those 2 tests to expect 502 and 1354. Either way, the old comments claiming "finance rounds half up" come out.
