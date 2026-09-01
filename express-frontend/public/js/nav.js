// Nav partial's client-side behaviour, extracted from views/partials/nav.ejs
// so it can be loaded with `defer` — synchronous inline <script> was blocking
// HTML parse on every page for ~1s+ on mobile, tanking LCP on blog/marketing
// pages (Lighthouse: "Render-blocking requests ~1,760 ms savings").
//
// Contents (order matters — earlier code defines what later code uses):
//   1. performLogout + logout-loop protection
//   2. Workspace nav link hardening
//   3. Homepage / general logout-flag cleanup
//   4. Logout button wiring
//   5. Mobile hamburger menu
//
// Nothing in this file reads EJS template variables — it operates purely on
// DOM elements defined in nav.ejs. Safe to defer: every DOM element it looks
// up (logout-btn, mobile-menu-btn, etc.) exists by the time this runs.

// Flag to prevent multiple logout confirmations
let logoutInProgress = false;
let logoutButtonClickTime = 0;
let logoutCallCount = 0;
const MAX_LOGOUT_CALLS_PER_MINUTE = 2; // Maximum 2 logout calls per minute

// CRITICAL: Track logout calls to prevent loops
const logoutCallHistory = [];

// Centralized logout function - make it globally accessible
// CRITICAL: Only allow logout from actual user clicks, not automatic calls
window.performLogout = function performLogout(skipConfirm, event) {
  // CRITICAL: Block ALL automatic calls on homepage to prevent loops
  const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';

  // On homepage, ONLY allow logout if:
  // 1. It's from a trusted user event (actual click)
  // 2. OR it's a programmatic call with skipConfirm=true AND it's not within 30 seconds of a previous logout
  if (isHomepage) {
    const isUserInitiated = event && event.isTrusted === true;
    const justLoggedOut = sessionStorage.getItem('just_logged_out') === 'true';

    if (!isUserInitiated && (justLoggedOut || !skipConfirm)) {
      console.error('[NAV] BLOCKED: performLogout called on homepage - preventing loop!', {
        skipConfirm: skipConfirm,
        isUserInitiated: isUserInitiated,
        justLoggedOut: justLoggedOut
      });
      console.error('[NAV] Call stack:', new Error().stack);
      return;
    }
  }

  // CRITICAL: Rate limit logout calls - prevent more than 2 per minute
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const recentCalls = logoutCallHistory.filter(timestamp => timestamp > oneMinuteAgo);

  if (recentCalls.length >= MAX_LOGOUT_CALLS_PER_MINUTE) {
    console.error('[NAV] BLOCKED: Too many logout calls in short time - possible loop!', {
      recentCalls: recentCalls.length,
      maxAllowed: MAX_LOGOUT_CALLS_PER_MINUTE
    });
    return;
  }

  // Record this logout call
  logoutCallHistory.push(now);
  // Keep only last 10 calls in history
  if (logoutCallHistory.length > 10) {
    logoutCallHistory.shift();
  }

  // CRITICAL: Prevent automatic calls - only allow if:
  // 1. skipConfirm is explicitly true (programmatic logout)
  // 2. OR event is a trusted user event (actual click)
  // 3. OR logout was clicked within last 5 seconds (user-initiated)
  const isUserInitiated = event && event.isTrusted === true;
  const recentClick = Date.now() - logoutButtonClickTime < 5000;

  if (!skipConfirm && !isUserInitiated && !recentClick) {
    console.warn('[NAV] performLogout called without user interaction - blocking');
    console.warn('[NAV] Call stack:', new Error().stack);
    return;
  }

  // Prevent multiple simultaneous logout attempts
  if (logoutInProgress) {
    console.log('[NAV] Logout already in progress, ignoring duplicate call');
    return;
  }

  console.log('[NAV] performLogout called', { skipConfirm: skipConfirm, isUserInitiated: isUserInitiated, recentClick: recentClick, isHomepage: isHomepage });

  // Only show confirm dialog if not explicitly skipped
  // For user-initiated logouts, always show confirm
  if (!skipConfirm) {
    if (!confirm('Are you sure you want to log out?')) {
      return;
    }
  }

  logoutInProgress = true;
  console.log('[NAV] User confirmed logout');

  // Always clear tokens first (client-side)
  console.log('[NAV] Clearing client-side tokens...');
  localStorage.removeItem('access_token');

  // Clear all cookies
  const cookieOptions = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  const clearCookie = (name) => {
    // Host-only
    document.cookie = `${name}=; ${cookieOptions}`;
    // Best-effort domain clears (works only for non-HttpOnly cookies)
    document.cookie = `${name}=; ${cookieOptions}; domain=prooftamil.com`;
    document.cookie = `${name}=; ${cookieOptions}; domain=.prooftamil.com`;
    document.cookie = `${name}=; ${cookieOptions}; domain=www.prooftamil.com`;
  };
  clearCookie('access_token');
  clearCookie('refresh_token');
  clearCookie('proof_refresh_token');

  // Try to call logout API (non-blocking, fire and forget)
  // CRITICAL: Add a flag to localStorage to prevent logout loop
  try {
    localStorage.setItem('logout_in_progress', 'true');
    localStorage.setItem('logout_timestamp', Date.now().toString());
  } catch (e) {
    console.warn('[NAV] Could not set logout flag in localStorage:', e);
  }

  // Call logout API with keepalive so the request can complete even if we navigate.
  // Express now clears cookies BEFORE awaiting the backend, so this responds in
  // tens of milliseconds — wait for it (no race) so Set-Cookie deletions are
  // applied before the next page request.
  const logoutRequest = fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => null);

  console.log('[NAV] Logging out, awaiting Set-Cookie clear before redirect');

  try {
    sessionStorage.setItem('just_logged_out', 'true');
    sessionStorage.setItem('logout_time', Date.now().toString());
  } catch (e) {
    console.warn('[NAV] Could not set sessionStorage flag:', e);
  }

  // Wait up to 1500 ms (Express response is normally <50 ms; this is a safety cap).
  // Then redirect to /login?logout=1 so the login route force-clears any stale
  // cookie that might still be attached (browser/CDN edge cases).
  Promise.race([
    logoutRequest,
    new Promise((resolve) => setTimeout(resolve, 1500))
  ]).finally(() => {
    window.location.replace('/login?logout=1');
  });
};

