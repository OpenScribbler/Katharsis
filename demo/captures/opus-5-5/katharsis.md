> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

**Neither yet: finance has to pick the rule. Until they do, I'd change the code to explicit half-up, because the current behavior wasn't chosen either.**

## Why the code has no better claim than the tests

`round()` in Python 3 rounds half to even, so 502.5 becomes 502 and 1354.5 becomes 1354. Those are the 2 tests failing now; the other 4 pass. Nothing in the repo shows anyone chose half-to-even. It's just Python's default, and whoever wrote `round(discounted)` most likely expected half-up. The tests at least record what someone intended, even though they have no sign-off behind them.

F1 - **Rounding is undecided on both sides** - the tests assume a finance rule nobody confirmed, and the code's half-to-even behavior comes from Python's default with no decision behind it.

## Why I lean half-up

Half-up is the usual rule on invoices and in most tax guidance. Half-to-even is mainly used where totals are aggregated, to cancel out bias. If finance says half-up, the tests are already correct. The code change is to use `Decimal` with `ROUND_HALF_UP` in both functions, which also takes floats out of money math.

C1 - **Finance may not choose half-up** - if a tax authority or an existing ledger expects half-to-even, changing the code would move customer totals by 1 cent on exact half-cent cases, and the tests should change instead.

## What to settle with finance

Ask them 2 things: the rounding rule, and whether it applies per line, on the order total, or both. The code rounds at both steps today, and that choice affects totals as much as the rule does. Whichever rule they pick, the answer belongs in a comment in `pricing.py` so the next reader doesn't have to guess.

MV1 - **Get the rounding rule from finance** - ask "when a line or tax amount lands exactly on half a cent, which way does it round, and do we round each line or only the order total?"

> go with what you recommend

I switched pricing to round half up, and all 10 tests now pass, including the 2 half-cent tests that were failing.

## Half-up rounding

AT1 - **Both functions now round half up, using `Decimal` instead of floats** - line totals and the order total are still rounded at the same 2 steps, so only exact half-cent amounts change, each by 1 cent. A comment in the code marks the rule as unconfirmed by finance. `orders/pricing.py`

AT2 - **Percentages are converted to `Decimal` through their string form** - a float such as 7.3 would otherwise carry binary noise that could push a half-cent case the wrong way. Integer and fractional percentages both give correct results.

MV1, asking finance for the rounding rule, is still open. If they choose half to even, change `ROUND_HALF_UP` to `ROUND_HALF_EVEN` in `_round_cents` and update the 2 half-cent tests.
