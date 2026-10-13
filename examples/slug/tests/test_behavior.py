import unittest
from src.slug import make_slug

class SlugTests(unittest.TestCase):
    def test_spaces(self):
        self.assertEqual(make_slug("Hello   World"), "hello-world")
    def test_accents(self):
        self.assertEqual(make_slug("Café crème"), "cafe-creme")
    def test_punctuation(self):
        self.assertEqual(make_slug("AI: patches & tests!"), "ai-patches-tests")
    def test_edges(self):
        self.assertEqual(make_slug(" ---Hello--- "), "hello")
    def test_empty(self):
        self.assertEqual(make_slug("!!!"), "")
    def test_digits(self):
        self.assertEqual(make_slug("Version 2"), "version-2")
