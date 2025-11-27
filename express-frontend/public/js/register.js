// Register page functionality with password strength and email verification

let registeredEmail = '';
let resendTimeout = null;

// Password strength validation
function validatePasswordStrength(password) {
  const result = {
    isValid: true,
    score: 0,
    requirements: {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/.test(password)
    }
  };

  // Calculate score
  if (result.requirements.length) result.score++;
  if (result.requirements.upper) result.score++;
  if (result.requirements.lower) result.score++;
  if (result.requirements.number) result.score++;
  if (result.requirements.special) result.score++;

  // Check if all requirements are met
  result.isValid = Object.values(result.requirements).every(v => v);

  return result;
}

function updatePasswordUI(result) {
  const strengthContainer = document.getElementById('password-strength');
  strengthContainer.classList.remove('hidden');

  // Update strength bars
  for (let i = 1; i <= 5; i++) {
    const bar = document.getElementById(`strength-bar-${i}`);
    if (i <= result.score) {
      if (result.score <= 2) {
        bar.className = 'h-1 flex-1 rounded bg-red-500';
      } else if (result.score <= 4) {
        bar.className = 'h-1 flex-1 rounded bg-yellow-500';
      } else {
        bar.className = 'h-1 flex-1 rounded bg-green-500';
      }
    } else {
      bar.className = 'h-1 flex-1 rounded bg-gray-200';
    }
  }

  // Update requirements
  updateRequirement('req-length', result.requirements.length);
  updateRequirement('req-upper', result.requirements.upper);
  updateRequirement('req-lower', result.requirements.lower);
  updateRequirement('req-number', result.requirements.number);
  updateRequirement('req-special', result.requirements.special);

  // Update submit button state
  updateSubmitButton();
}

function updateRequirement(elementId, isMet) {
  const element = document.getElementById(elementId);
  const icon = element.querySelector('.req-icon');
  
  if (isMet) {
    element.className = 'flex items-center gap-1 text-green-600';
    icon.textContent = '✓';
  } else {
    element.className = 'flex items-center gap-1 text-gray-400';
    icon.textContent = '○';
  }
}

function updateSubmitButton() {
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const terms = document.getElementById('terms-checkbox').checked;
  const submitBtn = document.getElementById('submit-btn');
  
  const passwordResult = validatePasswordStrength(password);
  
  const isValid = name.trim() && email.trim() && passwordResult.isValid && terms;
  submitBtn.disabled = !isValid;
}

// Password input listener
document.getElementById('password')?.addEventListener('input', (e) => {
  const result = validatePasswordStrength(e.target.value);
  updatePasswordUI(result);
});

// Other form inputs
document.getElementById('name')?.addEventListener('input', updateSubmitButton);
document.getElementById('email')?.addEventListener('input', updateSubmitButton);
document.getElementById('terms-checkbox')?.addEventListener('change', updateSubmitButton);

// Registration form submit
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = document.getElementById('submit-btn');
  const errorDiv = document.getElementById('error-message');
  
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  // Final password validation
  const passwordResult = validatePasswordStrength(password);
  if (!passwordResult.isValid) {
    errorDiv.textContent = 'Please ensure your password meets all requirements';
    errorDiv.classList.remove('hidden');
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating your account...';
  errorDiv.classList.add('hidden');
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    // Registration successful - user is immediately logged in
    // Store access token if provided
    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token);
    }
    
    // Redirect to dashboard
    window.location.href = '/dashboard';
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create free account';
  }
});

function showVerificationStep(email) {
  document.getElementById('registration-step').classList.add('hidden');
  document.getElementById('verification-step').classList.remove('hidden');
  document.getElementById('verification-email').textContent = email;
  
  // Focus on OTP input
  document.getElementById('otp').focus();
  
  // Start resend timer
  startResendTimer();
}

function showRegistrationStep() {
  document.getElementById('verification-step').classList.add('hidden');
  document.getElementById('registration-step').classList.remove('hidden');
  
  // Clear any timers
  if (resendTimeout) {
    clearInterval(resendTimeout);
    resendTimeout = null;
  }
}

function startResendTimer() {
  const timerElement = document.getElementById('timer-seconds');
  const timerContainer = document.getElementById('resend-timer');
  const resendBtn = document.getElementById('resend-btn');
  
  let seconds = 60;
  timerElement.textContent = seconds;
  timerContainer.classList.remove('hidden');
  resendBtn.classList.add('hidden');
  
  resendTimeout = setInterval(() => {
    seconds--;
    timerElement.textContent = seconds;
    
    if (seconds <= 0) {
      clearInterval(resendTimeout);
      timerContainer.classList.add('hidden');
      resendBtn.classList.remove('hidden');
    }
  }, 1000);
}

// OTP verification form
document.getElementById('verification-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const verifyBtn = document.getElementById('verify-btn');
  const errorDiv = document.getElementById('verification-error');
  const successDiv = document.getElementById('verification-success');
  const otp = document.getElementById('otp').value;
  
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';
  errorDiv.classList.add('hidden');
  successDiv.classList.add('hidden');
  
  try {
    const response = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registeredEmail, otp })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Verification failed');
    }
    
    // Store access token
    if (data.access_token) {
      localStorage.setItem('accessToken', data.access_token);
    }
    
    successDiv.textContent = 'Email verified successfully! Redirecting...';
    successDiv.classList.remove('hidden');
    
    // Redirect to dashboard after a brief delay
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 1500);
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify Email';
  }
});

// Resend OTP button
document.getElementById('resend-btn')?.addEventListener('click', async () => {
  const resendBtn = document.getElementById('resend-btn');
  const errorDiv = document.getElementById('verification-error');
  const successDiv = document.getElementById('verification-success');
  
  resendBtn.disabled = true;
  resendBtn.textContent = 'Sending...';
  errorDiv.classList.add('hidden');
  successDiv.classList.add('hidden');
  
  try {
    const response = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registeredEmail })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to resend code');
    }
    
    successDiv.textContent = 'A new verification code has been sent to your email';
    successDiv.classList.remove('hidden');
    
    // Restart timer
    startResendTimer();
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.classList.remove('hidden');
  } finally {
    resendBtn.disabled = false;
    resendBtn.textContent = 'Resend code';
  }
});

// Back to registration
document.getElementById('back-to-register')?.addEventListener('click', showRegistrationStep);

// OTP input formatting - only allow numbers
document.getElementById('otp')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
});

// Google signup button
document.getElementById('google-signup-btn')?.addEventListener('click', () => {
  console.log('Google signup button clicked');
  console.log('triggerGoogleSignIn function exists:', typeof window.triggerGoogleSignIn);
  
  if (window.triggerGoogleSignIn) {
    console.log('Calling triggerGoogleSignIn...');
    window.triggerGoogleSignIn();
  } else {
    console.error('triggerGoogleSignIn not found on window object');
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
      errorDiv.textContent = 'Google Sign-In is still loading. Please wait a moment and try again.';
      errorDiv.classList.remove('hidden');
    }
  }
});
