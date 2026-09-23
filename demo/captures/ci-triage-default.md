The sleep in `orders/retry.py` isn't what's failing. It's the only reason the suite is slow, but the whole suite takes about 4 seconds, and neither a 30-minute timeout nor a split would help.

## What's failing

I ran the suite 4 times and got the same 2 failures every time (10 tests, 8 pass). So in this suite, at least, nothing is flaky; the failures happen on every run.

| Test | Expected | Got |
|---|---|---|
| `test_pricing.LineTotalTest.test_half_cent_rounds_up` | 503 | 502 |
| `test_pricing.OrderTotalTest.test_half_cent_tax_rounds_up` | 1355 | 1354 |

All 4 retry tests pass.

**Why:** `orders/pricing.py:8` and `:14` use Python's built-in `round()`. It uses banker's rounding: exact halves go to the nearest even number, so `round(502.5) == 502` and `round(1354.5) == 1354`. The test comments say "finance rounds half up," so the code doesn't do what the business rule asks. There's a second problem too: the code divides with floats (`gross * (100 - discount_pct) / 100`), which you generally want to avoid for money.

The usual fix is integer arithmetic, or `Decimal` with `ROUND_HALF_UP`. For example, in `line_total`:

```python
from decimal import Decimal, ROUND_HALF_UP
discounted = Decimal(gross) * (100 - discount_pct) / 100
return int(discounted.quantize(Decimal(1), rounding=ROUND_HALF_UP))
```

`order_total` needs the same change. I haven't edited anything; say if you want me to.

## How long it takes and where the time goes

The whole suite takes **about 4.0 seconds**, and nearly all of it is the retry tests sleeping:

| Test | Time | Why |
|---|---|---|
| `test_respects_attempt_count` | 2.0 s | 5 attempts means 4 sleeps of 0.5 s |
| `test_retries_then_succeeds` | 1.0 s | 2 sleeps |
| `test_raises_after_exhausting_attempts` | 1.0 s | 2 sleeps |
| Everything else (7 tests) | ~0 s | |

So you were right that the sleep costs time, just not that it causes failures. It's also worth fixing: patch the sleep out in the tests (`mock.patch("orders.retry.time.sleep")`) or make the delay injectable. That brings the suite down to milliseconds and lets you check that it sleeps the right number of times.

## Bigger timeout or split the suite?

Neither. The CI timeout is `timeout-minutes: 10` in `.github/workflows/ci.yml`, and the suite uses about 4 seconds of it, less than 1%.
- **A 30-minute timeout** would change nothing. No run is close to 10 minutes, and a bigger limit only means a genuinely stuck job burns 30 minutes before it's killed.
- **Splitting into two jobs** would make CI slower overall, because each job repeats checkout and Python setup, which almost certainly takes longer than the 4-second test run. Both jobs would still stay red, since the failures are logic bugs.

## What I couldn't check

- **Where CI's time actually goes.** If CI jobs really are slow or timing out, the cause isn't in these tests. It's more likely in runner queueing, setup, or network steps. The run logs would show which step takes the time; I don't have access to them.
- **The flakiness.** Nothing here is nondeterministic, so if you're seeing tests pass and fail on different runs, it's probably coming from another branch, different code, or the environment.
- **Python version.** CI uses 3.12 and I ran 3.13. `round()` behaves the same in both, so I'd expect the same result in CI.
- **History.** The directory isn't a git repo, so I couldn't see when these tests were added or if they ever passed.

My recommendation: fix the rounding in `pricing.py` (that turns CI green), mock the sleep in `test_retry.py` (that makes the suite nearly instant), and leave the CI timeout and job layout alone.
