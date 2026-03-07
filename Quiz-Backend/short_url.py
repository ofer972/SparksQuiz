"""
TinyURL API integration for short join links.
Uses TINYURL_API_TOKEN from environment; if unset or API fails, returns None.
"""
import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)


def get_short_url(long_url: str) -> Optional[str]:
    """Create a short URL via TinyURL API. Returns None if token missing or request fails."""
    api_token = os.getenv("TINYURL_API_TOKEN", "").strip()
    if not api_token:
        logger.debug("TinyURL: TINYURL_API_TOKEN not set, skipping short URL")
        return None
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "url": long_url,
        "domain": "tiny.one",
    }
    try:
        response = requests.post(
            "https://api.tinyurl.com/create",
            headers=headers,
            json=payload,
            timeout=10,
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("data") and isinstance(data["data"], dict):
                return data["data"].get("tiny_url")
        logger.warning(
            "TinyURL API failed: status=%s body=%s",
            response.status_code,
            response.text[:200] if response.text else "",
        )
    except Exception as e:
        logger.warning("TinyURL request failed: %s", e)
    return None
