> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

Change the code, not the tests: round-half-up is the correct default for money, even without finance's sign-off.

## Why half-up is the safer default

`round()` in Python does round-half-to-even ("banker's rounding") — a general-purpose numeric default chosen to avoid statistical bias when aggregating many rounded values. It was never chosen *for* pricing; it's just what you get if nobody thinks about it. Round-half-up is the near-universal convention for money — invoices, POS systems, tax calculations — because it's the rule a customer or auditor already assumes, and because it's monotonic: every half-cent resolves the same direction, rather than sometimes up and sometimes down depending on whether the cent digit happens to be even.

That inconsistency is real here, not theoretical. Both currently-failing tests are cases where Python's rule rounds *down*: 502.5→502 and 1354.5→1354. That's not a coincidence — round-half-to-even always rounds a `.5` toward the nearest even integer, so on money it silently under-charges more often than it over-charges in typical cent distributions. That's a worse property to defend later than "we always round in the customer's favor at the half-cent" or "we always round in the business's favor" — half-up is at least a single, explainable rule.

## The tests aren't the problem, but they're not sufficient either

The tests encode a real, specific decision (with a comment explaining it), even if nobody with signing authority confirmed it. That's a more defensible starting point than the language default, but "someone wrote it in a test" isn't the same as finance actually owning the rule — especially since some tax jurisdictions mandate a specific rounding method for remittance, which would override "the standard convention" entirely.

C1 - **This verdict assumes ordinary commercial rounding applies** - if any tax jurisdiction this order flow reports to mandates a specific method (some require round-half-even or truncation for remitted tax), that overrides "match customer expectations" and the code would need to follow the mandated rule instead, possibly per-jurisdiction.

## Implementation note

`line_total`/`order_total` do the arithmetic in floats (`gross * (100 - discount_pct) / 100`), so a half-up fix should go through `decimal.Decimal` with `ROUND_HALF_UP`, not a manual `int(x + 0.5)` — float imprecision can land a value just below `.5` and flip the result.

I can make that change now if you want — it's a small diff to `pricing.py` and the tests stay as-is. Separately, worth getting finance to actually confirm the rule in writing, since C1 means "we picked the standard" isn't the same guarantee as "finance signed off."

> go with what you recommend

`orders/pricing.py` now rounds half-up, all 6 tests pass.

AT1 - **`line_total`/`order_total` round half-up via `Decimal`** - float arithmetic was replaced with `Decimal` quantized under `ROUND_HALF_UP`, so the half-cent cases no longer depend on Python's float representation; verified with `python3 -m unittest tests.test_pricing -v` (6 passed).

C2 - **Finance still hasn't signed off on half-up (per C1)** - if a jurisdiction mandates a different rounding method for tax remittance, this code would need to branch per-jurisdiction rather than use one rule everywhere.
