import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.engine import Connection

from auth_utils import generate_token, create_session_jwt, verify_session_jwt
from database_auth import (
    get_host_by_email, get_host_by_id,
    create_magic_token, get_magic_token, consume_magic_token, update_last_login,
    get_all_hosts, create_host, update_host_reinvite, revoke_host, delete_host,
)
from database_connection import get_db_connection, get_db_engine

logger = logging.getLogger(__name__)

APP_URL       = os.getenv("APP_URL", "http://localhost:3000")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM   = os.getenv("RESEND_FROM", "SparksQuiz <onboarding@resend.dev>")
COOKIE_NAME   = "sq_session"
COOKIE_MAX_AGE = 30 * 24 * 3600   # 30 days

DEFAULT_HOST_EMAIL = os.getenv("DEFAULT_HOST_EMAIL", "")


def _cookie_kwargs() -> dict:
    """Return cookie security settings appropriate for the current environment.
    Cross-domain (Railway) requires SameSite=None + Secure=True.
    Local dev (http) uses SameSite=lax + Secure=False.
    """
    frontend = os.getenv("FRONTEND_URL", os.getenv("APP_URL", ""))
    is_https = frontend.startswith("https://")
    return {
        "httponly": True,
        "samesite": "none" if is_https else "lax",
        "secure": is_https,
        "max_age": COOKIE_MAX_AGE,
    }


# ── Email helper ───────────────────────────────────────────────────────────────

def _send_magic_link(email: str, name: str, token: str, subject: str = "Your SparksQuiz login link"):
    link = f"{APP_URL}/auth/verify?token={token}"
    if RESEND_API_KEY:
        try:
            import resend
            resend.api_key = RESEND_API_KEY
            resend.Emails.send({
                "from": RESEND_FROM,
                "to": email,
                "subject": subject,
                "html": f"""
                    <div style="font-family:sans-serif;max-width:480px;margin:auto">
                      <h2>Hello {name}!</h2>
                      <p>{subject.replace('Your ', '').replace('login link', 'login link below')}.</p>
                      <p>This link expires in <strong>15 minutes</strong> and can only be used once.</p>
                      <a href="{link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;
                         color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0">
                        Log in to SparksQuiz
                      </a>
                      <p style="color:#888;font-size:12px">
                        If you didn't request this, you can safely ignore it.
                      </p>
                    </div>
                """,
            })
            logger.info(f"Magic link sent to {email}")
        except Exception as e:
            logger.error(f"Failed to send email via Resend: {e}")
    else:
        # Dev mode — print link so you can log in without email setup
        logger.info(f"[DEV] Magic link for {email}:\n  {link}")


# ── Auth dependency ────────────────────────────────────────────────────────────

