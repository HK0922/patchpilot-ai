from datetime import datetime, timezone

def appointment_utc(timestamp):
    return datetime.fromisoformat(timestamp).replace(tzinfo=timezone.utc)
