import unittest
from src.invoice import invoice_total

class InvoiceTests(unittest.TestCase):
    def test_positive_half_cent(self):
        self.assertEqual(invoice_total([2.675]), 2.68)
    def test_negative_credit_half_cent(self):
        self.assertEqual(invoice_total([-2.675]), -2.68)
    def test_decimal_sum(self):
        self.assertEqual(invoice_total([0.1, 0.2]), 0.3)
    def test_discount_before_rounding(self):
        self.assertEqual(invoice_total([5.35], 50), 2.68)
    def test_empty_invoice(self):
        self.assertEqual(invoice_total([]), 0.0)
    def test_discount_validation(self):
        for discount in [-1, 101]:
            with self.assertRaises(ValueError):
                invoice_total([10], discount)
