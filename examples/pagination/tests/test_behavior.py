import unittest
from src.pagination import paginate

class PaginationTests(unittest.TestCase):
    def test_full_first_page(self):
        self.assertEqual(paginate(list(range(10)), 1, 3), [0, 1, 2])
    def test_second_page(self):
        self.assertEqual(paginate(list(range(10)), 2, 3), [3, 4, 5])
    def test_partial_page(self):
        self.assertEqual(paginate(list(range(8)), 3, 3), [6, 7])
    def test_empty_page(self):
        self.assertEqual(paginate([], 1, 3), [])
    def test_past_end(self):
        self.assertEqual(paginate([1], 2, 3), [])
    def test_validation(self):
        for page, size in [(0, 3), (1, 0), (-1, 2)]:
            with self.assertRaises(ValueError):
                paginate([1, 2], page, size)
