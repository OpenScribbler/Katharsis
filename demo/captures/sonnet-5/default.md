Ran the suite twice; results are 100% deterministic, not flaky.

## What's actually failing

**2 of 10 tests fail, both in `tests/test_pricing.py`, both for the same reason** — `orders/pricing.py` uses Python's built-in `round()`, which does round-half-to-even ("banker's rounding"), not round-half-up:

```
round(502.5)  -> 502   (test expects 503)
round(1354.5) -> 1354  (test expects 1355)
```

- `test_half_cent_rounds_up`: `line_total(1005, 1, 50)` computes exactly 502.5 cents; the test comment even says "finance rounds half up," but `round()` rounds to the nearest *even* integer, giving 502.
- `test_half_cent_tax_rounds_up`: same issue, 1354.5 → 1354 instead of 1355.

This is a plain logic bug, not a timing/environment issue — it fails identically every run. All 8 tests in `orders/retry.py`'s test file pass every time.

## Where the time goes

Total suite time: **~4.0 seconds**, all of it in `test_retry.py`. `orders/retry.py:5` has `SLEEP_SECONDS = 0.5`, and it's slept a total of 8 times across the retry tests:

| test | attempts | sleeps | time |
|---|---|---|---|
| `test_returns_on_first_success` | 1 | 0 | 0s |
| `test_retries_then_succeeds` | 3 (2 retries) | 2 | 1.0s |
| `test_raises_after_exhausting_attempts` | 3 (default) | 2 | 1.0s |
| `test_respects_attempt_count` | 5 | 4 | 2.0s |

2 + 2 + 4 = 8 sleeps × 0.5s = 4.0s, which is exactly the measured runtime. `test_pricing.py` runs in effectively zero time (no I/O, no sleeps). So the fixed sleep is real and is where 100% of the wall-clock time goes — but 4 seconds is trivial.

## Does the sleep explain the CI failures? No

The current timeout is 10 minutes (`timeout-minutes: 10` in `.github/workflows/ci.yml:6`). The suite takes 4 seconds — about 1/150th of the budget. There's no plausible way `SLEEP_SECONDS = 0.5` pushes this over a 10-minute timeout, so it isn't the cause of test failures. It also can't explain "flakiness," since a fixed sleep is deterministic and every run above gave identical results.

The two failures are unconditional assertion failures from a rounding-mode mismatch. If CI has been reported as "flaky," that report doesn't match what this suite does — it fails the same two tests every single time, and passes/fails have nothing to do with timing.

## Recommendation: neither 30-minute timeout nor splitting into two jobs

Both changes address a slow/flaky suite, and this suite is neither:
- **30-minute timeout**: pointless. You already have 150x headroom (4s vs. 10min). Raising it wouldn't turn the two failing assertions into passes.
- **Splitting into two jobs**: pointless and mildly counterproductive. It would add two runner-startup overheads (checkout, Python setup — each easily 10-20s) to parallelize a 4-second workload. Net effect: slower CI, not faster.

**Actual fix**: correct the rounding in `orders/pricing.py`. Replace `round()` with round-half-up semantics, e.g. via `decimal.Decimal` with `ROUND_HALF_UP`, or `math.floor(x + 0.5)` (valid here since these are always non-negative cent amounts):

```python
from decimal import Decimal, ROUND_HALF_UP

def line_total(unit_price_cents, quantity, discount_pct):
    gross = unit_price_cents * quantity
    discounted = Decimal(gross) * (100 - discount_pct) / 100
    return int(discounted.quantize(0, rounding=ROUND_HALF_UP))
```

Want me to apply that fix to `orders/pricing.py`?
