#!/bin/bash

# Tamil Words Extraction from Wikipedia - Production Script
# This script extracts Tamil words from the 24GB Wikipedia dump

set -e

DUMP_FILE="/Users/palkanirajendran/Downloads/enwiki-20260101-pages-articles-multistream.xml.bz2"
LOG_FILE="./extraction_$(date +%Y%m%d_%H%M%S).log"

echo "=========================================="
echo "Tamil Words Extraction from Wikipedia"
echo "=========================================="
echo "Dump file: $DUMP_FILE"
echo "Log file: $LOG_FILE"
echo "Started at: $(date)"
echo "=========================================="
echo ""

# Check if file exists
if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file not found: $DUMP_FILE"
    exit 1
fi

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "Warning: DATABASE_URL not set. Loading from .env..."
    if [ -f "../../.env" ]; then
        export $(cat ../../.env | grep -v '^#' | xargs)
    else
        echo "Error: DATABASE_URL not found. Please set it or create .env file."
        exit 1
    fi
fi

# Run extraction with optimal settings for 24GB file
echo "Starting extraction..."
echo "Settings: batch=5000, workers=8, min-freq=3"
echo ""

cd "$(dirname "$0")"

go run main.go \
  -file="$DUMP_FILE" \
  -batch=5000 \
  -workers=8 \
  -min-freq=3 \
  -progress=true \
  2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=========================================="
echo "Extraction completed at: $(date)"
echo "Exit code: $EXIT_CODE"
echo "Log saved to: $LOG_FILE"
echo "=========================================="

exit $EXIT_CODE
