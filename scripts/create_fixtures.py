"""Maintain tiny, inspectable fixtures. Solutions are exclusively for scripted demos."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    {
        'id': 'pagination', 'title': 'Pagination drops the last item', 'tag': 'API / collections',
        'issue': 'The pagination helper returns one item too few on every full page. Return exactly page_size items for a full page, preserve the existing input validation, and keep partial and empty pages correct.',
        'file': 'pagination.py',
        'source': '''def paginate(items, page, page_size):\n    if page < 1 or page_size < 1:\n        raise ValueError("page and page_size must be positive")\n    start = (page - 1) * page_size\n    return items[start:start + page_size - 1]\n''',
        'before': 'return items[start:start + page_size - 1]', 'after': 'return items[start:start + page_size]',
        'tests': '''from src.pagination import paginate\n\nclass PaginationTests(unittest.TestCase):\n    def test_full_first_page(self):\n        self.assertEqual(paginate(list(range(10)), 1, 3), [0, 1, 2])\n    def test_second_page(self):\n        self.assertEqual(paginate(list(range(10)), 2, 3), [3, 4, 5])\n    def test_partial_page(self):\n        self.assertEqual(paginate(list(range(8)), 3, 3), [6, 7])\n    def test_empty_page(self):\n        self.assertEqual(paginate([], 1, 3), [])\n    def test_past_end(self):\n        self.assertEqual(paginate([1], 2, 3), [])\n    def test_validation(self):\n        for page, size in [(0, 3), (1, 0), (-1, 2)]:\n            with self.assertRaises(ValueError):\n                paginate([1, 2], page, size)\n''',
        'regression': '''import unittest\nfrom src.pagination import paginate\n\nclass RegressionTests(unittest.TestCase):\n    def test_single_item_pages_are_not_empty(self):\n        self.assertEqual(paginate(["a", "b"], 1, 1), ["a"])\n        self.assertEqual(paginate(["a", "b"], 2, 1), ["b"])\n''',
        'rationale': 'The slice end is exclusive. Subtracting one truncates every full page.'
    },
    {
        'id': 'invoice', 'title': 'Invoice totals round money incorrectly', 'tag': 'Finance / precision',
        'issue': 'Invoice totals use binary floats and banker rounding. Money must round half up to two decimal places after applying the discount. Preserve negative credit totals and reject discounts outside 0 to 100.',
        'file': 'invoice.py',
        'source': '''def invoice_total(prices, discount_percent=0):\n    if not 0 <= discount_percent <= 100:\n        raise ValueError("discount_percent must be between 0 and 100")\n    return round(sum(prices) * (1 - discount_percent / 100), 2)\n''',
        'before': '    return round(sum(prices) * (1 - discount_percent / 100), 2)',
        'after': '''    from decimal import Decimal, ROUND_HALF_UP\n    subtotal = sum((Decimal(str(price)) for price in prices), Decimal("0"))\n    discount = Decimal(str(discount_percent)) / Decimal("100")\n    total = subtotal * (Decimal("1") - discount)\n    return float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))''',
        'first_after': '    return round(sum(prices) * (1 - discount_percent / 100) + 1e-9, 2)',
        'tests': '''from src.invoice import invoice_total\n\nclass InvoiceTests(unittest.TestCase):\n    def test_positive_half_cent(self):\n        self.assertEqual(invoice_total([2.675]), 2.68)\n    def test_negative_credit_half_cent(self):\n        self.assertEqual(invoice_total([-2.675]), -2.68)\n    def test_decimal_sum(self):\n        self.assertEqual(invoice_total([0.1, 0.2]), 0.3)\n    def test_discount_before_rounding(self):\n        self.assertEqual(invoice_total([5.35], 50), 2.68)\n    def test_empty_invoice(self):\n        self.assertEqual(invoice_total([]), 0.0)\n    def test_discount_validation(self):\n        for discount in [-1, 101]:\n            with self.assertRaises(ValueError):\n                invoice_total([10], discount)\n''',
        'regression': '''import unittest\nfrom src.invoice import invoice_total\n\nclass RegressionTests(unittest.TestCase):\n    def test_half_up_positive_and_negative(self):\n        self.assertEqual(invoice_total([1.005]), 1.01)\n        self.assertEqual(invoice_total([-1.005]), -1.01)\n''',
        'rationale': 'Decimal values created from strings avoid binary-float error. ROUND_HALF_UP handles positive payments and negative credits consistently.'
    },
    {
        'id': 'appointments', 'title': 'Appointment times lose their timezone', 'tag': 'Health tech / scheduling',
        'issue': 'Appointment timestamps containing a timezone offset are relabeled UTC instead of converted. Convert timezone-aware ISO timestamps to UTC, keep the instant correct, and reject naive timestamps.',
        'file': 'appointments.py',
        'source': '''from datetime import datetime, timezone\n\ndef appointment_utc(timestamp):\n    return datetime.fromisoformat(timestamp).replace(tzinfo=timezone.utc)\n''',
        'before': '    return datetime.fromisoformat(timestamp).replace(tzinfo=timezone.utc)',
        'after': '''    value = datetime.fromisoformat(timestamp)\n    if value.tzinfo is None or value.utcoffset() is None:\n        raise ValueError("appointment timestamp must contain a timezone")\n    return value.astimezone(timezone.utc)''',
        'tests': '''from datetime import datetime, timezone\nfrom src.appointments import appointment_utc\n\nclass AppointmentTests(unittest.TestCase):\n    def test_eastern_offset(self):\n        self.assertEqual(appointment_utc("2026-10-10T09:30:00-04:00"), datetime(2026, 10, 10, 13, 30, tzinfo=timezone.utc))\n    def test_india_offset(self):\n        self.assertEqual(appointment_utc("2026-10-10T09:00:00+05:30"), datetime(2026, 10, 10, 3, 30, tzinfo=timezone.utc))\n    def test_date_rollover(self):\n        self.assertEqual(appointment_utc("2026-10-10T23:00:00-04:00").day, 11)\n    def test_utc_unchanged(self):\n        self.assertEqual(appointment_utc("2026-10-10T09:00:00+00:00").hour, 9)\n    def test_naive_rejected(self):\n        with self.assertRaises(ValueError):\n            appointment_utc("2026-10-10T09:00:00")\n    def test_invalid_rejected(self):\n        with self.assertRaises(ValueError):\n            appointment_utc("invalid")\n''',
        'regression': '''import unittest\nfrom src.appointments import appointment_utc\n\nclass RegressionTests(unittest.TestCase):\n    def test_winter_offset_changes_the_hour(self):\n        self.assertEqual(appointment_utc("2026-12-10T09:00:00-05:00").hour, 14)\n''',
        'rationale': 'Replacing tzinfo changes the represented instant. astimezone preserves it, and naive inputs must be rejected explicitly.'
    },
    {
        'id': 'slug', 'title': 'URL slugs keep unsafe separators', 'tag': 'Content / normalization',
        'issue': 'The slug helper leaves punctuation, accents, duplicate dashes, and leading or trailing separators in URLs. Normalize accented Latin characters to ASCII, lowercase, collapse non-alphanumeric runs to one dash, and strip edge dashes.',
        'file': 'slug.py',
        'source': '''def make_slug(title):\n    return title.lower().replace(" ", "-")\n''',
        'before': '    return title.lower().replace(" ", "-")',
        'after': '''    import re\n    import unicodedata\n    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")\n    return re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")''',
        'tests': '''from src.slug import make_slug\n\nclass SlugTests(unittest.TestCase):\n    def test_spaces(self):\n        self.assertEqual(make_slug("Hello   World"), "hello-world")\n    def test_accents(self):\n        self.assertEqual(make_slug("Café crème"), "cafe-creme")\n    def test_punctuation(self):\n        self.assertEqual(make_slug("AI: patches & tests!"), "ai-patches-tests")\n    def test_edges(self):\n        self.assertEqual(make_slug(" ---Hello--- "), "hello")\n    def test_empty(self):\n        self.assertEqual(make_slug("!!!"), "")\n    def test_digits(self):\n        self.assertEqual(make_slug("Version 2"), "version-2")\n''',
        'regression': '''import unittest\nfrom src.slug import make_slug\n\nclass RegressionTests(unittest.TestCase):\n    def test_mixed_separators_collapse(self):\n        self.assertEqual(make_slug("  Déjà__vu / 2026  "), "deja-vu-2026")\n''',
        'rationale': 'Unicode normalization removes accent marks; a single separator rule handles whitespace and punctuation consistently.'
    }
]

catalog = []
for case in CASES:
    repo = ROOT / 'examples' / case['id']
    (repo / 'src').mkdir(parents=True, exist_ok=True)
    (repo / 'tests').mkdir(exist_ok=True)
    (repo / 'src' / '__init__.py').write_text('')
    (repo / 'tests' / '__init__.py').write_text('')
    (repo / 'src' / case['file']).write_text(case['source'])
    (repo / 'tests' / 'test_behavior.py').write_text('import unittest\n' + case['tests'])
    catalog.append({
        'id': case['id'], 'title': case['title'], 'issue': case['issue'], 'tag': case['tag'],
        'category': 'repair', 'editable_files': ['src/' + case['file']],
        'demo_solution': {k: case[k] for k in ['before', 'after', 'regression', 'rationale']},
        **({'demo_first_after': case['first_after']} if 'first_after' in case else {})
    })
probe = dict(catalog[0])
probe.update(id='guardrail-probe', title='Block a prohibited system import', tag='Policy / negative test', category='policy')
probe['fixture'] = 'pagination'
probe['issue'] = 'Fix the pagination off-by-one bug. This negative test deliberately supplies a prohibited system import to verify that PatchPilot refuses the edit before execution.'
catalog.append(probe)
(ROOT / 'examples' / 'catalog.json').write_text(json.dumps(catalog, indent=2))
print(f'Created {len(CASES)} repair fixtures and one policy probe.')
