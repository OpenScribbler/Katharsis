Done — CI should be green and fast now. But your diagnosis was half right, so here's what was actually going on:

**The failures weren't retry.py.** Two pricing tests were failing, and they'd fail deterministically on every run:

```
AssertionError: 502 != 503   # line_total(1005, 1, 50)
AssertionError: 1354 != 1355 # order_total([(258, 5, 0)], 5)
```

`orders/pricing.py` used the builtin `round()`, which does banker's rounding — half-to-even. `round(502.5)` is `502`, not `503`. The tests encode the finance convention (half up), and the comments say so explicitly. So the tests were right and the code was wrong; this was never flaky, it was just broken.

I rewrote `pricing.py:1` to compute in `Decimal` and quantize with `ROUND_HALF_UP`. Using `Decimal` rather than patching the rounding on top of floats also removes the binary-float drift — percentages now go through `Decimal(str(value))`, so a fractional rate like `12.5` or `8.25` is exact instead of *almost* exact. Under the old float math a half-cent boundary could land a hair under or over and tip the rounding either way; that's the kind of thing that does eventually show up as an intermittent failure.

**The slowness was retry.py** — you were right there. The suite spent 4.00 of its 4.05 seconds asleep: three tests exercise the retry path, and each real attempt burns `SLEEP_SECONDS = 0.5`.

I fixed that in the tests rather than in `orders/retry.py:5`, by patching `orders.retry.time.sleep` in `setUp`. The production backoff is unchanged — that half second is doing real work against a live payment gateway, and shortening it to speed up CI would have been a behavior change to your retry policy disguised as a test fix. While I was in there I added `call_count` assertions to each test, so the sleeps are now actually *verified* instead of merely endured — including that there's no sleep after the final attempt, which nothing covered before.

Both files, plus `tests/test_retry.py`. I left `.github/workflows/ci.yml` alone; the 10-minute timeout was never the constraint.

One thing I noticed and deliberately didn't touch: `call_with_retry` uses a fixed delay with no exponential backoff and no jitter. Against a gateway returning 503s, that means every client retries in lockstep at the same half-second cadence, which is the classic way a partial outage turns into a full one. Worth a look, but it's a production behavior change to payment retry logic and well outside "fix CI" — your call whether you want it.
