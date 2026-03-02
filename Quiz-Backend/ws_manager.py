import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from fastapi import WebSocket
from scoring import calculate_score

logger = logging.getLogger(__name__)


@dataclass
class RoomState:
    """In-memory state for one active game session."""
    pin: str
    quiz_id: int
    session_id: int
    host_ws: WebSocket | None = None
    # nickname -> WebSocket (populated on WS connect)
    player_connections: dict[str, WebSocket] = field(default_factory=dict)
    # registered via HTTP join — source of truth for uniqueness
    registered_nicknames: set[str] = field(default_factory=set)
    # scores tracked in memory, flushed to DB at game end
    scores: dict[str, int] = field(default_factory=dict)
    # questions loaded when host connects, shared with all players
    questions: list[dict] = field(default_factory=list)
    status: str = "lobby"
    current_question_index: int = 0
    question_start_time: float = 0.0
    current_question_time_limit: int = 20
    # nickname -> set of answer_ids — cleared each question
    current_answers: dict[str, set[int]] = field(default_factory=dict)
    # snapshotted at question start so disconnect doesn't change denominator
    total_players_at_question_start: int = 0


class ConnectionManager:
    def __init__(self):
        self._rooms: dict[str, RoomState] = {}

    # ------------------------------------------------------------------
    # Room lifecycle
    # ------------------------------------------------------------------

    def create_room(self, pin: str, quiz_id: int, session_id: int) -> RoomState:
        room = RoomState(pin=pin, quiz_id=quiz_id, session_id=session_id)
        self._rooms[pin] = room
        return room

    def get_room(self, pin: str) -> RoomState | None:
        return self._rooms.get(pin)

    def remove_room(self, pin: str):
        self._rooms.pop(pin, None)

    def active_pins(self) -> set[str]:
        return set(self._rooms.keys())

    # ------------------------------------------------------------------
    # Connection helpers
    # ------------------------------------------------------------------

    async def connect_host(self, pin: str, ws: WebSocket):
        await ws.accept()
        room = self._rooms.get(pin)
        if room:
            room.host_ws = ws

    async def connect_player(self, pin: str, nickname: str, ws: WebSocket):
        await ws.accept()
        room = self._rooms.get(pin)
        if room:
            room.player_connections[nickname] = ws
            if nickname not in room.scores:
                room.scores[nickname] = 0

    def disconnect_player(self, pin: str, nickname: str):
        room = self._rooms.get(pin)
        if room:
            room.player_connections.pop(nickname, None)

    def disconnect_host(self, pin: str):
        room = self._rooms.get(pin)
        if room:
            room.host_ws = None

    # ------------------------------------------------------------------
    # Send helpers
    # ------------------------------------------------------------------

    async def _send(self, ws: WebSocket, data: dict):
        try:
            await ws.send_text(json.dumps(data))
        except Exception as e:
            logger.debug(f"WebSocket send failed: {e}")

    async def broadcast_players(self, pin: str, data: dict):
        room = self._rooms.get(pin)
        if not room:
            return
        await asyncio.gather(*[self._send(ws, data) for ws in room.player_connections.values()])

    async def send_host(self, pin: str, data: dict):
        room = self._rooms.get(pin)
        if room and room.host_ws:
            await self._send(room.host_ws, data)

    async def broadcast_all(self, pin: str, data: dict):
        await self.broadcast_players(pin, data)
        await self.send_host(pin, data)

    # ------------------------------------------------------------------
    # Lobby
    # ------------------------------------------------------------------

    async def notify_lobby(self, pin: str):
        room = self._rooms.get(pin)
        if not room:
            return
        nicknames = list(room.player_connections.keys())
        await self.broadcast_all(pin, {"type": "lobby_update", "players": nicknames})

    async def kick_player(self, pin: str, nickname: str):
        room = self._rooms.get(pin)
        if not room:
            return
        ws = room.player_connections.get(nickname)
        if ws:
            await self._send(ws, {"type": "kicked"})
            await ws.close()
        self.disconnect_player(pin, nickname)
        room.scores.pop(nickname, None)
        room.registered_nicknames.discard(nickname)
        await self.notify_lobby(pin)

    # ------------------------------------------------------------------
    # Game flow
    # ------------------------------------------------------------------

    async def start_question(self, pin: str, question: dict):
        room = self._rooms.get(pin)
        if not room:
            return
        room.status = "question"
        room.current_answers = {}
        room.question_start_time = time.time()
        room.current_question_time_limit = question["time_limit"]
        # snapshot so player disconnects don't change the denominator
        room.total_players_at_question_start = len(room.player_connections)

        player_payload = {
            "type": "question_start",
            "question_index": room.current_question_index,
            "total_questions": len(room.questions),
            "question_text": question["question_text"],
            "question_type": question["question_type"],
            "time_limit": question["time_limit"],
            "answers": [{"id": a["id"], "text": a["answer_text"]} for a in question["answers"]],
            "timestamp": room.question_start_time,
        }
        host_payload = {**player_payload, "answers": question["answers"]}
        await self.broadcast_players(pin, player_payload)
        await self.send_host(pin, host_payload)

    async def receive_answer(
        self,
        pin: str,
        nickname: str,
        answer_ids: list[int],
        correct_answer_ids: set[int],
        time_limit: int,
    ) -> int:
        room = self._rooms.get(pin)
        if not room or room.status != "question":
            return 0
        if nickname in room.current_answers:
            return 0  # already answered this question

        room.current_answers[nickname] = set(answer_ids)
        time_elapsed = time.time() - room.question_start_time
        time_remaining = max(0.0, time_limit - time_elapsed)

        is_correct = set(answer_ids) == correct_answer_ids
        points = calculate_score(is_correct, time_remaining, time_limit)
        room.scores[nickname] = room.scores.get(nickname, 0) + points

        ws = room.player_connections.get(nickname)
        if ws:
            await self._send(ws, {"type": "answer_ack", "correct": is_correct, "points": points})

        await self.send_host(pin, {
            "type": "answer_progress",
            "answered": len(room.current_answers),
            "total": room.total_players_at_question_start,
        })

        # Auto-advance: all players answered — no need to wait for the timer
        if (room.total_players_at_question_start > 0
                and len(room.current_answers) >= room.total_players_at_question_start):
            q = room.questions[room.current_question_index]
            correct_ids = {a["id"] for a in q["answers"] if a["is_correct"]}
            await self.show_results(pin, correct_ids)

        return points

    async def show_results(self, pin: str, correct_answer_ids: set[int]):
        room = self._rooms.get(pin)
        if not room or room.status != "question":
            return  # guard against double-call (e.g. auto-advance + host button)
        room.status = "result"
        await self.broadcast_all(pin, {
            "type": "show_results",
            "correct_answer_ids": list(correct_answer_ids),
            "leaderboard": self._get_leaderboard(room)[:5],
        })

    async def show_leaderboard(self, pin: str):
        room = self._rooms.get(pin)
        if not room:
            return
        room.status = "leaderboard"
        await self.broadcast_all(pin, {"type": "leaderboard", "leaderboard": self._get_leaderboard(room)[:5]})

    async def rejoin_host(self, pin: str):
        """Send the current game state to a host reconnecting mid-game."""
        room = self._rooms.get(pin)
        if not room:
            return

        if room.status == "lobby":
            await self.notify_lobby(pin)
            return

        if room.status == "question":
            q = room.questions[room.current_question_index]
            elapsed = time.time() - room.question_start_time
            await self.send_host(pin, {
                "type": "question_start",
                "question_index": room.current_question_index,
                "total_questions": len(room.questions),
                "question_text": q["question_text"],
                "question_type": q["question_type"],
                "time_limit": room.current_question_time_limit,
                "time_elapsed": round(elapsed, 2),
                "answers": q["answers"],
                "timestamp": room.question_start_time,
            })
            await self.send_host(pin, {
                "type": "answer_progress",
                "answered": len(room.current_answers),
                "total": room.total_players_at_question_start,
            })

        elif room.status == "result":
            q = room.questions[room.current_question_index]
            correct_ids = [a["id"] for a in q["answers"] if a["is_correct"]]
            await self.send_host(pin, {
                "type": "show_results",
                "correct_answer_ids": correct_ids,
                "leaderboard": self._get_leaderboard(room)[:5],
            })

        elif room.status == "leaderboard":
            await self.send_host(pin, {
                "type": "leaderboard",
                "leaderboard": self._get_leaderboard(room),
            })

        elif room.status == "finished":
            await self.send_host(pin, {
                "type": "game_over",
                "leaderboard": self._get_leaderboard(room),
            })

    async def rejoin_player(self, pin: str, nickname: str):
        """Send the current game state to a player reconnecting mid-game."""
        room = self._rooms.get(pin)
        if not room:
            return
        ws = room.player_connections.get(nickname)
        if not ws:
            return

        if room.status == "question":
            q = room.questions[room.current_question_index]
            elapsed = time.time() - room.question_start_time

            if nickname in room.current_answers:
                # Already answered — put them back in the waiting screen
                correct_ids = {a["id"] for a in q["answers"] if a["is_correct"]}
                is_correct = room.current_answers[nickname] == correct_ids
                await self._send(ws, {"type": "answer_ack", "correct": is_correct, "points": 0})
            else:
                # Not yet answered — let them answer with the remaining time
                await self._send(ws, {
                    "type": "question_start",
                    "question_index": room.current_question_index,
                    "total_questions": len(room.questions),
                    "question_text": q["question_text"],
                    "question_type": q["question_type"],
                    "time_limit": room.current_question_time_limit,
                    "time_elapsed": round(elapsed, 2),
                    "answers": [{"id": a["id"], "text": a["answer_text"]} for a in q["answers"]],
                    "timestamp": room.question_start_time,
                })

        elif room.status == "result":
            q = room.questions[room.current_question_index]
            correct_ids = [a["id"] for a in q["answers"] if a["is_correct"]]
            await self._send(ws, {
                "type": "show_results",
                "correct_answer_ids": correct_ids,
                "leaderboard": self._get_leaderboard(room)[:5],
            })

        elif room.status == "leaderboard":
            await self._send(ws, {
                "type": "leaderboard",
                "leaderboard": self._get_leaderboard(room),
            })

        elif room.status == "finished":
            await self._send(ws, {
                "type": "game_over",
                "leaderboard": self._get_leaderboard(room),
            })

    async def end_game(self, pin: str):
        room = self._rooms.get(pin)
        if not room:
            return
        room.status = "finished"
        await self.broadcast_all(pin, {"type": "game_over", "leaderboard": self._get_leaderboard(room)})

    def _get_leaderboard(self, room: RoomState) -> list[dict]:
        sorted_scores = sorted(room.scores.items(), key=lambda x: x[1], reverse=True)
        return [
            {"rank": i + 1, "nickname": nick, "score": score}
            for i, (nick, score) in enumerate(sorted_scores)
        ]


manager = ConnectionManager()
