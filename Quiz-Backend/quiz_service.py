from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.engine import Connection

from database_connection import get_db_connection
from database_quiz import (
    get_all_quizzes,
    get_quiz_by_id,
    create_quiz as db_create_quiz,
    update_quiz as db_update_quiz,
    delete_quiz as db_delete_quiz,
)
from quiz_schemas import QuizCreate, QuizUpdate

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.get("/")
def list_quizzes(conn: Connection = Depends(get_db_connection)):
    return get_all_quizzes(conn)


@router.post("/", status_code=201)
def create_quiz(payload: QuizCreate, conn: Connection = Depends(get_db_connection)):
    questions = [q.model_dump() for q in payload.questions]
    quiz_id = db_create_quiz(conn, payload.title, payload.description, questions)
    conn.commit()
    return get_quiz_by_id(conn, quiz_id)


@router.get("/{quiz_id}")
def get_quiz(quiz_id: int, conn: Connection = Depends(get_db_connection)):
    quiz = get_quiz_by_id(conn, quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    return quiz


@router.put("/{quiz_id}")
def update_quiz(quiz_id: int, payload: QuizUpdate, conn: Connection = Depends(get_db_connection)):
    if not get_quiz_by_id(conn, quiz_id):
        raise HTTPException(404, "Quiz not found")
    questions = [q.model_dump() for q in payload.questions]
    db_update_quiz(conn, quiz_id, payload.title, payload.description, questions)
    conn.commit()
    return get_quiz_by_id(conn, quiz_id)


@router.delete("/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: int, conn: Connection = Depends(get_db_connection)):
    if not get_quiz_by_id(conn, quiz_id):
        raise HTTPException(404, "Quiz not found")
    db_delete_quiz(conn, quiz_id)
    conn.commit()
