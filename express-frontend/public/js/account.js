// Account page functionality

// ── Save display name (stub — profile update coming soon) ─────────────────────
document.getElementById('account-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const saveBtn    = document.getElementById('save-btn');
  const successDiv = document.getElementById('success-message');

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';
  successDiv.classList.add('hidden');

  await new Promise(resolve => setTimeout(resolve, 600));

  successDiv.textContent = 'Your account updates will be available soon.';
  successDiv.className   = 'rounded-2xl border border-primary-500/20 bg-blue-50 px-4 py-3 text-sm text-primary-700';
  successDiv.classList.remove('hidden');
  setTimeout(() => successDiv.classList.add('hidden'), 3500);

  saveBtn.disabled    = false;
  saveBtn.textContent = 'Save changes';
});

// ── Change password toggle ─────────────────────────────────────────────────────
document.getElementById('change-password-btn')?.addEventListener('click', () => {
  const form = document.getElementById('change-password-form');
  if (!form) return;

  const isHidden = form.classList.contains('hidden');
  form.classList.toggle('hidden', !isHidden);

  if (isHidden) {
    // Show form — clear previous state
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value     = '';
    document.getElementById('confirm-password').value = '';
    document.getElementById('pw-message').classList.add('hidden');
    document.getElementById('current-password').focus();
  }
});

document.getElementById('cancel-password-btn')?.addEventListener('click', () => {
  document.getElementById('change-password-form').classList.add('hidden');
});

// ── Save new password ─────────────────────────────────────────────────────────
document.getElementById('save-password-btn')?.addEventListener('click', async () => {
  const currentPw = document.getElementById('current-password').value;
  const newPw     = document.getElementById('new-password').value;
  const confirmPw = document.getElementById('confirm-password').value;
  const msgDiv    = document.getElementById('pw-message');
  const saveBtn   = document.getElementById('save-password-btn');

  function showMsg(text, isError) {
    msgDiv.textContent = text;
    msgDiv.className   = 'rounded-2xl px-4 py-3 text-sm ' +
      (isError
        ? 'border border-red-200 bg-red-50 text-red-700'
        : 'border border-green-200 bg-green-50 text-green-700');
    msgDiv.classList.remove('hidden');
  }

  // Client-side validation
  if (!currentPw) { showMsg('Please enter your current password.', true); return; }
  if (!newPw)     { showMsg('Please enter a new password.', true); return; }
  if (newPw.length < 8) { showMsg('New password must be at least 8 characters.', true); return; }
  if (newPw !== confirmPw) { showMsg('New passwords do not match.', true); return; }
  if (newPw === currentPw) { showMsg('New password must be different from your current password.', true); return; }

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Updating…';
  msgDiv.classList.add('hidden');

  try {
    const res  = await fetch('/api/v1/auth/change-password', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ current_password: currentPw, new_password: newPw }),
    });
    const data = await res.json();

    if (res.ok) {
      showMsg('Password updated successfully.', false);
      // Clear inputs and close form after short delay
      setTimeout(() => {
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value     = '';
        document.getElementById('confirm-password').value = '';
        document.getElementById('change-password-form').classList.add('hidden');
      }, 2000);
    } else {
      showMsg(data.error || 'Failed to update password.', true);
    }
  } catch (err) {
    showMsg('Network error — please try again.', true);
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Update password';
  }
});
