# Clear Cache and Deploy to Production

## Quick Steps to Clear Cache and Deploy

### Option 1: Via GitHub Actions (Recommended)
1. Go to your GitHub repository
2. Navigate to **Actions** tab
3. Click on **"Deploy to Cloud Run"** workflow
4. Click **"Run workflow"** button
5. Select **main** branch
6. Click **"Run workflow"** to trigger a fresh deployment

### Option 2: Via Vercel CLI (Manual)

```bash
# Install Vercel CLI if not already installed
npm install -g vercel@latest

# Navigate to express-frontend directory
cd express-frontend

# Login to Vercel (if not already logged in)
vercel login

# Pull latest project settings
vercel pull --yes --environment=production --token=$VERCEL_TOKEN

# Deploy with force and no cache
vercel deploy --prod --yes --force --no-cache

# Clear Vercel cache (if available in your plan)
vercel cache clear
```

### Option 3: Via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **prooftamil** project
3. Go to **Deployments** tab
4. Click on the **three dots** (⋯) next to the latest deployment
5. Select **"Redeploy"**
6. Check **"Use existing Build Cache"** = **OFF** (unchecked)
7. Click **"Redeploy"**

### Option 4: Force Cache Clear via API

```bash
# Clear Vercel cache via API (requires Vercel token)
curl -X POST "https://api.vercel.com/v1/deployments/{deployment_id}/cache/clear" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

## Clear Browser Cache

After deployment, users should clear their browser cache:

### Chrome/Edge:
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select **"Cached images and files"**
3. Select **"All time"**
4. Click **"Clear data"**

### Firefox:
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select **"Cache"**
3. Select **"Everything"**
4. Click **"Clear Now"**

### Safari:
1. Press `Cmd+Option+E` to clear cache
2. Or go to **Safari > Preferences > Advanced > Show Develop menu**
3. Then **Develop > Empty Caches**

## Hard Refresh

Users can also do a hard refresh:
- **Windows/Linux**: `Ctrl+F5` or `Ctrl+Shift+R`
- **Mac**: `Cmd+Shift+R`

## Verify Deployment

After deployment, verify the changes:

1. Check the deployment URL: `https://www.prooftamil.com`
2. Open browser DevTools (F12)
3. Go to **Network** tab
4. Check **"Disable cache"** checkbox
5. Reload the page (F5)
6. Verify the changes are visible

## Cache-Busting for Static Assets

The updated `vercel.json` includes cache headers:
- **HTML pages**: No cache (must revalidate)
- **JavaScript files**: No cache (always fresh)
- **CSS files**: 1 hour cache
- **Images**: 24 hour cache

## Troubleshooting

If changes still don't appear:

1. **Check deployment logs** in Vercel dashboard
2. **Verify build completed** successfully
3. **Check if files were updated** in the deployment
4. **Try incognito/private browsing** mode
5. **Clear CDN cache** (if using Cloudflare or similar)

## Force Immediate Cache Invalidation

Add a version query parameter to force cache refresh:

```javascript
// In your HTML templates, add version to asset URLs
<link rel="stylesheet" href="/css/output.css?v=20260111">
<script src="/js/workspace.js?v=20260111"></script>
```

Or use a build timestamp:

```javascript
const BUILD_VERSION = Date.now();
<link rel="stylesheet" href="/css/output.css?v=${BUILD_VERSION}">
```

