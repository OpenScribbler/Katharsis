The suite runs in 4 seconds, the 2 failures are deterministic rounding bugs in `orders/pricing.py`, and your retry-sleep hypothesis doesn't hold — so neither a 30-minute timeout nor a job split is warranted.

## What the run showed

`python -m pytest tests` — 10 tests, 2 failed, 8 passed, 4.03s total. The failures are identical on every run, so whatever flakiness you're seeing in CI is not coming from these tests; it's more likely infrastructure (runner provisioning, dependency install, network) and worth checking the CI logs for where the wall-clock actually goes, because it isn't going into pytest.

## Findings

F1 - **The 2 failures are banker's rounding, not the retry sleep** - both `line_total` and `order_total` use Python's `round()`, which rounds half to even, while the tests encode finance half-up rounding: 502.5 rounds to 502 (expected 503) and 1354.5 to 1354 (expected 1355). These fail on exact half-cents every time, deterministically. `orders/pricing.py:8` and `orders/pricing.py:14`.

F2 - **The retry sleep costs time but fails nothing** - all 4 retry tests pass; they just spend the suite's entire 4 seconds sleeping (2.0s + 1.0s + 1.0s across 3 tests, from the fixed `SLEEP_SECONDS = 0.5` in `orders/retry.py:5`). Injecting a sleep function or patching `time.sleep` would make the suite near-instant, but it's a cleanup, not a fix.

F3 - **Neither CI remedy fits a 4-second suite** - a 30-minute timeout would only mask whatever is hanging the runner, and splitting 10 tests into two jobs adds a second round of job startup overhead that would exceed the suite itself. If CI takes minutes, the time is outside pytest.

## Verified

V1 - **Ran the full suite with per-test durations** - `2 failed, 8 passed in 4.03s`; the three slowest tests are all in `tests/test_retry.py` and account for effectively all runtime.

## Next Actions

NA1 - **Fix the half-up rounding in `orders/pricing.py`** - replace `round()` with half-up arithmetic (e.g. `int(x + 0.5)` on non-negative cents or `decimal.Decimal` with `ROUND_HALF_UP`), which makes both failures pass.

NA2 - **Make `call_with_retry` take an injectable sleep** - lets the retry tests run without real sleeping and removes the fixed-delay smell you flagged.
