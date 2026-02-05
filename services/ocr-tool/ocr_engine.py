"""
OCR engine: use C++ native module (pybind11) when available, else pytesseract.
Import the compiled module in Python normally: import ocr_native
"""

try:
    import ocr_native
    _native_available = True
except ImportError:
    _native_available = False
    ocr_native = None


def run_ocr(image, lang="eng+tam"):
    """
    Run OCR on a PIL Image. Uses ocr_native (C++ Tesseract) if built, else pytesseract.

    Args:
        image: PIL.Image (RGB or L)
        lang: Tesseract language code, e.g. "eng+tam"

    Returns:
        Extracted text string.
    """
    if _native_available and ocr_native is not None:
        # Use C++ module: pass raw bytes and dimensions
        w, h = image.size[0], image.size[1]
        if image.mode == "L":
            data = image.tobytes()
            channels = 1
        elif image.mode in ("RGB", "RGBA"):
            if image.mode == "RGBA":
                image = image.convert("RGB")
            data = image.tobytes()
            channels = 3
        else:
            image = image.convert("RGB")
            data = image.tobytes()
            channels = 3
        return ocr_native.ocr_image(data, w, h, channels, lang)

    # Fallback: pytesseract (spawns tesseract process)
    import pytesseract
    return pytesseract.image_to_string(image, lang=lang)


def is_native():
    """Return True if the C++ native module is in use."""
    return _native_available
