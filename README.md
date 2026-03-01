# SparksQuiz

A real-time Kahoot-style quiz app for up to 30 concurrent players.

## Project Structure

```
SparksQuiz/
├── Quiz-Backend/   FastAPI + PostgreSQL backend
└── Quiz-UI/        Next.js (App Router) + Tailwind frontend
```

## Quick Start

### 1. Backend

```bash
cd Quiz-Backend

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure your DB connection string
# Edit .env — set DATABASE_URL to your PostgreSQL instance
# Uses pg8000 (pure Python, no C extensions — works on Windows ARM64)
# Format: postgresql+pg8000://user:password@host:5432/Quiz
# The app will CREATE the Quiz database + all tables automatically on first run.

# Start the server
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd Quiz-UI

# Install dependencies (already done if you ran create-next-app)
npm install

# Configure the backend URL if not running locally
# Edit .env.local

# Start the dev server
npm run dev
```

The UI will be at `http://localhost:3000`

---

## URL Structure

| URL | Who | What |
|-----|-----|-------|
| `/` | Everyone | Landing page |
| `/host` | Host | Dashboard — manage quizzes |
| `/host/quiz/new` | Host | Create a new quiz |
| `/host/quiz/[id]` | Host | Edit an existing quiz |
| `/host/game/[pin]` | Host | Live game control panel |
| `/play` | Player | Enter PIN + nickname to join |
| `/play/[pin]` | Player | In-game controller |

> **No authentication** — the host dashboard is URL-based access.  
> Share `/play` (or `/play/[PIN]`) with players.

---

## Game Flow

1. Host opens `/host`, creates a quiz.
2. Host clicks **Start Game** → gets a 5-digit PIN → `/host/game/[PIN]`.
3. Players open `/play`, enter the PIN + a nickname.
4. Host sees the lobby in real-time; can kick players.
5. Host clicks **Start Game**.
6. Questions are sent to all players simultaneously.
   - **Single choice**: tapping an answer auto-submits.
   - **Multi-choice**: player selects answers, then taps **SUBMIT**.
7. Host clicks **End Question & Show Results** to reveal answers.
8. Host clicks **Show Leaderboard** → broadcasts top 5 to all players.
9. Host clicks **Next Question** → repeat.
10. After the last question → **Game Over** podium.

---

## Scoring

| Result | Points |
|--------|--------|
| Correct | 800 base + up to 200 speed bonus |
| Incorrect / Partial | 0 |

Speed bonus formula: `200 × (timeRemaining / totalTime)`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Python 3.11+, FastAPI, SQLAlchemy (async) |
| Database | PostgreSQL (auto-created tables on startup) |
| Real-time | WebSockets (native FastAPI) |
