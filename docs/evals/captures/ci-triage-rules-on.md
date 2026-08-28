## Findings

F1 - **Both failures are in pricing** - `line_total(1005, 1, 50)` returns 502 against an expected 503, and `order_total([(258, 5, 0)], 5)` returns 1354 against an expected 1355. Python's `round()` at `orders/pricing.py:8` and `orders/pricing.py:14` rounds half to even, so `round(502.5)` gives 502 and `round(1354.5)` gives 1354, while both test comments state that finance rounds half up.

F2 - **The retry sleep causes no failures** - all 4 tests in `tests/test_retry.py` pass.

F3 - **The suite is deterministic, not flaky** - 5 consecutive runs produced identical output every time: 10 tests, 2 failures, 4.002s.

F4 - **The sleeps are the entire runtime** - `tests/test_retry.py` takes 4.004s and `tests/test_pricing.py` takes 0.001s. Per test, `test_retries_then_succeeds` takes 1.000s, `test_raises_after_exhausting_attempts` takes 1.000s, and `test_respects_attempt_count` takes 2.001s, which is 8 sleeps at `SLEEP_SECONDS = 0.5` in `orders/retry.py:5`.

F5 - **The timeout is not the constraint** - `.github/workflows/ci.yml:6` sets `timeout-minutes: 10`, so the 4s suite uses 0.7% of a 600s budget.

## Decisions

D1 - **Neither option** - bumping the timeout to 30 minutes and splitting into two jobs both reduce wall-clock pressure, and CI is failing on two assertions with 596s of headroom to spare. A 30-minute timeout makes a genuinely hung job take three times as long to report. Splitting 4s of work across two jobs adds two checkouts and two Python installs, which costs more than the suite.

## Questions

❓ **Q1** - **Which side of the rounding mismatch is wrong?** - The code and the tests disagree about half-cent rounding, and only you know the finance rule that applies.
   a. Fix `orders/pricing.py` to round half up, using `decimal.Decimal` with `ROUND_HALF_UP`.
   b. Change the two tests to expect 502 and 1354, accepting banker's rounding.
   c. Round half up only at `order_total`, leaving line-level rounding as is.

➡️ Option a - both test comments state "finance rounds half up", so the tests record the intended behavior and the implementation drifted from it. `Decimal` also removes the float division at `orders/pricing.py:7`, which will produce further off-by-one cents at other inputs.

❓ **Q2** - **Should I make the retry sleep injectable?** - Passing a sleep function into `call_with_retry` would let the tests stub it and cut the suite from 4.002s to about 0.003s.
   a. Yes, add a `sleep` parameter defaulting to `time.sleep`.
   b. No, leave `orders/retry.py` alone.

➡️ Option b for now - 4s against a 600s budget changes nothing about whether CI passes, so it is worth doing only if the retry suite grows.
