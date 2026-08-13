"""
BK Logic - JWT kimlik dogrulama.

Roller:
  - dealer: Admin, tum araclari gorebilir, musteri yonetimi yapar
  - customer: Sadece kendine atanmis araclari gorebilir
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

SECRET_KEY = os.getenv("JWT_SECRET", "bklogic-secret-change-in-production")
TOKEN_EXPIRY = 86400 * 7  # 7 gun


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored: str) -> bool:
    if ":" not in stored:
        return False
    salt, hashed = stored.split(":", 1)
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()
    return hmac.compare_digest(hashed, check)


def _b64url_encode(data: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    import base64
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def create_token(user_id: int | str, role: str, name: str = "") -> str:
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload_data = {
        "sub": str(user_id),
        "role": role,
        "name": name,
        "exp": int(time.time()) + TOKEN_EXPIRY,
        "iat": int(time.time()),
    }
    payload = _b64url_encode(json.dumps(payload_data).encode())
    signature = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    sig = _b64url_encode(signature)
    return f"{header}.{payload}.{sig}"


def decode_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header, payload, sig = parts
        expected_sig = hmac.new(
            SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256
        ).digest()
        actual_sig = _b64url_decode(sig)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload_data = json.loads(_b64url_decode(payload))

        if payload_data.get("exp", 0) < time.time():
            return None

        return payload_data
    except Exception:
        return None
