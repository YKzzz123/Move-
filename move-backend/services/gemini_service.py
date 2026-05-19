from __future__ import annotations

import asyncio
import logging
import os
from functools import partial
from pathlib import Path
from typing import Any, Tuple

from dotenv import load_dotenv
import requests

logger = logging.getLogger(__name__)

# 历史文件名保留为 gemini_service.py，实际生成链路已全部走火山方舟豆包 API。

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)

DOUBAO_API_KEY: str = os.getenv("DOUBAO_API_KEY", "").strip()
DOUBAO_BASE_URL: str = os.getenv(
    "DOUBAO_BASE_URL",
    "https://ark.cn-beijing.volces.com/api/v3/responses",
).strip()
DOUBAO_MODEL_NAME: str = os.getenv("DOUBAO_MODEL", os.getenv("DOUBAO_MODEL_NAME", "doubao-1-5-lite-32k-250115")).strip()
DOUBAO_ENDPOINT_ID: str = os.getenv("DOUBAO_ENDPOINT_ID", "").strip()

DEFAULT_FALLBACK_QUOTE: str = "气定神闲，一念一春。"
DEFAULT_ZEN_REPORT_FALLBACK: str = (
    "岁月流转，静水流深。无论数据如何起伏，你的每一次呼吸都在重塑自我。"
)
MAX_QUOTE_LENGTH: int = 30
MAX_ZEN_REPORT_CHARS: int = 150
MAX_DIARY_COVER_CHARS: int = 40
FALLBACK_DIARY_COVER: str = "🔒 封存的灵光"


def is_doubao_configured() -> bool:
    """豆包（方舟）是否具备调用条件。"""
    return bool(DOUBAO_API_KEY and (DOUBAO_ENDPOINT_ID or DOUBAO_MODEL_NAME))


def generate_text_sync(prompt: str, *, timeout_sec: float = 30) -> str:
    """同步调用豆包，返回模型正文；未配置或失败时返回空串。"""
    try:
        return _call_doubao_sync(prompt, timeout_sec=timeout_sec)
    except Exception as exc:
        logger.warning("Doubao generate_text_sync failed: %s", exc)
        return ""


def _sanitize_diary_emotion_cover(text: str) -> str:
    cleaned = (text or "").strip().replace("\r", " ").replace("\n", " ")
    while "  " in cleaned:
        cleaned = cleaned.replace("  ", " ")
    cleaned = cleaned.strip("「」\"'`*《》 \t")
    if len(cleaned) > MAX_DIARY_COVER_CHARS:
        cleaned = cleaned[:MAX_DIARY_COVER_CHARS]
    return cleaned


def generate_diary_emotion_cover_sync(diary_content: str) -> str:
    """
    根据日记正文生成「1 个 Emoji + 3～5 字」情绪封面，供列表封存态展示。
    仅调用豆包（同步）；失败返回 FALLBACK_DIARY_COVER。
    """
    c = (diary_content or "").strip()
    if not c:
        return FALLBACK_DIARY_COVER

    prompt = (
        "请根据以下日记内容，总结出最符合心境的1个Emoji和3到5个字的精炼短语，例如「☀️ 开心的一天」。\n"
        "严格要求：只输出这一串文字，不要引号、不要书名号、不要解释、不要换行、不要 Markdown。\n\n"
        f"日记：\n{c[:4000]}"
    )

    try:
        raw = _call_doubao_sync(prompt, timeout_sec=45)
        out = _sanitize_diary_emotion_cover(raw)
        if out:
            return out
        logger.warning("Doubao diary cover empty")
    except Exception as exc:
        logger.warning("Doubao diary cover failed: %s", exc)

    return FALLBACK_DIARY_COVER


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


def _sanitize_zen_report(text: str) -> str:
    cleaned = text.strip().replace("\r", " ").replace("\n", " ")
    while "  " in cleaned:
        cleaned = cleaned.replace("  ", " ")
    cleaned = cleaned.strip("「」\"'`*《》 ")
    if len(cleaned) > MAX_ZEN_REPORT_CHARS:
        cleaned = cleaned[:MAX_ZEN_REPORT_CHARS]
    return cleaned


