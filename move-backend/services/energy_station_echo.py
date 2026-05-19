from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, TypedDict

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, status
from pgvector.sqlalchemy import Vector
from pydantic import BaseModel, Field
from sqlalchemy import JSON, DateTime, String, Text, create_engine, func, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
import requests

logger = logging.getLogger(__name__)

# 与 database.py / services.gemini_service（豆包 HTTP 配置）一致：从仓库根目录加载 .env
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(_PROJECT_ROOT / ".env", override=True)

DOUBAO_API_KEY = os.getenv("DOUBAO_API_KEY", "").strip()


def _ark_api_v3_root() -> str:
    """与 DOUBAO_BASE_URL（常为 …/api/v3/responses）对齐，避免对话在 A 地域、Embedding 仍打默认华北。"""
    explicit = os.getenv("DOUBAO_ARK_API_ROOT", "").strip().rstrip("/")
    if explicit:
        return explicit
    resp = os.getenv("DOUBAO_RESPONSES_URL", "").strip()
    if resp.endswith("/responses"):
        return resp[: -len("/responses")].rstrip("/")
    base = os.getenv(
        "DOUBAO_BASE_URL",
        "https://ark.cn-beijing.volces.com/api/v3/responses",
    ).strip().rstrip("/")
    if base.endswith("/responses"):
        return base[: -len("/responses")].rstrip("/")
    return base or "https://ark.cn-beijing.volces.com/api/v3"


_ARK_V3 = _ark_api_v3_root()

DOUBAO_RESPONSES_URL = os.getenv(
    "DOUBAO_RESPONSES_URL",
    f"{_ARK_V3}/responses",
).strip()
DOUBAO_EMBEDDING_URL = os.getenv(
    "DOUBAO_EMBEDDING_URL",
    f"{_ARK_V3}/embeddings",
).strip()
# 多模态向量化（如 doubao-embedding-vision-*）使用 /embeddings/multimodal，请求体与纯文本 API 不同
DOUBAO_EMBEDDING_MULTIMODAL_URL = os.getenv(
    "DOUBAO_EMBEDDING_MULTIMODAL_URL",
    f"{_ARK_V3}/embeddings/multimodal",
).strip()
DOUBAO_CHAT_MODEL = os.getenv("DOUBAO_CHAT_MODEL", "").strip()
# 与全局豆包配置一致：优先使用「推理接入点」ID（ep-…），避免写死未开通的模型名。
DOUBAO_CHAT_ENDPOINT_ID = os.getenv("DOUBAO_ENDPOINT_ID", "").strip()
# 仅配置了 DOUBAO_MODEL / DOUBAO_MODEL_NAME 时，能量站对话链路仍可用
DOUBAO_CHAT_MODEL_LEGACY = os.getenv("DOUBAO_MODEL", os.getenv("DOUBAO_MODEL_NAME", "")).strip()
DOUBAO_EMBEDDING_MODEL = os.getenv("DOUBAO_EMBEDDING_MODEL", "doubao-embedding-text-240715").strip()
DOUBAO_EMBEDDING_ENDPOINT_ID = os.getenv("DOUBAO_EMBEDDING_ENDPOINT_ID", "").strip()
ENERGY_PGVECTOR_URL = os.getenv(
    "ENERGY_PGVECTOR_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/move_energy",
).strip()

def _kb_batch_size() -> int:
    raw = (os.getenv("ENERGY_KB_BATCH_SIZE", "12") or "12").strip()
    try:
        n = int(raw)
    except ValueError:
        return 12
    return max(3, min(n, 40))


KB_TARGET_SIZE = 200
# 单次生成条数过大易导致输出被截断、JSON 不完整或网关超时；默认改小，由多轮补齐 200 条。可用 ENERGY_KB_BATCH_SIZE 覆盖（3–40）。
KB_BATCH_SIZE = _kb_batch_size()


class EnergyEchoError(RuntimeError):
    """Domain error for energy echo pipeline."""


class EnergyBase(DeclarativeBase):
    """Dedicated ORM base for pgvector knowledge base tables."""


