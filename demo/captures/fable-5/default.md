I ran the suite. Your hypothesis doesn't hold up: the retry sleep makes the suite slow, but it isn't causing any failures — and neither a 30-minute timeout nor a job split is warranted.

## What's actually failing and why

**2 of 10 tests fail, both in `tests/test_pricing.py`, and both deterministically** — they fail the same way every run, so they're not flaky:

- `test_half_cent_rounds_up`: expected 503, got 502
- `test_half_cent_tax_rounds_up`: expected 1355, got 1354

The cause is `round()` in `orders/pricing.py:8` and `orders/pricing.py:14`. Python 3's `round()` uses banker's rounding (round-half-to-even), so `round(502.5)` → 502 and `round(1354.5)` → 1354, while the tests' comments state the finance requirement is round-half-up. The fix is to round half-up explicitly, e.g. with `Decimal(...).quantize(Decimal("1"), rounding=ROUND_HALF_UP)` (or `math.floor(x + 0.5)` if you accept float representation caveats).

All four retry tests **pass**. If CI is intermittently red beyond these two failures, the source is outside this test code — worth pulling actual CI logs before changing anything else.

## Where the time goes

The whole suite takes **~4.0 seconds**, and essentially 100% of it is the fixed `time.sleep(0.5)` in `orders/retry.py:17`:

- `test_pricing.py`: 6 tests in **0.001s**
- `test_retry.py`: 4 tests in **4.002s** — exactly the 8 retry sleeps its tests trigger (2 + 2 + 4) × 0.5s

So you're right that the sleep is the slowness; it's just real wall-clock waste, not a failure cause. The clean fix is to make the delay injectable (`call_with_retry(fn, attempts=3, sleep=time.sleep)`) and pass a no-op in tests, which takes the suite to milliseconds.

## Timeout bump vs. splitting the suite: neither

Both options are solutions to a problem this suite doesn't have. A 4-second suite is nowhere near any sane CI timeout — bumping to 30 minutes would only mask hangs by letting a stuck job burn 30 minutes before failing. Splitting 10 tests into two jobs would add a second round of runner spin-up and checkout that costs more than the tests themselves. If CI runs are genuinely taking many minutes, the time is going to infrastructure (queueing, checkout, dependency install) rather than tests, and that's what the CI logs would show.

Recommended order of operations: fix the half-up rounding in `pricing.py` (that turns CI green), make the retry sleep injectable (that removes the 4s), and leave the CI topology alone. Want me to make those two changes?
