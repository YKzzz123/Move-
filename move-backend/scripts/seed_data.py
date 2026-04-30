"""
向 energy_station 表播种 10 条古典疗愈文案；可重复执行，已存在 system_seed 数据时跳过。
独立运行：python scripts/seed_data.py（工作目录为 move-backend）
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import SessionLocal, create_tables, ensure_user_auth_columns
from models import EnergyStation

SOURCE_TAG = "system_seed"

SEED_QUOTES = [
    "不疾而速，不行而至。调息以养气，动静皆是修行。",
    "神安则气定，气定则血和。久坐之后，一寸松肩即一寸春。",
    "目为神之舍，敛光于内，胜却万千浮语。",
    "手阳明大肠经，合谷若开，清气自升；勿急勿猛，如引线之柔。",
    "大椎若松，天际自远；项背舒缓，则百脉俱柔。",
    "卧虎藏龙在脊，不与人争，乃与己和。气到处，便是归处。",
    "阴平阳秘，精神乃治。一呼一吸间，可听体内涓涓。",
    "上工治未病。微动非争，乃提醒身心：我还在此。",
    "虚邪贼风，避之有时；心平气和，自无内外之争。",
    "读书如饮茶，三咽方知其味；养生如种竹，成林在岁寒之后。",
]


def seed_energy_station() -> None:
    create_tables()
    ensure_user_auth_columns()
    db = SessionLocal()
    try:
        n = db.query(EnergyStation).filter(EnergyStation.source_tag == SOURCE_TAG).count()
        if n >= 10:
            print(f"[seed] EnergyStation 已有 {n} 条 {SOURCE_TAG!r} 记录，跳过。")
            return
        to_add = 10 - n
        for j in range(to_add):
            text = SEED_QUOTES[n + j]
            item = EnergyStation(quote_text=text, is_favorited=False, source_tag=SOURCE_TAG)
            db.add(item)
        db.commit()
        total = db.query(EnergyStation).filter(EnergyStation.source_tag == SOURCE_TAG).count()
        print(f"[seed] 已提交 {to_add} 条 EnergyStation，当前 {SOURCE_TAG!r} 共 {total} 条。")
    except Exception as e:  # noqa: BLE001
        db.rollback()
        print(f"[seed] 失败: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_energy_station()
