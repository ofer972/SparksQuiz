import logging
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

load_dotenv()

logger = logging.getLogger(__name__)

_cached_engine = None


def get_connection_string() -> str:
    base = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/Quiz")
    db_name = os.getenv("DB_NAME", "")
    if db_name:
        # Replace the database name portion of the URL with DB_NAME
        base = base.rsplit("/", 1)[0] + "/" + db_name
    return base


def ensure_database_exists(connection_string: str):
    """Connect to the 'postgres' system DB and create the target DB if it doesn't exist."""
    base_url = connection_string.rsplit("/", 1)[0] + "/postgres"
    db_name = connection_string.rsplit("/", 1)[1]

    bootstrap_engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
    try:
        with bootstrap_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).fetchone()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                logger.info(f"Created database '{db_name}'")
            else:
                logger.info(f"Database '{db_name}' already exists")
    finally:
        bootstrap_engine.dispose()


def get_db_engine():
    global _cached_engine
    if _cached_engine is None:
        connection_string = get_connection_string()
        _cached_engine = create_engine(
            connection_string,
            pool_size=10,
            pool_pre_ping=True,
            pool_recycle=300,
            pool_timeout=30,
            max_overflow=5,
            echo=False,
        )
        logger.info("Database engine created")
    return _cached_engine


def get_db_connection():
    """FastAPI dependency — yields one connection per request from the pool."""
    conn = None
    try:
        conn = get_db_engine().connect()
        yield conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise
    finally:
        if conn:
            conn.close()
