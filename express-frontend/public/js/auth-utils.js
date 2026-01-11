/**
 * Centralized Authentication Utilities
 * 
 * This file provides consistent authentication functions used across the application.
 * All login, signup, and logout flows should use these functions.
 */

/**
 * Clear all authentication tokens from storage
 */
function clearAuthTokens() {
  // Clear localStorage
  localStorage.removeItem('access_token');
  
  // Clear cookies - clear both refresh token cookie names for compatibility
  // Backend uses 'proof_refresh_token', but we also clear 'refresh_token' for safety
  const cookieOptions = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  document.cookie = `access_token=; ${cookieOptions}`;
  document.cookie = `refresh_token=; ${cookieOptions}`;
  document.cookie = `proof_refresh_token=; ${cookieOptions}`;
  
  console.log('[AUTH] All tokens cleared from storage');
}

/**
 * Store access token in both localStorage and cookie
 * @param {string} token - The access token to store
 */
function storeAccessToken(token) {
  if (!token) {
    console.warn('[AUTH] Attempted to store empty token');
    return;
  }
  
  // Clear old tokens first
  clearAuthTokens();
  
  // Store in localStorage
  localStorage.setItem('access_token', token);
  
  // Store in cookie (non-HTTP-only for client-side access)
  document.cookie = `access_token=${token}; path=/; SameSite=Lax; Max-Age=900`;
  
  console.log('[AUTH] Access token stored successfully');
}

/**
 * Handle successful login/registration
 * @param {string} accessToken - The access token from the API response
 * @param {string} redirectTo - Optional redirect path (defaults to /drafts)
 */
function handleAuthSuccess(accessToken, redirectTo = '/drafts') {
  if (accessToken) {
    storeAccessToken(accessToken);
  } else {
    console.warn('[AUTH] No access token in response');
  }
  
  // Redirect to specified page (default: drafts)
  console.log('[AUTH] Redirecting to:', redirectTo);
  window.location.href = redirectTo;
}

/**
 * Handle logout - clears tokens and redirects to home
 */
async function handleLogout() {
  try {
    // Call logout API to revoke refresh token on backend
    await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(err => {
      // Ignore network errors - still proceed with client-side cleanup
      console.warn('[AUTH] Logout API call failed (non-fatal):', err.message);
    });
  } catch (err) {
    // Ignore errors - still proceed with client-side cleanup
    console.warn('[AUTH] Logout error (non-fatal):', err.message);
  } finally {
    // Always clear tokens and redirect, even if API call fails
    clearAuthTokens();
    window.location.href = '/';
  }
}

/**
 * Check if user is authenticated (has valid token)
 * @returns {boolean}
 */
function isAuthenticated() {
  const token = localStorage.getItem('access_token');
  if (!token) return false;
  
  try {
    // Decode token to check expiration
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    
    const payload = JSON.parse(atob(base64));
    const now = Math.floor(Date.now() / 1000);
    const clockSkewBuffer = 300; // 5 minutes
    
    // Token is valid if not expired (with clock skew buffer)
    return payload.exp && payload.exp > (now - clockSkewBuffer);
  } catch (e) {
    return false;
  }
}

/**
 * Attempt to refresh the access token using the refresh token cookie
 * @returns {Promise<string|null>} New access token or null if refresh failed
 */
async function refreshAccessToken() {
  try {
    console.log('[AUTH] Attempting to refresh access token...');
    const response = await fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('[AUTH] Token refresh failed:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.access_token) {
      storeAccessToken(data.access_token);
      console.log('[AUTH] Token refreshed successfully');
      return data.access_token;
    }
    return null;
  } catch (error) {
    console.error('[AUTH] Error refreshing token:', error);
    return null;
  }
}

// Export functions to window for global access
window.authUtils = {
  clearAuthTokens,
  storeAccessToken,
  handleAuthSuccess,
  handleLogout,
  isAuthenticated,
  refreshAccessToken
};

