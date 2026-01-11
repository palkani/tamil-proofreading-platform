#!/bin/bash

# Script to clear cache and deploy to Vercel production

set -e

echo "🚀 Starting Vercel deployment with cache clearing..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel@latest
fi

# Navigate to express-frontend directory
cd express-frontend

# Check if Vercel token is set
if [ -z "$VERCEL_TOKEN" ]; then
    echo "❌ Error: VERCEL_TOKEN environment variable is not set"
    echo "Please set it with: export VERCEL_TOKEN=your_token"
    exit 1
fi

echo "📥 Pulling latest project settings..."
vercel pull --yes --environment=production --token=$VERCEL_TOKEN

echo "🗑️  Deploying with cache clearing..."
vercel deploy --prod --token=$VERCEL_TOKEN --yes --force --no-cache

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Clear your browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)"
echo "2. Do a hard refresh (Ctrl+F5 or Cmd+Shift+R)"
echo "3. Or use incognito/private browsing mode to verify changes"
echo ""
echo "🌐 Your site should be live at: https://www.prooftamil.com"

