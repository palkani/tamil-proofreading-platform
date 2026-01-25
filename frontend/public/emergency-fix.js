// EMERGENCY FIX: Force LTR and disable IME
// Run this in Browser Console (F12) immediately

console.log('🔧 Applying emergency fix for reverse text...');

// 1. Clear all storage
localStorage.clear();
sessionStorage.clear();

// 2. Force disable Tamil IME
localStorage.setItem('tamilIMEEnabled', 'false');

// 3. Force LTR on all text elements
const forceStyle = document.createElement('style');
forceStyle.id = 'emergency-ltr-fix';
forceStyle.textContent = `
  * {
    direction: ltr !important;
    unicode-bidi: normal !important;
  }
  
  body, html {
    direction: ltr !important;
  }
  
  .ProseMirror,
  .ProseMirror *,
  [contenteditable],
  [contenteditable] * {
    direction: ltr !important;
    unicode-bidi: embed !important;
    text-align: left !important;
  }
  
  /* Disable any IME styling */
  .tamil-ime-dropdown {
    display: none !important;
  }
`;
document.head.appendChild(forceStyle);

// 4. Force all contenteditable elements to LTR
setTimeout(() => {
  const editables = document.querySelectorAll('[contenteditable="true"], .ProseMirror');
  editables.forEach(el => {
    el.setAttribute('dir', 'ltr');
    el.style.direction = 'ltr';
    el.style.unicodeBidi = 'embed';
    el.style.textAlign = 'left';
  });
  console.log('✅ Applied LTR to', editables.length, 'editable elements');
}, 500);

console.log('✅ Emergency fix applied! Reloading page in 2 seconds...');

// 5. Reload page to apply changes
setTimeout(() => {
  location.reload(true);
}, 2000);