class EnergyQuoteKB(EnergyBase):
    __tablename__ = "energy_quote_kb"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_or_source: Mapped[str] = mapped_column(String(255), nullable=False)
    target_emotions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    target_events: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    vibe_tone: Mapped[str] = mapped_column(String(64), nullable=False, default="平和")
    # Keep dimensions flexible for different embedding models.
    embedding: Mapped[list[float]] = mapped_column(Vector(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class QuoteMetadata(TypedDict):
    target_emotions: list[str]
    target_events: list[str]
    vibe_tone: str


class QuoteRecord(TypedDict):
    id: str
    content: str
    author_or_source: str
    metadata: QuoteMetadata


class EnergyEchoRequest(BaseModel):
    daily_diary: str = Field(..., min_length=1, max_length=20_000)


class EnergyEchoResponse(BaseModel):
    quote: str
    source: str
    explanation: str


class RandomQuoteResponse(BaseModel):
    """无日记时的随机箴言（仅展示，不向量化）。"""

    quote: str
    source: str


class KnowledgeBaseInitResponse(BaseModel):
    target: int
    inserted_or_updated: int = Field(
        ...,
        description="调用结束后表内总行数（历史字段名，值为当前库规模而非仅本次新增）",
    )
    attempts: int = Field(..., description="本次实际执行的补齐轮次")
    initial_rows: int = Field(..., description="本次调用进入逻辑前表内行数")
    skipped: bool = Field(
        ...,
        description="若调用前已达 target 条，则不再拉取 LLM/向量化写入，本接口立即返回",
    )


_energy_engine = create_engine(
    ENERGY_PGVECTOR_URL,
    pool_pre_ping=True,
    future=True,
)
_energy_session_local = sessionmaker(bind=_energy_engine, autoflush=False, autocommit=False, class_=Session)
router = APIRouter(prefix="/api/energy-station", tags=["energy-station"])


def _doubao_model_for_chat() -> str:
    if DOUBAO_CHAT_ENDPOINT_ID:
        return DOUBAO_CHAT_ENDPOINT_ID
    if DOUBAO_CHAT_MODEL:
        return DOUBAO_CHAT_MODEL
    if DOUBAO_CHAT_MODEL_LEGACY:
        return DOUBAO_CHAT_MODEL_LEGACY
    raise EnergyEchoError(
        "未配置豆包对话：请在 .env 设置 DOUBAO_ENDPOINT_ID（方舟「推理接入点」ep-xxxx，推荐），"
        "或设置已在方舟控制台开通的 DOUBAO_CHAT_MODEL（亦可使用 DOUBAO_MODEL / DOUBAO_MODEL_NAME）。"
    )


def _doubao_model_for_embedding() -> str:
    return DOUBAO_EMBEDDING_ENDPOINT_ID or DOUBAO_EMBEDDING_MODEL


def _use_multimodal_embeddings(model_name: str) -> bool:
    """
    视觉/多模态向量化模型需调用 /embeddings/multimodal，且 input 为 [{type,text}, ...]。
    可用 DOUBAO_EMBEDDING_MULTIMODAL=1/0 强制开关（接入点 ep- 无法从名称推断时）。
    """
    flag = os.getenv("DOUBAO_EMBEDDING_MULTIMODAL", "").strip().lower()
    if flag in ("1", "true", "yes", "on"):
        return True
    if flag in ("0", "false", "no", "off"):
        return False
    m = (model_name or "").lower()
    return "embedding-vision" in m or "multimodal" in m


def _embedding_request_url(model_name: str) -> str:
    if _use_multimodal_embeddings(model_name):
        return DOUBAO_EMBEDDING_MULTIMODAL_URL
    return DOUBAO_EMBEDDING_URL


def _doubao_headers() -> dict[str, str]:
    if not DOUBAO_API_KEY:
        raise EnergyEchoError("DOUBAO_API_KEY is not configured.")
    return {
        "Authorization": f"Bearer {DOUBAO_API_KEY}",
        "Content-Type": "application/json",
    }


def _energy_db_public_dsn() -> str:
    """Host/port/database for operator hints (no password)."""
    u = _energy_engine.url
    host = u.host or "?"
    port = u.port or 5432
    db = u.database or "?"
    return f"{host}:{port}/{db}"


def _ensure_vector_store_ready() -> None:
    try:
        with _energy_engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        EnergyBase.metadata.create_all(bind=_energy_engine)
    except SQLAlchemyError as exc:
        root = getattr(exc, "orig", exc)
        root_txt = str(root).strip() or str(exc).strip()
        if len(root_txt) > 400:
            root_txt = root_txt[:400] + "…"
        dsn = _energy_db_public_dsn()
        msg = (
            f"PostgreSQL（pgvector）不可用，无法创建扩展或表。"
            f" 当前 ENERGY_PGVECTOR_URL 指向 {dsn}。"
            f" 底层错误: {root_txt}"
            f" 请在本机启动带 pgvector 的 Postgres，或修正 .env 中的 ENERGY_PGVECTOR_URL。"
        )
        logger.exception("pgvector storage prepare failed (%s)", dsn)
        raise EnergyEchoError(msg) from exc


def _message_content_to_text(content: Any) -> str:
    """Normalize chat `message.content` which may be str or list of typed parts."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                t = str(block.get("type", "")).lower()
                if t in ("text", "output_text", "input_text") or "text" in block:
                    parts.append(str(block.get("text", "")).strip())
            elif isinstance(block, str):
                parts.append(block.strip())
        return "".join(parts).strip()
    return ""


def _extract_doubao_text(payload: dict[str, Any]) -> str:
    err = payload.get("error")
    if isinstance(err, dict) and err:
        msg = str(err.get("message") or err.get("code") or json.dumps(err, ensure_ascii=False))[:500]
        if msg:
            raise EnergyEchoError(f"豆包 API 返回错误字段: {msg}")

    output_text = payload.get("output_text", "")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    output = payload.get("output", [])
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content", [])
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict):
                    continue
                text_val = part.get("text", "")
                if isinstance(text_val, str) and text_val.strip():
                    return text_val.strip()

    chat_choices = payload.get("choices", [])
    if isinstance(chat_choices, list) and chat_choices and isinstance(chat_choices[0], dict):
        message = chat_choices[0].get("message", {})
        if isinstance(message, dict):
            merged = _message_content_to_text(message.get("content", ""))
            if merged:
                return merged
    return ""


def _http_error_detail(exc: Exception) -> str:
    if not isinstance(exc, requests.HTTPError) or exc.response is None:
        return str(exc).strip() or exc.__class__.__name__
    r = exc.response
    body = (r.text or "").strip().replace("\r\n", "\n")
    if len(body) > 900:
        body = body[:900] + "…"
    detail = f"HTTP {r.status_code}: {body}"
    if "ModelNotOpen" in body or "not activated" in body.lower() or "has not activated" in body.lower():
        detail += (
            " 【处理说明】请在火山引擎「方舟」控制台为该账号开通对应模型，或创建推理接入点并在 .env 设置 "
            "DOUBAO_ENDPOINT_ID=ep-xxxx（推荐，与已在控制台开通的模型绑定）。"
        )
    return detail


def _call_doubao_text(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.7,
    *,
    timeout_sec: float = 120.0,
) -> str:
    headers = _doubao_headers()
    model_name = _doubao_model_for_chat()

    responses_payload = {
        "model": model_name,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": f"[系统指令]\n{system_prompt}\n\n[用户输入]\n{user_prompt}",
                    }
                ],
            }
        ],
        "temperature": temperature,
    }

    # Responses API first, chat/completions fallback.
    candidate_urls = [DOUBAO_RESPONSES_URL]
    if DOUBAO_RESPONSES_URL.endswith("/responses"):
        candidate_urls.append(DOUBAO_RESPONSES_URL.replace("/responses", "/chat/completions"))

    last_error: Exception | None = None
    last_empty_hint: str | None = None
    for url in candidate_urls:
        try:
            if url.endswith("/chat/completions"):
                chat_payload = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": temperature,
                }
                response = requests.post(url, headers=headers, json=chat_payload, timeout=timeout_sec)
            else:
                response = requests.post(url, headers=headers, json=responses_payload, timeout=timeout_sec)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                last_empty_hint = f"非 JSON 对象响应: {str(data)[:300]}"
                continue
            text_out = _extract_doubao_text(data)
            if text_out:
                return text_out
            last_empty_hint = json.dumps(data, ensure_ascii=False)[:1200]
            logger.warning("Doubao returned 200 but no extractable text from %s", url)
        except EnergyEchoError:
            raise
        except requests.HTTPError as exc:
            last_error = exc
            logger.warning("Doubao HTTP error url=%s detail=%s", url, _http_error_detail(exc))
            continue
        except Exception as exc:
            last_error = exc
            logger.warning("Doubao request failed url=%s: %s", url, exc)
            continue

    if last_error is not None:
        raise EnergyEchoError(f"豆包文本调用失败（{ _http_error_detail(last_error) }）。") from last_error
    if last_empty_hint:
        raise EnergyEchoError(
            "豆包返回成功但未解析到文本；请确认 DOUBAO_ENDPOINT_ID / DOUBAO_CHAT_MODEL 与接口路径。"
            f" 响应摘要: {last_empty_hint}"
        )
    raise EnergyEchoError("豆包文本调用无可用结果。")


def _parse_embedding_items(body: dict[str, Any], expected_n: int, model_label: str) -> list[list[float]]:
    """解析 Ark 文本 / 多模态向量化响应：支持 data 为数组，或 data 为单对象 {{ embedding: [...] }}。"""
    data = body.get("data")

    # 多模态等场景：data 为对象，内含单个 embedding 数组（非 [{index, embedding}, ...]）
    if isinstance(data, dict):
        nested_list = data.get("embeddings")
        if isinstance(nested_list, list) and nested_list:
            out_nested: list[list[float]] = []
            for item in nested_list:
                if isinstance(item, list) and item and isinstance(item[0], (int, float)):
                    out_nested.append([float(x) for x in item])
                elif isinstance(item, dict):
                    for key in ("embedding", "vector", "values"):
                        raw = item.get(key)
                        if isinstance(raw, list) and raw and isinstance(raw[0], (int, float)):
                            out_nested.append([float(x) for x in raw])
                            break
            if len(out_nested) == expected_n:
                return out_nested

        for key in ("embedding", "vector", "values"):
            raw = data.get(key)
            if isinstance(raw, list) and raw and isinstance(raw[0], (int, float)):
                vec = [float(x) for x in raw]
                if expected_n == 1:
                    return [vec]
                raise EnergyEchoError(
                    f"豆包 Embedding 返回单个向量（data 为对象），但本次请求 {expected_n} 条文本。"
                    f" 将降级为逐条请求。model={model_label!r}。"
                )

    if isinstance(data, list):
        parsed: list[tuple[int, list[float]]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            vec: list[float] = []
            for key in ("embedding", "vector", "values"):
                raw = item.get(key)
                if isinstance(raw, list) and raw:
                    vec = [float(x) for x in raw]
                    break
            if not vec:
                continue
            idx = item.get("index")
            if isinstance(idx, int):
                parsed.append((idx, vec))
            else:
                parsed.append((len(parsed), vec))
        if len(parsed) != expected_n:
            raise EnergyEchoError(
                f"豆包 Embedding 解析条数为 {len(parsed)}，期望 {expected_n}。"
                f" model={model_label!r}。"
                f" 摘要: {json.dumps(body, ensure_ascii=False)[:900]}"
            )
        parsed.sort(key=lambda x: x[0])
        return [v for _, v in parsed]

    raise EnergyEchoError(
        f"豆包 Embedding 无法解析 data（既非列表也非含 embedding 的对象）。model={model_label!r}。"
        f" 摘要: {json.dumps(body, ensure_ascii=False)[:900]}"
    )


def _embed_one(text: str, model_name: str, headers: dict[str, str], *, timeout_sec: float = 120) -> list[float]:
    url = _embedding_request_url(model_name)
    if _use_multimodal_embeddings(model_name):
        payload: dict[str, Any] = {
            "model": model_name,
            "input": [{"type": "text", "text": text}],
            "encoding_format": "float",
        }
    else:
        payload = {"model": model_name, "input": text}
    response = requests.post(url, headers=headers, json=payload, timeout=timeout_sec)
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict):
        raise EnergyEchoError(f"豆包 Embedding 单条返回非 JSON 对象: {str(body)[:400]}")
    err = body.get("error")
    if isinstance(err, dict) and err:
        msg = str(err.get("message") or err.get("code") or json.dumps(err, ensure_ascii=False))[:800]
        raise EnergyEchoError(f"豆包 Embedding API 错误: {msg}")
    vecs = _parse_embedding_items(body, 1, model_name)
    return vecs[0]


def _embed_texts(texts: list[str], *, http_timeout_sec: float = 120) -> list[list[float]]:
    if not texts:
        return []
    model_name = _doubao_model_for_embedding()
    if not (model_name or "").strip():
        raise EnergyEchoError(
            "未配置豆包向量模型：请在 .env 设置 DOUBAO_EMBEDDING_ENDPOINT_ID（推理接入点 ep-xxxx，推荐）"
            "或 DOUBAO_EMBEDDING_MODEL（已在方舟控制台开通的 Embedding 模型名）。"
        )
    headers = _doubao_headers()

    url = _embedding_request_url(model_name)
    logger.info(
        "[energy-kb] 豆包向量化请求 model=%r multimodal=%s url=%s 条数=%s",
        model_name,
        _use_multimodal_embeddings(model_name),
        url,
        len(texts),
    )

    def _raise_http(exc: requests.HTTPError) -> None:
        raise EnergyEchoError(f"豆包向量 HTTP 失败（{_http_error_detail(exc)}）") from exc

    # 多模态 / vision 向量化：多条 input 时接口常只返回单个 data.embedding，批量必失败。
    # 直接逐条请求，避免多余 HTTP、重复 WARNING、以及「先失败再降级」的噪音。
    if _use_multimodal_embeddings(model_name):
        out_mm: list[list[float]] = []
        for i, t in enumerate(texts):
            try:
                out_mm.append(_embed_one(t, model_name, headers, timeout_sec=http_timeout_sec))
            except requests.HTTPError as exc:
                _raise_http(exc)
            except EnergyEchoError:
                raise
            except Exception as exc:
                raise EnergyEchoError(f"豆包向量单条失败（第 {i + 1}/{len(texts)} 条）: {exc}") from exc
        return out_mm

    # 1) 文本向量化：优先批量
    payload_batch: dict[str, Any] = {"model": model_name, "input": texts}
    try:
        response = requests.post(url, headers=headers, json=payload_batch, timeout=http_timeout_sec)
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise EnergyEchoError(f"豆包 Embedding 返回非 JSON 对象: {str(body)[:400]}")

        err = body.get("error")
        if isinstance(err, dict) and err:
            msg = str(err.get("message") or err.get("code") or json.dumps(err, ensure_ascii=False))[:800]
            hint = ""
            if "ModelNotOpen" in msg or "not activated" in msg.lower():
                hint = " 请在方舟控制台开通该 Embedding 模型，或创建专用接入点并设置 DOUBAO_EMBEDDING_ENDPOINT_ID=ep-xxxx。"
            raise EnergyEchoError(f"豆包 Embedding API 错误: {msg}{hint}")

        try:
            return _parse_embedding_items(body, len(texts), model_name)
        except EnergyEchoError as batch_exc:
            if len(texts) <= 1:
                raise
            logger.warning(
                "Doubao embedding batch parse failed (%s), falling back to one-by-one; url=%s",
                batch_exc,
                url,
            )
    except EnergyEchoError:
        raise
    except requests.HTTPError as exc:
        _raise_http(exc)
    except Exception as exc:
        if len(texts) <= 1:
            raise EnergyEchoError(f"豆包向量调用异常: {exc}") from exc
        logger.warning("Doubao embedding batch request failed (%s), falling back to one-by-one", exc)

    # 2) 逐条（兼容仅支持单条 input 或与批量返回结构不一致的情况）
    out: list[list[float]] = []
    for i, t in enumerate(texts):
        try:
            out.append(_embed_one(t, model_name, headers, timeout_sec=http_timeout_sec))
        except requests.HTTPError as exc:
            _raise_http(exc)
        except EnergyEchoError:
            raise
        except Exception as exc:
            raise EnergyEchoError(f"豆包向量单条失败（第 {i + 1}/{len(texts)} 条）: {exc}") from exc
    return out


def _extract_json_payload(raw_text: str) -> Any:
    cleaned = raw_text.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _generate_quote_batch(batch_size: int) -> list[QuoteRecord]:
    system_prompt = "你是严格输出 JSON 的中文疗愈语料构建助手。"
    prompt = f"""
你是一名文学与心理疗愈内容策划师，请生成 {batch_size} 条高质量治愈系名著语录数据。
语料范围必须覆盖：传统中医养生、古典诗词、现代正念。

严格输出 JSON，格式如下：
{{
  "items": [
    {{
      "id": "uuid",
      "content": "语录正文",
      "author_or_source": "出处",
      "metadata": {{
        "target_emotions": ["情绪词"],
        "target_events": ["事件标签"],
        "vibe_tone": "基调"
      }}
    }}
  ]
}}

要求：
1) 只输出 JSON，不要额外解释；
2) content 为中文，20~80 字；
3) metadata 至少包含 2 个 target_emotions 与 2 个 target_events；
4) 三类语料分布均衡，避免重复；
5) id 必须是 UUID 字符串。
"""
    # 大批量 JSON 易截断：批次大小见 KB_BATCH_SIZE，超时单独放宽。
    timeout = max(120.0, 20.0 * float(batch_size))
    try:
        content = (
            _call_doubao_text(
                system_prompt=system_prompt,
                user_prompt=prompt,
                temperature=0.8,
                timeout_sec=timeout,
            )
            or "{}"
        )
        payload = _extract_json_payload(content)
        records = payload.get("items", []) if isinstance(payload, dict) else []
        if not isinstance(records, list):
            return []
        normalized: list[QuoteRecord] = []
        for item in records:
            if not isinstance(item, dict):
                continue
            metadata = item.get("metadata", {})
            if not isinstance(metadata, dict):
                metadata = {}
            quote_id = str(item.get("id") or uuid.uuid4())
            normalized.append(
                QuoteRecord(
                    id=quote_id,
                    content=str(item.get("content", "")).strip(),
                    author_or_source=str(item.get("author_or_source", "")).strip(),
                    metadata=QuoteMetadata(
                        target_emotions=[
                            str(x).strip()
                            for x in (metadata.get("target_emotions") or [])
                            if str(x).strip()
                        ],
                        target_events=[
                            str(x).strip()
                            for x in (metadata.get("target_events") or [])
                            if str(x).strip()
                        ],
                        vibe_tone=str(metadata.get("vibe_tone", "平和")).strip() or "平和",
                    ),
                )
            )
        return normalized
    except EnergyEchoError:
        raise
    except json.JSONDecodeError as exc:
        raise EnergyEchoError(
            "豆包返回的内容不是合法 JSON（常见于单次生成条数过多导致输出被截断）。"
            f"可在环境变量 ENERGY_KB_BATCH_SIZE 中减小批次（当前逻辑批次由该变量与代码共同决定）。解析错误: {exc}"
        ) from exc
    except Exception as exc:
        raise EnergyEchoError(f"语录冷启动（豆包）失败: {exc}") from exc


def _energy_kb_row_count() -> int:
    """当前知识库表中的语录行数（用于冷启动进度，避免用「本轮新增」误判）。"""
    with _energy_session_local() as db:
        try:
            n = db.query(func.count()).select_from(EnergyQuoteKB).scalar()
            return int(n or 0)
        except SQLAlchemyError as exc:
            logger.warning("energy_kb row count failed: %s", exc)
            return 0


def _upsert_quotes(records: list[QuoteRecord]) -> int:
    if not records:
        return 0
    texts = [f"{r['content']} | {r['author_or_source']}" for r in records]
    vectors = _embed_texts(texts)
    if len(vectors) != len(records):
        raise EnergyEchoError("Embedding count mismatch.")

    inserted = 0
    with _energy_session_local() as db:
        try:
            for idx, rec in enumerate(records):
                if not rec["content"] or not rec["author_or_source"]:
                    continue
                row = db.get(EnergyQuoteKB, rec["id"])
                if row is None:
                    row = EnergyQuoteKB(
                        id=rec["id"],
                        content=rec["content"],
                        author_or_source=rec["author_or_source"],
                        target_emotions=rec["metadata"]["target_emotions"],
                        target_events=rec["metadata"]["target_events"],
                        vibe_tone=rec["metadata"]["vibe_tone"],
                        embedding=vectors[idx],
                    )
                    db.add(row)
                    inserted += 1
                else:
                    row.content = rec["content"]
                    row.author_or_source = rec["author_or_source"]
                    row.target_emotions = rec["metadata"]["target_emotions"]
                    row.target_events = rec["metadata"]["target_events"]
                    row.vibe_tone = rec["metadata"]["vibe_tone"]
                    row.embedding = vectors[idx]
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise EnergyEchoError("Failed to persist quotes into pgvector.") from exc
    return inserted


def init_knowledge_base() -> dict[str, Any]:
    """
    Cold start the quote knowledge base:
    1) Auto-create table + pgvector extension;
    2) Ask LLM to generate 200 mock records;
    3) Embed and persist into PostgreSQL pgvector.
    """
    _ensure_vector_store_ready()
    attempts = 0
    raw_max = (os.getenv("ENERGY_KB_MAX_ROUNDS", "40") or "40").strip()
    try:
        max_rounds = int(raw_max)
    except ValueError:
        max_rounds = 40
    max_rounds = max(1, min(max_rounds, 200))

    total = _energy_kb_row_count()
    initial_total = total
    skipped = initial_total >= KB_TARGET_SIZE
    logger.info(
        "[energy-kb] 冷启动开始 | 目标=%s | 每批≤%s | 最多轮次=%s | 当前库行数=%s | 若已达标将跳过=%s",
        KB_TARGET_SIZE,
        KB_BATCH_SIZE,
        max_rounds,
        total,
        skipped,
    )

    while total < KB_TARGET_SIZE and attempts < max_rounds:
        attempts += 1
        remaining = KB_TARGET_SIZE - total
        batch_size = min(KB_BATCH_SIZE, remaining)
        logger.info(
            "[energy-kb] 第 %s/%s 轮 | 库中 %s/%s | 本批向 LLM 申请 %s 条…",
            attempts,
            max_rounds,
            total,
            KB_TARGET_SIZE,
            batch_size,
        )
        batch = _generate_quote_batch(batch_size=batch_size)
        logger.info("[energy-kb] 第 %s 轮 | LLM 返回语录 %s 条，正在向量化并写入 pgvector…", attempts, len(batch))
        n_new_rows = _upsert_quotes(batch)
        prev_total = total
        total = _energy_kb_row_count()
        logger.info(
            "[energy-kb] 第 %s 轮结束 | 本轮新插入行(仅全新 id)=%s | 库行数 %s → %s",
            attempts,
            n_new_rows,
            prev_total,
            total,
        )

    if total < KB_TARGET_SIZE:
        logger.warning(
            "[energy-kb] 未达目标：%s/%s（已达最大轮次 %s 或其它限制），详见上方日志",
            total,
            KB_TARGET_SIZE,
            max_rounds,
        )
    else:
        logger.info("[energy-kb] 冷启动完成 | 库行数=%s/%s | 总轮次=%s", total, KB_TARGET_SIZE, attempts)

    return {
        "target": KB_TARGET_SIZE,
        "inserted_or_updated": total,
        "attempts": attempts,
        "initial_rows": initial_total,
        "skipped": skipped,
    }


def _retrieve_best_quote_for_diary(daily_diary: str) -> EnergyQuoteKB:
    """
    用日记正文做语义检索（一次 Embedding + pgvector），省去「情绪/事件」抽取 LLM，
    缩短「今日回响」首字节与总耗时。
    """
    _ensure_vector_store_ready()
    q = daily_diary.strip()
    if not q:
        raise EnergyEchoError("daily_diary is empty.")
    max_chars = 800
    if len(q) > max_chars:
        q = q[:max_chars]
    query_vector = _embed_texts([q], http_timeout_sec=50)[0]

    with _energy_session_local() as db:
        try:
            distance_expr = EnergyQuoteKB.embedding.cosine_distance(query_vector)
        except Exception as exc:
            raise EnergyEchoError(f"构建向量检索表达式失败: {exc}") from exc
        try:
            row = db.query(EnergyQuoteKB).order_by(distance_expr.asc()).limit(1).first()
            if row is None:
                raise EnergyEchoError(
                    "知识库尚无语录或与检索条件不匹配。请先完成「初始化语录库」并等待跑满目标条数。"
                )
            return row
        except EnergyEchoError:
            raise
        except SQLAlchemyError as exc:
            root = str(getattr(exc, "orig", exc)).strip() or str(exc).strip()
            if len(root) > 600:
                root = root[:600] + "…"
            raise EnergyEchoError(
                "pgvector 向量检索失败。常见原因：库中向量维度与当前 Embedding 模型不一致、"
                "或扩展/连接异常。"
                f" 详情: {root}"
            ) from exc


def _generate_explanation(daily_diary: str, quote: str, source: str) -> str:
    system_prompt = """
