"""Raw SQL helpers for host authentication and admin management."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.engine import Connection

from auth_utils import MAGIC_LINK_EXPIRY_MINUTES


# ── Host queries ───────────────────────────────────────────────────────────────

def get_host_by_email(conn: Connection, email: str) -> dict | None:
    row = conn.execute(
        text("SELECT id, email, name, is_active, is_admin, last_login FROM hosts WHERE email = :email"),
        {"email": email},
    ).fetchone()
    return dict(row._mapping) if row else None


def get_host_by_id(conn: Connection, host_id: int) -> dict | None:
    row = conn.execute(
        text("SELECT id, email, name, is_active, is_admin, last_login FROM hosts WHERE id = :id"),
        {"id": host_id},
    ).fetchone()
    return dict(row._mapping) if row else None


def get_all_hosts(conn: Connection) -> list[dict]:
    rows = conn.execute(
        text("""
            SELECT id, email, name, is_active, is_admin,
                   invited_at, last_login, invited_by
            FROM hosts
            ORDER BY invited_at DESC NULLS LAST
        """)
    ).fetchall()
    return [dict(r._mapping) for r in rows]


def create_host(conn: Connection, email: str, name: str, is_admin: bool, invited_by: str) -> int:
    row = conn.execute(
        text("""
            INSERT INTO hosts (email, name, is_active, is_admin, invited_at, invited_by)
            VALUES (:email, :name, TRUE, :is_admin, NOW(), :invited_by)
            RETURNING id
        """),
        {"email": email, "name": name, "is_admin": is_admin, "invited_by": invited_by},
    ).fetchone()
    return row.id


def update_host_reinvite(conn: Connection, host_id: int, invited_by: str):
    conn.execute(
        text("UPDATE hosts SET invited_at = NOW(), invited_by = :invited_by WHERE id = :id"),
        {"invited_by": invited_by, "id": host_id},
    )


def update_last_login(conn: Connection, host_id: int):
    conn.execute(
        text("UPDATE hosts SET last_login = NOW() WHERE id = :id"),
        {"id": host_id},
    )


def revoke_host(conn: Connection, host_id: int):
    conn.execute(
        text("UPDATE hosts SET is_active = FALSE WHERE id = :id"),
        {"id": host_id},
    )


def delete_host(conn: Connection, host_id: int):
    conn.execute(text("DELETE FROM hosts WHERE id = :id"), {"id": host_id})


# ── Magic link token queries ───────────────────────────────────────────────────

def create_magic_token(conn: Connection, host_id: int, token: str):
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=MAGIC_LINK_EXPIRY_MINUTES)
    conn.execute(
        text("""
            INSERT INTO magic_link_tokens (host_id, token, expires_at)
            VALUES (:host_id, :token, :expires_at)
        """),
        {"host_id": host_id, "token": token, "expires_at": expires_at},
    )


def get_magic_token(conn: Connection, token: str) -> dict | None:
    row = conn.execute(
        text("SELECT id, host_id, expires_at, used FROM magic_link_tokens WHERE token = :token"),
        {"token": token},
    ).fetchone()
    return dict(row._mapping) if row else None


def consume_magic_token(conn: Connection, token_id: int):
    conn.execute(
        text("UPDATE magic_link_tokens SET used = TRUE WHERE id = :id"),
        {"id": token_id},
    )
