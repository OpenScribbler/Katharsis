All 10 tests pass, and the suite dropped from ~4s to ~0.001s.

Summary of what was actually going on and what I fixed:
- **The real failure** was in `orders/pricing.py`: it used Python's `round()`, which does round-half-to-even (`round(502.5) == 502`), not the round-half-up finance requires. I replaced it with exact integer arithmetic (`_round_half_up`), so `502.5¢` → `503¢` correctly, no floats involved.
- **`retry.py` itself was never broken** — its tests always passed — but it was doing real `time.sleep()` calls during tests, adding ~4s of pure waste. I mocked `time.sleep` in `tests/test_retry.py` so the retry logic and attempt counts are still fully exercised, just without actually waiting.

No CI config changes were needed. Both files are fixed and verified locally.
