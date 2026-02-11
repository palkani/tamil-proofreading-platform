/**
 * Google Sign-In: Supabase (preferred) or legacy backend OAuth.
 * If SUPABASE_URL and SUPABASE_ANON_KEY are set, uses Supabase signInWithOAuth(google).
 * Otherwise falls back to redirect to /auth/google (backend callback).
 */
(function () {
  var supabaseUrl = typeof window !== 'undefined' && window.SUPABASE_URL;
  var supabaseAnonKey = typeof window !== 'undefined' && window.SUPABASE_ANON_KEY;
  var useSupabase = supabaseUrl && supabaseAnonKey;

  var redirectTo = (typeof window !== 'undefined' && window.SUPABASE_REDIRECT_TO) || '/drafts';
  // Must be a full URL (https://...) so Supabase redirects to your app, not to supabase.co/www.prooftamil.com
  var origin = (typeof window !== 'undefined' && window.location && window.location.origin) || 'https://www.prooftamil.com';
  if (origin && !/^https?:\/\//i.test(origin)) origin = 'https://' + origin;
  var callbackUrl = origin.replace(/\/$/, '') + '/auth/callback';
  if (redirectTo && redirectTo.startsWith('/')) {
    callbackUrl += '?redirect=' + encodeURIComponent(redirectTo);
  }

  function triggerGoogleSignIn() {
    var client = window.supabaseClient || (window.supabase && window.supabase.createClient && window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY));
    if (useSupabase && client && client.auth) {
      client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl }
      }).then(function (result) {
        if (result.error) {
          console.error('[SUPABASE-AUTH]', result.error);
          if (typeof alert === 'function') alert('Sign-in failed: ' + (result.error.message || 'Try again.'));
          return;
        }
        if (result.data && result.data.url) {
          window.location.href = result.data.url;
        }
      }).catch(function (err) {
        console.error('[SUPABASE-AUTH]', err);
        if (typeof alert === 'function') alert('Sign-in failed. Please try again.');
      });
      return;
    }
    // Fallback: legacy backend OAuth
    if (window.triggerGoogleSignInLegacy) {
      window.triggerGoogleSignInLegacy();
    } else {
      window.location.href = '/auth/google';
    }
  }

  if (typeof window !== 'undefined') {
    window.triggerGoogleSignIn = triggerGoogleSignIn;
  }

  if (useSupabase) {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      console.log('[SUPABASE-AUTH] Client ready for Google sign-in');
    } else {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.async = true;
      script.onload = function () {
        if (window.supabase && window.supabase.createClient && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
          window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
          console.log('[SUPABASE-AUTH] Client ready for Google sign-in');
        }
      };
      document.head.appendChild(script);
    }
  }
})();