def get_current_host(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = verify_session_jwt(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired session")
    # Verify host is still active in DB on every request
    with get_db_engine().connect() as conn:
        host = get_host_by_id(conn, int(payload["sub"]))
    if not host or not host["is_active"]:
        raise HTTPException(401, "Account revoked or not found")
    return payload


def get_current_admin(payload: dict = Depends(get_current_host)) -> dict:
    if not payload.get("is_admin"):
        raise HTTPException(403, "Admin access required")
    return payload


# ── Auth router (/auth) ────────────────────────────────────────────────────────

router = APIRouter(prefix="/auth", tags=["auth"])


class RequestLinkBody(BaseModel):
    email: str


@router.post("/request-link")
def request_link(body: RequestLinkBody, response: Response, conn: Connection = Depends(get_db_connection)):
    email = body.email.lower().strip()
    host = get_host_by_email(conn, email)
    if not host:
        raise HTTPException(404, "This email is not registered as a host.")
    if not host["is_active"]:
        raise HTTPException(403, "This account has been revoked. Contact an admin.")

    superadmin = DEFAULT_HOST_EMAIL.lower().strip()
    # Super-admin bypass: DEFAULT_HOST_EMAIL logs in directly — no magic link needed
    if superadmin and email == superadmin:
        update_last_login(conn, host["id"])
        conn.commit()
        jwt_token = create_session_jwt(
            host["id"], host["email"], host["name"] or "", host["is_admin"]
        )
        response.set_cookie(COOKIE_NAME, jwt_token, **_cookie_kwargs())
        logger.info(f"Direct login for super-admin: {email}")
        return {"direct": True}

    token = generate_token()
    create_magic_token(conn, host["id"], token)
    conn.commit()
    _send_magic_link(host["email"], host["name"] or "Host", token)
    return {"message": "Login link sent. Check your email."}


@router.get("/verify")
def verify_token(token: str, response: Response, conn: Connection = Depends(get_db_connection)):
    record = get_magic_token(conn, token)
    if not record:
        raise HTTPException(400, "Invalid link — it may have already been used or never existed.")
    if record["used"]:
        raise HTTPException(400, "This link has already been used. Please request a new one.")

    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "This link has expired. Please request a new one.")

    consume_magic_token(conn, record["id"])
    host = get_host_by_id(conn, record["host_id"])
    if not host or not host["is_active"]:
        conn.commit()
        raise HTTPException(403, "This account has been revoked.")

    update_last_login(conn, host["id"])
    conn.commit()

    jwt_token = create_session_jwt(
        host["id"], host["email"], host["name"] or "", host["is_admin"]
    )
    response.set_cookie(COOKIE_NAME, jwt_token, **_cookie_kwargs())
    return {"ok": True, "name": host["name"], "is_admin": host["is_admin"]}


@router.post("/logout")
def logout(response: Response):
    kwargs = _cookie_kwargs()
    response.delete_cookie(COOKIE_NAME, samesite=kwargs["samesite"], secure=kwargs["secure"])
    return {"ok": True}


@router.get("/me")
def me(payload: dict = Depends(get_current_host)):
    return {
        "id": payload["sub"],
        "email": payload["email"],
        "name": payload["name"],
        "is_admin": payload["is_admin"],
    }


# ── Admin router (/admin) ──────────────────────────────────────────────────────

admin_router = APIRouter(prefix="/admin", tags=["admin"])


class InviteBody(BaseModel):
    email: str
    name: str
    is_admin: bool = False


@admin_router.get("/hosts")
def list_hosts(
    payload: dict = Depends(get_current_admin),
    conn: Connection = Depends(get_db_connection),
):
    return get_all_hosts(conn)


@admin_router.post("/hosts/invite")
def invite_host(
    body: InviteBody,
    payload: dict = Depends(get_current_admin),
    conn: Connection = Depends(get_db_connection),
):
    email = body.email.lower().strip()
    existing = get_host_by_email(conn, email)

    if existing:
        if not existing["is_active"]:
            raise HTTPException(
                400,
                "This host is currently revoked. Delete them first, then re-invite.",
            )
        # Resend invite to existing active host
        token = generate_token()
        create_magic_token(conn, existing["id"], token)
        update_host_reinvite(conn, existing["id"], payload["email"])
        conn.commit()
        _send_magic_link(email, existing["name"] or "Host", token, "Your new SparksQuiz login link")
        return {"ok": True, "action": "reinvited", "id": existing["id"]}

    host_id = create_host(conn, email, body.name.strip(), body.is_admin, payload["email"])
    token = generate_token()
    create_magic_token(conn, host_id, token)
    conn.commit()
    _send_magic_link(email, body.name.strip() or "Host", token, "You've been invited to SparksQuiz")
    return {"ok": True, "action": "invited", "id": host_id}


@admin_router.put("/hosts/{host_id}/revoke")
def revoke(
    host_id: int,
    payload: dict = Depends(get_current_admin),
    conn: Connection = Depends(get_db_connection),
):
    if str(host_id) == payload["sub"]:
        raise HTTPException(400, "You cannot revoke your own account.")
    host = get_host_by_id(conn, host_id)
    if not host:
        raise HTTPException(404, "Host not found.")
    revoke_host(conn, host_id)
    conn.commit()
    return {"ok": True}


@admin_router.delete("/hosts/{host_id}")
def remove_host(
    host_id: int,
    payload: dict = Depends(get_current_admin),
    conn: Connection = Depends(get_db_connection),
):
    if str(host_id) == payload["sub"]:
        raise HTTPException(400, "You cannot delete your own account.")
    host = get_host_by_id(conn, host_id)
    if not host:
        raise HTTPException(404, "Host not found.")
    delete_host(conn, host_id)
    conn.commit()
    return {"ok": True}
