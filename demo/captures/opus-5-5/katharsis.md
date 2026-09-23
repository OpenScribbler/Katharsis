The failures come from `round()` in `orders/pricing.py`, not the sleep in `orders/retry.py`, and the suite runs in 4 seconds, so neither a 30-minute timeout nor a split would help.

## What fails and why

I ran the suite 3 times and got the same result each time: 10 tests, 2 failures, both in `tests/test_pricing.py`. The failures are deterministic, so they are real bugs rather than flakiness. Python's `round()` rounds exact halves to the nearest even number ("banker's rounding"). So 502.5 cents becomes 502 and 1354.5 becomes 1354. The tests expect 503 and 1355, and their comments say finance rounds half up. Either the code is wrong or the tests are, and that is a business rule to settle, not a CI problem.

The retry sleep doesn't cause any failure. All 4 retry tests pass on every run.

## Where the time goes

The whole suite takes 4.0 seconds. All of that is the retry tests calling the real `time.sleep(0.5)`: 1 s for the exhausted-attempts test, 1 s for retries-then-succeeds, and 2 s for the 5-attempt test. The 6 pricing tests take under a millisecond combined. So your instinct about the sleep is right for speed, just not for the failures. Patching `time.sleep` in `tests/test_retry.py` brings the suite to near zero. At 4 seconds that saving is small, though.

## Timeout versus split

I'd do neither. The job's current limit is 10 minutes and the tests use 4 seconds of it. Raising the limit to 30 minutes gives more room to a job that doesn't need it, and it makes a genuinely hung run wait three times as long before it gets killed. Splitting into two jobs adds a second checkout and a second Python setup, which probably cost more than the tests themselves. It also splits 4 seconds into 2 s and 2 s.

If CI feels slow, the cause is outside this test suite: runner queue time, `setup-python`, or something that doesn't show up in this repo. The strongest argument against my view is that I haven't seen your CI logs. A timeout that has actually been hit would mean something is hanging in CI that doesn't hang locally. The step timings on one slow run would settle it.

## Caveats

C1 - **I tested on Python 3.13; CI uses 3.12** - `round()` has rounded halves to even since Python 3.0, so both versions give the same result.

C2 - **The "slow and flaky" part isn't explained by this repo** - no test here depends on timing or ordering, so an intermittent CI failure would have to come from the runner or the environment.

## Questions

❓ **Q1** - **Which is correct for pricing: round half up, or round half to even?** - The fix changes either what customers are charged or what the tests assert, so the call is yours.

   a. Round half up, as the test comments say finance wants. I'd switch `line_total` and `order_total` to `Decimal` with `ROUND_HALF_UP`, which changes totals by 1 cent on exact half-cent amounts.

   b. Keep banker's rounding and fix the 2 tests. Current production behaviour stays the same, but the tests' finance comments would then be wrong.

➡️ a - the tests record a stated finance rule, and the code looks like it uses `round()` by accident rather than by choice. Confirm with finance first if 1-cent changes to live totals matter.

❓ **Q2** - **Should I also patch `time.sleep` in the retry tests?**

   a. Yes. The suite drops from 4 s to near zero, and the tests stop depending on the sleep constant.

   b. Leave it. 4 seconds costs nothing noticeable.

➡️ a - it's a small change to the tests only, and it stops the next person from blaming the sleep.
