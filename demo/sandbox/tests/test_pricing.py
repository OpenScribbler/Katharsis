import unittest

from orders.pricing import line_total, order_total


class LineTotalTest(unittest.TestCase):
    def test_no_discount(self):
        self.assertEqual(line_total(1999, 3, 0), 5997)

    def test_ten_percent_discount(self):
        self.assertEqual(line_total(1999, 3, 10), 5397)

    def test_half_cent_rounds_up(self):
        # 1005 * 1 at 50% off is exactly 502.5 cents; finance rounds half up.
        self.assertEqual(line_total(1005, 1, 50), 503)


class OrderTotalTest(unittest.TestCase):
    def test_single_line_with_tax(self):
        self.assertEqual(order_total([(1000, 2, 0)], 8), 2160)

    def test_half_cent_tax_rounds_up(self):
        # 1290 cents at 5% tax is exactly 1354.5; finance rounds half up.
        self.assertEqual(order_total([(258, 5, 0)], 5), 1355)

    def test_mixed_lines(self):
        lines = [(1999, 3, 10), (450, 2, 0)]
        self.assertEqual(order_total(lines, 0), 6297)
