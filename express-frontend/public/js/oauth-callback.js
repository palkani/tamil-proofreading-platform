// Handle OAuth callback with access token in URL
document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  
  if (accessToken) {
    // Store access token in localStorage
    localStorage.setItem('access_token', accessToken);
    
    // Remove the token from URL for security
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Token is now available for authenticated requests
    console.log('[OAuth] Access token stored successfully');
  }
});
