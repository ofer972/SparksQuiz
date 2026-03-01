import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from database_connection import get_connection_string, ensure_database_exists, get_db_engine
from database_tables import initialize_tables
from database_seed import seed_default_data
from quiz_service import router as quiz_router
from game_service import router as game_router
from websockets_service import router as ws_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── ANSI colors (same style as SparksAI-backend) ─────────────────────────────

class Colors:
    RESET  = '\033[0m'
    BOLD   = '\033[1m'
    GET    = '\033[92m'   # Bright Green
    POST   = '\033[96m'   # Cyan
    PUT    = '\033[93m'   # Yellow
    DELETE = '\033[95m'   # Magenta
    WS     = '\033[94m'   # Blue  (WebSocket)
    GRAY   = '\033[90m'   # Gray
    STATUS_OK    = '\033[92m'   # Green  (2xx)
    STATUS_WARN  = '\033[93m'   # Yellow (4xx)
    STATUS_ERROR = '\033[91m'   # Red    (5xx)

METHOD_EMOJI = {'GET': '📥', 'POST': '📤', 'PUT': '✏️', 'DELETE': '🗑️'}


def _method_color(method: str) -> tuple[str, str]:
    m = method.upper()
    color = getattr(Colors, m, Colors.GRAY)
    emoji = METHOD_EMOJI.get(m, '📡')
    return color, emoji


def _status_style(code: int, method_color: str) -> tuple[str, str]:
    """Returns (line_color, status_color)."""
    if 200 <= code < 300:
        return method_color, Colors.STATUS_OK
    if 400 <= code < 500:
        return Colors.STATUS_WARN, Colors.STATUS_WARN
    if code >= 500:
        return Colors.STATUS_ERROR, Colors.STATUS_ERROR
    return method_color, Colors.GRAY


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting SparksQuiz API...")
    connection_string = get_connection_string()
    ensure_database_exists(connection_string)
    engine = get_db_engine()
    initialize_tables(engine)
    seed_default_data(engine)
    logger.info("✅ SparksQuiz API ready")
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="SparksQuiz API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response timing middleware (mirrors SparksAI-backend) ───────────

@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.time()
    path = request.url.path

    # Skip noisy health checks from logs
    if path == "/health":
        return await call_next(request)

    color, emoji = _method_color(request.method)

    # Log query params on GET requests
    qs = ""
    if request.method == "GET" and request.query_params:
        qs = f" | params: {dict(request.query_params)}"

    logger.info(f"{color}{emoji}  {request.method} {path}{qs} — START{Colors.RESET}")

    response = await call_next(request)

    duration = time.time() - start
    code = response.status_code
    line_color, status_color = _status_style(code, color)
    bold = Colors.BOLD if code >= 400 else ""

    logger.info(
        f"{line_color}{bold}{emoji}  {request.method} {path} — "
        f"{status_color}{bold}{code}{Colors.RESET}{line_color}{bold} "
        f"({duration:.3f}s){Colors.RESET}"
    )
    return response


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(quiz_router)
app.include_router(game_router)
app.include_router(ws_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.getenv("PORT", 8011))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
