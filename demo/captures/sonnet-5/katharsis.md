Ran the suite. The two failures are a rounding bug in `orders/pricing.py`, unrelated to the sleep in `orders/retry.py` — and the sleep, while it is the entire runtime, isn't causing any flakiness.

## Findings

F1 - **`line_total` and `order_total` fail on exact `.5` cent cases because `round()` in Python rounds half-to-even, not half-up** - `line_total(1005, 1, 50)` computes 502.5 cents; `round(502.5)` gives 502 (nearest even), but the test expects 503 (finance's round-half-up). Same mechanism trips `order_total`'s tax case (1354.5 → 1354, expected 1355). Deterministic every run — not flaky. `orders/pricing.py:8`, `orders/pricing.py:14`.

F2 - **The fixed `time.sleep(0.5)` in `orders/retry.py:17` accounts for all 4.0s of the suite's 4.04s wall-clock time, but zero of the failures** - `test_retries_then_succeeds` and `test_raises_after_exhausting_attempts` each sleep twice (1.0s), `test_respects_attempt_count` sleeps four times (2.0s); the other 6 tests are instant. The retry tests all pass.

## Decisions

D1 - **Ran `python -m unittest discover -v` directly rather than through the GitHub Actions runner** - no CI credentials or runner available here; local timing should track CI closely since there's no I/O or network in this suite, only in-process sleeps.

## Actions Taken

AT1 - **Ran the full suite twice for consistency** - 10 tests, 2 failures, 4.002s and 4.039s wall-clock, both times isolated to `test_pricing.py`.

## Questions

❓ **Q1** - **Bump the CI timeout to 30 minutes, split the suite into two jobs, or neither?** - the suite runs in ~4s against a `timeout-minutes: 10` budget in `.github/workflows/ci.yml:6` — over 100x headroom already. Neither change touches the actual failures, which are a logic bug, not a timing or flake problem.

   a. bump timeout to 30 min — pure slack added to a job that already finishes in 4s; doesn't fix or explain anything

   b. split into two jobs — adds a second runner, artifact/matrix config, and CI minutes for a suite that isn't remotely near its limit

   c. do neither now — fix the rounding in `orders/pricing.py` (use `decimal.Decimal` with `ROUND_HALF_UP`, or `math.floor(x + 0.5)` for positive cents), and only revisit CI shape if the real (larger) suite you're picturing is slower than this sample

➡️ c - the current failures and runtime don't support either CI change; they'd add complexity without addressing the actual bug
