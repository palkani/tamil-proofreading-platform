# Authentication Flow Audit Report

## Overview
This document provides a comprehensive audit of all login, signup, and logout flows across the application to ensure they work seamlessly.

## Centralized Authentication Utilities

### File: `express-frontend/public/js/auth-utils.js`
**Purpose**: Centralized authentication functions used across the entire application.

**Functions**:
1. `clearAuthTokens()` - Clears all tokens from localStorage and cookies
2. `storeAccessToken(token)` - Stores access token in both localStorage and cookie
3. `handleAuthSuccess(accessToken, redirectTo)` - Handles successful login/registration
4. `handleLogout()` - Handles logout (calls API, clears tokens, redirects)
5. `isAuthenticated()` - Checks if user has valid token

**Loaded in**: `express-frontend/views/partials/header.ejs` (available globally)

## Login Flow

### Entry Points:
1. **Navigation Bar** (`nav.ejs`): "Sign In" link → `/login`
2. **Home Page**: "Sign In" button → `/login`
3. **Direct URL**: `/login`

### Login Methods:

#### 1. Email/Password Login
- **Form**: `express-frontend/views/pages/login.ejs`
- **API Endpoint**: `/auth/login` (proxied to backend via `routes/auth.js`)
- **Success Flow**:
  1. User submits email/password
  2. API returns `access_token`
  3. Token stored via `authUtils.storeAccessToken()`
  4. Redirect to `/drafts`

#### 2. Google OAuth Login
- **Button**: "Sign in with Google" in login page
- **Handler**: `express-frontend/public/js/google-auth.js`
- **Flow**:
  1. User clicks button → redirects to Google OAuth
  2. Google redirects to `/api/v1/auth/google/callback`
  3. Backend processes OAuth → returns token
  4. Frontend proxy redirects to `/drafts?access_token=...`
  5. Token extracted from URL and stored
  6. Redirect to `/drafts` (token removed from URL)

### Token Storage:
- **localStorage**: `access_token` (for client-side API calls)
- **Cookie**: `access_token` (non-HTTP-only, for server-side auth)
- **Cookie**: `refresh_token` (HTTP-only, set by backend)

### Redirect After Login:
- **All login methods** → `/drafts` (consistent)

## Signup/Registration Flow

### Entry Points:
1. **Navigation Bar** (`nav.ejs`): "Sign Up" link → `/register`
2. **Login Page**: "Sign up for free" link → `/register`
3. **Direct URL**: `/register`

### Registration Process:
- **Form**: `express-frontend/views/pages/register.ejs`
- **API Endpoint**: `/auth/register` (proxied to backend via `routes/auth.js`)
- **Success Flow**:
  1. User submits name, email, password
  2. API returns `access_token` (user is immediately logged in)
  3. Token stored via `authUtils.storeAccessToken()`
  4. Redirect to `/drafts`

### Redirect After Signup:
- **Registration** → `/drafts` (consistent)

## Logout Flow

### Entry Points:
1. **Navigation Bar** (`nav.ejs`): Logout button (icon)
2. **Workspace Page** (`workspace.js`): Logout button

### Logout Process:
1. User clicks logout button
2. Confirmation dialog appears
3. If confirmed:
   - Calls `/auth/logout` API (revokes refresh token on backend)
   - Clears tokens via `authUtils.clearAuthTokens()`
   - Redirects to `/` (home page)

### Token Clearing:
- **localStorage**: `access_token` removed
- **Cookies**: `access_token` and `refresh_token` cleared

## Authentication State Management

### Server-Side (`attachUser` middleware):
- Checks for token in:
  1. `Authorization: Bearer <token>` header
  2. `access_token` cookie
- If token expired but refresh token exists → allows request through
- Sets `req.user` for authenticated users

### Client-Side:
- Checks `localStorage.getItem('access_token')`
- Validates token expiration before API calls
- Automatically refreshes token on 401 errors

## Redirect Consistency

### After Login/Signup:
- ✅ All flows redirect to `/drafts`

### After Logout:
- ✅ All flows redirect to `/` (home page)

