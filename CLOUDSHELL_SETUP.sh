#!/bin/bash
# =============================================================================
# COPY-PASTE THIS ENTIRE BLOCK INTO GOOGLE CLOUD SHELL
# =============================================================================
# This will:
#   1. Clone your repo (if not already)
#   2. Run the complete IME architecture setup
#   3. Seed corpus + enable corpus + verify
# =============================================================================

set -e

echo "🚀 Starting Tamil IME Corpus Setup"
echo "===================================="
echo ""

# Navigate to home directory
cd ~

# Clone or update repo
if [ -d "tamil-proofreading-platform" ]; then
  echo "📦 Updating existing repo..."
  cd tamil-proofreading-platform
  git pull origin main
else
  echo "📦 Cloning repo..."
  git clone https://github.com/palkani/tamil-proofreading-platform.git
  cd tamil-proofreading-platform
fi

echo ""
echo "✅ Repo ready. Starting setup..."
echo ""

# Run the complete setup
./setup_complete_ime_architecture.sh

echo ""
echo "🎉 COMPLETE!"
echo "==========="
echo ""
echo "The corpus-based architecture is now active!"
echo ""
echo "Test in your app:"
echo "  - Type 'soru' → should get 'சோறு' from corpus_db"
echo "  - Type 'sapadu' → should get 'சாப்பாடு' from corpus_db"
echo "  - Type 'amma' → should get 'அம்மா' from corpus_db"
echo ""
echo "Check backend logs for 'suggest_corpus_hit' to confirm."
