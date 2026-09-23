"""Retry helper for the payment gateway client."""

import time

SLEEP_SECONDS = 0.5


def call_with_retry(fn, attempts=3):
    """Call fn, retrying on exception with a fixed sleep between attempts."""
    last = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:  # the gateway raises many types
            last = exc
            if attempt < attempts - 1:
                time.sleep(SLEEP_SECONDS)
    raise last
