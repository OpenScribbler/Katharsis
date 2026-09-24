I fixed both problems, and all 10 tests pass locally in 0.002s, down from 4s. The sleep in `retry.py` made the suite slow, but it wasn't what made CI fail. The failures came from rounding in `pricing.py`.

## Why CI fails

F1 - **Two pricing tests fail because Python's `round()` sends halves to the even number** - 502.5 becomes 502 and 1354.5 becomes 1354, while the tests expect finance's round-half-up (503, 1355); `orders/pricing.py`

AT1 - **Pricing now rounds half up, using `Decimal` arithmetic** - the 2 failing tests pass, and the other 4 pricing tests still pass. This changes real totals by one cent whenever an amount lands exactly on a half cent, which is the behaviour the tests say finance wants; `orders/pricing.py`

## Why it's slow

The retry tests really slept: 8 retries at 0.5s each, which comes to 4s of the 4.0s run. That's slow, but nowhere near CI's 10-minute timeout, so it couldn't have caused the failures by itself.

AT2 - **The retry tests now mock `time.sleep`, so they don't wait on real sleeps** - I left the 0.5s backoff unchanged in production, and all 4 retry tests pass; `tests/test_retry.py`

C1 - **I haven't seen a CI run with these changes** - this directory isn't a git repo, so I couldn't commit or push. The results above come from local Python 3.13, and CI runs 3.12.
