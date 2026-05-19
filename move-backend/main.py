from __future__ import annotations

import calendar
import logging
import os
import json
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from auth.utils import hash_password, verify_password
from auth.zodiac import zodiac_sign_from_birthday
from database import (
    SessionLocal,
    create_tables,
    ensure_diary_ai_summary_column,
    ensure_user_auth_columns,
    get_db,
)
from models import Diary, EnergyStation, MicroWorkoutRun, SessionRecord, User
from schemas import DiaryCreate, DiaryResponse, DiaryUpdateRequest, LoginRequest, RegisterResponse, UserRegister
from services.energy_station_echo import router as energy_station_router
from services.gemini_service import (
    generate_diary_emotion_cover_sync,
    generate_healing_quote,
    generate_zen_report,
    generate_text_sync,
    is_doubao_configured,
)

log = logging.getLogger(__name__)


def _refresh_diary_ai_cover_after_edit(diary_id: int, content_snapshot: str) -> None:
    """
    PATCH 正文后异步生成「情绪封面」并写库。豆包耗时长，若同步执行会拖慢保存按钮。
    若用户在此之后又改过一次正文，则以最新正文为准，本次结果丢弃（避免盖掉新内容摘要）。
    """
    stripped = (content_snapshot or "").strip()
    if not stripped:
        return
    cover = generate_diary_emotion_cover_sync(stripped)
    db = SessionLocal()
    try:
        row = db.get(Diary, diary_id)
        if row is None:
            return
        if (row.content or "").strip() != stripped:
            return
        row.ai_summary = cover
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        log.exception("Diary cover persist failed after edit, diary_id=%s", diary_id)
    finally:
        db.close()


class QiUpdateRequest(BaseModel):
    qi_delta: int = Field(..., ge=-1000, le=1000, description="Change amount of qi_score")


class QiUpdateResponse(BaseModel):
    user_id: int
    qi_score: int
    message: str


class WorkoutCompleteRequest(BaseModel):
    user_id: int = Field(..., gt=0)
    action_type: str = Field(..., min_length=1, max_length=64)
    context: Optional[str] = Field(default="", max_length=500)


class WorkoutCompleteResponse(BaseModel):
    message: str
    healing_quote: str
    energy_station_id: int


class RecentMovementsResponse(BaseModel):
    """近 N 天完成过的微运动 id，供前端加权随机降权；暂无持久化时返回空。"""

    movement_ids: List[str] = Field(default_factory=list)


class WorkoutCalendarDatesResponse(BaseModel):
    """某自然月内至少完成过一次微运动收纳的日期（YYYY-MM-DD）。"""

    dates: List[str] = Field(default_factory=list)


class MicroWorkoutFinishRequest(BaseModel):
    total_qi: int = Field(..., ge=0, le=100_000)
    total_calories: int = Field(..., ge=0, le=1_000_000)
    plan_mode: str = Field(default="custom", max_length=32)
    items: List[Dict[str, Any]] = Field(default_factory=list)


class MicroWorkoutFinishResponse(BaseModel):
    run_id: int
    user_id: int
    qi_score: int
    message: str


class EnergyGenerateRequest(BaseModel):
    user_id: int = Field(..., gt=0)
    performance: str = Field(
        default="完成了一次微运动",
        min_length=1,
        max_length=200,
        description="用户运动表现描述，例如 '完成了眼部微运动'",
    )


class EnergyGenerateResponse(BaseModel):
    energy_station_id: int
    quote_text: str
    is_default: bool
    message: str


class ZenSummaryResponse(BaseModel):
    period: str
    report_content: str


class ZenBoardStatBlock(BaseModel):
    focus_hours: float = 0.0
    movement_count: int = 0
    preferred_movement: str = "暂无记录"


class ZenBoardHeatCell(BaseModel):
    day: str
    level: int = Field(ge=0, le=4, description="0–4 活跃度档位")


