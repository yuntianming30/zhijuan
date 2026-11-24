from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

from json_repair import loads as repair_loads

from . import config_store


class DeepSeekError(RuntimeError):
    pass


def redact(value: str) -> str:
    value = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-REDACTED", value)
    value = re.sub(
        r"(?i)(authorization[\"']?\s*[:=]\s*[\"']?bearer\s+)[^\s\"']+",
        r"\1REDACTED",
        value,
    )
    return value


def api_key() -> str | None:
    value = config_store.effective()["apiKey"].strip()
    return value or None


def model_name(kind: str) -> str:
    if kind == "vision":
        return config_store.effective()["visionModel"]
    return config_store.effective()["textModel"]


def _request(payload: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    key = api_key()
    if not key:
        raise DeepSeekError("未配置 DEEPSEEK_API_KEY")

    base_url = config_store.effective()["baseUrl"].rstrip("/")
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise DeepSeekError(f"HTTP {error.code}: {redact(raw[:1200])}") from error
    except urllib.error.URLError as error:
        raise DeepSeekError(f"网络错误: {redact(str(error.reason))}") from error


def _content(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if not choices:
        raise DeepSeekError("模型响应缺少 choices")
    choice = choices[0]
    if choice.get("finish_reason") == "length":
        raise DeepSeekError("模型输出达到长度上限，未生成完整结果")
    content = choice.get("message", {}).get("content")
    if isinstance(content, str) and content.strip():
        return content
    raise DeepSeekError("模型返回了空内容")


def _json_content(content: str) -> Any:
    value = content.strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*", "", value)
        value = re.sub(r"\s*```$", "", value)
    try:
        return json.loads(value)
    except json.JSONDecodeError as error:
        try:
            repaired = repair_loads(value)
            if isinstance(repaired, (dict, list)):
                return repaired
        except Exception:
            pass
        raise DeepSeekError(
            f"模型未返回合法 JSON: {redact(str(error))}"
        ) from error


def chat_json(
    *,
    kind: str,
    content: str | list[dict[str, Any]],
    max_tokens: int,
    timeout_seconds: int = 240,
) -> tuple[Any, dict[str, Any]]:
    model = model_name(kind)
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "max_tokens": max_tokens,
    }
    response = _request(payload, timeout_seconds)
    parsed = _json_content(_content(response))
    metadata = {
        "model": model,
        "usage": response.get("usage"),
        "finishReason": (response.get("choices") or [{}])[0].get("finish_reason"),
    }
    return parsed, metadata


def fetch_models(
    key: str | None = None,
    base: str | None = None,
) -> list[dict[str, Any]]:
    settings = config_store.effective()
    resolved_key = (key or settings["apiKey"]).strip()
    resolved_base = (base or settings["baseUrl"]).rstrip("/")
    if not resolved_key:
        raise DeepSeekError("未配置 API Key")
    if not resolved_base.startswith(("https://", "http://")):
        raise DeepSeekError("接口地址格式不正确")

    request = urllib.request.Request(
        f"{resolved_base}/models",
        headers={
            "Authorization": f"Bearer {resolved_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return payload.get("data", [])
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise DeepSeekError(f"HTTP {error.code}: {redact(raw[:800])}") from error
    except urllib.error.URLError as error:
        raise DeepSeekError(f"网络错误: {redact(str(error.reason))}") from error
