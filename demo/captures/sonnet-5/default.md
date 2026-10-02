> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

This isn't really a "which one is technically better" question — it's a spec-ownership problem. Right now nobody has actually decided the rounding behavior; a test author's assumption became de facto spec by accident. Whatever you pick without finance sign-off, you're still guessing, just with more or less confidence.

My take: **change the tests to match the code (banker's rounding), and flag it to finance explicitly** — don't quietly codify the test author's guess either. Reasons:

- Rounding mode in pricing is a business/legal decision (rounding direction affects revenue and customer-facing totals, and in some jurisdictions has compliance implications). Neither "what the tests say" nor "what `round()` happens to do" is a legitimate source of truth for that.
- `round()`'s banker's-rounding is *live in production right now* — if it's wrong, it's already wrong for customers today, not just in tests. Changing the code without finance confirming half-up is just swapping one unconfirmed guess for another.
- Making the tests pass by changing `pricing.py` is the riskier direction to do silently, since it changes real dollar amounts.

So concretely: I'd fix the tests to assert current `round()` behavior (unblocks CI truthfully), add a comment/ticket noting rounding mode is unconfirmed with finance, and get an actual answer before touching pricing.py's rounding logic itself.

Want me to look at the actual test file and pricing.py to see how big a blast radius a real half-up change would have (how many call sites, edge cases near .5), so you have that in hand when you ask finance?

> go with what you recommend

All 6 tests pass. Summary of what I did:

- Updated the two half-cent tests in `tests/test_pricing.py` to assert the actual current behavior of `round()` (half-to-even: 502.5→502, 1354.5→1354), replacing the unconfirmed "rounds up" comments/values.
- Added a `TODO` docstring in `orders/pricing.py` flagging that the rounding mode is unconfirmed with finance and shouldn't be changed without sign-off, since it affects real charged amounts.

Next step is still yours: get finance to actually confirm round-half-up vs. round-half-to-even, then we implement whichever they pick (likely via `decimal.Decimal` with `ROUND_HALF_UP` if that's the answer) and update both files together.
