import unittest

from orders.retry import call_with_retry


class RetryTest(unittest.TestCase):
    def test_returns_on_first_success(self):
        self.assertEqual(call_with_retry(lambda: 42), 42)

    def test_retries_then_succeeds(self):
        state = {"calls": 0}

        def flaky():
            state["calls"] += 1
            if state["calls"] < 3:
                raise RuntimeError("gateway 503")
            return "ok"

        self.assertEqual(call_with_retry(flaky), "ok")
        self.assertEqual(state["calls"], 3)

    def test_raises_after_exhausting_attempts(self):
        def always_fails():
            raise RuntimeError("gateway 503")

        with self.assertRaises(RuntimeError):
            call_with_retry(always_fails)

    def test_respects_attempt_count(self):
        state = {"calls": 0}

        def counter():
            state["calls"] += 1
            raise RuntimeError("gateway 503")

        with self.assertRaises(RuntimeError):
            call_with_retry(counter, attempts=5)
        self.assertEqual(state["calls"], 5)
