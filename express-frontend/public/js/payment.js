/**
 * payment.js — Client-side payment integration for ProofTamil
 *
 * Only DodoPayments is supported. The backend always returns a checkout_url
 * which we redirect to. Stripe and Razorpay have been removed.
 */

(function () {
  'use strict';

  /** Returns headers with Content-Type + Authorization (Bearer token from localStorage). */
  function _authHeaders() {
    var token = localStorage.getItem('access_token') || '';
    var h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  /**
   * Entry point — called from pricing page and workspace upgrade modal.
   * @param {string} planCode    e.g. 'PRO_MONTHLY' | 'PRO_YEARLY'
   * @param {string} countryCode e.g. 'IN' | 'US'
   */
  window.startCheckout = async function startCheckout(planCode, countryCode) {
    // Require login before attempting checkout
    if (!window.USER_LOGGED_IN && !window.USER_EMAIL) {
      var afterAuthUrl = '/pricing?auto_checkout=' + encodeURIComponent(planCode);
      window.location.href = '/login?redirect=' + encodeURIComponent(afterAuthUrl);
      return;
    }

    var btn = document.getElementById('checkout-btn-' + planCode);
    var origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processing…';
    }

    try {
      var res = await fetch('/api/v1/billing/checkout-session', {
        method: 'POST',
        headers: _authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          plan_code: planCode,
          country_code: countryCode || 'US',
        }),
      });

      var data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        var msg = (data && data.error) ? data.error : 'Checkout failed. Please try again.';
        var details = (data && data.details) ? data.details : '';
        if (details) msg = msg + ': ' + details;
        throw new Error(msg);
      }

      if (data.checkout_url) {
        // Route via /checkout/redirecting interstitial so users have a
        // visible "Back to pricing" button when they land on Dodo (their
        // page has no in-app back navigation) and if they browser-back
        // from Dodo, they hit our page not the pricing page directly.
        var q = 'url=' + encodeURIComponent(data.checkout_url)
              + (planCode ? '&plan=' + encodeURIComponent(planCode) : '');
        window.location.href = '/checkout/redirecting?' + q;
      } else {
        throw new Error('No checkout URL returned. Please contact support.');
      }
    } catch (err) {
      console.error('[payment.js] Checkout error:', err);
      alert(err.message || 'Checkout error. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  };
})();
