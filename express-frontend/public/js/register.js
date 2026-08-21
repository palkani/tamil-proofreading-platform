// Register page functionality with password strength and email verification

let registeredEmail = '';
let resendTimeout = null;

// ── Email validity tracking ───────────────────────────────────────────
// Populated by the /auth/validate-email fetch on blur. `emailStatus` is
// one of: 'unknown' (not yet checked), 'checking' (fetch in flight),
// 'valid', 'invalid'. Submit button stays disabled unless 'valid'.
let emailStatus = 'unknown';
let lastCheckedEmail = '';
let emailCheckInFlight = null;

function showEmailFeedback(kind, message, suggestion) {
  const el = document.getElementById('email-feedback');
  if (!el) return;
  if (!message && !suggestion) { el.classList.add('hidden'); el.textContent = ''; return; }
  const colour =
    kind === 'valid'    ? 'text-green-700 bg-green-50 border-green-200' :
    kind === 'invalid'  ? 'text-red-700 bg-red-50 border-red-200' :
                          'text-gray-600 bg-gray-50 border-gray-200';
  el.className = 'mt-1.5 text-xs px-3 py-2 rounded-lg border ' + colour;
  el.innerHTML = '';
  if (message) el.appendChild(document.createTextNode(message));
  if (suggestion) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-2 underline font-semibold hover:opacity-80';
    btn.textContent = 'Use ' + suggestion;
    btn.addEventListener('click', () => {
      document.getElementById('email').value = suggestion;
      checkEmail(suggestion);
    });
    el.appendChild(btn);
  }
  el.classList.remove('hidden');
}

async function checkEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) {
    emailStatus = 'unknown';
    showEmailFeedback('info', '');
    updateSubmitButton();
    return;
  }
  if (value === lastCheckedEmail && emailStatus !== 'unknown') return;
  lastCheckedEmail = value;
  emailStatus = 'checking';
  showEmailFeedback('info', 'Checking email…');
  updateSubmitButton();

  if (emailCheckInFlight && emailCheckInFlight.abort) emailCheckInFlight.abort();
  const ctrl = ('AbortController' in window) ? new AbortController() : null;
  emailCheckInFlight = ctrl;
  try {
    const r = await fetch('/auth/validate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: value }),
      signal: ctrl ? ctrl.signal : undefined,
    });
    const d = await r.json();
    if (value !== (document.getElementById('email').value || '').trim().toLowerCase()) {
      return; // user typed something else while we were checking
    }
    if (d && d.valid) {
      emailStatus = 'valid';
      showEmailFeedback('valid', d.suggestion ? '' : '', d.suggestion || undefined);
    } else {
      emailStatus = 'invalid';
      showEmailFeedback('invalid', (d && d.message) || 'This email is not accepted.', d && d.suggestion);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    // Network error — allow submit and let server-side revalidate.
    emailStatus = 'valid';
    showEmailFeedback('info', '');
  } finally {
    emailCheckInFlight = null;
    updateSubmitButton();
  }
}

// Resolve the post-auth redirect target once at load time.
// Mirrors the same safe-redirect logic used in login.js.
var _registerRedirectTarget = (function () {
  var params = new URLSearchParams(window.location.search);
  var raw = params.get('redirect') || '/drafts';
  if (!raw || raw.startsWith('//') || !raw.startsWith('/')) return '/drafts';
  try {
    var u = new URL(raw, window.location.origin);
    u.searchParams.delete('access_token');
    return u.pathname + (u.search ? u.search : '');
  } catch (_e) {
    return '/drafts';
  }
})();

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
  // Only enable submit when the async email check has explicitly said OK.
  // 'unknown' and 'checking' both keep the button disabled to prevent
  // racy submits with junk emails.
  const emailOk = emailStatus === 'valid';
  const isValid = name.trim() && email.trim() && emailOk && passwordResult.isValid && terms;
  submitBtn.disabled = !isValid;
}

// Password input listener
document.getElementById('password')?.addEventListener('input', (e) => {
  const result = validatePasswordStrength(e.target.value);
  updatePasswordUI(result);
});

// Name + terms toggle re-check the submit button; email has its own
// listeners below because it needs both the debounced check and an
// immediate state reset when the user starts editing.
document.getElementById('name')?.addEventListener('input', updateSubmitButton);
document.getElementById('terms-checkbox')?.addEventListener('change', updateSubmitButton);

// Debounced auto-check after 800 ms of idle typing + immediate check on
// blur. Resets status the moment the value changes so the button re-locks.
let emailIdleTimer = null;
document.getElementById('email')?.addEventListener('input', (e) => {
  if (e.target.value.trim().toLowerCase() !== lastCheckedEmail) {
    emailStatus = 'unknown';
    showEmailFeedback('info', '');
  }
  updateSubmitButton();
  if (emailIdleTimer) clearTimeout(emailIdleTimer);
  const v = e.target.value;
  emailIdleTimer = setTimeout(() => checkEmail(v), 800);
});
document.getElementById('email')?.addEventListener('blur', (e) => {
  if (emailIdleTimer) { clearTimeout(emailIdleTimer); emailIdleTimer = null; }
  checkEmail(e.target.value);
});

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
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || 'Registration failed';
      throw new Error(String(errorMessage));
    }

    // 2026-08-21 policy: NEVER auto-log-in on register. Users must verify
    // their email via OTP first. This gates junk-mail signups even if the
    // strict email validator (syntax + disposable blocklist + MX check)
    // somehow lets one through. If the backend still returns an
    // access_token in the register response, we DELIBERATELY ignore it —
    // the token that logs the user in comes from /auth/otp/verify only.
    registeredEmail = email;

    // Fire an OTP request. If the backend already sent one automatically
    // during /auth/register, this second call is idempotent — the user
    // still ends up on the verification step either way. If the backend
    // requires an explicit send, this call kicks it off.
    try {
      await fetch('/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'register' })
      });
    } catch (_) { /* the verification step will show a Resend button */ }

    showVerificationStep(email);
  } catch (error) {
    const errorMessage = error?.message || 'An unexpected error occurred';
    errorDiv.textContent = errorMessage;
    errorDiv.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
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
    const response = await fetch('/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registeredEmail, otp })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Verification failed');
    }
    
    // Store access token (use consistent key: access_token)
    if (data.access_token) {
      if (window.authUtils && window.authUtils.storeAccessToken) {
        window.authUtils.storeAccessToken(data.access_token);
      } else {
        // Fallback
        localStorage.setItem('access_token', data.access_token);
        document.cookie = `access_token=${data.access_token}; path=/; SameSite=Lax; Max-Age=900`;
      }
    }
    
    successDiv.textContent = 'Email verified successfully! Redirecting...';
    successDiv.classList.remove('hidden');

    setTimeout(() => {
      window.location.href = _registerRedirectTarget;
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
    const response = await fetch('/auth/otp/send', {
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