class ZenBoardTimelineItem(BaseModel):
    occurred_at: datetime
    time_label: str
    text: str


class ZenBoardResponse(BaseModel):
    """数字禅意看板：三档统计、近 30 日气脉、近 3 个自然日历史回音。"""

    daily: ZenBoardStatBlock
    rhythm: ZenBoardStatBlock
    yearly: ZenBoardStatBlock
    heatmap_30d: List[ZenBoardHeatCell] = Field(default_factory=list)
    timeline_recent: List[ZenBoardTimelineItem] = Field(default_factory=list)


class UserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    birthday: date
    zodiac_cat_type: str
    qi_score: int
    created_at: datetime
    updated_at: datetime


app = FastAPI(title="Move! V2 Backend API")
app.include_router(energy_station_router)

# 开发时 Vite 可能落在 5173、5174… 任意端口，用正则避免每次改白名单
_DEV_ORIGIN_REGEX = r"http://(127\.0\.0\.1|localhost):\d+"
# 生产环境：放行 Cloudflare Pages 二级域名（含预览分支域名）和自定义追加域名
_PAGES_ORIGIN_REGEX = r"https://([a-zA-Z0-9-]+\.)?move-2h6\.pages\.dev"
_CORS_ORIGINS_ENV = "CORS_ALLOW_ORIGINS"
_DEFAULT_PROD_ORIGINS = [
    "https://3cdc9956.move-2h6.pages.dev",
]


def _parse_cors_origins() -> List[str]:
    """
    Parse CSV origins from env, e.g.:
    CORS_ALLOW_ORIGINS=https://foo.pages.dev,https://app.example.com
    """
    raw = os.getenv(_CORS_ORIGINS_ENV, "")
    env_origins = [item.strip() for item in raw.split(",") if item.strip()]
    # Keep one safe default origin for production, and allow env overrides/additions.
    return sorted(set(_DEFAULT_PROD_ORIGINS + env_origins))


_cors_origins = _parse_cors_origins()
_combined_origin_regex = f"{_DEV_ORIGIN_REGEX}|{_PAGES_ORIGIN_REGEX}"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_combined_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_MICRO_MOVEMENT_JSON = Path(__file__).resolve().parent / "config" / "micro_movements.json"
_movement_label_map: Optional[Dict[str, str]] = None
_ZEN_ALLOWED_PERIODS = frozenset({"daily", "weekly", "monthly", "yearly"})


def _load_movement_id_labels() -> Dict[str, str]:
    global _movement_label_map
    if _movement_label_map is not None:
        return _movement_label_map
    _movement_label_map = {}
    try:
        with _MICRO_MOVEMENT_JSON.open(encoding="utf-8") as f:
            payload = json.load(f)
        for rule in payload.get("rules") or []:
            rid = rule.get("id")
            name = rule.get("name")
            if rid and name:
                _movement_label_map[str(rid)] = str(name)
    except (OSError, json.JSONDecodeError, TypeError) as exc:
        log.warning("movement labels load skipped: %s", exc)
    return _movement_label_map


def _zen_period_window_start(period: str) -> datetime:
    now = datetime.now().astimezone()
    days = {"daily": 1, "weekly": 7, "monthly": 30, "yearly": 365}[period]
    return now - timedelta(days=days)


def _local_calendar_date(dt: datetime, tz) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz).date()


