The fixed sleep is not what's failing. The two failures are deterministic rounding bugs in pricing. The sleep only costs time, and not enough to justify either CI change.

**What fails and why**

Both failures are in `tests/test_pricing.py`, and they fail identically on every run. Three consecutive runs produced the same two failures with the same values, so this is not flakiness.

- `test_half_cent_rounds_up` expects 503 and gets 502. The discounted value is exactly 502.5 cents.
- `test_half_cent_tax_rounds_up` expects 1355 and gets 1354. The taxed value is exactly 1354.5 cents.

The cause is in `orders/pricing.py:8` and `orders/pricing.py:14`. Both call Python's built-in `round()`, which uses banker's rounding. Exact halves round to the nearest even integer, so 502.5 becomes 502 and 1354.5 becomes 1354. The tests document that finance rounds half up. The code does not. The fix is to round half up explicitly, for example with `decimal.Decimal` and `ROUND_HALF_UP`, or integer arithmetic. This behaves the same on Python 3.12 in CI and 3.13 locally, so there is no version drift involved.

All four retry tests pass on every run.

**Where the time goes**

The whole suite takes 4.0 seconds wall clock. Every measurable millisecond is the fixed sleep in `orders/retry.py:17`.

| Test | Time | Sleeps |
|---|---|---|
| test_respects_attempt_count | 2.0s | 4 × 0.5s |
| test_retries_then_succeeds | 1.0s | 2 × 0.5s |
| test_raises_after_exhausting_attempts | 1.0s | 2 × 0.5s |
| all six pricing tests + first-success | ~0s | none |

So your instinct about the sleep is right for slowness and wrong for failures. If CI runs are taking anywhere near the current 10 minute limit, the time is not coming from this test suite. Look at runner queueing, checkout, and Python setup in the workflow logs instead.

**Bump the timeout or split the suite?**

Neither. Both options treat a 4 second suite as if it were a 20 minute one.

- **Raising the timeout to 30 minutes** would not change the outcome. The pricing tests fail in milliseconds, and a longer timeout just delays feedback when something genuinely hangs.
- **Splitting into two jobs** would save at most 4 seconds of test time while adding a second checkout and Python setup, which cost more than that. It would also leave the red builds red.

What actually helps, in order:

1. Fix the rounding in `orders/pricing.py` to round half up. This turns CI green.
2. Make the sleep injectable, for example a `sleep` parameter on `call_with_retry` defaulting to `time.sleep`, and pass a no-op in tests. That drops the suite from 4.0s to effectively zero.
3. If CI is still slow after that, the cause is outside this suite. Pull step timings from a few recent workflow runs before touching the timeout.

I did not change any files. Say the word and I'll apply the rounding fix and the injectable sleep.
