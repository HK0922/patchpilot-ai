import unittest
from datetime import datetime, timezone
from src.appointments import appointment_utc

class AppointmentTests(unittest.TestCase):
    def test_eastern_offset(self):
        self.assertEqual(appointment_utc("2026-10-10T09:30:00-04:00"), datetime(2026, 10, 10, 13, 30, tzinfo=timezone.utc))
    def test_india_offset(self):
        self.assertEqual(appointment_utc("2026-10-10T09:00:00+05:30"), datetime(2026, 10, 10, 3, 30, tzinfo=timezone.utc))
    def test_date_rollover(self):
        self.assertEqual(appointment_utc("2026-10-10T23:00:00-04:00").day, 11)
    def test_utc_unchanged(self):
        self.assertEqual(appointment_utc("2026-10-10T09:00:00+00:00").hour, 9)
    def test_naive_rejected(self):
        with self.assertRaises(ValueError):
            appointment_utc("2026-10-10T09:00:00")
    def test_invalid_rejected(self):
        with self.assertRaises(ValueError):
            appointment_utc("invalid")
