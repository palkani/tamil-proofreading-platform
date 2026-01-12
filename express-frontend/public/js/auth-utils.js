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
  console.log('[AUTH] handleLogout called');
  
  // Always clear tokens first (client-side)
  console.log('[AUTH] Clearing client-side tokens immediately...');
  clearAuthTokens();
  
  // Try to call logout API (non-blocking - don't wait for it)
  console.log('[AUTH] Calling /auth/logout API (non-blocking)...');
  fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(response => {
    console.log('[AUTH] Logout API response status:', response.status);
  }).catch(err => {
    // Ignore network errors - tokens already cleared
    console.warn('[AUTH] Logout API call failed (non-fatal, tokens already cleared):', err.message);
  });
  
  // Redirect immediately (don't wait for API call)
  console.log('[AUTH] Redirecting to home page immediately');
  setTimeout(() => {
    window.location.href = '/';
  }, 100);
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

// Global flag to prevent multiple simultaneous refresh attempts
let globalRefreshInProgress = false;
let globalRefreshPromise = null;

/**
 * Attempt to refresh the access token using the refresh token cookie
 * @returns {Promise<string|null>} New access token or null if refresh failed
 */
async function refreshAccessToken(maxRetries = 2) {
  // If a refresh is already in progress, wait for it instead of starting a new one
  if (globalRefreshInProgress && globalRefreshPromise) {
    console.log('[AUTH] Refresh already in progress, waiting for existing refresh...');
    try {
      return await globalRefreshPromise;
    } catch (e) {
      console.warn('[AUTH] Existing refresh failed, will attempt new refresh');
      // Continue with new refresh attempt
    }
  }
  
  // Set global flag and create promise
  globalRefreshInProgress = true;
  globalRefreshPromise = (async () => {
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[AUTH] Retry attempt ${attempt} of ${maxRetries}...`);
            // Exponential backoff for retries, with longer delay for 429
            const delay = attempt === 1 ? 1000 : 2000 * attempt;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          console.log('[AUTH] Attempting to refresh access token...');
      
      // Check if refresh token cookie exists
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      const hasRefreshToken = cookies.proof_refresh_token || cookies.refresh_token;
      console.log('[AUTH] Refresh token cookie present:', hasRefreshToken ? 'Yes' : 'No');
      console.log('[AUTH] All cookies:', Object.keys(cookies));
      
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Important: sends cookies including proof_refresh_token
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[AUTH] Refresh response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || 'Unknown error' };
        }
        console.warn('[AUTH] Token refresh failed:', response.status, errorData);
        
        // If 401, the refresh token is invalid - clear all tokens to prevent loops
        if (response.status === 401) {
          console.warn('[AUTH] Refresh token is invalid, clearing all tokens');
          clearAuthTokens();
          // Don't retry on 401 - token is definitely invalid
          return null;
        }
        
        // If 429 (Too Many Requests), wait longer before retrying
        if (response.status === 429) {
          console.warn('[AUTH] Rate limited (429), waiting before retry...');
          // Wait longer for 429 - exponential backoff
          const waitTime = Math.min(5000 * Math.pow(2, attempt), 30000); // Max 30 seconds
          console.log(`[AUTH] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // If we have attempts left, retry
          if (attempt < maxRetries) {
            console.log(`[AUTH] Retrying refresh after rate limit (attempt ${attempt + 1}/${maxRetries})...`);
            continue;
          }
          
          // If all retries exhausted, return null but don't clear tokens
          // The rate limit might be temporary
          console.warn('[AUTH] Rate limit retries exhausted, returning null');
          return null;
        }
        
        // For other errors, retry if we have attempts left
        if (attempt < maxRetries) {
          console.log(`[AUTH] Retrying refresh (attempt ${attempt + 1}/${maxRetries})...`);
          continue;
        }
        
        return null;
      }

      const data = await response.json();
      if (data.access_token) {
        // Verify the token is not expired before storing
        try {
          const parts = data.access_token.split('.');
          if (parts.length === 3) {
            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const payload = JSON.parse(atob(base64));
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp <= now) {
              console.error('[AUTH] ❌ CRITICAL: Refreshed token is already expired!', {
                exp: payload.exp,
                now: now,
                diff: payload.exp - now
              });
              // Don't store expired token
              return null;
            }
          }
        } catch (e) {
          console.warn('[AUTH] Could not verify token expiration, storing anyway:', e);
        }
        
        storeAccessToken(data.access_token);
        console.log('[AUTH] Token refreshed successfully');
        return data.access_token;
      }
      console.warn('[AUTH] No access_token in refresh response:', data);
      
      // Retry if we have attempts left
      if (attempt < maxRetries) {
        continue;
      }
      return null;
    } catch (error) {
      console.error('[AUTH] Error refreshing token:', error);
      // On network error, retry if we have attempts left
      if (attempt < maxRetries) {
        console.log(`[AUTH] Network error, retrying (attempt ${attempt + 1}/${maxRetries})...`);
        continue;
      }
      // On final attempt failure, return null
      return null;
    }
  }
  
  // If we get here, all retries failed
  console.error('[AUTH] All refresh attempts failed');
  return null;
    } finally {
      // Always clear the global flag when done
      globalRefreshInProgress = false;
      globalRefreshPromise = null;
    }
  })();
  
  try {
    return await globalRefreshPromise;
  } catch (e) {
    console.error('[AUTH] Refresh promise rejected:', e);
    return null;
  }
}

