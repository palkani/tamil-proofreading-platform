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
    
    // Always use the single allowed redirect URI to avoid mismatches
    const redirectUri = 'https://prooftamil.com/api/v1/auth/google/callback';
    
    console.log('[GOOGLE-AUTH] Production Mode:', isProduction);
    console.log('[GOOGLE-AUTH] Cloud Run:', isCloudRun);
    console.log('[GOOGLE-AUTH] Hostname:', window.location.hostname);
    console.log('[GOOGLE-AUTH] Redirect URI:', redirectUri);
    console.log('[GOOGLE-AUTH] Client ID:', googleClientId.substring(0, 20) + '...');
    
    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline'
    });
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    console.log('[GOOGLE-AUTH] Full OAuth URL:', googleAuthUrl);
    console.log('[GOOGLE-AUTH] Redirecting to Google OAuth...');
    window.location.href = googleAuthUrl;
    
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
