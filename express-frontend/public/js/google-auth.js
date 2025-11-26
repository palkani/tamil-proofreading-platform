// Google OAuth Authentication Handler
// This script handles Google Sign-In authentication

let googleInitialized = false;
let googleClientId = null;

// Initialize Google Sign-In
async function initializeGoogleAuth() {
  try {
    // Get Google Client ID from DOM (set by backend in HTML)
    const clientIdElement = document.getElementById('google-client-id');
    if (!clientIdElement) {
      console.error('Google OAuth not configured - no client ID element in DOM');
      return;
    }
    
    googleClientId = clientIdElement.value;
    if (!googleClientId) {
      console.error('Google OAuth not configured - no client ID value');
      return;
    }
    
    console.log('Google Client ID loaded:', googleClientId ? 'Yes' : 'No');
    
    // Load Google Identity Services library
    await loadGoogleScript();
    
    // Initialize Google client
    if (window.google && window.google.accounts) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCallback,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      
      googleInitialized = true;
      console.log('Google Sign-In initialized successfully');
    } else {
      console.error('Google Identity Services not loaded');
    }
    
  } catch (error) {
    console.error('Failed to initialize Google Auth:', error);
  }
}

// Load Google Identity Services script
function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('Google Identity Services script loaded');
      resolve();
    };
    script.onerror = () => {
      console.error('Failed to load Google Identity Services script');
      reject(new Error('Failed to load Google script'));
    };
    document.head.appendChild(script);
  });
}

// Handle Google OAuth callback
async function handleGoogleCallback(response) {
  console.log('Google callback received');
  const errorDiv = document.getElementById('error-message');
  
  try {
    if (!response.credential) {
      throw new Error('No credential received from Google');
    }
    
    console.log('Sending credential to backend...');
    
    // Send credential to backend for verification via Express proxy
    const result = await fetch('/api/v1/auth/social', {
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
    
    console.log('Backend response status:', result.status);
    
    if (!result.ok) {
      const errorData = await result.json();
      console.error('Backend error:', errorData);
      throw new Error(errorData.error || JSON.stringify(errorData) || 'Google sign-in failed');
    }
    
    const data = await result.json();
    console.log('Backend authentication successful, user:', data.user?.email);
    
    // Create session on Express
    const sessionResponse = await fetch('/auth/google-callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role
      })
    });
    
    console.log('Session response status:', sessionResponse.status);
    
    if (sessionResponse.ok) {
      console.log('Session created, redirecting to dashboard');
      window.location.href = '/dashboard';
    } else {
      const sessionError = await sessionResponse.text();
      console.error('Session creation failed:', sessionError);
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
  console.log('triggerGoogleSignIn called, initialized:', googleInitialized);
  
  if (!googleInitialized) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
      errorDiv.textContent = 'Google Sign-In is still loading. Please wait a moment and try again.';
      errorDiv.classList.remove('hidden');
    }
    // Try initializing again
    initializeGoogleAuth();
    return;
  }
  
  try {
    // Show Google One Tap prompt
    google.accounts.id.prompt((notification) => {
      console.log('Google prompt notification:', notification.getMomentType());
      
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // If One Tap is not shown, render the sign-in button in popup
        console.log('One Tap not displayed, showing button popup');
        renderGoogleButtonPopup();
      }
    });
  } catch (error) {
    console.error('Error triggering Google Sign-In:', error);
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
      errorDiv.textContent = 'Error loading Google Sign-In. Please try refreshing the page.';
      errorDiv.classList.remove('hidden');
    }
  }
}

// Render Google Sign-In button in a popup
function renderGoogleButtonPopup() {
  // Remove existing popup if any
  const existing = document.getElementById('google-signin-popup');
  if (existing) {
    existing.remove();
  }
  
  // Create popup overlay
  const overlay = document.createElement('div');
  overlay.id = 'google-signin-popup';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9998; display: flex; align-items: center; justify-content: center;';
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
  
  // Create popup container
  const container = document.createElement('div');
  container.style.cssText = 'background: white; padding: 40px; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 400px; width: 90%; position: relative;';
  
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 28px; cursor: pointer; color: #666; line-height: 1; padding: 0; width: 30px; height: 30px;';
  closeBtn.onclick = () => overlay.remove();
  
  // Title
  const title = document.createElement('h3');
  title.textContent = 'Sign in with Google';
  title.style.cssText = 'margin: 0 0 24px 0; font-size: 22px; font-weight: 600; text-align: center; color: #1f2937;';
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'google-button-placeholder';
  buttonContainer.style.cssText = 'display: flex; justify-content: center;';
  
  container.appendChild(closeBtn);
  container.appendChild(title);
  container.appendChild(buttonContainer);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
  
  // Render the actual Google button
  try {
    google.accounts.id.renderButton(
      buttonContainer,
      {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 300
      }
    );
    console.log('Google button rendered in popup');
  } catch (error) {
    console.error('Error rendering Google button:', error);
    overlay.remove();
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
      errorDiv.textContent = 'Failed to render Google Sign-In button. Please try again.';
      errorDiv.classList.remove('hidden');
    }
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Google Auth');
    initializeGoogleAuth();
  });
} else {
  console.log('DOM already loaded, initializing Google Auth');
  initializeGoogleAuth();
}

// Attach click handlers to Google Sign-In buttons
function attachButtonHandlers() {
  // Login page button (id: google-signin-btn)
  const loginButton = document.getElementById('google-signin-btn');
  if (loginButton && !loginButton.dataset.handlerAttached) {
    loginButton.addEventListener('click', triggerGoogleSignIn);
    loginButton.dataset.handlerAttached = 'true';
  }
  
  // Sign up page button (id: google-signup-btn)
  const signupButton = document.getElementById('google-signup-btn');
  if (signupButton && !signupButton.dataset.handlerAttached) {
    signupButton.addEventListener('click', triggerGoogleSignIn);
    signupButton.dataset.handlerAttached = 'true';
  }
}

// Attach handlers when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachButtonHandlers);
} else {
  attachButtonHandlers();
}

// Export for use in other scripts
window.triggerGoogleSignIn = triggerGoogleSignIn;
