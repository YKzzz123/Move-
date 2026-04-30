"""一次性脚本：确保数据库里有一个可用的测试用户，便于接口联调。"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import SessionLocal, create_tables
from models import User


def seed() -> None:
    create_tables()
    db = SessionLocal()
    try:
        existing = db.query(User).first()
        if existing is not None:
            print(f"[seed] User already exists: id={existing.id}, qi_score={existing.qi_score}")
            return
        user = User(
            birthday=date(2000, 4, 1),
            zodiac_cat_type="Aries",
            qi_score=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"[seed] Created test user: id={user.id}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
