All 10 tests pass, and the suite dropped from 4.002s to 0.001s.

## What was actually happening

The sleep in `retry.py:17` wasn't the cause of failures — it's why the suite was slow, but that's a different bug than the one causing the red build.

- **F1 - **The failures come from `pricing.py`, not `retry.py`** - `round()` in Python 3 uses round-half-to-even, so `round(502.5)` gives `502`. The tests expect finance's round-half-up (`503`), so `test_half_cent_rounds_up` and `test_half_cent_tax_rounds_up` failed on every run, deterministically — not flaky, not related to retries.
- **F2 - **The slowness came from tests sleeping for real** - `test_retries_then_succeeds` and `test_respects_attempt_count` call `call_with_retry`, which calls the real `time.sleep(0.5)` between attempts since nothing mocked it. That's 3 of the suite's 4 seconds.

## What changed

- `AT1` - `orders/pricing.py` now rounds half up using integer arithmetic (`_round_half_up`) instead of Python's banker's-rounding `round()` — fixes both failing tests.
- `AT2` - `tests/test_retry.py` patches `orders.retry.time.sleep` at the class level so retry tests no longer block on real sleeps — full suite now runs in 0.001s (was 4.002s), 10/10 passing.

`retry.py` itself is untouched — the sleep there is real production behavior for a payment-gateway retry and shouldn't change; only the test's use of real time needed fixing.
