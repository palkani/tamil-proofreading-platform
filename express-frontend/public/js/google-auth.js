// Google OAuth Authentication Handler
let googleClientId = null;

// Initialize Google Auth
async function initializeGoogleAuth() {
  try {
    const clientIdElement = document.getElementById('google-client-id');
    if (!clientIdElement) {
      console.error('Google OAuth not configured');
      return;
    }
    
    googleClientId = clientIdElement.value;
    if (!googleClientId) {
      console.error('Google OAuth not configured - empty client ID');
      return;
    }
    
    console.log('Google Client ID loaded: Yes');
    console.log('Google Sign-In initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize Google Auth:', error);
  }
}

// Trigger Google Sign-In using redirect flow
function triggerGoogleSignIn() {
  if (!googleClientId) {
    console.error('Google Client ID not available');
    alert('Google Sign-In is not configured. Please try again later.');
    return;
  }
  
  try {
    // Get current URL for redirect
    const currentUrl = window.location.origin;
    const redirectUri = `${currentUrl}/api/v1/auth/google/callback`;
    
    console.log('[GOOGLE-AUTH] Origin:', currentUrl);
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
