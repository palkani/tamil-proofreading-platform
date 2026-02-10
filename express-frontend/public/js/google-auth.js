// Google OAuth Authentication Handler
let googleClientId = null;

// Initialize Google Auth (single, browser-safe source: window.GOOGLE_CLIENT_ID)
async function initializeGoogleAuth() {
  try {
    googleClientId = typeof window !== 'undefined' ? window.GOOGLE_CLIENT_ID || '' : '';

    // Debug (non-secret): log only presence
    console.log('[GOOGLE-AUTH] Client ID present:', !!googleClientId);

    // If missing, warn but do not block rendering or throw
    if (!googleClientId) {
      console.warn('[GOOGLE-AUTH] Client ID not provided via window.GOOGLE_CLIENT_ID');
    }
  } catch (error) {
    console.error('Failed to initialize Google Auth:', error);
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
