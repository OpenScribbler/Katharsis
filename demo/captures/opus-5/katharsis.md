The fixed sleep is not causing the failures — it costs time and nothing else, and neither CI option is the right fix.

## What actually fails

Two pricing tests fail, both on `round()`. Python's `round()` uses banker's rounding, so it sends exact halves to the nearest even integer: `round(502.5)` is 502 where `test_half_cent_rounds_up` expects 503, and `round(1354.5)` is 1354 where `test_half_cent_tax_rounds_up` expects 1355. Both values are exactly representable as floats, so this is not accumulated float error — the two comments in `tests/test_pricing.py` state the intended rule, "finance rounds half up", and `orders/pricing.py` does not implement it. All four retry tests pass.

## Where the time goes

The suite runs in 4.002 seconds. `tests/test_retry.py` accounts for 4.000 of those and `tests/test_pricing.py` for 0.002. The retry tests trigger 8 real sleeps at `SLEEP_SECONDS = 0.5` — 2 in `test_retries_then_succeeds`, 2 in `test_raises_after_exhausting_attempts`, 4 in `test_respects_attempt_count`. So your instinct about the sleep is right about the clock and wrong about the failures.

## Why neither CI option helps

`timeout-minutes: 10` in `.github/workflows/ci.yml` is already 150× the runtime. Raising it to 30 buys nothing a 4-second suite can use, and splitting 10 tests across two jobs adds a second checkout and Python setup — likely 20-30 seconds of overhead — to save 4 seconds of tests. Both options treat a wall-clock problem that this suite does not have. If CI jobs are genuinely running long, the time is in the steps around `python -m unittest`, not in the tests.

## The case against this verdict

I only have the working tree; no CI run logs and no git history are available here, so I cannot see what the runner actually spends time on. A timing breakdown from one recent Actions run would settle it. If those logs show the test step itself taking minutes, something in CI differs from this checkout and my conclusion about the timeout does not hold.

## Findings

F1 - **The two failures are deterministic, not flaky** - three consecutive runs produced the identical `Ran 10 tests in 4.002s / FAILED (failures=2)`, so retries in CI will never make them pass.

F2 - **`orders/pricing.py` has a real money bug** - half-cent totals round down against the documented finance rule, in both `line_total` and `order_total`.

## Caveats

C1 - **Everything here is from a local run** - no CI logs, no git repository, and one Python version (3.13 locally against 3.12 in the workflow); rounding behavior is identical across both.

## Questions

❓ **Q1** - **Which side of the rounding mismatch is wrong?** - The code and the tests disagree about half-cent totals, and the fix changes what customers are charged.

   a. Fix `orders/pricing.py` to round half up, using `Decimal(...).quantize(Decimal(1), ROUND_HALF_UP)` — every exact half-cent total gains one cent, on every order priced from now on.

   b. Fix the tests to expect banker's rounding — halves stay split evenly between up and down, and the "finance rounds half up" comments come out.

➡️ a - the tests encode a stated finance rule, and code that silently rounds revenue down is the half more expensive to discover later.

❓ **Q2** - **Do you want the 4 seconds back?** - The sleep is real production behavior, so the choice is where to neutralize it.

   a. Patch `time.sleep` in `tests/test_retry.py` — tests drop to milliseconds, and the retry delay stays 0.5s in production.

   b. Make the delay injectable in `call_with_retry` — same speedup, but the signature becomes something callers can set, including to zero in production by accident.

   c. Leave it — 4 seconds against a 10-minute timeout costs nothing.

➡️ a - it removes the only slow thing in the suite without changing what the gateway client does on a real retry.
