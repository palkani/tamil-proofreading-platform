// Handle OAuth callback with access token in URL
document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  
  if (accessToken) {
    // Clear old tokens first
    localStorage.removeItem('access_token');
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    
    // Store access token in localStorage
    localStorage.setItem('access_token', accessToken);
    document.cookie = `access_token=${accessToken}; path=/; SameSite=Lax; Max-Age=900`;
    
    // Remove the token from URL for security
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Token is now available for authenticated requests
    console.log('[OAuth] Access token stored successfully');
  }
});
