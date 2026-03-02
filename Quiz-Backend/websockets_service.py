import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from database_connection import get_db_engine
from database_game import (
    load_questions_for_quiz,
    update_session_status,
    get_session_by_pin,
    persist_scores,
)
from ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# HOST WebSocket  ws://.../ws/host/{pin}
# ---------------------------------------------------------------------------

@router.websocket("/ws/host/{pin}")
async def host_ws(websocket: WebSocket, pin: str):
    logger.info(f"🔌 WS HOST CONNECT  pin={pin}  client={websocket.client}")

    room = manager.get_room(pin)
    if not room:
        # Room not in memory — backend may have restarted. Try to restore from DB.
        with get_db_engine().connect() as conn:
            session = get_session_by_pin(conn, pin)
        if session and session["status"] == "lobby":
            room = manager.create_room(pin, session["quiz_id"], session["id"])
            logger.info(f"♻️  WS HOST ROOM RESTORED  pin={pin}  quiz_id={session['quiz_id']}")
        else:
            logger.warning(f"❌ WS HOST REJECTED  pin={pin}  reason=room_not_found_or_not_lobby")
            await websocket.accept()
            await websocket.close(code=4004)
            return

    logger.info(f"✅ WS HOST ACCEPTED  pin={pin}  quiz_id={room.quiz_id}  status={room.status}")
    await manager.connect_host(pin, websocket)
    await manager.rejoin_host(pin)

    # Load questions once and cache in RoomState — players will reuse them
    if not room.questions:
        logger.info(f"📚 Loading questions for quiz_id={room.quiz_id}")
        with get_db_engine().connect() as conn:
            room.questions = load_questions_for_quiz(conn, room.quiz_id)
        logger.info(f"📚 Loaded {len(room.questions)} question(s) for pin={pin}")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            action = msg.get("action")
            logger.info(f"📨 WS HOST MSG  pin={pin}  action={action}  room_status={room.status}")

            if action == "ping":
                await manager.send_host(pin, {"type": "pong"})

            elif action == "kick" and room.status == "lobby":
                nickname = msg.get("nickname", "")
                logger.info(f"🦵 KICK  pin={pin}  nickname={nickname}")
                await manager.kick_player(pin, nickname)

            elif action == "start_game" and room.status == "lobby":
                if not room.questions:
                    logger.warning(f"⚠️  START_GAME  pin={pin}  reason=no_questions")
                    await manager.send_host(pin, {"type": "error", "message": "Quiz has no questions"})
                    continue
                room.icon_set = msg.get("icon_set", "elements")
                logger.info(f"🎮 START_GAME  pin={pin}  questions={len(room.questions)}  players={len(room.registered_nicknames)}  icon_set={room.icon_set}")
                _update_status(pin, "active")
                room.current_question_index = 0
                await manager.start_question(pin, room.questions[0])

            elif action == "next_question" and room.status == "question":
                q = room.questions[room.current_question_index]
                correct_ids = {a["id"] for a in q["answers"] if a["is_correct"]}
                logger.info(f"🏁 END_QUESTION  pin={pin}  q_idx={room.current_question_index}  correct_ids={correct_ids}")
                await manager.show_results(pin, correct_ids)

            elif action == "show_leaderboard" and room.status == "result":
                logger.info(f"🏆 SHOW_LEADERBOARD  pin={pin}")
                await manager.show_leaderboard(pin)

            elif action == "next" and room.status == "leaderboard":
                room.current_question_index += 1
                logger.info(f"➡️  NEXT  pin={pin}  new_q_idx={room.current_question_index}  total={len(room.questions)}")
                if room.current_question_index >= len(room.questions):
                    logger.info(f"🎉 GAME_OVER  pin={pin}")
                    await manager.end_game(pin)
                    _update_status(pin, "finished")
                    _save_scores(pin)
                else:
                    await manager.start_question(pin, room.questions[room.current_question_index])

            else:
                logger.debug(f"⚠️  WS HOST MSG IGNORED  pin={pin}  action={action}  room_status={room.status}  (wrong state or unknown action)")

    except WebSocketDisconnect:
        logger.warning(f"🔌 WS HOST DISCONNECT  pin={pin}  room_status={room.status}")
        manager.disconnect_host(pin)
        if room.status not in ("lobby", "finished"):
            logger.info(f"💾 Saving scores on host disconnect  pin={pin}")
            _save_scores(pin)
            _update_status(pin, "finished")
            await manager.broadcast_players(pin, {"type": "host_disconnected"})