def _aggregate_zen_board_stats(db: Session, user_id: int, window_start: datetime) -> ZenBoardStatBlock:
    session_rows = (
        db.query(SessionRecord)
        .filter(SessionRecord.user_id == user_id, SessionRecord.start_time >= window_start)
        .all()
    )
    focus_seconds = 0.0
    for rec in session_rows:
        try:
            delta_sec = (rec.end_time - rec.start_time).total_seconds()
            if delta_sec > 0:
                focus_seconds += delta_sec
        except Exception:
            continue
    focus_hours = round(focus_seconds / 3600.0, 2)

    workout_rows = (
        db.query(MicroWorkoutRun)
        .filter(
            MicroWorkoutRun.user_id == user_id,
            MicroWorkoutRun.created_at >= window_start,
        )
        .all()
    )
    movement_count = len(workout_rows)
    freq: Counter[str] = Counter()
    for row in workout_rows:
        try:
            parsed = json.loads(row.detail_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        for item in parsed.get("items") or []:
            mid = item.get("movementId") or item.get("movement_id")
            if mid:
                freq[str(mid)] += 1

    labels = _load_movement_id_labels()
    if freq:
        top_id = freq.most_common(1)[0][0]
        favorite_movement = labels.get(top_id, top_id)
    else:
        favorite_movement = "暂无记录"

    return ZenBoardStatBlock(
        focus_hours=focus_hours,
        movement_count=movement_count,
        preferred_movement=favorite_movement,
    )


def _zen_board_heatmap_cells(db: Session, user_id: int, tz) -> List[ZenBoardHeatCell]:
    now = datetime.now(tz)
    today = now.date()
    start_date = today - timedelta(days=29)
    window_start = datetime.combine(start_date, time.min).replace(tzinfo=tz)

    micro_rows = (
        db.query(MicroWorkoutRun)
        .filter(
            MicroWorkoutRun.user_id == user_id,
            MicroWorkoutRun.created_at >= window_start,
        )
        .all()
    )
    micro_by_day: Counter[date] = Counter()
    for row in micro_rows:
        micro_by_day[_local_calendar_date(row.created_at, tz)] += 1

    session_rows = (
        db.query(SessionRecord)
        .filter(
            SessionRecord.user_id == user_id,
            SessionRecord.start_time >= window_start,
        )
        .all()
    )
    focus_sec_by_day: Dict[date, float] = defaultdict(float)
    for rec in session_rows:
        try:
            d = _local_calendar_date(rec.start_time, tz)
            delta_sec = (rec.end_time - rec.start_time).total_seconds()
            if delta_sec > 0:
                focus_sec_by_day[d] += delta_sec
        except Exception:
            continue

    out: List[ZenBoardHeatCell] = []
    for i in range(30):
        d = start_date + timedelta(days=i)
        mc = micro_by_day.get(d, 0)
        fs = focus_sec_by_day.get(d, 0.0)
        pts = mc * 2 + min(12, int(fs // 600))
        if pts <= 0:
            level = 0
        elif pts <= 2:
            level = 1
        elif pts <= 5:
            level = 2
        elif pts <= 10:
            level = 3
        else:
            level = 4
        out.append(ZenBoardHeatCell(day=d.isoformat(), level=level))
    return out


def _format_timeline_time_label(dt: datetime, now: datetime, tz) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt_l = dt.astimezone(tz)
    now_l = now.astimezone(tz)
    d_local = dt_l.date()
    n_local = now_l.date()
    t_str = dt_l.strftime("%H:%M")
    if d_local == n_local:
        return t_str
    if d_local == n_local - timedelta(days=1):
        return f"昨日 {t_str}"
    if d_local == n_local - timedelta(days=2):
        return f"前日 {t_str}"
    return dt_l.strftime("%m月%d日 %H:%M")


def _zen_board_timeline(db: Session, user_id: int, tz, limit: int = 80) -> List[ZenBoardTimelineItem]:
    """近 3 个自然日（含当日）内的修习回音：专注会话、微运动收纳、日记。"""
    now = datetime.now(tz)
    today = now.date()
    oldest = today - timedelta(days=2)
    cutoff = datetime.combine(oldest, time.min).replace(tzinfo=tz)

    labels = _load_movement_id_labels()
    raw_items: List[tuple[datetime, str]] = []

    sessions = (
        db.query(SessionRecord)
        .filter(
            SessionRecord.user_id == user_id,
            SessionRecord.end_time >= cutoff,
        )
        .all()
    )
    for rec in sessions:
        try:
            mins = int(round((rec.end_time - rec.start_time).total_seconds() / 60.0))
            if mins < 1:
                continue
            et = rec.end_time
            if et.tzinfo is None:
                et = et.replace(tzinfo=timezone.utc)
            raw_items.append((et, f"完成 {mins} 分钟专注"))
        except Exception:
            continue

    runs = (
        db.query(MicroWorkoutRun)
        .filter(
            MicroWorkoutRun.user_id == user_id,
            MicroWorkoutRun.created_at >= cutoff,
        )
        .all()
    )
    for row in runs:
        names: List[str] = []
        try:
            parsed = json.loads(row.detail_json or "{}")
            for item in (parsed.get("items") or [])[:8]:
                mid = item.get("movementId") or item.get("movement_id")
                if mid:
                    names.append(labels.get(str(mid), str(mid)))
        except (json.JSONDecodeError, TypeError):
            pass
        text = "完成微运动收纳"
        if names:
            order_preserving: List[str] = []
            seen: set[str] = set()
            for n in names:
                if n not in seen:
                    seen.add(n)
                    order_preserving.append(n)
            if len(order_preserving) == 1:
                text = f"完成微动作：{order_preserving[0]}"
            else:
                text = f"完成微动作：{order_preserving[0]} 等 {len(order_preserving)} 项"
        ct = row.created_at
        if ct.tzinfo is None:
            ct = ct.replace(tzinfo=timezone.utc)
        raw_items.append((ct, text))

    diary_rows = (
        db.query(Diary)
        .filter(
            Diary.user_id == user_id,
            Diary.created_at >= cutoff,
        )
        .all()
    )
    for entry in diary_rows:
        body = (entry.content or "").strip().replace("\n", " ").replace("\r", " ")
        snippet = ((entry.ai_summary or "").strip() or body)[:48]
        if not snippet:
            continue
        suffix = "…" if len(((entry.ai_summary or "").strip() or body)) > 48 else ""
        dct = entry.created_at
        if dct.tzinfo is None:
            dct = dct.replace(tzinfo=timezone.utc)
        raw_items.append((dct, f"身心日记：{snippet}{suffix}"))

    raw_items.sort(key=lambda x: x[0], reverse=True)
    out: List[ZenBoardTimelineItem] = []
    for dt_val, line in raw_items[:limit]:
        out.append(
            ZenBoardTimelineItem(
                occurred_at=dt_val,
                time_label=_format_timeline_time_label(dt_val, now, tz),
                text=line,
            )
        )
    return out


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        log.exception("health check: database")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc
    return {"ok": True, "database": "connected"}


@app.on_event("startup")
def on_startup() -> None:
    # For early-stage development convenience; production should use migrations.
    create_tables()
    ensure_user_auth_columns()
    ensure_diary_ai_summary_column()


@app.get("/api/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(
        id=user.id,
        username=user.username,
        birthday=user.birthday,
        zodiac_cat_type=user.zodiac_cat_type,
        qi_score=user.qi_score,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@app.post("/api/auth/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: UserRegister,
    db: Session = Depends(get_db),
) -> RegisterResponse:
    key = payload.username.lower()
    taken = (
        db.query(User.id)
        .filter(func.lower(User.username) == key)
        .first()
    )
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )

    zodiac_cat = zodiac_sign_from_birthday(payload.birthday)
    password_hash = hash_password(payload.password)
    user = User(
        username=payload.username.lower(),
        hashed_password=password_hash,
        birthday=payload.birthday,
        zodiac_cat_type=zodiac_cat,
        qi_score=0,
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        # 预检查与 INSERT 之间并发注册时可能 1062；应返回 400 而非 500
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        log.exception("register: database error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user",
        ) from exc
    return RegisterResponse(
        message="Registration successful",
        user_id=int(user.id),
        username=str(user.username if user.username is not None else key),
        zodiac_cat_type=str(user.zodiac_cat_type),
    )


@app.post("/api/auth/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> UserResponse:
    key = payload.username.strip().lower()
    user = db.query(User).filter(func.lower(User.username) == key).first()
    if user is None or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    return UserResponse(
        id=user.id,
        username=user.username,
        birthday=user.birthday,
        zodiac_cat_type=user.zodiac_cat_type,
        qi_score=user.qi_score,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@app.post("/api/users/{user_id}/qi", response_model=QiUpdateResponse)
def update_user_qi(
    user_id: int,
    payload: QiUpdateRequest,
    db: Session = Depends(get_db),
) -> QiUpdateResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        user.qi_score += payload.qi_delta
        db.commit()
        db.refresh(user)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update qi score",
        )

    return QiUpdateResponse(
        user_id=user.id,
        qi_score=user.qi_score,
        message="Qi score updated successfully",
    )


@app.get("/api/users/{user_id}/workouts/recent-movements", response_model=RecentMovementsResponse)
def get_recent_micro_movements(
    user_id: int,
    days: int = 3,
    db: Session = Depends(get_db),
) -> RecentMovementsResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    since = datetime.now().astimezone() - timedelta(days=max(1, min(int(days), 90)))
    rows = (
        db.query(MicroWorkoutRun)
        .filter(
            MicroWorkoutRun.user_id == user_id,
            MicroWorkoutRun.created_at >= since,
        )
        .all()
    )
    ids: set[str] = set()
    for row in rows:
        try:
            parsed = json.loads(row.detail_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        for item in parsed.get("items") or []:
            mid = item.get("movementId") or item.get("movement_id")
            if mid:
                ids.add(str(mid))
    return RecentMovementsResponse(movement_ids=sorted(ids))


@app.get(
    "/api/users/{user_id}/micro-workouts/calendar-dates",
    response_model=WorkoutCalendarDatesResponse,
)
def get_micro_workout_calendar_dates(
    user_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
) -> WorkoutCalendarDatesResponse:
    """按月返回有 micro_workout_runs 记录的日期，供首页打卡日历展示。"""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    y = int(year)
    m = int(month)
    if m < 1 or m > 12 or y < 2000 or y > 2100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid year or month",
        )
    first = date(y, m, 1)
    last_day = calendar.monthrange(y, m)[1]
    last = date(y, m, last_day)
    range_start = datetime.combine(first, time.min)
    range_end_excl = datetime.combine(last + timedelta(days=1), time.min)

    day_rows = (
        db.query(func.date(MicroWorkoutRun.created_at))
        .filter(
            MicroWorkoutRun.user_id == user_id,
            MicroWorkoutRun.created_at >= range_start,
            MicroWorkoutRun.created_at < range_end_excl,
        )
        .distinct()
        .all()
    )
    out: List[str] = []
    for (d,) in day_rows:
        if d is None:
            continue
        if isinstance(d, datetime):
            out.append(d.date().isoformat())
        elif isinstance(d, date):
            out.append(d.isoformat())
        else:
            out.append(str(d)[:10])
    out = sorted(set(out))
    return WorkoutCalendarDatesResponse(dates=out)


@app.get("/api/users/{user_id}/reports/zen-summary", response_model=ZenSummaryResponse)
async def get_zen_summary_report(
    user_id: int,
    period: str = Query(
        "weekly",
        description="时间窗口：daily | weekly | monthly | yearly",
    ),
    db: Session = Depends(get_db),
) -> ZenSummaryResponse:
    """
    数据降维摘要（sessions / micro_workout_runs / diaries）+ 豆包 LLM 生成禅意寄语。
    """
    p = (period or "weekly").strip().lower()
    if p not in _ZEN_ALLOWED_PERIODS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid period; expected daily, weekly, monthly, or yearly",
        )
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    window_start = _zen_period_window_start(p)

    session_rows = (
        db.query(SessionRecord)
        .filter(SessionRecord.user_id == user_id, SessionRecord.start_time >= window_start)
        .all()
    )
    focus_seconds = 0.0
    for rec in session_rows:
        try:
            delta_sec = (rec.end_time - rec.start_time).total_seconds()
            if delta_sec > 0:
                focus_seconds += delta_sec
        except Exception:
            continue
    focus_hours = round(focus_seconds / 3600.0, 2)

    workout_rows = (
        db.query(MicroWorkoutRun)
        .filter(
            MicroWorkoutRun.user_id == user_id,
            MicroWorkoutRun.created_at >= window_start,
        )
        .all()
    )
    movement_count = len(workout_rows)
    freq: Counter[str] = Counter()
    for row in workout_rows:
        try:
            parsed = json.loads(row.detail_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        for item in parsed.get("items") or []:
            mid = item.get("movementId") or item.get("movement_id")
            if mid:
                freq[str(mid)] += 1

    labels = _load_movement_id_labels()
    if freq:
        top_id = freq.most_common(1)[0][0]
        favorite_movement = labels.get(top_id, top_id)
    else:
        favorite_movement = "暂无记录"

    diary_rows = (
        db.query(Diary)
        .filter(Diary.user_id == user_id)
        .order_by(desc(Diary.created_at))
        .limit(3)
        .all()
    )
    pieces: List[str] = []
    for entry in diary_rows:
        text = (entry.content or "").strip().replace("\n", " ").replace("\r", " ")
        if text:
            pieces.append(text[:50])
    recent_diary_summary = " ".join(pieces) if pieces else "暂无日记摘录"

    user_stats: Dict[str, Any] = {
        "focus_hours": focus_hours,
        "favorite_movement": favorite_movement,
        "movement_count": movement_count,
        "recent_diary_summary": recent_diary_summary[:200],
    }

    report_content = await generate_zen_report(user_stats, p)
    return ZenSummaryResponse(period=p, report_content=report_content)


@app.get("/api/users/{user_id}/dashboard/zen-board", response_model=ZenBoardResponse)
def get_zen_board_dashboard(
    user_id: int,
    db: Session = Depends(get_db),
) -> ZenBoardResponse:
    """
    数字禅意看板聚合：今日 / 近 30 日 / 近一年统计与热力图；历史回音仅限近 3 个自然日。
    与前端 Tab「今日回顾 / 近期趋势 / 年度总结」对齐（趋势窗口与 zen-summary 的 monthly、yearly 一致）。
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    tz = datetime.now().astimezone().tzinfo
    if tz is None:
        tz = timezone.utc

    daily = _aggregate_zen_board_stats(db, user_id, _zen_period_window_start("daily"))
    rhythm = _aggregate_zen_board_stats(db, user_id, _zen_period_window_start("monthly"))
    yearly = _aggregate_zen_board_stats(db, user_id, _zen_period_window_start("yearly"))

    return ZenBoardResponse(
        daily=daily,
        rhythm=rhythm,
        yearly=yearly,
        heatmap_30d=_zen_board_heatmap_cells(db, user_id, tz),
        timeline_recent=_zen_board_timeline(db, user_id, tz),
    )


@app.post("/api/users/{user_id}/micro-workouts/finish", response_model=MicroWorkoutFinishResponse)
def finish_micro_workout(
    user_id: int,
    payload: MicroWorkoutFinishRequest,
    db: Session = Depends(get_db),
) -> MicroWorkoutFinishResponse:
    """收纳本轮微运动：累加真气、写入 micro_workout_runs。"""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        user.qi_score = (user.qi_score or 0) + payload.total_qi
        row = MicroWorkoutRun(
            user_id=user_id,
            total_qi_delta=payload.total_qi,
            total_calories=payload.total_calories,
            plan_mode=(payload.plan_mode or "custom")[:32],
            detail_json=json.dumps(
                {"items": payload.items, "plan_mode": payload.plan_mode},
                ensure_ascii=False,
            ),
        )
        db.add(row)
        db.commit()
        db.refresh(user)
        db.refresh(row)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save micro workout",
        )

    return MicroWorkoutFinishResponse(
        run_id=row.id,
        user_id=user.id,
        qi_score=user.qi_score,
        message="Micro workout saved",
    )


@app.post("/api/workouts/complete", response_model=WorkoutCompleteResponse)
def complete_workout(
    payload: WorkoutCompleteRequest,
    db: Session = Depends(get_db),
) -> WorkoutCompleteResponse:
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not is_doubao_configured():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DOUBAO_API_KEY and DOUBAO_ENDPOINT_ID (or DOUBAO_MODEL) must be configured",
        )

    prompt = (
        "你是温暖克制的疗愈文案助手。请用中文生成一句 20~60 字的鼓励语，"
        "融合轻微中医/古典意境，不要夸张，不要使用 Markdown。\n"
        f"用户星座猫咪类型: {user.zodiac_cat_type}\n"
        f"本次动作: {payload.action_type}\n"
        f"补充上下文: {payload.context or '无'}"
    )

    try:
        healing_quote = generate_text_sync(prompt, timeout_sec=60).strip()
        if not healing_quote:
            raise ValueError("Empty response from Doubao")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate healing quote from Doubao",
        )

    try:
        item = EnergyStation(
            quote_text=healing_quote,
            is_favorited=False,
            source_tag="doubao",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save quote to EnergyStation",
        )

    return WorkoutCompleteResponse(
        message="Workout completion handled successfully",
        healing_quote=healing_quote,
        energy_station_id=item.id,
    )


@app.post("/api/energy/generate", response_model=EnergyGenerateResponse)
async def generate_energy_quote(
    payload: EnergyGenerateRequest,
    db: Session = Depends(get_db),
) -> EnergyGenerateResponse:
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    quote_text, is_default = await generate_healing_quote(payload.performance)

    try:
        item = EnergyStation(
            quote_text=quote_text,
            is_favorited=False,
            source_tag="doubao-default" if is_default else "doubao",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save quote to EnergyStation",
        )

    return EnergyGenerateResponse(
        energy_station_id=item.id,
        quote_text=quote_text,
        is_default=is_default,
        message="Healing quote generated and saved",
    )


@app.post("/api/diaries/", response_model=DiaryResponse, status_code=status.HTTP_201_CREATED)
def create_diary(
    payload: DiaryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> DiaryResponse:
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    content_stripped = payload.content.strip()
    entry = Diary(user_id=payload.user_id, content=content_stripped, ai_summary=None)
    try:
        db.add(entry)
        db.commit()
        db.refresh(entry)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create diary entry",
        )
    background_tasks.add_task(_refresh_diary_ai_cover_after_edit, entry.id, content_stripped)
    return DiaryResponse.model_validate(entry)


@app.get("/api/diaries/{user_id}", response_model=List[DiaryResponse])
def list_diaries(
    user_id: int,
    db: Session = Depends(get_db),
) -> List[DiaryResponse]:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    rows = (
        db.query(Diary)
        .filter(Diary.user_id == user_id)
        .order_by(desc(Diary.created_at))
        .all()
    )
    return [DiaryResponse.model_validate(r) for r in rows]


@app.patch("/api/diaries/{diary_id}", response_model=DiaryResponse)
def update_diary(
    diary_id: int,
    payload: DiaryUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> DiaryResponse:
    row = db.get(Diary, diary_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diary not found")
    if row.user_id != payload.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    content_stripped = payload.content.strip()
    row.content = content_stripped
    try:
        db.commit()
        db.refresh(row)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update diary",
        )
    background_tasks.add_task(_refresh_diary_ai_cover_after_edit, diary_id, content_stripped)
    return DiaryResponse.model_validate(row)


@app.delete("/api/diaries/{diary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_diary(
    diary_id: int,
    user_id: int = Query(..., gt=0, description="Must match diary owner"),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(Diary, diary_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diary not found")
    if row.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        db.delete(row)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete diary",
        )
