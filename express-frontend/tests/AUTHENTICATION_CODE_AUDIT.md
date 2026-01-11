# Authentication Code Audit Report

## Date: 2025-01-11

## Issues Found

### 🔴 CRITICAL ISSUES

#### 1. Refresh Token Cookie Name Inconsistency
**Severity**: HIGH
**Location**: Multiple files
**Issue**: 
- Backend uses `proof_refresh_token` as cookie name
- Client-side code clears `refresh_token` (incorrect name)
- This causes refresh tokens to persist after logout

**Files Affected**:
- `express-frontend/public/js/auth-utils.js` - Line 17
- `express-frontend/views/pages/drafts.ejs` - Line 124
- `express-frontend/views/partials/nav.ejs` - Line 76
- `express-frontend/views/pages/login.ejs` - Lines 287, 299
- `express-frontend/public/js/workspace.js` - Line 3205

**Fix Required**: Clear both `proof_refresh_token` and `refresh_token` for backward compatibility

---

#### 2. Missing Token Refresh on 401 Errors
**Severity**: MEDIUM
**Location**: Multiple `apiFetch` functions
**Issue**: 
- Some `apiFetch` implementations don't attempt token refresh on 401
- This causes unnecessary redirects to login

**Files Affected**:
- `express-frontend/public/js/editor.js` - No refresh attempt
- `express-frontend/public/js/dashboard.js` - No refresh attempt
- `express-frontend/public/js/archive.js` - No refresh attempt

**Fix Required**: Add token refresh logic to all `apiFetch` functions

---

#### 3. Inconsistent Token Expiration Checks
**Severity**: MEDIUM
**Location**: Multiple files
**Issue**: 
- Some files check token expiration, some don't
- Clock skew buffer values differ (300s vs 1 minute)

**Files Affected**:
- `express-frontend/public/js/home-editor.js` - Checks expiration
- `express-frontend/public/js/editor.js` - No expiration check
- `express-frontend/public/js/dashboard.js` - No expiration check
- `express-frontend/public/js/archive.js` - No expiration check

**Fix Required**: Standardize expiration checks using `authUtils.isAuthenticated()`

---

### 🟡 MEDIUM ISSUES

#### 4. Hardcoded Cookie Names
**Severity**: LOW
**Location**: Multiple files
**Issue**: Cookie names are hardcoded throughout the codebase

**Fix Required**: Create constants for cookie names

---

#### 5. Inconsistent Error Handling
**Severity**: LOW
**Location**: Multiple files
**Issue**: 
- Some files use `authUtils`, some have fallback code
- Error messages differ

**Fix Required**: Standardize error handling

---

## Files Audited

### Core Authentication Files ✅
- `express-frontend/public/js/auth-utils.js` - ✅ Good (needs refresh token fix)
- `express-frontend/middleware/auth.js` - ✅ Good
- `express-frontend/routes/auth.js` - ✅ Good
- `express-frontend/routes/index.js` - ✅ Good

### Login/Signup Files ✅
- `express-frontend/views/pages/login.ejs` - ⚠️ Needs refresh token fix
- `express-frontend/public/js/register.js` - ✅ Good
- `express-frontend/public/js/google-auth.js` - ✅ Good
- `express-frontend/public/js/oauth-callback.js` - ✅ Good

### Logout Files ⚠️
- `express-frontend/views/partials/nav.ejs` - ⚠️ Needs refresh token fix
- `express-frontend/public/js/workspace.js` - ⚠️ Needs refresh token fix

### API Fetch Functions ⚠️
- `express-frontend/public/js/editor.js` - ⚠️ No refresh logic
- `express-frontend/public/js/dashboard.js` - ⚠️ No refresh logic
- `express-frontend/public/js/archive.js` - ⚠️ No refresh logic
- `express-frontend/public/js/home-editor.js` - ⚠️ Has expiration check but no refresh
- `express-frontend/views/pages/analytics.ejs` - ⚠️ Has expiration check but no refresh

### Other Files ✅
- `express-frontend/views/pages/drafts.ejs` - ⚠️ Needs refresh token fix
- `express-frontend/routes/api.js` - ✅ Good
- `express-frontend/routes/workspace.js` - ✅ Good

---

## Recommended Fixes

### Priority 1: Fix Refresh Token Cookie Clearing
Update `auth-utils.js` and all places that clear tokens to clear both cookie names.

### Priority 2: Add Token Refresh to apiFetch Functions
Standardize all `apiFetch` functions to attempt token refresh on 401.

### Priority 3: Standardize Token Expiration Checks
Use `authUtils.isAuthenticated()` consistently.

### Priority 4: Create Constants for Cookie Names
Extract hardcoded cookie names to constants.

---

## Test Checklist

After fixes:
- [ ] Logout clears both `proof_refresh_token` and `refresh_token` cookies
- [ ] All `apiFetch` functions attempt token refresh on 401
- [ ] Token expiration checks are consistent
- [ ] No hardcoded cookie names remain
- [ ] Error handling is consistent

