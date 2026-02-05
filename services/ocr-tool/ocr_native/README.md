# Native OCR module (C++ / pybind11)

The heavy OCR work runs in C++ using Tesseract’s C++ API and is exposed to Python via pybind11. Python imports the compiled module normally: `import ocr_native`.

## Build (local)

**Requirements:** CMake 3.14+, C++14 compiler, Tesseract dev libraries, pybind11, Python dev headers.

- **Ubuntu/Debian:**  
  `sudo apt install build-essential cmake pkg-config libtesseract-dev python3-dev`  
  `pip install pybind11`

- **macOS:**  
  `brew install tesseract cmake`  
  `pip install pybind11`

Then:

```bash
cd services/ocr-tool/ocr_native
./build.sh
```

The script creates `build/`, runs CMake, builds the extension, and copies the `.so` (or `.pyd`) into `services/ocr-tool/` so that from `services/ocr-tool/` you can run:

```python
import ocr_native
text = ocr_native.ocr_image(image_bytes, width, height, channels, "eng+tam")
```

## Usage from Python

The app uses `ocr_engine.py`, which tries `import ocr_native` and, if it succeeds, uses `ocr_native.ocr_image(...)` for OCR. If the native module is not built, it falls back to `pytesseract.image_to_string(...)`.

You can also use the module directly:

```python
import ocr_native
from PIL import Image
img = Image.open("page.png")
# Grayscale
data = img.convert("L").tobytes()
w, h = img.size
text = ocr_native.ocr_image(data, w, h, 1, "eng+tam")
# Or RGB (converted to grayscale inside C++)
img_rgb = img.convert("RGB")
text = ocr_native.ocr_image(img_rgb.tobytes(), w, h, 3, "eng+tam")
```

## Docker

The image installs build deps, runs `ocr_native/build.sh`, and copies the built `.so` into the app directory so the web app uses the native module when available.
