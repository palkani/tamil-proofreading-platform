#!/bin/bash

# Tamil Words Import Helper Script
# Usage: ./import.sh /path/to/dump.sql [format] [batch-size]

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <dump-file> [format] [batch-size]"
    echo ""
    echo "Examples:"
    echo "  $0 /path/to/dump.sql sql 2000"
    echo "  $0 /path/to/words.csv csv 1000"
    echo "  $0 /path/to/words.jsonl.gz jsonl 1500"
    echo ""
    echo "Formats: auto, sql, csv, json, jsonl, txt"
    exit 1
fi

DUMP_FILE="$1"
FORMAT="${2:-auto}"
BATCH_SIZE="${3:-2000}"

if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: File not found: $DUMP_FILE"
    exit 1
fi

echo "=========================================="
echo "Tamil Words Import Tool"
echo "=========================================="
echo "File: $DUMP_FILE"
echo "Format: $FORMAT"
echo "Batch Size: $BATCH_SIZE"
echo "=========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Warning: DATABASE_URL not set. Loading from .env..."
    if [ -f "../../.env" ]; then
        export $(cat ../../.env | grep -v '^#' | xargs)
    else
        echo "Error: DATABASE_URL not found. Please set it or create .env file."
        exit 1
    fi
fi

# Run the import
cd "$(dirname "$0")"
go run main.go \
    -file="$DUMP_FILE" \
    -format="$FORMAT" \
    -batch="$BATCH_SIZE" \
    -workers=4 \
    -source="dump_import_$(date +%Y%m%d)" \
    -skip-existing=true \
    -progress=true

echo ""
echo "Import completed!"