# ---------------------------------------------------------------------------
# PLAYER WebSocket  ws://.../ws/player/{pin}/{nickname}
# ---------------------------------------------------------------------------

@router.websocket("/ws/player/{pin}/{nickname}")
async def player_ws(websocket: WebSocket, pin: str, nickname: str):
    logger.info(f"🔌 WS PLAYER CONNECT  pin={pin}  nickname={nickname}  client={websocket.client}")

    room = manager.get_room(pin)
    if not room:
        # Room not in memory — backend may have restarted. Try to restore from DB.
        with get_db_engine().connect() as conn:
            session = get_session_by_pin(conn, pin)
        if session and session["status"] == "lobby":
            room = manager.create_room(pin, session["quiz_id"], session["id"])
            logger.info(f"♻️  WS PLAYER ROOM RESTORED  pin={pin}  quiz_id={session['quiz_id']}")
        else:
            logger.warning(f"❌ WS PLAYER REJECTED  pin={pin}  nickname={nickname}  reason=room_not_found_or_not_lobby")
            await websocket.accept()
            await websocket.close(code=4004)
            return

    if room.status != "lobby":
        # Allow registered players to reconnect mid-game (e.g. after phone sleep)
        if nickname not in room.registered_nicknames:
            logger.warning(f"❌ WS PLAYER REJECTED  pin={pin}  nickname={nickname}  reason=game_active_not_registered")
            await websocket.accept()
            await websocket.close(code=4003)
            return
        logger.info(f"♻️  WS PLAYER REJOIN  pin={pin}  nickname={nickname}  status={room.status}")
        await manager.connect_player(pin, nickname, websocket)
        await manager.rejoin_player(pin, nickname)
    else:
        if nickname not in room.registered_nicknames:
            logger.warning(f"❌ WS PLAYER REJECTED  pin={pin}  nickname={nickname}  reason=not_registered  registered={room.registered_nicknames}")
            await websocket.accept()
            await websocket.close(code=4003)
            return
        logger.info(f"✅ WS PLAYER ACCEPTED  pin={pin}  nickname={nickname}  registered_players={len(room.registered_nicknames)}")
        await manager.connect_player(pin, nickname, websocket)
        await manager.notify_lobby(pin)

    if not room.questions:
        logger.info(f"📚 Loading questions for quiz_id={room.quiz_id} (player fallback)")
        with get_db_engine().connect() as conn:
            room.questions = load_questions_for_quiz(conn, room.quiz_id)

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            action = msg.get("action")

            if action == "ping":
                ws = room.player_connections.get(nickname)
                if ws:
                    await manager._send(ws, {"type": "pong"})

            elif action == "submit_answer" and room.status == "question":
                q_idx = room.current_question_index
                answer_ids = msg.get("answer_ids", [])
                logger.info(f"📝 ANSWER  pin={pin}  nickname={nickname}  q_idx={q_idx}  answer_ids={answer_ids}")
                if q_idx >= len(room.questions):
                    continue
                q = room.questions[q_idx]
                correct_ids = {a["id"] for a in q["answers"] if a["is_correct"]}
                await manager.receive_answer(
                    pin, nickname, answer_ids, correct_ids, q["time_limit"]
                )

    except WebSocketDisconnect:
        logger.info(f"🔌 WS PLAYER DISCONNECT  pin={pin}  nickname={nickname}")
        manager.disconnect_player(pin, nickname)
        await manager.notify_lobby(pin)


# ---------------------------------------------------------------------------
# Sync DB helpers
# ---------------------------------------------------------------------------

def _update_status(pin: str, status: str):
    logger.info(f"💾 DB update session status  pin={pin}  status={status}")
    with get_db_engine().begin() as conn:
        update_session_status(conn, pin, status)


def _save_scores(pin: str):
    room = manager.get_room(pin)
    if not room:
        return
    logger.info(f"💾 DB persist scores  pin={pin}  scores={room.scores}")
    with get_db_engine().begin() as conn:
        session = get_session_by_pin(conn, pin)
        if session:
            persist_scores(conn, session["id"], room.scores)
