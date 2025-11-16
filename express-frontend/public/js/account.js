// Account page functionality

document.getElementById('account-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const saveBtn = document.getElementById('save-btn');
  const successDiv = document.getElementById('success-message');
  const name = document.getElementById('name').value;
  
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  successDiv.classList.add('hidden');
  
  try {
    // Simulate save (in production, this would call the backend API)
    await new Promise(resolve => setTimeout(resolve, 800));
    
    successDiv.textContent = 'Your account updates will be available soon.';
    successDiv.classList.remove('hidden');
    
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
    
    // Hide success message after 3 seconds
    setTimeout(() => {
      successDiv.classList.add('hidden');
    }, 3000);
  } catch (error) {
    console.error('Error saving account:', error);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
  }
});

document.getElementById('change-password-btn')?.addEventListener('click', () => {
  const successDiv = document.getElementById('success-message');
  successDiv.textContent = 'Password change functionality coming soon.';
  successDiv.classList.remove('hidden');
  
  setTimeout(() => {
    successDiv.classList.add('hidden');
  }, 3000);
});
