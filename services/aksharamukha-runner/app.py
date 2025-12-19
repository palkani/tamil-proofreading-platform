import logging
import time
import uuid
from typing import Optional

from fastapi import FastAPI, Header
from pydantic import BaseModel, Field

try:
    from aksharamukha.transliterate import process
except ImportError:
    process = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI(title="Aksharamukha Runner", version="0.1.0")


class TransliterateRequest(BaseModel):
    text: str = Field(..., max_length=50)
    mode: Optional[str] = "spoken"


class TransliterateResponse(BaseModel):
    success: bool = True
    input: str
    output: str
    variants: Optional[list[str]] = None
    request_id: str


def make_request_id(x_request_id: Optional[str]) -> str:
    return x_request_id or str(uuid.uuid4())


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/transliterate", response_model=TransliterateResponse)
async def transliterate(req: TransliterateRequest, x_request_id: Optional[str] = Header(default=None)):
    rid = make_request_id(x_request_id)
    started = time.time()
    text = (req.text or "").strip()
    if not text or len(text) > 50:
        logging.warning("[AKSHARA] rid=%s invalid input len=%s", rid, len(text))
        return TransliterateResponse(success=True, input=req.text, output="", variants=[], request_id=rid)

    if process is None:
        logging.error("[AKSHARA] rid=%s aksharamukha not installed", rid)
        return TransliterateResponse(success=True, input=req.text, output="", variants=[], request_id=rid)

    try:
        # Using ISO (roman) to Tamil
        output = process("ISO", "Tamil", text)
        variants = []
        logging.info("[AKSHARA] rid=%s ok elapsed_ms=%.2f output_len=%d", rid, (time.time() - started) * 1000, len(output))
        return TransliterateResponse(success=True, input=req.text, output=output, variants=variants, request_id=rid)
    except Exception as e:
        logging.exception("[AKSHARA] rid=%s transliterate error: %s", rid, e)
        return TransliterateResponse(success=True, input=req.text, output="", variants=[], request_id=rid)

