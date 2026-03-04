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

router = APIRouter(prefix="/api/game", tags=["game"])


@router.post("/session", status_code=201)
def create_session(payload: GameSessionCreate, conn: Connection = Depends(get_db_connection)):
    if not get_quiz_by_id(conn, payload.quiz_id):
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
        long_join_url = f"{app_url}/play/{pin}"
        short_url = get_short_url(long_join_url)
        if short_url:
            update_session_short_join_url(conn, session["id"], short_url)
            session["short_join_url"] = short_url
    conn.commit()

    manager.create_room(pin, payload.quiz_id, session["id"])
    return session


@router.get("/session/{pin}")
def get_session(pin: str, conn: Connection = Depends(get_db_connection)):
    session = get_session_by_pin(conn, pin)
    if not session:
        raise HTTPException(404, "Session not found")
    return session


@router.post("/session/{pin}/join")
def join_session(pin: str, nickname: str, conn: Connection = Depends(get_db_connection)):
    room = manager.get_room(pin)
    if not room:
        session = get_session_by_pin(conn, pin)
        if not session or session["status"] != "lobby":
            raise HTTPException(404, "Game not found or already started")
        manager.create_room(pin, session["quiz_id"], session["id"])
        room = manager.get_room(pin)

    if room.status != "lobby":
        raise HTTPException(400, "Game already started")

    nickname = nickname.strip()
    if not nickname:
        raise HTTPException(400, "Nickname is required")

    # Use registered_nicknames (populated at HTTP join) — not player_connections
    # (which is only populated when the WebSocket is opened)
    if nickname in room.registered_nicknames:
        raise HTTPException(400, "Nickname already taken")

    session = get_session_by_pin(conn, pin)
    create_player(conn, session["id"], nickname)
    conn.commit()

    room.registered_nicknames.add(nickname)
    room.scores[nickname] = 0

    return {"ok": True, "pin": pin, "nickname": nickname}
