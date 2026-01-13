#!/bin/bash
# Git commit and push commands for recent fixes

cd /Users/palkanirajendran/Documents/Palkani/SAAS_IDEAS/tamil-proofreading-platform

echo "Staging all changes..."
git add -A

echo "Checking status..."
git status --short

echo "Committing changes..."
git commit -m "Fix: logout confirmation appearing incorrectly and improve logout/My Drafts handlers

- Fixed logout confirmation dialog appearing when clicking My Drafts or during login
- Made document-level click listener more strict to only trigger on actual logout button clicks
- Improved logout button handler to check button ID before processing
- Enhanced My Drafts link handler for reliable navigation
- Fixed syntax error in workspace.js (extra closing brace at line 2028)
- Unified logout handlers to use centralized performLogout function
- Made logout more robust with immediate token clearing and redirect"

echo "Pushing to remote..."
git push origin main

echo "Done!"