// Ensure the Workspace nav link always navigates (some pages attach aggressive click handlers).
;(function () {
  try {
    const link = document.getElementById('nav-workspace-link');
    if (!link) return;
    link.addEventListener(
      'click',
      function (e) {
        // Allow opening in new tab/window
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        e.preventDefault();
        console.log('[NAV] Workspace link clicked, navigating to /workspace');
        window.location.href = '/workspace';
      },
      true // capture phase to win against other handlers
    );
  } catch (err) {
    // Non-fatal
  }
})();

// CRITICAL: On homepage load, check if we just logged out and prevent re-logout
;(function() {
  const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';
  if (isHomepage) {
    try {
      const justLoggedOut = sessionStorage.getItem('just_logged_out');
      const logoutTime = sessionStorage.getItem('logout_time');

      if (justLoggedOut === 'true' && logoutTime) {
        const timeSinceLogout = Date.now() - parseInt(logoutTime, 10);
        // If logout was within last 30 seconds, block any logout attempts
        if (timeSinceLogout < 30000) {
          console.log('[NAV] Just logged out, blocking any automatic logout for 30 seconds');
          logoutInProgress = true;

          // Clear the flag after 30 seconds
          setTimeout(() => {
            try {
              sessionStorage.removeItem('just_logged_out');
              sessionStorage.removeItem('logout_time');
              logoutInProgress = false;
              console.log('[NAV] Logout protection expired');
            } catch (e) {
              console.warn('[NAV] Error clearing sessionStorage:', e);
            }
          }, 30000);
        } else {
          // Logout was more than 30 seconds ago, clear the flag
          sessionStorage.removeItem('just_logged_out');
          sessionStorage.removeItem('logout_time');
        }
      }
    } catch (e) {
      console.warn('[NAV] Error checking logout protection:', e);
    }
  }
})();

