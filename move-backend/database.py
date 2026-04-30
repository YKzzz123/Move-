from __future__ import annotations

import os
from pathlib import Path
from typing import Generator, List

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable
from sqlalchemy.orm import Session, sessionmaker

# Load env vars from project root .env if present.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)

DEFAULT_DATABASE_URL = "mysql+pymysql://root:123456@localhost:3306/move_v2"
DATABASE_URL = os.getenv("MOVEV2_DATABASE_URL", DEFAULT_DATABASE_URL)

# Use SQLAlchemy's QueuePool for stable MySQL connection reuse.
engine: Engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yield a DB session and ensure close."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    """Create all tables declared in SQLAlchemy models."""
    from models import Base

    Base.metadata.create_all(bind=engine)


def ensure_user_auth_columns() -> None:
    """
    If `users` was created before username/password were added, ALTER TABLE
    to add missing columns. Safe to run repeatedly (idempotent for MySQL).
    """
    if "mysql" not in str(engine.url).lower():
        return
    with engine.begin() as conn:
        db_row = conn.execute(text("SELECT DATABASE()")).fetchone()
        dbname = db_row[0] if db_row else None
        if not dbname:
            return

        def has_column(column_name: str) -> bool:
            r = conn.execute(
                text(
                    """
                    SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = :db
                      AND TABLE_NAME = 'users'
                      AND COLUMN_NAME = :col
                    """
                ),
                {"db": dbname, "col": column_name},
            )
            return (r.scalar() or 0) > 0

        if not has_column("username"):
            conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL"))
        if not has_column("hashed_password"):
            conn.execute(
                text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255) NULL")
            )

        r_idx = conn.execute(
            text(
                """
                SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = :db
                  AND TABLE_NAME = 'users'
                  AND INDEX_NAME = 'uq_users_username'
                """
            ),
            {"db": dbname},
        )
        if (r_idx.scalar() or 0) == 0:
            try:
                conn.execute(
                    text("CREATE UNIQUE INDEX uq_users_username ON users (username)")
                )
            except Exception:
                pass


def generate_create_table_sql() -> List[str]:
    """Return MySQL CREATE TABLE statements from current ORM metadata."""
    from models import Base

    return [str(CreateTable(table).compile(dialect=engine.dialect)) for table in Base.metadata.sorted_tables]


if __name__ == "__main__":
    print("Generated DDL:")
    for ddl in generate_create_table_sql():
        print(f"{ddl};\n")
    create_tables()
    print("Database tables created successfully.")
