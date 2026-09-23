## What's actually failing

Two tests, both in `tests/test_pricing.py` — and neither is in the retry module:

```
FAIL: LineTotalTest.test_half_cent_rounds_up      AssertionError: 502 != 503
FAIL: OrderTotalTest.test_half_cent_tax_rounds_up AssertionError: 1354 != 1355
```

**Why:** `orders/pricing.py` uses Python's builtin `round()`, which does banker's rounding (ties-to-even), not half-up. Both failing cases land on an exact `.5`:

- `line_total(1005, 1, 50)` → `502.5` → `round()` → **502** (502 is even)
- `order_total([(258, 5, 0)], 5)` → `1354.5` → `round()` → **1354** (1354 is even)

The test comments say "finance rounds half up," so the tests encode the intended behavior and the implementation is wrong. Both values are exactly representable in binary float, so this isn't float drift — it's a genuine rounding-mode bug that produces off-by-one-cent errors on real orders.

All 4 retry tests pass.

## On the flakiness premise

The suite isn't flaky. I ran it five times: identical output every run, `Ran 10 tests in 4.002s`, same two failures. The fixed sleep is deterministic — it's slow, but it can't make a test pass sometimes and fail other times. I'd guess "always red, and people re-ran it hoping" got read as flaky. I can only speak to this suite, though; if you're also seeing runner-level flakes (checkout timeouts, setup-python cache misses), that's outside these files.

## Where the time goes

| | wall clock | CPU |
|---|---|---|
| `tests.test_pricing` | 0.034s | — |
| `tests.test_retry` | 4.034s | ~0.03s |
| **full suite** | **4.002s** | **0.025s user** |

Essentially 100% of the runtime is `time.sleep` in `orders/retry.py:17`, and your instinct about that file was right — just about the slowness, not the failures. The three retrying tests trigger exactly 8 sleeps (2 + 2 + 4) × `SLEEP_SECONDS = 0.5` = 4.0s, matching the measured 4.002s to the millisecond. Actual computation across the whole suite is ~30 milliseconds.

## Timeout bump or split the suite?

**Neither.** Both are treatments for a problem you don't have. The suite takes 4 seconds against a 10-minute timeout — you're using 0.7% of the budget. Bumping to 30 minutes widens a limit that has never been hit; splitting into two jobs would add two runner startups (~30s each) to parallelize 4 seconds of work, making CI slower and more expensive. Neither one turns a red build green, which is the thing actually blocking you.

What to do instead, in priority order:

1. **Fix the rounding** — that's the red build. Integer arithmetic is the cleanest fix here since everything is already in cents, and it sidesteps float entirely: `(unit_price_cents * quantity * (100 - discount_pct) + 50) // 100`. I checked this against all six pricing tests and all six pass. `Decimal` with `ROUND_HALF_UP` also works if you expect fractional percentages later.
2. **Make the sleep injectable** — add a `sleep=time.sleep` parameter to `call_with_retry` and pass a no-op from tests, or `mock.patch("orders.retry.time.sleep")`. Either takes the suite to ~0.07s. Production behavior is unchanged; you're only removing real waiting from tests.
3. **Then revisit the timeout** — a 4-second suite arguably wants a *lower* timeout, not a higher one, so a genuine hang fails fast instead of burning 30 minutes of runner time.

Worth noting separately: the fixed 0.5s sleep is also questionable for production against a payment gateway — a 503 usually wants exponential backoff with jitter, since fixed-interval retries from many clients re-synchronize into a thundering herd. That's a real design issue but not a CI one, so I've left it alone.

Want me to apply the rounding fix and the sleep injection?
