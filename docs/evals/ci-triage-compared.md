# CI triage, both replies compared

The GIF at the top of the README plays the two replies at reading speed and cannot be paused.
This page holds the same two replies as text, paired part by part, so you can stop on any claim
and compare it against its counterpart. [ci-triage.md](ci-triage.md) has the method, the counts,
and the caveats.

## How to read this page

Every word of both replies is here. The rules-on reply already sorts its material into coded
groups, so the pairs below follow the parts of the prompt, and the rules-off reply's own headings
are kept as bold lines inside each pair. That means the rules-off reply appears out of its
original order. The untouched originals are
[captures/ci-triage-rules-off.md](captures/ci-triage-rules-off.md) and
[captures/ci-triage-rules-on.md](captures/ci-triage-rules-on.md).

## The prompt

> CI has been flaky and slow on this repo. I'm pretty sure the fixed sleep in `orders/retry.py`
> is what's causing the test failures. Run the test suite, tell me what is actually failing and
> why, how long the suite takes and where that time goes, and whether we should bump the CI
> timeout to 30 minutes or split the suite into two jobs. Explain your reasoning.

---

## How each reply opens

**Rules off**

I ran the suite locally 5 times and timed each module. Here's what I found — and the sleep is only half-implicated, but not in the way you expect.

**Rules on**

The reply opens on `## Findings` and its first line is F1 below. No preamble stands between the
prompt and the first finding.

---

## What is failing

**Rules off**

**What's actually failing**

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

**Rules on**

**Findings**

F1 - **Both failures are in pricing** - `line_total(1005, 1, 50)` returns 502 against an expected 503, and `order_total([(258, 5, 0)], 5)` returns 1354 against an expected 1355. Python's `round()` at `orders/pricing.py:8` and `orders/pricing.py:14` rounds half to even, so `round(502.5)` gives 502 and `round(1354.5)` gives 1354, while both test comments state that finance rounds half up.

F2 - **The retry sleep causes no failures** - all 4 tests in `tests/test_retry.py` pass.

F3 - **The suite is deterministic, not flaky** - 5 consecutive runs produced identical output every time: 10 tests, 2 failures, 4.002s.

---

## Where the time goes

**Rules off**

**Where the time goes**

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

**Rules on**

F4 - **The sleeps are the entire runtime** - `tests/test_retry.py` takes 4.004s and `tests/test_pricing.py` takes 0.001s. Per test, `test_retries_then_succeeds` takes 1.000s, `test_raises_after_exhausting_attempts` takes 1.000s, and `test_respects_attempt_count` takes 2.001s, which is 8 sleeps at `SLEEP_SECONDS = 0.5` in `orders/retry.py:5`.

---

## Bump the timeout or split the suite

**Rules off**

**Timeout bump or split the suite?**

**Neither.** Both options treat a 4-second suite as if it were a capacity problem.

- **30-minute timeout** — the current limit is 10 minutes and the suite runs in 4 seconds, a 150x margin. Raising it changes nothing about the failures, and makes CI *worse* on the day something genuinely hangs: you'd wait 30 minutes to learn it instead of 10.
- **Two jobs** — splitting 4 seconds across two runners adds two checkouts and two `setup-python` installs. That overhead almost certainly exceeds the entire test runtime, so it would make the pipeline slower in wall-clock terms while doubling billed minutes.

**Rules on**

F5 - **The timeout is not the constraint** - `.github/workflows/ci.yml:6` sets `timeout-minutes: 10`, so the 4s suite uses 0.7% of a 600s budget.

**Decisions**

D1 - **Neither option** - bumping the timeout to 30 minutes and splitting into two jobs both reduce wall-clock pressure, and CI is failing on two assertions with 596s of headroom to spare. A 30-minute timeout makes a genuinely hung job take three times as long to report. Splitting 4s of work across two jobs adds two checkouts and two Python installs, which costs more than the suite.

---

## What each reply leaves you to do

**Rules off**

What to do instead, in priority order:

1. **Fix the rounding bug.** Use `Decimal` with `ROUND_HALF_UP` in `line_total`/`order_total`. This clears both failures and fixes incorrect customer-facing totals.
2. **Make the sleep injectable.** Pass the sleep function (or the interval) as a parameter, or patch `time.sleep` in the retry tests. That takes the suite from 4.0s to ~0.03s — a >100x speedup — and lets you also switch to exponential backoff without slowing tests further. Fixed 0.5s retries against a payment gateway is worth revisiting on its own merits.

**One caveat on the "flaky" framing**

There's no git remote configured here and `gh` isn't authenticated, so I could not inspect your actual CI run history — everything above is local evidence.

That matters, because what I measured isn't flaky at all: the same two tests fail identically every run. If CI *looks* intermittent, the failures I found don't explain it, and neither does the suite runtime approaching a timeout. I'd look at runner queue time, checkout, and `setup-python` (which has no dependency caching in `ci.yml`) — those dominate a pipeline whose tests take 4 seconds. If you can share a couple of failing run logs, or authenticate `gh`, I can check whether there's a second, genuinely nondeterministic problem beyond these two.

**Rules on**

**Questions**

❓ **Q1** - **Which side of the rounding mismatch is wrong?** - The code and the tests disagree about half-cent rounding, and only you know the finance rule that applies.
   a. Fix `orders/pricing.py` to round half up, using `decimal.Decimal` with `ROUND_HALF_UP`.
   b. Change the two tests to expect 502 and 1354, accepting banker's rounding.
   c. Round half up only at `order_total`, leaving line-level rounding as is.

➡️ Option a - both test comments state "finance rounds half up", so the tests record the intended behavior and the implementation drifted from it. `Decimal` also removes the float division at `orders/pricing.py:7`, which will produce further off-by-one cents at other inputs.

❓ **Q2** - **Should I make the retry sleep injectable?** - Passing a sleep function into `call_with_retry` would let the tests stub it and cut the suite from 4.002s to about 0.003s.
   a. Yes, add a `sleep` parameter defaulting to `time.sleep`.
   b. No, leave `orders/retry.py` alone.

➡️ Option b for now - 4s against a 600s budget changes nothing about whether CI passes, so it is worth doing only if the retry suite grows.

---

## What the pairs show

The rules-off reply ends by offering to keep looking, and the rules-on reply ends by handing back
the one decision only the user can make. Both replies reached the same diagnosis, so the pairs
above differ in reading time rather than in correctness.
