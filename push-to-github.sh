#!/bin/bash

# Script to push Tamil Proofreading Platform to GitHub

echo "🚀 Pushing Tamil AI Proofreading Platform to GitHub..."
echo ""

# Check if remote already exists
if git remote get-url origin > /dev/null 2>&1; then
    echo "✓ Remote 'origin' already exists"
    git remote -v
else
    echo "📝 Please provide your GitHub repository URL:"
    echo "   Example: https://github.com/yourusername/tamil-proofreading-platform.git"
    read -p "GitHub repository URL: " REPO_URL
    
    if [ -z "$REPO_URL" ]; then
        echo "❌ No repository URL provided. Exiting."
        exit 1
    fi
    
    git remote add origin "$REPO_URL"
    echo "✓ Remote 'origin' added"
fi

echo ""
echo "📤 Pushing to GitHub..."

# Push to GitHub
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🌐 Your repository is now available on GitHub"
else
    echo ""
    echo "❌ Failed to push to GitHub"
    echo "💡 Make sure you have:"
    echo "   1. Created a repository on GitHub"
    echo "   2. Authenticated with GitHub (using GitHub CLI, SSH keys, or personal access token)"
    echo "   3. Provided the correct repository URL"
fi

