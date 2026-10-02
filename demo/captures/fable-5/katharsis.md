> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

Change the code, and get finance to confirm half-up in writing — the tests are currently the only place the convention is recorded.

## Why the code side is the wrong one

Python's `round()` is banker's rounding (half-to-even), a convention almost no finance team intends — half-up is the standard for currency, and half-even is what you get when nobody chose. So between an unconfirmed test and an unchosen default, the test is the better guess at intent.

F1 - **The floats are a bigger problem than the rounding mode** - `gross * (100 - discount_pct) / 100` runs in binary floats, so many discounted values land at 502.4999… instead of 502.5 and round wrong under either convention; the fix is `Decimal` with an explicit `ROUND_HALF_UP`, which also forces the convention to be named in code rather than inherited from `round()` — `orders/pricing.py:7`.

C1 - **If finance comes back with a different mode** (half-even is legal for some tax jurisdictions), both the code and the tests change — which is why the confirmation is worth one email before merging.

> go with what you recommend

`orders/pricing.py` now computes in `Decimal` and rounds with an explicit `ROUND_HALF_UP`; all 10 tests pass, tests unchanged.

MV1 - **Get finance to confirm half-up in writing** - per C1, a different mode from them changes both the code's rounding constant and the two half-cent tests.
