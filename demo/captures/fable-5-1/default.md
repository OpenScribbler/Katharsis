> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

Neither one yet. This is a business rule, and right now nobody has actually decided it.

**What's there now:**
- `orders/pricing.py:8` and `:14` use Python's built-in `round()`, which rounds halves to the nearest even number ("banker's rounding"). So 502.5 → 502 and 1354.5 → 1354.
- `tests/test_pricing.py:15` and `:24` expect 503 and 1355. The comments say "finance rounds half up," which reads like a confirmed requirement when it isn't one.

**Why you shouldn't just pick one:**
- The code's behavior was an accident too. Whoever wrote `round()` probably didn't choose banker's rounding on purpose. So neither side is the source of truth.
- The right answer depends on things outside the repo: what your accounting system or ledger does, what your invoices show, and sometimes what the tax jurisdiction requires. Many sales-tax rules specify half-up, but some don't. If these totals don't match what finance's system calculates, you get one-cent reconciliation differences.
- If this code is already in production, past orders were rounded half-to-even. Switching changes the result in exact half-cent cases, and finance may want to know that.

**What I'd do:**
1. **Ask finance one specific question:** "When a line total or tax comes out to exactly half a cent, do we round up, or to the nearest even cent? Is rounding done per line or on the order total?" The code currently rounds each line, then applies tax to the subtotal and rounds again. That's a policy choice too, and it's worth confirming at the same time.
2. **Whatever they answer, make the choice explicit in the code.** Use `Decimal` with `ROUND_HALF_UP` or `ROUND_HALF_EVEN` instead of float math and bare `round()`. The rule is then visible in the code, and it stays correct if a price calculation ever produces a float that's slightly off.
3. **Until they answer,** the two half-cent tests could be marked `@unittest.expectedFailure` (or skipped) with a note pointing to the open question. That's better than quietly making the code or the tests "win," and the comment stops claiming finance confirmed something they didn't.

I can draft the question for finance, or make the `Decimal` change now so it's a one-line switch once they decide.

> go with what you recommend

The rounding rule is now an explicit setting in the code, and the tests pass: all 6 ran, 4 pass normally and the 2 half-cent tests are marked as expected failures. Pricing results haven't changed.

**`orders/pricing.py`**
- The math now uses `Decimal` instead of floats, and all rounding goes through a single `ROUNDING` constant.
- I set it to `ROUND_HALF_EVEN` for now, which gives the same results as the old `round()`. A comment says finance hasn't confirmed the rule yet.
- Once finance decides, it's a one-line change: switch to `ROUND_HALF_UP`, or leave it as is.

**`tests/test_pricing.py`**
- The two half-cent tests are marked `@unittest.expectedFailure`, with a note pointing to `ROUNDING`.
- I removed the comments claiming "finance rounds half up," since nobody confirmed that.

**Once finance answers:**
- **Half-up:** change `ROUNDING` to `ROUND_HALF_UP` and remove the two `expectedFailure` markers. The tests should then pass as written.
- **Half-even:** remove the markers and change the expected values to 502 and 1354.

Here's a draft question you can send to finance:

> When a price calculation comes out to exactly half a cent (e.g. $5.025 after a discount, or tax of $13.545), should we round up, or to the nearest even cent? Also, should we round each line item separately before adding tax, or only round the final order total? We currently round each line, then add tax to the subtotal and round again. If this needs to match how our accounting system or invoices calculate totals, please tell us what they do.
