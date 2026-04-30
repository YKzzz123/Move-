from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Tuple

import google.generativeai as genai
from dotenv import load_dotenv
import requests

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL_NAME: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()
DOUBAO_API_KEY: str = os.getenv("DOUBAO_API_KEY", "").strip()
DOUBAO_BASE_URL: str = os.getenv(
    "DOUBAO_BASE_URL",
    "https://ark.cn-beijing.volces.com/api/v3/responses",
).strip()
DOUBAO_MODEL_NAME: str = os.getenv("DOUBAO_MODEL", os.getenv("DOUBAO_MODEL_NAME", "doubao-1-5-lite-32k-250115")).strip()
DOUBAO_ENDPOINT_ID: str = os.getenv("DOUBAO_ENDPOINT_ID", "").strip()

DEFAULT_FALLBACK_QUOTE: str = "气定神闲，一念一春。"
MAX_QUOTE_LENGTH: int = 30

_configured: bool = False


def _ensure_configured() -> bool:
    """Configure Gemini SDK lazily; return False if API key missing."""
    global _configured
    if _configured:
        return True
    if not GEMINI_API_KEY:
        return False
    genai.configure(api_key=GEMINI_API_KEY)
    _configured = True
    return True


def _build_prompt(performance: str) -> str:
    return (
        "你是融合东方古典文学与中医意境的疗愈文案助手。\n"
        f"用户刚刚完成的运动表现：{performance}\n"
        "请输出一句鼓励金句，严格要求：\n"
        "1. 纯中文，不超过30个汉字；\n"
        "2. 含古典或中医意象（如气、脉、安神、松肩、明目等）；\n"
        "3. 不使用 Markdown、不换行、不加引号、不加解释。"
    )


def _sanitize(text: str) -> str:
    cleaned = text.strip().replace("\n", "").replace("\r", "")
    cleaned = cleaned.strip("「」\"'`*《》 ")
    if len(cleaned) > MAX_QUOTE_LENGTH:
        cleaned = cleaned[:MAX_QUOTE_LENGTH]
    return cleaned


def _extract_doubao_text(data: dict) -> str:
    """Extract text from Ark Responses API payload."""
    # New Responses API may return output_text directly.
    output_text = data.get("output_text", "")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    # Or return nested output blocks.
    output = data.get("output", [])
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
                text = part.get("text", "")
                if isinstance(text, str) and text.strip():
                    return text.strip()

    # Backward compatible parsing for chat completions style.
    return (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


def _call_doubao_sync(prompt: str) -> str:
    """Call Doubao API (Responses API) and return text."""
    if not DOUBAO_API_KEY:
        return ""

    # In Volcengine Ark, "model" is usually the endpoint ID (e.g. ep-xxxx).
    model_or_endpoint = DOUBAO_ENDPOINT_ID or DOUBAO_MODEL_NAME
    if not model_or_endpoint:
        return ""

    headers = {
        "Authorization": f"Bearer {DOUBAO_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model_or_endpoint,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": prompt,
                    }
                ],
            }
        ],
    }

    # Prefer official Responses API, keep chat/completions as compatibility fallback.
    candidate_urls = [DOUBAO_BASE_URL]
    if DOUBAO_BASE_URL.endswith("/responses"):
        candidate_urls.append(DOUBAO_BASE_URL.replace("/responses", "/chat/completions"))
    elif DOUBAO_BASE_URL.endswith("/chat/completions"):
        candidate_urls.insert(0, DOUBAO_BASE_URL.replace("/chat/completions", "/responses"))

    last_error: Exception | None = None
    for url in candidate_urls:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=20)
            response.raise_for_status()
            data = response.json()
            return _extract_doubao_text(data)
        except Exception as exc:
            last_error = exc
            continue

    if last_error is not None:
        raise last_error
    return ""


async def generate_healing_quote(performance: str) -> Tuple[str, bool]:
    """
    Generate a short healing quote (<=30 chars) blending Eastern classical aesthetics.

    Args:
        performance: 用户运动表现描述，例如 "完成了眼部微运动"。

    Returns:
        (quote_text, is_default)
        - quote_text: 生成的金句或默认文案
        - is_default: 是否使用了兜底默认文案（True 表示 API 调用失败/缺配置）
    """
    if not performance or not performance.strip():
        logger.warning("Empty performance text, returning default quote")
        return DEFAULT_FALLBACK_QUOTE, True

    prompt = _build_prompt(performance.strip())

    # 1) Prefer Gemini first.
    try:
        if _ensure_configured():
            model = genai.GenerativeModel(GEMINI_MODEL_NAME)
            result = await model.generate_content_async(prompt)
            raw = result.text if getattr(result, "text", None) else ""
            quote = _sanitize(raw)
            if quote:
                return quote, False
            logger.warning("Gemini returned empty content, fallback to Doubao")
        else:
            logger.warning("GEMINI_API_KEY not configured, fallback to Doubao")
    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc)

    # 2) Fallback to Doubao if Gemini failed/unavailable.
    try:
        doubao_raw = await asyncio.to_thread(_call_doubao_sync, prompt)
        doubao_quote = _sanitize(doubao_raw)
        if doubao_quote:
            return doubao_quote, False
        logger.warning("Doubao returned empty content, fallback to default")
    except Exception as exc:
        logger.error("Doubao API call failed: %s", exc)

    # 3) Fallback default.
    return DEFAULT_FALLBACK_QUOTE, True
