All 10 tests now pass, and the suite runs in 0.001 s instead of 4.0 s.

## Actions Taken

AT1 - **Pricing now rounds exact half-cents up** - `line_total` and `order_total` use `Decimal` with `ROUND_HALF_UP`, so an exact half-cent total now comes out 1 cent higher than before. The other 4 pricing tests still pass. `orders/pricing.py`

AT2 - **The retry tests no longer really sleep** - they replace `time.sleep` with a mock. They also now check how many times it was called: 0 sleeps on first-try success, 2 for three attempts, and 4 for five, so the wait between attempts is still tested. `tests/test_retry.py`

## Caveats

C3 - **Nothing is committed and CI hasn't run** - this directory isn't a git repository, so I only ran the tests locally on Python 3.13. I didn't change `ci.yml`, and its 10-minute timeout stays as it is.
