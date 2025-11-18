// Google OAuth Authentication Handler
// This script handles Google Sign-In with One Tap and button-based authentication

let googleClient = null;

// Initialize Google Sign-In
async function initializeGoogleAuth() {
  try {
    // Load Google Identity Services library
    await loadGoogleScript();
    
    // Get Google Client ID from backend config
    const response = await fetch('/api/config/google-client-id');
    const config = await response.json();
    
    if (!config.clientId) {
      console.warn('Google OAuth not configured');
      return;
    }
    
    // Initialize Google client
    google.accounts.id.initialize({
      client_id: config.clientId,
      callback: handleGoogleCallback,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    
    googleClient = google;
    
  } catch (error) {
    console.error('Failed to initialize Google Auth:', error);
  }
}

// Load Google Identity Services script
function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Handle Google OAuth callback
async function handleGoogleCallback(response) {
  const errorDiv = document.getElementById('error-message');
  
  try {
    // Send credential to backend for verification
    const result = await fetch('http://localhost:8080/api/v1/auth/social', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        provider: 'google',
        token: response.credential
      })
    });
    
    if (!result.ok) {
      const error = await result.json();
      throw new Error(error.error || 'Google sign-in failed');
    }
    
    const data = await result.json();
    
    // Store user info in session (Express will handle this)
    // For now, just create a simple session marker
    const sessionData = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role
    };
    
    // Make a request to Express to create session
    const sessionResponse = await fetch('/auth/google-callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionData)
    });
    
    if (sessionResponse.ok) {
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } else {
      throw new Error('Failed to create session');
    }
    
  } catch (error) {
    console.error('Google sign-in error:', error);
    if (errorDiv) {
      errorDiv.textContent = error.message || 'Google sign-in failed. Please try again.';
      errorDiv.classList.remove('hidden');
    }
  }
}

// Trigger Google Sign-In when button is clicked
function triggerGoogleSignIn() {
  if (!googleClient) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
      errorDiv.textContent = 'Google Sign-In is not ready yet. Please refresh the page.';
      errorDiv.classList.remove('hidden');
    }
    return;
  }
  
  // Show Google One Tap prompt
  google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      // If One Tap is not shown, render the sign-in button
      renderGoogleButton();
    }
  });
}

// Render Google Sign-In button in a modal/popup
function renderGoogleButton() {
  const errorDiv = document.getElementById('error-message');
  
  // Create a temporary container for the button
  const container = document.createElement('div');
  container.id = 'google-signin-container';
  container.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);';
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666;';
  closeBtn.onclick = () => container.remove();
  
  const title = document.createElement('h3');
  title.textContent = 'Sign in with Google';
  title.style.cssText = 'margin-bottom: 20px; font-size: 18px; font-weight: 600;';
  
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'google-button-placeholder';
  
  container.appendChild(closeBtn);
  container.appendChild(title);
  container.appendChild(buttonContainer);
  document.body.appendChild(container);
  
  // Render the actual Google button
  google.accounts.id.renderButton(
    buttonContainer,
    {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left'
    }
  );
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGoogleAuth);
} else {
  initializeGoogleAuth();
}

// Export for use in other scripts
window.triggerGoogleSignIn = triggerGoogleSignIn;