/**
 * Centralized API fetch function with automatic token refresh
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {boolean} requireAuth - Whether authentication is required (default: true)
 * @returns {Promise<Response>}
 */
async function apiFetch(url, options = {}, requireAuth = true) {
  // Create a fresh headers object to avoid mutation issues
  const headers = new Headers(options.headers || {});
  
  // Get access token and add to headers if auth is required
  // CRITICAL: Always get token fresh from localStorage, don't cache it
  let accessToken = localStorage.getItem('access_token');
  
  // If token exists, verify it's not expired before using it
  if (accessToken && requireAuth) {
    // Check if token is expired BEFORE making the request
    const isExpired = (() => {
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) base64 += '=';
          const payload = JSON.parse(atob(base64));
          const now = Math.floor(Date.now() / 1000);
          const clockSkewBuffer = 60; // 1 minute buffer
          // Token is expired if: exp < now OR exp < (now + buffer) - expires soon
          return payload.exp && (payload.exp < now || payload.exp < (now + clockSkewBuffer));
        }
      } catch (e) {
        // If we can't decode, assume not expired and let server decide
        return false;
      }
      return false;
    })();
    
    if (isExpired) {
      console.log('[AUTH] Token is expired or expires soon, refreshing proactively...');
      // Refresh token BEFORE making the request
      const newToken = await refreshAccessToken();
      if (newToken) {
        accessToken = newToken;
        console.log('[AUTH] Token refreshed proactively, using new token');
      } else {
        console.warn('[AUTH] Proactive refresh failed, will try request anyway');
      }
    }
    
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }
  
  // Make initial request
  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  
  // Handle 401 with automatic token refresh
  if (requireAuth && response.status === 401) {
    console.warn('[AUTH] Got 401, attempting token refresh...');
    console.log('[AUTH] Current token exp:', accessToken ? (() => {
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) base64 += '=';
          const payload = JSON.parse(atob(base64));
          return payload.exp;
        }
      } catch (e) {}
      return 'unknown';
    })() : 'no token');
    
    // Try to refresh token
    const newToken = await refreshAccessToken();
    if (newToken) {
      console.log('[AUTH] Token refreshed, retrying request with new token');
      // CRITICAL: Create a NEW headers object with the new token
      // Don't reuse the old headers object as it may have stale values
      const newHeaders = new Headers(options.headers || {});
      newHeaders.set('Authorization', `Bearer ${newToken}`);
      
      // Verify the new token is actually different
      const oldTokenExp = accessToken ? (() => {
        try {
          const parts = accessToken.split('.');
          if (parts.length === 3) {
            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const payload = JSON.parse(atob(base64));
            return payload.exp;
          }
        } catch (e) {}
        return null;
      })() : null;
      
      const newTokenExp = (() => {
        try {
          const parts = newToken.split('.');
          if (parts.length === 3) {
            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const payload = JSON.parse(atob(base64));
            return payload.exp;
          }
        } catch (e) {}
        return null;
      })();
      
      console.log('[AUTH] Token comparison:', {
        oldExp: oldTokenExp,
        newExp: newTokenExp,
        tokensMatch: accessToken === newToken
      });
      
      // Retry with new token - use new headers object
      response = await fetch(url, {
        ...options,
        headers: newHeaders, // Use the NEW headers object
        credentials: 'include',
      });
      
      // If still 401 after refresh, clear tokens and redirect
      if (response.status === 401) {
        console.error('[AUTH] Still 401 after refresh, clearing tokens and redirecting');
        clearAuthTokens();
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
      
      console.log('[AUTH] Retry successful with new token, status:', response.status);
      return response;
    } else {
      // Refresh failed, clear tokens and redirect
      console.warn('[AUTH] Token refresh failed, redirecting to login');
      clearAuthTokens();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
  }
  
  return response;
}

// Export functions to window for global access
window.authUtils = {
  clearAuthTokens,
  storeAccessToken,
  handleAuthSuccess,
  handleLogout,
  isAuthenticated,
  refreshAccessToken,
  apiFetch
};

