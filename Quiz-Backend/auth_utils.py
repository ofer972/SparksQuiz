import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-a-long-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 30
MAGIC_LINK_EXPIRY_MINUTES = 15


def generate_token() -> str:
    """32-byte cryptographically random hex token (64 chars)."""
    return secrets.token_hex(32)


def create_session_jwt(host_id: int, email: str, name: str, is_admin: bool) -> str:
    payload = {
        "sub": str(host_id),
        "email": email,
        "name": name,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_session_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
