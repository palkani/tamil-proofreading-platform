// Register page functionality

document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = document.getElementById('submit-btn');
  const errorDiv = document.getElementById('error-message');
  
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating your account…';
  errorDiv.classList.add('hidden');
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Registration failed');
    }
    
    // Success - redirect to dashboard
    window.location.href = '/dashboard';
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create free account';
  }
});

document.getElementById('google-signup-btn')?.addEventListener('click', () => {
  if (window.triggerGoogleSignIn) {
    window.triggerGoogleSignIn();
  } else {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = 'Google Sign-In is loading. Please wait a moment and try again.';
    errorDiv.classList.remove('hidden');
  }
});
