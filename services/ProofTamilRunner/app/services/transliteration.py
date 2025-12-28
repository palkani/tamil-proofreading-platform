import logging
import re
import time
from typing import List, Tuple, Set

from app.adapters.aksharamukha import AksharaAdapter
from app.clients.transliterator_client import build_client
from app.core.cache import LRUCache, make_cache_key
from app.core.config import settings

tamil_regex = re.compile(r"^[\u0B80-\u0BFF\s]+$")

# PART 3: Tamil dependent vowels (vowel signs that attach to consonants)
# These cannot be stacked sequentially
DEPENDENT_VOWELS: Set[str] = {
    'ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'
}


def has_invalid_vowel_sequence(word: str) -> bool:
    """
    Check if a Tamil word has invalid vowel sequences.
    Two dependent vowels in a row is linguistically invalid.
    """
    if not word or len(word) < 2:
        return False

    for i in range(1, len(word)):
        prev = word[i - 1]
        curr = word[i]

        # Two dependent vowels in a row is invalid
        if prev in DEPENDENT_VOWELS and curr in DEPENDENT_VOWELS:
            return True

    return False


def filter_tamil_suggestions(suggestions: List[dict], token: str) -> List[dict]:
    """
    PART 3: Filter Tamil suggestions to remove invalid forms.
    - Rejects Latin/digits
    - Rejects invalid vowel stacking
    - Rejects overly long expansions for short inputs
    """
    if not suggestions:
        return []

    # For short tokens (1-2 chars), limit to 3 chars max
    # For longer tokens, allow up to 6 chars
    max_len = 3 if len(token) <= 2 else 6

    filtered = []
    for s in suggestions:
        w = (s.get("word") or s.get("ta") or "").strip()
        if not w:
            continue

        # Reject Latin / digits (must be pure Tamil)
        if any(c.isascii() and c.isalnum() for c in w):
            continue

        # Reject invalid vowel stacking
        if has_invalid_vowel_sequence(w):
            continue

        # Reject too-long expansions for short input
        if len(w) > max_len:
            continue

        filtered.append(s)

    return filtered


class TransliterationService:
    """
    Provides transliteration with optional external runner and in-memory caching.
    """

    def __init__(self):
        self.adapter = AksharaAdapter()
        self.cache = LRUCache(max_size=settings.CACHE_MAX_SIZE, default_ttl=settings.CACHE_TTL_SECONDS)
        self.client = build_client()
        self.runner_enabled = settings.TRANSLITERATOR_ENABLED

    async def transliterate(
        self, text: str, mode: str, limit: int, request_id: str = "n/a"
    ) -> Tuple[List[dict], bool, str]:
        """
        Transliterate text with cache and external runner if enabled.
        Returns (suggestions, used_runner, cache_status[hit|miss|none]).
        """
        logging.info("transliteration_pipeline_start request_id=%s", request_id)

        text = (text or "").strip()
        if not text or len(text) > settings.MAX_TEXT_LEN:
            logging.warning("[IME] request_id=%s invalid_input len=%d", request_id, len(text))
            return [], False, "none"
        limit = max(1, min(limit or 8, 12))

        key = make_cache_key(text, mode, str(limit))
        logging.info("transliteration_cache_lookup request_id=%s", request_id)
        cached = self.cache.get(key)
        if cached:
            logging.info("transliteration_cache_hit request_id=%s", request_id)
            return cached, True, "hit"
        logging.info("transliteration_cache_miss request_id=%s", request_id)

        suggestions: List[dict] = []
        used_runner = False
        cache_status = "miss"

        if self.runner_enabled:
            if not self.client:
                logging.info(
                    "skipping_transliterator_runner request_id=%s reason=client_not_initialized",
                    request_id,
                )
            else:
                logging.info("calling_transliterator_runner request_id=%s", request_id)
                start = time.perf_counter()
                try:
                    data = await self.client.transliterate(text)
                    outputs = [s.get("word") or s.get("ta") for s in data.get("suggestions", []) if s]
                    latency_ms = (time.perf_counter() - start) * 1000
                    logging.info(
                        "transliterator_runner_success request_id=%s latency_ms=%.2f outputs=%d",
                        request_id,
                        latency_ms,
                        len(outputs),
                    )
                    used_runner = True
                    # Build suggestions list first
                    raw_suggestions = []
                    for out in outputs:
                        if not out or not tamil_regex.match(out):
                            continue
                        raw_suggestions.append({"word": out, "ta": out, "score": 1.0})
                    
                    # PART 3: Filter suggestions to remove invalid Tamil forms
                    filtered = filter_tamil_suggestions(raw_suggestions, text)
                    
                    # Fallback: if everything filtered out, keep only first raw item as safe fallback
                    if filtered:
                        suggestions = filtered[:limit]
                    else:
                        suggestions = raw_suggestions[:1] if raw_suggestions else []
                except Exception as e:
                    logging.error(
                        "transliterator_runner_failure request_id=%s error=%s", request_id, str(e)
                    )
        else:
            logging.info(
                "skipping_transliterator_runner request_id=%s reason=disabled enabled=%s base_url_present=%s",
                request_id,
                self.runner_enabled,
                bool(settings.TRANSLITERATOR_BASE_URL),
            )

        if used_runner:
            if suggestions:
                self.cache.set(key, suggestions)
            return suggestions, True, cache_status

        # Runner not used or failed; fallback to adapter (Gemini/legacy path)
        try:
            outputs = await self.adapter.transliterate(text, mode)
            logging.info(
                "[AKSHARA] request_id=%s event=fallback_adapter outputs=%d", request_id, len(outputs)
            )
            # Build raw suggestions list first
            raw_suggestions = []
            for out in outputs:
                if not out or not tamil_regex.match(out):
                    continue
                raw_suggestions.append({"word": out, "ta": out, "score": 1.0})
            
            # PART 3: Filter suggestions to remove invalid Tamil forms
            filtered = filter_tamil_suggestions(raw_suggestions, text)
            
            # Fallback: if everything filtered out, keep only first raw item as safe fallback
            if filtered:
                suggestions = filtered[:limit]
            else:
                suggestions = raw_suggestions[:1] if raw_suggestions else []
        except Exception as e:
            logging.exception("[AKSHARA] request_id=%s error=%s", request_id, e)
            return [], False, "none"

        return suggestions, False, "none"
