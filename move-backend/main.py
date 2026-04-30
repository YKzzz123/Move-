from __future__ import annotations

import logging
import os
import json
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import google.generativeai as genai
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from auth.utils import hash_password, verify_password
from auth.zodiac import zodiac_sign_from_birthday
from database import create_tables, ensure_user_auth_columns, get_db
from models import Diary, EnergyStation, MicroWorkoutRun, User
from schemas import DiaryCreate, DiaryResponse, LoginRequest, RegisterResponse, UserRegister
from services.gemini_service import generate_healing_quote

log = logging.getLogger(__name__)


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


class UserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    birthday: date
    zodiac_cat_type: str
    qi_score: int
    created_at: datetime
    updated_at: datetime


app = FastAPI(title="Move! V2 Backend API")

# 开发时 Vite 可能落在 5173、5174… 任意端口，用正则避免每次改白名单
_DEV_ORIGIN_REGEX = r"http://(127\.0\.0\.1|localhost):\d+"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_DEV_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY is not configured",
        )

    prompt = (
        "你是温暖克制的疗愈文案助手。请用中文生成一句 20~60 字的鼓励语，"
        "融合轻微中医/古典意境，不要夸张，不要使用 Markdown。\n"
        f"用户星座猫咪类型: {user.zodiac_cat_type}\n"
        f"本次动作: {payload.action_type}\n"
        f"补充上下文: {payload.context or '无'}"
    )

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        result = model.generate_content(prompt)
        healing_quote = (result.text or "").strip()
        if not healing_quote:
            raise ValueError("Empty response from Gemini")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate healing quote from Gemini",
        )

    try:
        item = EnergyStation(
            quote_text=healing_quote,
            is_favorited=False,
            source_tag="gemini",
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
            source_tag="gemini-default" if is_default else "gemini",
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
    db: Session = Depends(get_db),
) -> DiaryResponse:
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    entry = Diary(user_id=payload.user_id, content=payload.content.strip())
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
