I ran the suite locally 5 times and timed each module. Here's what I found — and the sleep is only half-implicated, but not in the way you expect.

## What's actually failing

Two tests, both in `tests/test_pricing.py`, both **100% deterministic** — identical failures on all 5 runs:

```
FAIL: test_half_cent_rounds_up      AssertionError: 502 != 503
FAIL: test_half_cent_tax_rounds_up  AssertionError: 1354 != 1355
```

The cause is Python's `round()`, which uses banker's rounding (ties-to-even), not half-up:

```
round(502.5)  = 502     # 1005 * 50/100 -> exactly 502.5, no float error
round(1354.5) = 1354    # 1290 * 105/100 -> exactly 1354.5, no float error
```

I confirmed both values are exactly representable as floats, so this isn't floating-point drift — it's the rounding mode. `orders/pricing.py:8` and `:14` both call bare `round()`, while the test comments state the requirement explicitly: *"finance rounds half up."* The tests encode the spec correctly; **the production code is wrong**. This is a real money bug that under-charges on every half-cent tie, not a bad test.

`tests/test_retry.py` passes cleanly, all 4 tests, every run.

## Where the time goes

| | Time | Share |
|---|---|---|
| `tests/test_retry.py` | 4.031s | ~99% |
| `tests/test_pricing.py` | 0.030s | ~1% |
| **Total** | **4.003s** | |

So your instinct about `orders/retry.py` was right about the *slowness*. The suite executes exactly 8 sleeps at `SLEEP_SECONDS = 0.5`:

- `test_returns_on_first_success` — 0 sleeps
- `test_retries_then_succeeds` — 2 sleeps = 1.0s
- `test_raises_after_exhausting_attempts` — 2 sleeps = 1.0s
- `test_respects_attempt_count` (`attempts=5`) — 4 sleeps = 2.0s

8 × 0.5s = 4.0s, against a measured 4.003s total. The fixed sleep is essentially the *entire* runtime — but it causes zero failures.

## Timeout bump or split the suite?

**Neither.** Both options treat a 4-second suite as if it were a capacity problem.

- **30-minute timeout** — the current limit is 10 minutes and the suite runs in 4 seconds, a 150x margin. Raising it changes nothing about the failures, and makes CI *worse* on the day something genuinely hangs: you'd wait 30 minutes to learn it instead of 10.
- **Two jobs** — splitting 4 seconds across two runners adds two checkouts and two `setup-python` installs. That overhead almost certainly exceeds the entire test runtime, so it would make the pipeline slower in wall-clock terms while doubling billed minutes.

What to do instead, in priority order:

1. **Fix the rounding bug.** Use `Decimal` with `ROUND_HALF_UP` in `line_total`/`order_total`. This clears both failures and fixes incorrect customer-facing totals.
2. **Make the sleep injectable.** Pass the sleep function (or the interval) as a parameter, or patch `time.sleep` in the retry tests. That takes the suite from 4.0s to ~0.03s — a >100x speedup — and lets you also switch to exponential backoff without slowing tests further. Fixed 0.5s retries against a payment gateway is worth revisiting on its own merits.

## One caveat on the "flaky" framing

There's no git remote configured here and `gh` isn't authenticated, so I could not inspect your actual CI run history — everything above is local evidence.

That matters, because what I measured isn't flaky at all: the same two tests fail identically every run. If CI *looks* intermittent, the failures I found don't explain it, and neither does the suite runtime approaching a timeout. I'd look at runner queue time, checkout, and `setup-python` (which has no dependency caching in `ci.yml`) — those dominate a pipeline whose tests take 4 seconds. If you can share a couple of failing run logs, or authenticate `gh`, I can check whether there's a second, genuinely nondeterministic problem beyond these two.