### Already Authenticated:
- ✅ Visiting `/login` → redirects to `/drafts`
- ✅ Visiting `/register` → redirects to `/drafts`

## Token Refresh Flow

### Automatic Refresh:
- When API call returns 401
- Client calls `/auth/refresh` (uses refresh token cookie)
- New access token stored
- Original request retried

### Manual Refresh:
- Available via `authUtils` (if needed)

## Files Modified

### Core Authentication Files:
1. ✅ `express-frontend/public/js/auth-utils.js` - NEW (centralized utilities)
2. ✅ `express-frontend/views/partials/header.ejs` - Loads auth-utils.js
3. ✅ `express-frontend/middleware/auth.js` - Updated to allow expired tokens if refresh token exists
4. ✅ `express-frontend/routes/auth.js` - Proxies auth endpoints to backend
5. ✅ `express-frontend/routes/index.js` - Removed blocking POST handlers

### Login Files:
1. ✅ `express-frontend/views/pages/login.ejs` - Uses auth-utils, redirects to /drafts
2. ✅ `express-frontend/public/js/google-auth.js` - OAuth handler

### Registration Files:
1. ✅ `express-frontend/views/pages/register.ejs` - Registration form
2. ✅ `express-frontend/public/js/register.js` - Uses auth-utils, redirects to /drafts

### Logout Files:
1. ✅ `express-frontend/views/partials/nav.ejs` - Logout button uses auth-utils
2. ✅ `express-frontend/public/js/workspace.js` - Logout function uses auth-utils

### Other Files:
1. ✅ `express-frontend/views/pages/drafts.ejs` - Uses auth-utils for token handling
2. ✅ `express-frontend/public/js/oauth-callback.js` - Uses auth-utils
3. ✅ `express-frontend/routes/index.js` - POST /logout handler

## Test Checklist

### Login Tests:
- [ ] Email/password login works
- [ ] Google OAuth login works
- [ ] Both redirect to `/drafts`
- [ ] Token is stored correctly
- [ ] Invalid credentials show error (no redirect)

### Signup Tests:
- [ ] Registration form works
- [ ] Redirects to `/drafts` after signup
- [ ] Token is stored correctly
- [ ] User is immediately logged in

### Logout Tests:
- [ ] Logout button in nav works
- [ ] Logout button in workspace works
- [ ] Tokens are cleared
- [ ] Redirects to home page
- [ ] User cannot access protected pages after logout

### Token Refresh Tests:
- [ ] Expired token triggers refresh
- [ ] Refresh token is used correctly
- [ ] New token is stored
- [ ] Original request is retried

### Edge Cases:
- [ ] Already authenticated user visiting /login → redirects to /drafts
- [ ] Already authenticated user visiting /register → redirects to /drafts
- [ ] Expired token with refresh token → allows access
- [ ] Expired token without refresh token → redirects to login

## Known Issues Fixed

1. ✅ **Inconsistent logout** - Now uses centralized `handleLogout()`
2. ✅ **Missing refresh token clearing** - Now clears both access and refresh tokens
3. ✅ **Inconsistent redirects** - All login/signup redirect to `/drafts`
4. ✅ **Token storage inconsistency** - All use `authUtils.storeAccessToken()`
5. ✅ **Redirect loop on expired token** - Fixed by allowing expired tokens if refresh token exists

## API Endpoints

### Authentication Endpoints (via `/auth` route):
- `POST /auth/login` - Email/password login
- `POST /auth/register` - User registration
- `POST /auth/logout` - Logout (revokes refresh token)
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user

All endpoints are proxied to backend via `express-frontend/routes/auth.js`.

## Security Considerations

1. ✅ Tokens cleared on logout
2. ✅ Refresh tokens revoked on backend
3. ✅ Expired tokens handled gracefully
4. ✅ Token expiration checked before API calls
5. ✅ Tokens removed from URL after extraction

## Next Steps

1. Test all flows manually before production deployment
2. Monitor logs for any authentication errors
3. Verify token refresh works correctly
4. Ensure all redirects are consistent

