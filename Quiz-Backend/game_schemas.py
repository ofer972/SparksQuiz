from pydantic import BaseModel


class GameSessionCreate(BaseModel):
    quiz_id: int
