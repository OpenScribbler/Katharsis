I fixed both problems. All 10 tests pass locally, and the suite now takes 0.002s instead of 4.0s. I haven't pushed anything or watched a CI run.

The sleep in retry.py made CI slow, but it wasn't why CI was failing.

**Failing:** two tests in `tests/test_pricing.py` failed because of how `orders/pricing.py` rounds. Python's built-in `round()` sends exact halves to the nearest even number, so 502.5 became 502. The tests say finance rounds half up and expect 503 (and 1355 rather than 1354). I changed the math in `orders/pricing.py` to exact decimal arithmetic that always rounds halves up. As a bonus, this avoids small float errors on cent amounts.

**Slow:** the retry tests really did wait 0.5s between attempts, 8 times in total, which is where the 4 seconds went. I stubbed out the sleep in `tests/test_retry.py` only, so the real retry delay for the payment gateway is unchanged.

One thing to check: this changes real order totals whenever a price lands exactly on half a cent. Those totals will now come out 1 cent higher than before, which is the behavior the tests say finance wants.