你是一位温柔、克制且博览群书的智者。
你的任务是写一段约 100 字中文“专属解语”：
1) 巧妙融合给定经典语录的哲理；
2) 紧贴用户日记中的具体烦恼，不空泛说教；
3) 语气温柔、稳重、有陪伴感；
4) 只输出正文，不要标题和 Markdown。
"""
    user_prompt = f"""
[用户日记]
{daily_diary}

[经典语录]
{quote}
——{source}
"""
    try:
        text_out = (
            _call_doubao_text(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.7,
                timeout_sec=55.0,
            ).strip()
        )
        return text_out[:240] if text_out else "慢一点呼吸，把心安放在当下。你并不孤单，这一段路会过去。"
    except Exception as exc:
        raise EnergyEchoError("Failed to generate explanation.") from exc


def generate_energy_echo(daily_diary: str) -> dict[str, str]:
    """
    「今日回响」RAG 流程（优化后 2 次远端调用：Embedding + 解语文本）：
    1) 用日记截断文本做向量，pgvector 检索最相近语录；
    2) 豆包生成个性化解语（与语录、日记融合）。
    """
    if not daily_diary.strip():
        raise EnergyEchoError("daily_diary is empty.")

    quote_row = _retrieve_best_quote_for_diary(daily_diary)
    explanation = _generate_explanation(daily_diary, quote_row.content, quote_row.author_or_source)
    return {
        "quote": quote_row.content,
        "source": quote_row.author_or_source,
        "explanation": explanation,
    }


def _fetch_random_quote_row() -> EnergyQuoteKB:
    _ensure_vector_store_ready()
    with _energy_session_local() as db:
        try:
            row = db.query(EnergyQuoteKB).order_by(func.random()).limit(1).first()
        except SQLAlchemyError as exc:
            logger.exception("random quote query failed")
            raise EnergyEchoError(f"随机箴言查询失败: {exc}") from exc
        if row is None:
            raise EnergyEchoError("知识库暂无语录，请稍后再来。")
        return row


@router.get("/random-quote", response_model=RandomQuoteResponse)
def get_random_energy_quote() -> RandomQuoteResponse:
    try:
        row = _fetch_random_quote_row()
        return RandomQuoteResponse(quote=row.content, source=row.author_or_source)
    except EnergyEchoError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post("/echo", response_model=EnergyEchoResponse)
def create_energy_echo(payload: EnergyEchoRequest) -> EnergyEchoResponse:
    try:
        result = generate_energy_echo(payload.daily_diary)
        return EnergyEchoResponse(**result)
    except EnergyEchoError as exc:
        logger.exception("energy echo pipeline failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("unexpected energy echo error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate energy echo.",
        ) from exc


@router.post("/init-kb", response_model=KnowledgeBaseInitResponse)
def initialize_energy_knowledge_base() -> KnowledgeBaseInitResponse:
    """
    Initialize/refresh the Energy Station quote knowledge base.
    """
    try:
        result = init_knowledge_base()
        return KnowledgeBaseInitResponse(**result)
    except EnergyEchoError as exc:
        logger.exception("energy knowledge base init failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("unexpected energy knowledge base init error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize energy knowledge base.",
        ) from exc
