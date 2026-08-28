"""Order pricing."""


def line_total(unit_price_cents, quantity, discount_pct):
    """Total for one order line, in cents, after a percentage discount."""
    gross = unit_price_cents * quantity
    discounted = gross * (100 - discount_pct) / 100
    return round(discounted)


def order_total(lines, tax_pct):
    """Total for an order, in cents, with tax applied to the discounted subtotal."""
    subtotal = sum(line_total(*line) for line in lines)
    return round(subtotal * (100 + tax_pct) / 100)
