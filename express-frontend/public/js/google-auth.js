// Google OAuth Authentication Handler
let googleClientId = null;

// Fallback client ID (must end with .apps.googleusercontent.com; never use a domain like prooftamil.com)
var FALLBACK_GOOGLE_CLIENT_ID = '991187041222-dp582s8kvqqktpq3t0bihl43e4iv8m5i.apps.googleusercontent.com';

// Initialize Google Auth (single, browser-safe source: window.GOOGLE_CLIENT_ID)
async function initializeGoogleAuth() {
  try {
    var raw = typeof window !== 'undefined' ? (window.GOOGLE_CLIENT_ID || '') : '';
    // Never use a domain as client_id; use fallback if invalid
    googleClientId = (raw && raw.indexOf('.apps.googleusercontent.com') !== -1) ? raw : FALLBACK_GOOGLE_CLIENT_ID;

    // Debug (non-secret): log only presence
    console.log('[GOOGLE-AUTH] Client ID present:', !!googleClientId);

    if (!googleClientId) {
      googleClientId = FALLBACK_GOOGLE_CLIENT_ID;
      console.warn('[GOOGLE-AUTH] Using fallback client ID');
    }
  } catch (error) {
    console.error('Failed to initialize Google Auth:', error);
    googleClientId = FALLBACK_GOOGLE_CLIENT_ID;
  }
}

// Trigger Google Sign-In using redirect flow
function triggerGoogleSignIn() {
  if (!googleClientId) {
    console.warn('Google Client ID not available; cannot start OAuth redirect.');
    return;
  }
  
  try {
    // CRITICAL: Always initiate OAuth from the frontend domain.
    // This ensures cookies/redirects stay consistent and we land on /drafts after callback.
    // The backend callback is still used, but the OAuth initiation begins at /auth/google.
    const frontendOauthStartUrl = '/auth/google';

    console.log('[GOOGLE-AUTH] Starting OAuth via frontend route:', frontendOauthStartUrl);
    console.log('[GOOGLE-AUTH] Hostname:', window.location.hostname);
    console.log('[GOOGLE-AUTH] Client ID present:', !!googleClientId);

    window.location.href = frontendOauthStartUrl;
    
  } catch (error) {
    console.error('Error triggering Google Sign-In:', error);
    alert('Error initiating Google Sign-In. Please try again.');
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGoogleAuth);
} else {
  initializeGoogleAuth();
}

// Export: Supabase script uses triggerGoogleSignInLegacy when Supabase is not configured
window.triggerGoogleSignIn = triggerGoogleSignIn;
window.triggerGoogleSignInLegacy = triggerGoogleSignIn;
