"""
Tamil Handwriting OCR API - ProofTamil integration.
Extract handwritten Tamil text from images (notes, whiteboard, etc.).
"""

import os
import time
from pathlib import Path
from typing import List, Dict, Any
from contextlib import asynccontextmanager
import logging

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Optional: deep learning OCR engine (requires torch + model file)
try:
    from ocr_engine import get_ocr_engine
    OCR_AVAILABLE = get_ocr_engine is not None
except ImportError:
    get_ocr_engine = None
    OCR_AVAILABLE = False


# ==================== Configuration ====================

class Settings:
    APP_NAME: str = "Tamil Handwriting OCR"
    VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    MODEL_PATH: str = os.getenv("MODEL_PATH", "./models/tamil_ocr.pth")
    MAX_IMAGE_SIZE: int = 10 * 1024 * 1024
    ALLOWED_EXTENSIONS: set = {".png", ".jpg", ".jpeg", ".bmp", ".tiff"}

settings = Settings()


# ==================== Pydantic Models ====================

class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int

class WordResult(BaseModel):
    line_number: int
    word_index: int
    bounding_box: BoundingBox
    text: str
    confidence: float
    alternatives: List[Dict[str, Any]] = Field(default_factory=list)

class LineResult(BaseModel):
    line_number: int
    bounding_box: BoundingBox
    words: List[WordResult] = Field(default_factory=list)

class OCRResponse(BaseModel):
    success: bool
    message: str = ""
    lines_count: int = 0
    words_count: int = 0
    lines: List[LineResult] = Field(default_factory=list)
    words: List[WordResult] = Field(default_factory=list)
    full_text: str = ""
    processing_time_ms: float = 0.0


# ==================== Global State ====================

ocr_engine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ocr_engine
    logger.info("Starting Tamil Handwriting OCR API...")
    if OCR_AVAILABLE and get_ocr_engine:
        try:
            model_path = settings.MODEL_PATH if Path(settings.MODEL_PATH).exists() else None
            ocr_engine = get_ocr_engine(model_path)
            logger.info("OCR Engine initialized")
        except Exception as e:
            logger.warning("OCR engine not available: %s", e)
            ocr_engine = None
    else:
        logger.info("Running in preprocess+segment mode (no ML model)")
    yield
    logger.info("Shutting down...")


# ==================== FastAPI App ====================

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="API for extracting handwritten Tamil text from images",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Helper Functions ====================

def validate_image(file: UploadFile):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type")
    ext = Path(file.filename or "").suffix.lower()
    if ext and ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file extension")

async def read_image(file: UploadFile) -> np.ndarray:
    content = await file.read()
    if len(content) > settings.MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="File too large")
    nparr = np.frombuffer(content, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Failed to decode image")
    return image

def python_preprocess(image: np.ndarray) -> np.ndarray:
    """Preprocess image using Python/OpenCV"""
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    kernel_size = max(31, min(image.shape[:2]) // 20)
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
    normalized = cv2.divide(gray, background, scale=255)
    denoised = cv2.fastNlMeansDenoising(normalized, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    binary = cv2.adaptiveThreshold(
        enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        15, 10
    )
    return binary

def python_segment(binary: np.ndarray) -> Dict:
    """Segment lines and words using Python/OpenCV"""
    h_proj = np.sum(binary, axis=1)
    threshold = np.mean(h_proj[h_proj > 0]) * 0.1 if np.any(h_proj > 0) else 1
    lines = []
    in_line = False
    line_start = 0
    for i, val in enumerate(h_proj):
        if not in_line and val > threshold:
            in_line = True
            line_start = i
        elif in_line and val <= threshold:
            if i - line_start > 15:
                lines.append((line_start, i))
            in_line = False
    if in_line:
        lines.append((line_start, len(h_proj) - 1))
    result = {"lines": [], "words": []}
    for line_num, (y1, y2) in enumerate(lines):
        line_img = binary[y1:y2, :]
        v_proj = np.sum(line_img, axis=0)
        words = []
        in_word = False
        word_start = 0
        gap_count = 0
        min_gap = 6
        for x, val in enumerate(v_proj):
            if val > 0:
                if not in_word:
                    in_word = True
                    word_start = x
                gap_count = 0
            else:
                if in_word:
                    gap_count += 1
                    if gap_count >= min_gap:
                        word_end = x - gap_count
                        if word_end - word_start > 8:
                            words.append((word_start, word_end))
                        in_word = False
                        gap_count = 0
        if in_word:
            words.append((word_start, len(v_proj) - 1 - gap_count))
        result["lines"].append({
            "line_number": line_num,
            "bounding_box": {"x": 0, "y": y1, "width": binary.shape[1], "height": y2 - y1}
        })
        for word_idx, (x1, x2) in enumerate(words):
            word_img = binary[y1:y2, x1:x2]
            result["words"].append({
                "line_number": line_num,
                "word_index": word_idx,
                "bounding_box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
                "image": word_img
            })
    return result


# ==================== API Endpoints ====================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "ocr_available": ocr_engine is not None
    }

@app.post("/api/ocr/extract-words", response_model=OCRResponse)
async def extract_words(file: UploadFile = File(...)):
    """Extract and recognize handwritten Tamil words from an image"""
    start_time = time.time()
    validate_image(file)
    image = await read_image(file)
    logger.info("Processing image: %sx%s", image.shape[1], image.shape[0])
    binary = python_preprocess(image)
    seg_result = python_segment(binary)
    words_result = []
    lines_dict = {}
    for word_info in seg_result.get("words", []):
        word_img = word_info.pop("image", None)
        line_num = word_info.get("line_number", 0)
        word_idx = word_info.get("word_index", 0)
        bbox = word_info.get("bounding_box", {})
        text = ""
        confidence = 0.0
        alternatives = []
        if ocr_engine is not None and word_img is not None:
            try:
                result = ocr_engine.recognize(word_img)
                text = result.text
                confidence = result.confidence
                alternatives = [{"text": t, "confidence": c} for t, c in result.alternatives]
            except Exception as e:
                logger.warning("OCR failed for word: %s", e)
        word_result = WordResult(
            line_number=line_num,
            word_index=word_idx,
            bounding_box=BoundingBox(**bbox),
            text=text,
            confidence=confidence,
            alternatives=alternatives
        )
        words_result.append(word_result)
        if line_num not in lines_dict:
            lines_dict[line_num] = []
        lines_dict[line_num].append(word_result)
    lines_result = []
    for line_info in seg_result.get("lines", []):
        line_num = line_info.get("line_number", 0)
        bbox = line_info.get("bounding_box", {})
        lines_result.append(LineResult(
            line_number=line_num,
            bounding_box=BoundingBox(**bbox),
            words=sorted(lines_dict.get(line_num, []), key=lambda w: w.word_index)
        ))
    full_text_lines = []
    for line in sorted(lines_result, key=lambda l: l.line_number):
        line_text = " ".join(w.text for w in line.words if w.text)
        if line_text:
            full_text_lines.append(line_text)
    full_text = "\n".join(full_text_lines)
    processing_time = (time.time() - start_time) * 1000
    return OCRResponse(
        success=True,
        message="OCR completed successfully",
        lines_count=len(lines_result),
        words_count=len(words_result),
        lines=lines_result,
        words=words_result,
        full_text=full_text,
        processing_time_ms=round(processing_time, 2)
    )


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