// CRITICAL: Check on page load if we're in a logout loop
;(function() {
  try {
    const logoutFlag = localStorage.getItem('logout_in_progress');
    const logoutTimestamp = localStorage.getItem('logout_timestamp');

    if (logoutFlag === 'true' && logoutTimestamp) {
      const timeSinceLogout = Date.now() - parseInt(logoutTimestamp, 10);
      // If logout was initiated more than 10 seconds ago, clear the flag
      // This prevents infinite loops if redirect failed
      if (timeSinceLogout > 10000) {
        console.warn('[NAV] Logout flag found but too old, clearing to prevent loop');
        localStorage.removeItem('logout_in_progress');
        localStorage.removeItem('logout_timestamp');
      } else {
        // Logout was recent, don't allow another logout
        console.log('[NAV] Logout was recently initiated, preventing automatic logout');
        logoutInProgress = true; // Set the module-level flag to prevent logout
      }
    }
  } catch (e) {
    console.warn('[NAV] Error checking logout flag:', e);
  }
})();

// Setup logout button - simplified and more reliable
;(function() {
  function attachLogoutHandler() {
    const logoutBtn = document.getElementById('logout-btn');
    if (!logoutBtn) {
      // Button not found yet, will retry
      return false;
    }

    // Check if handler is already attached
    if (logoutBtn.dataset.handlerAttached === 'true') {
      return true;
    }

    // Mark as attached
    logoutBtn.dataset.handlerAttached = 'true';

    // Attach handler directly to button
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      // CRITICAL: Record the click time to allow performLogout to verify it's user-initiated
      logoutButtonClickTime = Date.now();

      console.log('[NAV] Logout button clicked', { isTrusted: e.isTrusted, timestamp: logoutButtonClickTime });

      // Call logout function with the event to verify it's user-initiated
      if (window.performLogout) {
        window.performLogout(false, e);
      } else {
        console.error('[NAV] performLogout function not found!');
      }
    }, { capture: true, once: false });

    console.log('[NAV] ✅ Logout button handler attached successfully');
    return true;
  }

  // Try to attach immediately
  if (attachLogoutHandler()) {
    // Success - handler attached
  } else {
    // Button not found, set up retries
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        attachLogoutHandler();
      });
    }

    // Retry with delays
    setTimeout(() => attachLogoutHandler(), 100);
    setTimeout(() => attachLogoutHandler(), 500);
    setTimeout(() => attachLogoutHandler(), 1000);
  }

  // CRITICAL: Navigation links should work normally - no JavaScript handlers needed
  // Standard href navigation will work without any event listeners
})();

// ── Mobile hamburger menu ─────────────────────────────────────────────────
;(function() {
  var mBtn  = document.getElementById('mobile-menu-btn');
  var mMenu = document.getElementById('mobile-menu');
  var hIcon = document.getElementById('hamburger-icon');
  var xIcon = document.getElementById('close-icon');
  if (!mBtn || !mMenu) return;

  function openMenu() {
    mMenu.classList.remove('hidden');
    hIcon.classList.add('hidden');
    xIcon.classList.remove('hidden');
    mBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden'; // prevent background scroll
  }
  function closeMenu() {
    mMenu.classList.add('hidden');
    hIcon.classList.remove('hidden');
    xIcon.classList.add('hidden');
    mBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  mBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    mMenu.classList.contains('hidden') ? openMenu() : closeMenu();
  });

  // Close when any link inside the menu is clicked
  mMenu.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', closeMenu);
  });

  // Mobile sign-out button (delegates to existing performLogout)
  var mLogout = document.getElementById('mobile-logout-btn');
  if (mLogout) {
    mLogout.addEventListener('click', function(e) {
      closeMenu();
      logoutButtonClickTime = Date.now();
      if (window.performLogout) window.performLogout(false, e);
    });
  }

  // Close when clicking outside the menu
  document.addEventListener('click', function(e) {
    if (!mMenu.classList.contains('hidden') &&
        !mMenu.contains(e.target) &&
        !mBtn.contains(e.target)) {
      closeMenu();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMenu();
  });

  // Close on resize to desktop width
  window.addEventListener('resize', function() {
    if (window.innerWidth >= 1024) closeMenu();
  });
})();
