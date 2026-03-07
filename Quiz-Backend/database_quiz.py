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
    # 1. Insert quiz (one round-trip)
    quiz_row = conn.execute(
        text("INSERT INTO quizzes (title, description) VALUES (:title, :desc) RETURNING id"),
        {"title": title, "desc": description},
    ).fetchone()
    quiz_id = quiz_row.id

    if not questions:
        return quiz_id

    # 2. Bulk insert all questions (one round-trip), RETURNING id in order
    q_params = {"quiz_id": quiz_id}
    values_parts = []
    for idx, q_data in enumerate(questions):
        key = f"q_{idx}"
        q_params[f"{key}_text"] = q_data["question_text"]
        q_params[f"{key}_type"] = q_data.get("question_type", "single")
        q_params[f"{key}_limit"] = q_data.get("time_limit", 30)
        q_params[f"{key}_ord"] = idx
        values_parts.append(
            f"(:quiz_id, :{key}_text, :{key}_type, :{key}_limit, :{key}_ord)"
        )
    q_sql = text(
        "INSERT INTO questions (quiz_id, question_text, question_type, time_limit, order_index) "
        "VALUES " + ", ".join(values_parts) + " RETURNING id"
    )
    question_rows = conn.execute(q_sql, q_params).fetchall()
    question_ids = [r.id for r in question_rows]

    # 3. Bulk insert all answers (one round-trip)
    answer_rows_flat = []
    for q_idx, q_data in enumerate(questions):
        qid = question_ids[q_idx] if q_idx < len(question_ids) else None
        if qid is None:
            continue
        for a_data in q_data.get("answers", []):
            answer_rows_flat.append(
                (qid, a_data["answer_text"], a_data.get("is_correct", False))
            )

    if answer_rows_flat:
        a_params = {}
        a_parts = []
        for i, (qid, ans_text, is_correct) in enumerate(answer_rows_flat):
            a_params[f"qid_{i}"] = qid
            a_params[f"text_{i}"] = ans_text
            a_params[f"correct_{i}"] = is_correct
            a_parts.append(f"(:qid_{i}, :text_{i}, :correct_{i})")
        a_sql = text(
            "INSERT INTO answers (question_id, answer_text, is_correct) "
            "VALUES " + ", ".join(a_parts)
        )
        conn.execute(a_sql, a_params)

    return quiz_id


def update_quiz(conn: Connection, quiz_id: int, title: str, description: str | None, questions: list[dict]):
    conn.execute(
        text("UPDATE quizzes SET title = :title, description = :desc WHERE id = :id"),
        {"title": title, "desc": description, "id": quiz_id},
    )

    # ON DELETE CASCADE on answers handles answer cleanup automatically
    conn.execute(text("DELETE FROM questions WHERE quiz_id = :qid"), {"qid": quiz_id})

    if not questions:
        return

    # Bulk insert all questions (one round-trip)
    q_params = {"quiz_id": quiz_id}
    values_parts = []
    for idx, q_data in enumerate(questions):
        key = f"q_{idx}"
        q_params[f"{key}_text"] = q_data["question_text"]
        q_params[f"{key}_type"] = q_data.get("question_type", "single")
        q_params[f"{key}_limit"] = q_data.get("time_limit", 30)
        q_params[f"{key}_ord"] = idx
        values_parts.append(
            f"(:quiz_id, :{key}_text, :{key}_type, :{key}_limit, :{key}_ord)"
        )
    q_sql = text(
        "INSERT INTO questions (quiz_id, question_text, question_type, time_limit, order_index) "
        "VALUES " + ", ".join(values_parts) + " RETURNING id"
    )
    question_rows = conn.execute(q_sql, q_params).fetchall()
    question_ids = [r.id for r in question_rows]

    # Bulk insert all answers (one round-trip)
    answer_rows_flat = []
    for q_idx, q_data in enumerate(questions):
        qid = question_ids[q_idx] if q_idx < len(question_ids) else None
        if qid is None:
            continue
        for a_data in q_data.get("answers", []):
            answer_rows_flat.append(
                (qid, a_data["answer_text"], a_data.get("is_correct", False))
            )

    if answer_rows_flat:
        a_params = {}
        a_parts = []
        for i, (qid, ans_text, is_correct) in enumerate(answer_rows_flat):
            a_params[f"qid_{i}"] = qid
            a_params[f"text_{i}"] = ans_text
            a_params[f"correct_{i}"] = is_correct
            a_parts.append(f"(:qid_{i}, :text_{i}, :correct_{i})")
        a_sql = text(
            "INSERT INTO answers (question_id, answer_text, is_correct) "
            "VALUES " + ", ".join(a_parts)
        )
        conn.execute(a_sql, a_params)


def delete_quiz(conn: Connection, quiz_id: int):
    conn.execute(text("DELETE FROM quizzes WHERE id = :id"), {"id": quiz_id})