def _period_human_cn(period: str) -> str:
    key = (period or "").strip().lower()
    return {
        "daily": "今日",
        "weekly": "近一周",
        "monthly": "近一月",
        "yearly": "近一年",
    }.get(key, period or "近期")


def _build_zen_report_prompt(user_stats: dict[str, Any], period: str) -> str:
    period_cn = _period_human_cn(period)
    fh = user_stats.get("focus_hours", 0)
    fm = user_stats.get("favorite_movement") or "暂无"
    mc = user_stats.get("movement_count", 0)
    rd = user_stats.get("recent_diary_summary") or "暂无摘录"
    try:
        fh_display = float(fh)
    except (TypeError, ValueError):
        fh_display = 0.0
    try:
        mc_display = int(mc)
    except (TypeError, ValueError):
        mc_display = 0
    return (
        "你是一位精通东方哲学的数字疗愈师。请根据以下用户过去一段时期（"
        f"{period_cn}"
        "）的修习数据，写一段不超过 150 字的寄语。\n"
        "用户数据摘要：\n"
        f"- 累计专注：{fh_display:g} 小时\n"
        f"- 微运动偏好：最常做的是「{fm}」，总计 {mc_display} 次。\n"
        f"- 近期心境（日记摘录或情绪）：{rd}\n"
        "生成要求：\n"
        "1. 不要像机器一样罗列数据，要用东方智者写信的口吻（如：「我看到你这段时间在案牍前停留了太久...」）。\n"
        "2. 结合数据给出温和的身心建议。\n"
        "3. 语言风格：留白、克制、富有诗意。\n"
        "输出：仅正文，不要标题、不要 Markdown、不要分行列举。"
    )


def _extract_doubao_text(data: dict) -> str:
    """Extract text from Ark Responses API payload."""
    output_text = data.get("output_text", "")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

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

    return (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


def _call_doubao_sync(prompt: str, *, timeout_sec: float = 20) -> str:
    """Call Doubao API (Responses API) and return text."""
    if not DOUBAO_API_KEY:
        return ""

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

    candidate_urls = [DOUBAO_BASE_URL]
    if DOUBAO_BASE_URL.endswith("/responses"):
        candidate_urls.append(DOUBAO_BASE_URL.replace("/responses", "/chat/completions"))
    elif DOUBAO_BASE_URL.endswith("/chat/completions"):
        candidate_urls.insert(0, DOUBAO_BASE_URL.replace("/chat/completions", "/responses"))

    last_error: Exception | None = None
    for url in candidate_urls:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=timeout_sec)
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

    Returns:
        (quote_text, is_default)
        is_default: True 表示未配置豆包或调用失败，使用兜底文案。
    """
    if not performance or not performance.strip():
        logger.warning("Empty performance text, returning default quote")
        return DEFAULT_FALLBACK_QUOTE, True

    if not is_doubao_configured():
        logger.warning("Doubao not configured, returning default quote")
        return DEFAULT_FALLBACK_QUOTE, True

    prompt = _build_prompt(performance.strip())

    try:
        doubao_raw = await asyncio.to_thread(partial(_call_doubao_sync, prompt, timeout_sec=25))
        doubao_quote = _sanitize(doubao_raw)
        if doubao_quote:
            return doubao_quote, False
        logger.warning("Doubao returned empty content, fallback to default")
    except Exception as exc:
        logger.error("Doubao API call failed: %s", exc)

    return DEFAULT_FALLBACK_QUOTE, True


async def generate_zen_report(user_stats: dict[str, Any], period: str) -> str:
    """根据降维后的用户修习摘要生成不超过 150 字的东方疗愈寄语（仅豆包）。"""
    if not is_doubao_configured():
        return DEFAULT_ZEN_REPORT_FALLBACK

    prompt = _build_zen_report_prompt(user_stats, period)

    try:
        doubao_raw = await asyncio.to_thread(partial(_call_doubao_sync, prompt, timeout_sec=60))
        report = _sanitize_zen_report(doubao_raw)
        if report:
            return report
        logger.warning("Doubao zen report empty, fallback to default")
    except Exception as exc:
        logger.error("Doubao zen report failed: %s", exc)

    return DEFAULT_ZEN_REPORT_FALLBACK
