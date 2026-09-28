> the pricing tests expect round-half-up but pricing.py uses python's round(). thing is, finance never actually confirmed half-up, someone just wrote the tests that way. should we change the code or the tests?

Change the code to half-up, and treat it as provisional until finance answers.

## Why the code has no more authority than the tests

The question assumes the code records a decision and the tests record a guess. It doesn't. `round()` on a float is half-to-even because that is Python's default, and `orders/pricing.py:8` shows nobody choosing it — no comment, no named constant, no mention of a rounding policy anywhere in the module. Both sides are unconfirmed, and only one of them is written down as an intent.

F1 - **CI is red right now** - 2 of 10 tests fail on the two half-cent cases, 502 against 503 and 1354 against 1355 `python3 -m unittest discover`

F2 - **The half-up claim rests on 2 assertions** - `tests/test_pricing.py:14` and `:23` are the only record that a person thought about the tie case at all, comments included.

Half-up is also what consumer invoicing conventionally uses, so it is the reading finance is most likely to confirm. That is a lean rather than a fact, which is why the change goes in provisionally.

## The rounding question finance should actually get

`order_total` rounds twice — per line at `pricing.py:8`, then on the total at `:14` — so tax applies to a sum of already-rounded lines. Two lines of 1005 cents at 50% off come to 1056 with 5% tax under per-line rounding and 1055 under a single rounding at the end. Send both questions together; the second one moves more cents than the first.

## Trade-offs

T-O1 - **Changing the code forecloses nothing** - reversal is one function swap plus 2 test constants, and a wrong guess is off by 1 cent on the orders that land on an exact half.

T-O2 - **Changing the tests forecloses the audit trail** - 502 and 1354 asserted with the comments stripped read as confirmed policy to the next person, so reversing means re-deriving which cases anyone ever considered.

➡️ Change the code — reversal cost decided it.

C1 - **Half-up needs no `Decimal` here** - the float path does a single division on an integer product, so ties land exactly on .5; I checked 54,000 price/quantity/discount combinations against exact decimal arithmetic with no disagreement. It stops holding if a second division enters the chain.

MV1 - **Ask finance two things: half-up or half-even on a tie, and round per line or once on the total** - they are the only source that settles either, and the second answer can shift every multi-line invoice by a cent.

I have not edited either file — you asked which to change, not for the change.

> go with what you recommend

All 10 tests pass.

AT1 - **`orders/pricing.py` rounds half-up through one `_round_half_up` helper** - both `round()` calls now route through it, and its docstring plus `order_total`'s record that half-up and per-line rounding are unconfirmed, so the next reader does not take either for settled.

The helper breaks negative halves away from zero, which nothing calls today but fixes the answer if a credit line ever arrives. MV1 still stands — finance's answer to either question is a one-line change in that helper or a moved `_round_half_up` call.
