> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

Neither, yet — this is a spec question, and right now the tests' comments ("finance rounds half up") are the only written spec that exists, but you're telling me that claim is unverified. Here's how I'd frame the decision.

**What actually differs.** Python's `round()` is banker's rounding (half-to-even), so the two behaviors disagree only on exact half-cent ties: the test cases `round(502.5)` and `round(1354.5)` give 502 and 1354 in the current code, while the tests expect 503 and 1355. Everything else agrees. So the stakes are half a cent per tie — small in dollars, but this is billing, and tax rounding is often legally specified (many tax authorities mandate half-up or half-away-from-zero; almost nobody mandates banker's rounding for customer-facing prices).

**My recommendation:** get finance to answer the one-line question — "when a computed amount lands exactly on a half cent, do we bill 502 or 503?" — because changing `pricing.py` changes amounts customers are charged, and the code's current behavior is what's actually shipped. Don't let a test author's assumption become policy by default, but also note the priors run strongly in the tests' favor: half-up is the near-universal commerce convention, and it's very unlikely anyone deliberately chose banker's rounding here — `round()` reads like an accident, not a decision.

**Whichever way finance answers, the fix is the same shape:** don't keep float `round()` at all. The ties here are float-fragile — `gross * 0.9` style arithmetic doesn't produce exact halves reliably, so tie behavior is effectively arbitrary on many inputs regardless of which rule you pick. The robust version does the arithmetic in `decimal.Decimal` and makes the policy explicit:

```python
from decimal import Decimal, ROUND_HALF_UP

def line_total(unit_price_cents, quantity, discount_pct):
    gross = Decimal(unit_price_cents) * quantity
    discounted = gross * (100 - Decimal(discount_pct)) / 100
    return int(discounted.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
```

That turns the rounding rule into a named constant finance can literally read, and the tests then verify policy rather than encode a guess.

So: ask finance (with the 502-vs-503 example), and then change the code — either to half-up if they confirm, or to explicit `ROUND_HALF_EVEN` plus updated tests if they somehow want current behavior preserved. Happy to make the Decimal change once you have their answer, or now with `ROUND_HALF_UP` if you'd rather ship the likely answer and confirm after.

> go with what you recommend

Done — all 10 tests pass, including the two half-cent tie cases.

I changed `orders/pricing.py` to do the arithmetic in `decimal.Decimal` and round through a single module-level `ROUNDING = ROUND_HALF_UP` constant, with a comment noting the half-up choice is assumed pending finance's confirmation. The tests stayed untouched. Beyond making the tests pass, this fixes the latent float problem: values like 502.5 are now exact ties rounded by explicit policy, instead of whatever binary floating point happened to produce.

One loose end that's yours to close: confirm with finance that half-cent ties bill upward (the 502-vs-503 question). If they surprise us, the change is one word — swap the `ROUNDING` constant to `ROUND_HALF_EVEN` and update the two tie tests. Also worth knowing: this changes shipped behavior on exact ties (customers previously got the lower cent on some of them), so if any downstream reconciliation compares against historical totals, ties computed before and after this change can differ by one cent.
