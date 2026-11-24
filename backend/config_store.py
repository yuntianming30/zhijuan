from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).parent.parent
CONFIG_PATH = PROJECT_ROOT / "local-samples" / "config" / "model.json"
DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_TEXT_MODEL = "deepseek-v4-pro"
DEFAULT_VISION_MODEL = "deepseek-flash"


def _saved() -> dict[str, str]:
    if not CONFIG_PATH.exists():
        return {}
    try:
        payload = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return {
            key: str(value)
            for key, value in payload.items()
            if key in {"apiKey", "baseUrl", "textModel", "visionModel"}
            and value is not None
        }
    except (OSError, ValueError):
        return {}


def effective() -> dict[str, str]:
    saved = _saved()
    return {
        "apiKey": os.environ.get("DEEPSEEK_API_KEY", "").strip()
        or saved.get("apiKey", ""),
        "baseUrl": os.environ.get("DEEPSEEK_BASE_URL", "").strip()
        or saved.get("baseUrl", "")
        or DEFAULT_BASE_URL,
        "textModel": os.environ.get("DEEPSEEK_TEXT_MODEL", "").strip()
        or saved.get("textModel", "")
        or DEFAULT_TEXT_MODEL,
        "visionModel": os.environ.get("DEEPSEEK_VISION_MODEL", "").strip()
        or saved.get("visionModel", "")
        or DEFAULT_VISION_MODEL,
    }


def public() -> dict[str, Any]:
    settings = effective()
    key = settings["apiKey"]
    environment_override = any(
        os.environ.get(name, "").strip()
        for name in (
            "DEEPSEEK_API_KEY",
            "DEEPSEEK_BASE_URL",
            "DEEPSEEK_TEXT_MODEL",
            "DEEPSEEK_VISION_MODEL",
        )
    )
    return {
        "baseUrl": settings["baseUrl"],
        "textModel": settings["textModel"],
        "visionModel": settings["visionModel"],
        "keyConfigured": bool(key),
        "keyHint": f"••••{key[-4:]}" if key else "",
        "source": "environment" if environment_override else "local",
    }


def save(payload: dict[str, Any]) -> dict[str, Any]:
    current = _saved()
    api_key = str(payload.get("apiKey") or "").strip()
    base_url = str(payload.get("baseUrl") or current.get("baseUrl") or DEFAULT_BASE_URL).strip()
    text_model = str(
        payload.get("textModel") or current.get("textModel") or DEFAULT_TEXT_MODEL
    ).strip()
    vision_model = str(
        payload.get("visionModel")
        or current.get("visionModel")
        or DEFAULT_VISION_MODEL
    ).strip()

    parsed_url = urlparse(base_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise ValueError("接口地址必须是有效的 http 或 https URL")
    if not text_model or not vision_model:
        raise ValueError("文本模型和视觉模型名称不能为空")

    next_config = {
        "baseUrl": base_url.rstrip("/"),
        "textModel": text_model,
        "visionModel": vision_model,
    }
    if api_key:
        next_config["apiKey"] = api_key
    elif current.get("apiKey"):
        next_config["apiKey"] = current["apiKey"]

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(next_config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    try:
        CONFIG_PATH.chmod(0o600)
    except OSError:
        pass
    return public()


def clear_key() -> dict[str, Any]:
    saved = _saved()
    saved.pop("apiKey", None)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(saved, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return public()
