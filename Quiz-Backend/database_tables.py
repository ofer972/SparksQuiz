import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


def initialize_tables(engine):
    """Create all tables if they don't exist, and add any missing constraints."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS quizzes (
                id          SERIAL PRIMARY KEY,
                title       VARCHAR(255) NOT NULL,
                description TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS questions (
                id            SERIAL PRIMARY KEY,
                quiz_id       INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
                question_text TEXT NOT NULL,
                question_type VARCHAR(20) DEFAULT 'single',
                time_limit    INTEGER DEFAULT 20,
                order_index   INTEGER DEFAULT 0
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS answers (
                id          SERIAL PRIMARY KEY,
                question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
                answer_text TEXT NOT NULL,
                is_correct  BOOLEAN DEFAULT FALSE
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS game_sessions (
                id                     SERIAL PRIMARY KEY,
                pin                    VARCHAR(5) UNIQUE NOT NULL,
                quiz_id                INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
                status                 VARCHAR(20) DEFAULT 'lobby',
                current_question_index INTEGER DEFAULT 0,
                created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS players (
                id         SERIAL PRIMARY KEY,
                session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
                nickname   VARCHAR(50) NOT NULL,
                score      INTEGER DEFAULT 0,
                joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (session_id, nickname)
            )
        """))

        # Add UNIQUE constraint to existing players table if it was created without it
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'players_session_id_nickname_key'
                    AND table_name = 'players'
                ) THEN
                    ALTER TABLE players ADD CONSTRAINT players_session_id_nickname_key
                        UNIQUE (session_id, nickname);
                END IF;
            END $$;
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS hosts (
                id         SERIAL PRIMARY KEY,
                email      VARCHAR(255) UNIQUE NOT NULL,
                name       VARCHAR(255),
                is_active  BOOLEAN DEFAULT TRUE,
                is_admin   BOOLEAN DEFAULT FALSE,
                invited_at TIMESTAMP,
                last_login TIMESTAMP,
                invited_by VARCHAR(255)
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS magic_link_tokens (
                id         SERIAL PRIMARY KEY,
                host_id    INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
                token      VARCHAR(64) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used       BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

    logger.info("All tables verified/created")
