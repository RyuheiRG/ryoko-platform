from __future__ import annotations

import hashlib
import hmac
import time

from app.config import settings
from app.delivery import timestamp_is_fresh, verify_signature

SECRET = settings.webhook_secret.get_secret_value()


def _signature(timestamp: str, body: bytes) -> str:
    return hmac.new(SECRET.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def test_verify_signature_accepts_raw_and_prefixed_digests() -> None:
    timestamp = str(int(time.time()))
    body = b'{"event_id":"abc"}'
    digest = _signature(timestamp, body)
    assert verify_signature(secret=SECRET, timestamp=timestamp, body=body, signature=digest)
    assert verify_signature(
        secret=SECRET, timestamp=timestamp, body=body, signature=f"sha256={digest}"
    )


def test_verify_signature_rejects_tampering() -> None:
    timestamp = str(int(time.time()))
    body = b'{"event_id":"abc"}'
    digest = _signature(timestamp, body)
    assert not verify_signature(
        secret=SECRET, timestamp=timestamp, body=b'{"event_id":"xyz"}', signature=digest
    )
    assert not verify_signature(
        secret=SECRET, timestamp=timestamp, body=body, signature="sha256=deadbeef"
    )


def test_timestamp_window() -> None:
    now = 1_800_000_000.0
    assert timestamp_is_fresh(str(int(now)), now=now)
    assert timestamp_is_fresh(str(int(now - 300)), now=now)
    assert not timestamp_is_fresh(str(int(now - 301)), now=now)
    assert not timestamp_is_fresh("not-a-number", now=now)
