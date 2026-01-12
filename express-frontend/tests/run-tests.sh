#!/bin/bash

# ProofTamil Tools Test Runner
# This script sets up test files and runs all tests

set -e

echo "🧪 ProofTamil Tools Test Suite"
echo "================================"
echo ""

# Change to express-frontend directory
cd "$(dirname "$0")/.."

# Create test files
echo "📁 Creating test files..."
node tests/create-test-files.js
echo ""

# Run tests
echo "🚀 Running tests..."
echo ""
node tests/tools-test.js

# Exit with test result
exit $?

