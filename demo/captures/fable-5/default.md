Fixed — all 10 tests pass and the suite went from ~6s to ~0.06s.

The sleep wasn't actually what was failing, though it was the slowness. What was going on:

- **The failures** were in `orders/pricing.py`: it used Python's built-in `round()`, which rounds half-to-even (banker's rounding), so exact half-cents like 502.5 rounded *down* to 502 while the tests (correctly, per their comments) expect finance-style half-up rounding. I added a `_round_half_up` helper and use it in both `line_total` and `order_total`.
- **The slowness** was the `time.sleep(0.5)` in `retry.py` — the retry tests exercise failure paths, racking up ~4 seconds of pure sleep. I left `retry.py` untouched, since that backoff is real production behavior against the payment gateway; instead the test class now patches `orders.retry.time.sleep` in `setUp`, so the tests run instantly without changing what ships.

One thing to know: pricing still computes in floats, which is exact for these cent-and-integer-percent cases, but if you ever pass fractional percentages you'd want `Decimal` there. Happy to make that change if it's a real input shape for you.
