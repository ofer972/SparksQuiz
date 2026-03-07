"""
Raw SQL helpers for quiz CRUD.
All functions accept a SQLAlchemy Connection and return plain dicts.
Callers are responsible for conn.commit() after writes.
"""
from sqlalchemy import text
from sqlalchemy.engine import Connection


def get_all_quizzes(conn: Connection) -> list[dict]:
    result = conn.execute(text("""
        SELECT q.id, q.title, q.description, q.created_at,
               COUNT(qu.id) AS question_count
        FROM quizzes q
        LEFT JOIN questions qu ON qu.quiz_id = q.id
        GROUP BY q.id
        ORDER BY q.created_at DESC
    """))
    return [dict(row._mapping) for row in result.fetchall()]


def get_quiz_by_id(conn: Connection, quiz_id: int) -> dict | None:
    quiz_row = conn.execute(
        text("SELECT id, title, description, created_at FROM quizzes WHERE id = :id"),
        {"id": quiz_id},
    ).fetchone()
    if not quiz_row:
        return None

    quiz = dict(quiz_row._mapping)

    questions_result = conn.execute(
        text("""
            SELECT id, quiz_id, question_text, question_type, time_limit, order_index
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
            text("SELECT id, question_id, answer_text, is_correct FROM answers WHERE question_id = :qid"),
            {"qid": q["id"]},
        )
        q["answers"] = [dict(a._mapping) for a in answers_result.fetchall()]
        questions.append(q)

    quiz["questions"] = questions
    return quiz


def create_quiz(conn: Connection, title: str, description: str | None, questions: list[dict]) -> int:
    quiz_row = conn.execute(
        text("INSERT INTO quizzes (title, description) VALUES (:title, :desc) RETURNING id"),
        {"title": title, "desc": description},
    ).fetchone()
    quiz_id = quiz_row.id

    for idx, q_data in enumerate(questions):
        q_row = conn.execute(
            text("""
                INSERT INTO questions (quiz_id, question_text, question_type, time_limit, order_index)
                VALUES (:quiz_id, :question_text, :question_type, :time_limit, :order_index)
                RETURNING id
            """),
            {
                "quiz_id": quiz_id,
                "question_text": q_data["question_text"],
                "question_type": q_data.get("question_type", "single"),
                "time_limit": q_data.get("time_limit", 30),
                "order_index": idx,
            },
        ).fetchone()
        question_id = q_row.id

        for a_data in q_data.get("answers", []):
            conn.execute(
                text("""
                    INSERT INTO answers (question_id, answer_text, is_correct)
                    VALUES (:qid, :text, :correct)
                """),
                {"qid": question_id, "text": a_data["answer_text"], "correct": a_data.get("is_correct", False)},
            )

    return quiz_id


def update_quiz(conn: Connection, quiz_id: int, title: str, description: str | None, questions: list[dict]):
    conn.execute(
        text("UPDATE quizzes SET title = :title, description = :desc WHERE id = :id"),
        {"title": title, "desc": description, "id": quiz_id},
    )

    # ON DELETE CASCADE on answers handles answer cleanup automatically
    conn.execute(text("DELETE FROM questions WHERE quiz_id = :qid"), {"qid": quiz_id})

    for idx, q_data in enumerate(questions):
        q_row = conn.execute(
            text("""
                INSERT INTO questions (quiz_id, question_text, question_type, time_limit, order_index)
                VALUES (:quiz_id, :question_text, :question_type, :time_limit, :order_index)
                RETURNING id
            """),
            {
                "quiz_id": quiz_id,
                "question_text": q_data["question_text"],
                "question_type": q_data.get("question_type", "single"),
                "time_limit": q_data.get("time_limit", 30),
                "order_index": idx,
            },
        ).fetchone()
        question_id = q_row.id

        for a_data in q_data.get("answers", []):
            conn.execute(
                text("""
                    INSERT INTO answers (question_id, answer_text, is_correct)
                    VALUES (:qid, :text, :correct)
                """),
                {"qid": question_id, "text": a_data["answer_text"], "correct": a_data.get("is_correct", False)},
            )


def delete_quiz(conn: Connection, quiz_id: int):
    conn.execute(text("DELETE FROM quizzes WHERE id = :id"), {"id": quiz_id})
