#!/bin/bash
# Build ocr_native extension: C++ Tesseract + pybind11
set -e
cd "$(dirname "$0")"
mkdir -p build
cd build
cmake ..
cmake --build .
# Copy built .so to ocr-tool/ (parent of ocr_native/) so "import ocr_native" works
DEST="$(dirname "$(dirname "$(pwd)")")"
for f in ocr_native*.so libocr_native*.so; do
  [ -f "$f" ] && cp -f "$f" "$DEST/" && echo "Copied $f to $DEST/"
done
echo "Done. Import with: import ocr_native"
