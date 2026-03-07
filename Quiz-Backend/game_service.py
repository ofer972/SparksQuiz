import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.engine import Connection

from database_connection import get_db_connection
from database_game import (
    get_active_pins,
    get_session_by_pin,
    create_game_session,
    create_player,
    update_session_short_join_url,
)
from database_quiz import get_quiz_by_id
from game_schemas import GameSessionCreate
from pin import generate_pin
from short_url import get_short_url
from ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/game", tags=["game"])


@router.post("/session", status_code=201)
def create_session(payload: GameSessionCreate, conn: Connection = Depends(get_db_connection)):
    if not get_quiz_by_id(conn, payload.quiz_id):
        logger.warning("🎮 create_session  quiz_id=%d  not_found", payload.quiz_id)
        raise HTTPException(404, "Quiz not found")

    active_pins = manager.active_pins() | get_active_pins(conn)

    pin = generate_pin()
    attempts = 0
    while pin in active_pins:
        pin = generate_pin()
        attempts += 1
        if attempts > 100:
            raise HTTPException(503, "Could not generate a unique PIN, try again")

    session = create_game_session(conn, payload.quiz_id, pin)
    app_url = os.getenv("APP_URL", "").rstrip("/")
    if app_url:
        if not app_url.startswith("http://") and not app_url.startswith("https://"):
            app_url = f"https://{app_url}"
        long_join_url = f"{app_url}/play/{pin}"
        short_url = get_short_url(long_join_url)
        if short_url:
            update_session_short_join_url(conn, session["id"], short_url)
            session["short_join_url"] = short_url
            logger.info("🎮 create_session  quiz_id=%d  pin=%s  short_url=yes", payload.quiz_id, pin)
        else:
            logger.info("🎮 create_session  quiz_id=%d  pin=%s  short_url=no", payload.quiz_id, pin)
    else:
        logger.info("🎮 create_session  quiz_id=%d  pin=%s  (no APP_URL)", payload.quiz_id, pin)
    conn.commit()

    manager.create_room(pin, payload.quiz_id, session["id"])
    return session


@router.get("/session/{pin}")
def get_session(pin: str, conn: Connection = Depends(get_db_connection)):
    session = get_session_by_pin(conn, pin)
    if not session:
        logger.warning("🎮 get_session  pin=%s  not_found", pin)
        raise HTTPException(404, "Session not found")
    logger.info("🎮 get_session  pin=%s  quiz_id=%d", pin, session.get("quiz_id", 0))
    return session


@router.post("/session/{pin}/join")
def join_session(pin: str, nickname: str, conn: Connection = Depends(get_db_connection)):
    room = manager.get_room(pin)
    if not room:
        session = get_session_by_pin(conn, pin)
        if not session or session["status"] != "lobby":
            logger.warning("🎮 join_session  pin=%s  nickname=%s  rejected=game_not_found_or_started", pin, nickname)
            raise HTTPException(404, "Game not found or already started")
        manager.create_room(pin, session["quiz_id"], session["id"])
        room = manager.get_room(pin)

    # Allow join while game is in progress; only reject when game is finished
    if room.status == "finished":
        logger.warning("🎮 join_session  pin=%s  nickname=%s  rejected=game_finished", pin, nickname)
        raise HTTPException(400, "Game already finished")

    nickname = nickname.strip()
    if not nickname:
        logger.warning("🎮 join_session  pin=%s  rejected=nickname_empty", pin)
        raise HTTPException(400, "Nickname is required")

    # Use registered_nicknames (populated at HTTP join) — not player_connections
    # (which is only populated when the WebSocket is opened)
    if nickname in room.registered_nicknames:
        logger.warning("🎮 join_session  pin=%s  nickname=%s  rejected=nickname_taken", pin, nickname)
        raise HTTPException(400, "Nickname already taken")

    session = get_session_by_pin(conn, pin)
    create_player(conn, session["id"], nickname)
    conn.commit()

    room.registered_nicknames.add(nickname)
    room.scores[nickname] = 0

    logger.info("🎮 join_session  pin=%s  nickname=%s", pin, nickname)
    return {"ok": True, "pin": pin, "nickname": nickname}
