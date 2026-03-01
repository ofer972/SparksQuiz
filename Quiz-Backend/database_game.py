"""
Raw SQL helpers for game session management.
All functions accept a SQLAlchemy Connection and return plain dicts.
"""
from sqlalchemy import text
from sqlalchemy.engine import Connection


def get_active_pins(conn: Connection) -> set[str]:
    result = conn.execute(
        text("SELECT pin FROM game_sessions WHERE status != 'finished'")
    )
    return {row[0] for row in result.fetchall()}


def create_game_session(conn: Connection, quiz_id: int, pin: str) -> dict:
    row = conn.execute(
        text("""
            INSERT INTO game_sessions (pin, quiz_id, status)
            VALUES (:pin, :quiz_id, 'lobby')
            RETURNING id, pin, quiz_id, status, current_question_index
        """),
        {"pin": pin, "quiz_id": quiz_id},
    ).fetchone()
    return dict(row._mapping)


def get_session_by_pin(conn: Connection, pin: str) -> dict | None:
    row = conn.execute(
        text("SELECT id, pin, quiz_id, status, current_question_index FROM game_sessions WHERE pin = :pin"),
        {"pin": pin},
    ).fetchone()
    return dict(row._mapping) if row else None


def create_player(conn: Connection, session_id: int, nickname: str) -> int:
    row = conn.execute(
        text("INSERT INTO players (session_id, nickname) VALUES (:sid, :nick) RETURNING id"),
        {"sid": session_id, "nick": nickname},
    ).fetchone()
    return row.id


def update_session_status(conn: Connection, pin: str, status: str):
    conn.execute(
        text("UPDATE game_sessions SET status = :status WHERE pin = :pin"),
        {"status": status, "pin": pin},
    )


def persist_scores(conn: Connection, session_id: int, scores: dict[str, int]):
    for nickname, score in scores.items():
        conn.execute(
            text("UPDATE players SET score = :score WHERE session_id = :sid AND nickname = :nick"),
            {"score": score, "sid": session_id, "nick": nickname},
        )


def load_questions_for_quiz(conn: Connection, quiz_id: int) -> list[dict]:
    questions_result = conn.execute(
        text("""
            SELECT id, question_text, question_type, time_limit, order_index
            FROM questions
            WHERE quiz_id = :quiz_id
            ORDER BY order_index
        """),
        {"quiz_id": quiz_id},
    )
    questions = []
    for q_row in questions_result.fetchall():
        q = dict(q_row._mapping)
        answers_result = conn.execute(
            text("SELECT id, answer_text, is_correct FROM answers WHERE question_id = :qid"),
            {"qid": q["id"]},
        )
        q["answers"] = [dict(a._mapping) for a in answers_result.fetchall()]
        questions.append(q)
    return questions
