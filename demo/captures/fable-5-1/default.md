Done. All 11 tests pass and the suite went from about 4 seconds to under 50 milliseconds. Your hunch was half right: the sleep was the slowness, but not the failures.

**What was actually failing** was pricing, not retry. Two tests expected finance-style half-up rounding, but the code used Python's built-in `round`, which rounds half to even. So 502.5 came back as 502 and 1354.5 as 1354. I added a small helper in `orders/pricing.py` that rounds with Decimal and ROUND_HALF_UP, and both totals now use it.

**What was slow** was the retry tests waiting on the real half-second sleep, eight times per run. I made the sleep function an injectable parameter on `call_with_retry`, defaulting to the real one so production behavior is unchanged. The tests pass a no-op instead. I also added one test that records the sleep calls to confirm it sleeps between attempts and not after the last failure.

Files changed:
- `orders/pricing.py`: half-up rounding helper
- `orders/retry.py`: `sleep` parameter, default unchanged
- `tests/test_retry.py`: no-op sleep in tests, plus one new test

One thing I left alone: calling `call_with_retry` with `attempts=0` would raise a confusing TypeError because it re-raises `None`. Nothing in the code does that today, so I didn't touch it.
