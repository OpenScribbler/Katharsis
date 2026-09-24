Neither change is warranted: the suite runs in 4 seconds against a 10-minute timeout, and the 2 failures are deterministic rounding bugs in pricing, not anything the retry sleep touches.

## What fails and why

Both failures are in the pricing tests, and both fail on every run. Python's built-in round uses round-half-to-even, so 502.5 becomes 502 and 1354.5 becomes 1354, while the tests encode the finance rule of rounding half up. That is a real bug in the pricing code, or a wrong spec in the tests, but it is not flakiness. All 4 retry tests pass.

## Where the time goes

The whole suite takes 4.0 seconds, and every measurable millisecond of it is the retry tests. Three of them exercise real failures, which triggers 8 calls to the half-second fixed sleep. The 6 pricing tests complete in under a millisecond combined. So your premise is half right: the sleep is the entire runtime, but the runtime is 4 seconds, and the sleep causes no failure.

## The timeout question

The job has a 10-minute timeout and needs 4 seconds of test time, so neither a 30-minute timeout nor a second job would change any outcome. A wider timeout only lets a hung run burn 26 more minutes before failing. A split adds a second checkout and Python setup, each of which already costs more than the entire suite. If CI runs really are taking minutes or timing out, the time is in runner queueing, checkout, or setup, and the per-step timings in the Actions log would show which. This checkout has no git history or remote, so I could not read those logs.

## The case against

If the gateway client grows more attempts or longer sleeps, the suite time scales with it, because the tests exercise real wall-clock sleep. That argues for making the sleep injectable or patching it in tests, which would take the suite to near zero, rather than for widening the timeout.

## Findings

F1 - **The 2 failures are banker's rounding in pricing, and they fail every run** - built-in round gives 502 and 1354 where the tests expect 503 and 1355, on Python 3.12 and 3.13 alike; `orders/pricing.py:8`

F2 - **The retry sleep is 100% of suite runtime but causes no failure** - 8 half-second sleeps across 3 passing tests account for the full 4.0 seconds; `orders/retry.py:17`

F3 - **The CI timeout is 10 minutes against a 4-second suite** - neither raising it nor splitting the job can affect pass or fail; `.github/workflows/ci.yml:6`

## Caveats

C1 - **I could not inspect CI run history** - this checkout has no remote, so the claim that CI slowness lies outside the tests rests on the local run only.

## Questions

❓ **Q1** - **How should the rounding mismatch be resolved?** - The pricing code and the tests disagree on what half a cent does.

   a. Change pricing to round half up using Decimal, matching the finance rule the test comments cite. This changes billed totals by one cent in exact-half cases.

   b. Change the two tests to expect banker's rounding. This leaves billing as it is and rewrites the spec the tests document.

➡️ a - the test comments state the finance rule explicitly, so the tests are the spec and the code is wrong.

❓ **Q2** - **Should the retry tests stop sleeping for real?** - This is what would make the suite fast, and it changes the retry helper's signature or the test approach.

   a. Add a sleep parameter to the retry helper, defaulting to the current behavior, and pass a no-op in tests.

   b. Patch the sleep in the tests only, leaving the helper unchanged.

   c. Leave it. Four seconds is not the CI problem.

➡️ b - it removes the 4 seconds without touching production code, and option a is available later if callers need it.
