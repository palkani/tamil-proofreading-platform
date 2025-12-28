import logging
from fastapi import APIRouter, Request, Response, Query, HTTPException
from typing import Optional
from app.api.schemas import TransliterateRequest, TransliterateResponse
from app.services.transliteration import TransliterationService
from app.suggestion_engine.engine import SuggestionEngine
from app.suggestion_engine.types import SuggestionRequest
from app.core.config import settings

router = APIRouter()
service = TransliterationService()
suggestion_engine = SuggestionEngine()


@router.get("/health")
async def health():
    cache_stats = service.cache.stats() if service.cache else {"size": 0, "hits": 0, "misses": 0}
    base_present = bool(settings.TRANSLITERATOR_BASE_URL)
    return {
        "ok": True,
        "transliterator_enabled": settings.TRANSLITERATOR_ENABLED,
        "transliterator_base_url_present": base_present,
        "cache_size": cache_stats["size"],
        "cache_hits": cache_stats["hits"],
        "cache_misses": cache_stats["misses"],
    }


@router.post("/transliterate", response_model=TransliterateResponse)
async def transliterate(req: TransliterateRequest, request: Request, response: Response):
    rid = getattr(request.state, "request_id", "n/a")
    suggestions, used_runner, cache_status = await service.transliterate(req.text, req.mode, req.limit, rid)
    response.headers["X-Transliterator-Used"] = "true" if used_runner else "false"
    response.headers["X-Transliterator-Cache"] = cache_status
    return TransliterateResponse(success=True, suggestions=suggestions)


@router.get("/transliterate/suggest")
async def transliterate_suggest(
    q: str = Query(..., min_length=1, max_length=40, description="Roman input fragment"),
    limit: int = Query(8, ge=1, le=20, description="Maximum number of suggestions"),
    mode: str = Query("smart", regex="^(smart|strict)$", description="Mode: 'smart' or 'strict'"),
    context: Optional[str] = Query(None, max_length=5000, description="Full text around cursor"),
    cursor: Optional[int] = Query(None, ge=0, description="Cursor position within context"),
    lang: Optional[str] = Query(None, description="Language (reserved)"),
    client_id: Optional[str] = Query(None, description="Client ID (for logging)"),
    project_id: Optional[str] = Query(None, description="Project ID (for logging)"),
    request: Request = None,
    response: Response = None,
):
    """
    Enhanced suggest endpoint with layered algorithm.
    
    Returns context-aware Tamil suggestions with multiple layers:
    - Layer A: Core Transliteration (strict)
    - Layer B: Tamil Vowel Expansion
    - Layer C: Context-Aware Completion
    - Layer D: Frequency Ranking
    - Layer E: Heuristic Neighbors (smart mode only)
    - Layer F: Dedup + Final Ranker
    """
    rid = getattr(getattr(request, "state", None), "request_id", "n/a") if request else "n/a"
    
    # Build request
    suggest_request = SuggestionRequest(
        q=q,
        limit=limit,
        mode=mode,
        context=context,
        cursor=cursor,
        lang=lang,
        client_id=client_id,
        project_id=project_id,
    )
    
    # Generate suggestions
    result = await suggestion_engine.suggest(suggest_request, rid)
    
    if not result.success:
        if result.error:
            raise HTTPException(status_code=400, detail=result.error)
        raise HTTPException(status_code=500, detail="Internal error")
    
    # Set response headers
    if response is not None:
        response.headers["X-Algorithm-Version"] = result.meta.get("algorithm_version", "unknown")
        response.headers["X-Layers-Used"] = ",".join(result.meta.get("layers_used", []))
        response.headers["X-Cache-Hit-Core"] = str(result.meta.get("cache_hits", {}).get("core", False)).lower()
        response.headers["X-Cache-Hit-Final"] = str(result.meta.get("cache_hits", {}).get("final", False)).lower()
    
    # Return in backwards-compatible format
    return {
        "success": result.success,
        "suggestions": result.suggestions,
        "meta": result.meta,
    }

