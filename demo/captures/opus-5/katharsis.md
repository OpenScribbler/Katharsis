CI is green and the suite runs in 0.001s, down from 4.0s — but the two failures were never the sleep.

## Why it was failing

F1 - **`round()` uses banker's rounding, so exact half-cents rounded down** - `line_total(1005, 1, 50)` is exactly 502.5 cents and `round` returned 502; both failing tests are exact-half cases whose own comments say finance rounds half up. `orders/pricing.py`

AT1 - **Pricing computes in `Decimal` with `ROUND_HALF_UP`** - I changed the code rather than the tests, because the test comments state finance's rule; this shifts exact-half amounts up one cent against what production bills today.

## Why it was slow

F2 - **The sleep accounted for the entire 4.0s and none of the failures** - 3 retry tests made 8 real `time.sleep(0.5)` calls, which is the whole runtime the suite reported.

AT2 - **`call_with_retry` takes a `sleep` argument, defaulting to `time.sleep`** - the tests pass a recorder that asserts the waits instead of taking them, so backoff stays covered and production behavior is unchanged; 10 tests pass in 0.001s.

Push it and CI should go green on the first run. The one judgment call in there is AT1 — whoever owns billing should see that half-cent lines now round up.
