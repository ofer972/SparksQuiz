from datetime import datetime
from pydantic import BaseModel


class AnswerIn(BaseModel):
    answer_text: str
    is_correct: bool = False


class QuestionIn(BaseModel):
    question_text: str
    question_type: str = "single"
    time_limit: int = 20
    answers: list[AnswerIn] = []


class QuizCreate(BaseModel):
    title: str
    description: str | None = None
    questions: list[QuestionIn] = []


class QuizUpdate(BaseModel):
    title: str
    description: str | None = None
    questions: list[QuestionIn] = []
