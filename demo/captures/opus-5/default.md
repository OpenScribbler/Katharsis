> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

Neither, yet — but the status quo isn't the safe default it looks like, and that changes the shape of the question.

**What's actually in the code.** `round()` isn't half-down, it's half-to-even (banker's rounding). At exact half-cents it alternates direction depending on the neighboring digit:

```
502.5 -> 502     507.5 -> 508
512.5 -> 512     517.5 -> 518
522.5 -> 522
```

So "just fix the tests to match the code" would be writing down a rule nobody chose. Whoever wrote those tests made an unverified assumption about half-up; the code's behavior is an unverified assumption too, inherited from a Python builtin default. There's no incumbent spec here to defer to — you have two guesses, and one of them at least corresponds to a rule a human might plausibly have asked for.

**The two failing tests are both, and only, the half-cent cases.** The other 4 pricing tests pass, and they pin down the parts everyone does agree on (gross, discount, tax). So the disagreement is genuinely narrow and isolated — it's not a broad rewrite in either direction.

**My recommendation:** don't touch either file until finance answers, but treat the current code as equally unconfirmed rather than as the fallback. Concretely, I'd mark the two tests as blocked on that answer:

```python
@unittest.skip("half-cent rounding rule unconfirmed — see FIN-### ; do not delete")
```

That keeps CI green without silently ratifying half-to-even, and leaves a visible pointer to the open question instead of erasing it. Deleting the tests or flipping the assertions to `502`/`1354` both destroy the only artifact recording that the question exists.

The question for finance is narrower than "half-up?" — it's *what rule, at exact half-cents, and rounded at which step*. Note `order_total` rounds each line and then rounds the taxed subtotal, so the rule compounds; jurisdictions differ on per-line vs. per-invoice rounding.

**One thing worth fixing regardless of the answer:** the arithmetic goes through binary floats, so "exactly .5" is only reliably exact when the divisor cooperates. Whatever rule you adopt, half-up included, it'll be applied to a value that may already have drifted below or above the true half. `Decimal` with an explicit `ROUND_HALF_UP` (or `ROUND_HALF_EVEN`) quantize, or integer arithmetic like `(discounted_numerator * 2 + denom) // (denom * 2)`, makes the boundary exact and the intent explicit at the same time. That's a real bug independent of the policy dispute, and it's the change I'd make first.

Want me to apply the skips, or write up the finance question with the specific cases to confirm?

> go with what you recommend

Done, but I need to correct something I told you.

**I overstated the float bug.** I said it was "a real bug independent of the policy dispute" and the change I'd make first. I checked, and it doesn't manifest for any realistic input: zero disagreements between the old float path and exact arithmetic across ~84,000 integer-percentage cases and fractional percentages like 12.5% and 6.25%. The first divergence appears around 10¹⁷ cents — a quadrillion dollars.

The reason is one I should have thought through before flagging it: exact half-cents are dyadic rationals (`x.5` is exactly representable in binary), so when the true value sits exactly on a rounding boundary, IEEE division lands on it exactly rather than drifting past. And when the value *isn't* on a boundary, the error is ~10⁻¹² — far too small to cross one. The bug I predicted needs both conditions at once, and they're close to mutually exclusive at money magnitudes.

**What I actually changed, and why it's still worth keeping:**

`orders/pricing.py` now uses `Decimal` with a named module-level constant:

```python
TIE_BREAKING = ROUND_HALF_EVEN
```

The honest case for this is *not* correctness — it's that the disputed rule is now a named, documented, one-line thing instead of an invisible side effect of a builtin default. The comment states plainly that half-to-even was chosen only to preserve existing behavior and that finance hasn't signed off. When they answer, it's one line plus unskipping two tests. I also documented that `order_total` rounds per line *and* on the taxed subtotal, so the policy can apply twice per order — that compounding is part of the question.

If you'd rather not carry `Decimal` for a non-bug, reverting to `round()` and keeping just the skips is reasonable; say the word.

`tests/test_pricing.py`:
- The two half-cent tests are skipped with `"half-cent rounding rule unconfirmed by finance -- do not delete"`. Assertions untouched — still `503` and `1355`.
- Rewrote the misleading comments. They previously read "finance rounds half up" as settled fact; they now say the expectation is unconfirmed and note what the code currently returns.
- Added three tests for what *isn't* in dispute — that ties are decided exactly and consistently. The third accepts either the half-up or half-to-even result set, so it passes under whichever policy you adopt.

```
Ran 13 tests — OK (skipped=2)
```

CI is green without either side of the argument being silently ratified.

**Still open, and it's not mine to close:** the question for finance is narrower than "half up?" — it's *what rule at exact half-cents, and rounded per line or per invoice*. Both skip reasons should get your real ticket ID; I left it out rather than invent one.
