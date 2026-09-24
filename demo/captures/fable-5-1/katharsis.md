The suite passes, all 10 tests, and runs in 0.06 seconds instead of 4.

## Why CI failed

The sleep was the slowness but not the failures. Both failing tests were in pricing.

F1 - **Python's `round()` rounds half to even, so 502.5 became 502 and 1354.5 became 1354** - the two pricing tests assert finance's half-up rounding, and the float math in `pricing.py` handed those exact halves to the built-in.

AT1 - **Rewrote the two pricing functions on `Decimal` with `ROUND_HALF_UP`** - percentages go through `Decimal(str(x))` so float noise cannot skew a half; all 6 pricing tests pass, including the 4 that passed before.

## Why CI was slow

F2 - **The retry tests spent 4.0 of the suite's 4.04 seconds inside the real half-second sleep** - three tests exhaust attempts, so 8 sleeps run per suite.

AT2 - **Patched `time.sleep` in the retry tests' setUp rather than changing `retry.py`** - production backoff is unchanged, and the retry tests still assert call counts; suite time fell from 4.0 to 0.002 seconds.

This directory is not a git repository, so nothing is committed. The two changed files are `orders/pricing.py` and `tests/test_retry.py`.
