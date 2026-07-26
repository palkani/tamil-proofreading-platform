"""
Tamil Handwriting OCR API — ProofTamil (Gemini vision pipeline).

Pipeline (plan §2):
  image → preprocess → segment lines → 2-pass Gemini OCR → Tamil correction
        → confidence flagging → { text, flagged_words, confidence_pct }

Modes:
  accurate (default) — full pipeline, 2 OCR passes + correction (Gemini Pro)
  fast               — single pass, no correction (cheaper), or Tesseract if no key

The route path (/api/ocr/extract-words) is unchanged so the existing Express proxy
keeps working; the response now also carries flagged_words + confidence_pct.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import preprocessing
import segmentation
import ocr_engine
import postprocess
import confidence
import data_logger

logger = logging.getLogger(__name__)

# Optional legacy Tesseract fallback (fast/offline mode when no Gemini key).
try:
    import cv2
    import numpy as np
    import pytesseract
    from PIL import Image
    _TESSERACT = True
except Exception:
    _TESSERACT = False


class Settings:
    APP_NAME = "Tamil Handwriting OCR"
    VERSION = "2.0.0"
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    MAX_IMAGE_SIZE = 10 * 1024 * 1024
    ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"}


settings = Settings()

app = FastAPI(title=settings.APP_NAME, version=settings.VERSION,
              description="Handwritten Tamil → text (Gemini vision pipeline)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── models ───────────────────────────────────────────────────────────────────

class FlaggedWord(BaseModel):
    word: str
    line: int
    reason: str


class OCRResponse(BaseModel):
    success: bool
    engine: str
    mode: str
    full_text: str = ""          # kept for the existing Express integration
    text: str = ""               # same value, the plan's field name
    flagged_words: List[FlaggedWord] = []
    confidence_pct: Optional[float] = None
    lines_count: int = 0
    request_id: Optional[str] = None
    processing_time_ms: float = 0.0
    message: str = ""


class CorrectionIn(BaseModel):
    request_id: str
    corrected_text: str


# ── helpers ──────────────────────────────────────────────────────────────────

def _validate(file: UploadFile) -> None:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type")
    ext = Path(file.filename or "").suffix.lower()
    if ext and ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image extension")


def _gemini_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def _tesseract_full(image_bytes: bytes) -> str:
    """Fast/offline fallback: Tesseract Tamil on the whole (preprocessed) image."""
    if not _TESSERACT:
        return ""
    try:
        pil = preprocessing.preprocess(image_bytes)
        return (pytesseract.image_to_string(pil, lang="tam") or "").strip()
    except Exception as e:
        logger.warning("tesseract fallback failed: %s", e)
        return ""


def run_pipeline(image_bytes: bytes, context_hint: str, fast: bool) -> Dict:
    """The full OCR pipeline. Returns a dict matching OCRResponse fields."""
    # No key, or explicitly fast with no key → Tesseract (best effort).
    if not _gemini_available():
        text = _tesseract_full(image_bytes)
        return {
            "engine": "tesseract", "mode": "fast",
            "full_text": text, "text": text,
            "flagged_words": [], "confidence_pct": None,
            "lines_count": len(text.split("\n")) if text else 0,
            "request_id": None,
            "message": "GEMINI_API_KEY not set — used Tesseract fallback",
        }

    pil = preprocessing.preprocess(image_bytes, debug=settings.DEBUG)
    segments = segmentation.segment_lines(pil)
    line_images = [s.image for s in segments]

    if fast:
        # Single pass, no correction — cheaper, still Gemini-quality per line.
        lines = [ocr_engine.transcribe(img, context_hint) for img in line_images]
        text = "\n".join(l for l in lines).strip()
        rid = data_logger.log_request(line_images, text, context_hint, extra={"mode": "fast"})
        return {
            "engine": ocr_engine.MODEL, "mode": "fast",
            "full_text": text, "text": text,
            "flagged_words": [], "confidence_pct": None,
            "lines_count": len(segments), "request_id": rid, "message": "",
        }

    # Accurate: two passes → correction → confidence.
    passes = ocr_engine.transcribe_document(line_images, context_hint)
    raw_text = "\n".join(passes["pass_a"]).strip()
    corrected, _diff = postprocess.correct_tamil(raw_text, context_hint)
    scored = confidence.score(passes["pass_a"], passes["pass_b"], corrected)
    rid = data_logger.log_request(line_images, scored["text"], context_hint, extra={"mode": "accurate"})
    return {
        "engine": ocr_engine.MODEL, "mode": "accurate",
        "full_text": scored["text"], "text": scored["text"],
        "flagged_words": scored["flagged_words"],
        "confidence_pct": scored["confidence_pct"],
        "lines_count": len(segments), "request_id": rid, "message": "",
    }


# ── routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "gemini": _gemini_available(),
        "gemini_model": ocr_engine.MODEL,
        "tesseract_fallback": _TESSERACT,
        "data_logging": data_logger.enabled(),
    }


@app.post("/api/ocr/extract-words", response_model=OCRResponse)
async def extract_words(
    file: UploadFile = File(...),
    context: str = Form(""),
    mode: str = Form("accurate"),
):
    start = time.time()
    _validate(file)
    content = await file.read()
    if len(content) > settings.MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    try:
        result = run_pipeline(content, context.strip(), fast=(mode.lower() == "fast"))
    except Exception as e:
        logger.exception("pipeline failed")
        raise HTTPException(status_code=502, detail="OCR pipeline error") from e

    result["success"] = True
    result["processing_time_ms"] = round((time.time() - start) * 1000, 2)
    return result


@app.post("/api/ocr/log-correction")
async def log_correction(body: CorrectionIn):
    """Store a human-verified transcription against a prior request — the ground
    truth that grows the fine-tuning dataset (only when DATA_LOGGING=true)."""
    saved = data_logger.log_correction(body.request_id, body.corrected_text)
    return {"success": True, "saved": saved}


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
