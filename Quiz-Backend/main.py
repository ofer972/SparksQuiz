import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from database_connection import get_connection_string, ensure_database_exists, get_db_engine
from database_tables import initialize_tables
from database_seed import seed_default_data, seed_default_host
from quiz_service import router as quiz_router
from game_service import router as game_router
from websockets_service import router as ws_router
from auth_service import router as auth_router, admin_router

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

    # ── Environment variable dump (safe — secrets are masked) ─────────────────
    def _mask(val: str) -> str:
        """Show first 4 chars then asterisks for secrets."""
        return val[:4] + "****" if len(val) > 4 else "****"

    db_url   = os.getenv("DATABASE_URL", "")
    env_vars = {
        "DATABASE_URL":        _mask(db_url) if db_url else "(not set)",
        "DB_NAME":             os.getenv("DB_NAME",             "(not set)"),
        "FRONTEND_URL":        os.getenv("FRONTEND_URL",        "(not set)"),
        "APP_URL":             os.getenv("APP_URL",             "(not set)"),
        "DEFAULT_HOST_EMAIL":  os.getenv("DEFAULT_HOST_EMAIL",  "(not set)"),
        "RESEND_API_KEY":      _mask(os.getenv("RESEND_API_KEY", "")) if os.getenv("RESEND_API_KEY") else "(not set)",
        "JWT_SECRET":          _mask(os.getenv("JWT_SECRET",    "")) if os.getenv("JWT_SECRET") else "(not set)",
        "PORT":                os.getenv("PORT",                "(not set)"),
    }
    logger.info("📋 Environment variables:")
    for key, val in env_vars.items():
        logger.info(f"   {key:<22} = {val}")
    logger.info(f"🔒 CORS allow_origins    = {[FRONTEND_URL]}")
    connection_string = get_connection_string()
    ensure_database_exists(connection_string)
    engine = get_db_engine()
    initialize_tables(engine)
    seed_default_data(engine)
    seed_default_host(engine)
    logger.info("✅ SparksQuiz API ready")
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="SparksQuiz API", lifespan=lifespan)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],   # must be exact origin (not "*") for cookies to work
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

    origin = request.headers.get("origin", "")
    if request.method == "OPTIONS":
        logger.info(f"{color}{emoji}  {request.method} {path} | Origin: '{origin}' — START{Colors.RESET}")
    else:
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

app.include_router(auth_router)
app.include_router(admin_router)
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
