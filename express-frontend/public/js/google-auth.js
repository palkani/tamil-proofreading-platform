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
    // CRITICAL: Always use prooftamil.com in production/Cloud Run
    // Even if browser shows internal domain due to proxy, redirect_uri must match Google OAuth config
    const isCloudRun = window.location.hostname.includes('run.app');
    const isProduction = window.location.hostname.includes('prooftamil.com');
    
    // Redirect directly to backend Cloud Run auth endpoint (no proxy)
    const backendAuthUrl = 'https://prooftamil-backend-991187041222.asia-south1.run.app/api/v1/auth/google';
    
    console.log('[GOOGLE-AUTH] Production Mode:', isProduction);
    console.log('[GOOGLE-AUTH] Cloud Run:', isCloudRun);
    console.log('[GOOGLE-AUTH] Hostname:', window.location.hostname);
    console.log('[GOOGLE-AUTH] Backend Auth URL:', backendAuthUrl);
    console.log('[GOOGLE-AUTH] Client ID:', googleClientId.substring(0, 20) + '...');

    // Hand off to backend which owns the full OAuth flow
    window.location.href = backendAuthUrl;
    
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

// Export global function
window.triggerGoogleSignIn = triggerGoogleSignIn;
