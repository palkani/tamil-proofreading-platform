/**
 * payment.js — Client-side payment integration for ProofTamil
 *
 * Handles:
 *  - Stripe Checkout (international): redirects to Stripe-hosted checkout page
 *  - Razorpay Checkout (India): opens Razorpay payment modal inline
 *
 * Called from pricing.ejs via startCheckout(planCode, countryCode)
 */

(function () {
  'use strict';

  /**
   * Entry point — called from pricing page "Get Pro" buttons.
   * @param {string} planCode   e.g. 'PRO_MONTHLY' | 'PRO_YEARLY'
   * @param {string} countryCode  e.g. 'IN' | 'US'
   */
  window.startCheckout = async function startCheckout(planCode, countryCode) {
    var btn = document.getElementById('checkout-btn-' + planCode);
    var origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processing…';
    }

    // For non-India users, use a direct Stripe Payment Link if configured —
    // no backend call needed, just redirect straight to Stripe.
    if ((countryCode || '').toUpperCase() !== 'IN') {
      var directLink =
        planCode === 'PRO_MONTHLY' ? (window.STRIPE_PAYMENT_LINK_PRO_MONTHLY || '') :
        planCode === 'PRO_YEARLY'  ? (window.STRIPE_PAYMENT_LINK_PRO_YEARLY  || '') :
        '';
      if (directLink) {
        window.location.href = directLink;
        return;
      }
    }

    try {
      // Use embedded checkout when Stripe.js + publishable key are available and user is not in India
      var useEmbedded = (countryCode || '').toUpperCase() !== 'IN' &&
                        window.STRIPE_PK && typeof Stripe !== 'undefined';

      var res = await fetch('/api/v1/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan_code: planCode,
          country_code: countryCode,
          embedded_mode: !!useEmbedded
        })
      });

      var data = await res.json();

      if (!res.ok) {
        var msg = (data && data.error) ? data.error : 'Checkout failed. Please try again.';
        throw new Error(msg);
      }

      if (data.client_secret && useEmbedded) {
        // Stripe Embedded Checkout — render inside page modal
        if (btn) { btn.disabled = false; btn.textContent = origText; }
        openStripeEmbeddedCheckout(data.client_secret);
      } else if (data.checkout_url) {
        // Stripe redirect to hosted checkout page
        window.location.href = data.checkout_url;
      } else if (data.razorpay_order_id) {
        // Razorpay — open inline modal
        openRazorpayModal(data, function () {
          if (btn) { btn.disabled = false; btn.textContent = origText; }
        });
      } else {
        throw new Error('Unknown checkout response. Please contact support.');
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

  /**
   * Opens the Razorpay payment modal.
   * @param {object} data   Response from /api/v1/billing/checkout-session
   * @param {function} onDismiss  Called when user closes the modal without paying
   */
  function openRazorpayModal(data, onDismiss) {
    if (typeof Razorpay === 'undefined') {
      alert('Payment SDK not loaded. Please refresh the page and try again.');
      if (onDismiss) onDismiss();
      return;
    }

    var options = {
      key: data.razorpay_key_id || window.RAZORPAY_KEY_ID || '',
      order_id: data.razorpay_order_id,
      amount: data.amount,
      currency: data.currency || 'INR',
      name: 'ProofTamil',
      description: data.plan_name || 'Pro Subscription',
      image: '/images/tamil-logo.svg',
      prefill: {
        email: window.USER_EMAIL || ''
      },
      theme: {
        color: '#1A2B68'
      },
      modal: {
        ondismiss: function () {
          if (onDismiss) onDismiss();
        }
      },
      handler: async function (response) {
        // Verify payment on backend
        try {
          var vRes = await fetch('/api/v1/billing/verify-razorpay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });

          if (vRes.ok) {
            window.location.href = '/billing/success';
          } else {
            var vData = await vRes.json().catch(function () { return {}; });
            alert('Payment verification failed: ' + (vData.error || 'Please contact support.'));
          }
        } catch (err) {
          console.error('[payment.js] Razorpay verify error:', err);
          alert('Payment verification failed. Please contact support at prooftamil@gmail.com');
        }
      }
    };

    try {
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        console.error('[payment.js] Razorpay payment failed:', response.error);
        alert('Payment failed: ' + (response.error.description || 'Unknown error') + '. Please try again.');
        if (onDismiss) onDismiss();
      });
      rzp.open();
    } catch (err) {
      console.error('[payment.js] Razorpay open error:', err);
      alert('Failed to open payment modal. Please try again.');
      if (onDismiss) onDismiss();
    }
  }

  /**
   * Opens the Stripe Embedded Checkout in the on-page modal.
   * Requires Stripe.js loaded and window.STRIPE_PK set.
   */
  var _stripeCheckoutInstance = null;

  async function openStripeEmbeddedCheckout(clientSecret) {
    var modal     = document.getElementById('stripe-checkout-modal');
    var container = document.getElementById('stripe-checkout-container');
    var loading   = document.getElementById('stripe-checkout-loading');
    var errorEl   = document.getElementById('stripe-checkout-error');
    var closeBtn  = document.getElementById('stripe-checkout-close');
    var backdrop  = document.getElementById('stripe-checkout-backdrop');

    if (!modal || !container) {
      console.error('[payment.js] Stripe checkout modal elements not found');
      return;
    }

    // Reset state
    if (_stripeCheckoutInstance) {
      try { _stripeCheckoutInstance.destroy(); } catch (_e) {}
      _stripeCheckoutInstance = null;
    }
    container.innerHTML = '';
    loading.classList.remove('hidden');
    errorEl.classList.add('hidden');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    function closeModal() {
      modal.classList.add('hidden');
      modal.style.display = '';
      if (_stripeCheckoutInstance) {
        try { _stripeCheckoutInstance.destroy(); } catch (_e) {}
        _stripeCheckoutInstance = null;
      }
      container.innerHTML = '';
    }

    closeBtn && closeBtn.addEventListener('click', closeModal, { once: true });
    backdrop && backdrop.addEventListener('click', closeModal, { once: true });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });

    try {
      var stripe   = Stripe(window.STRIPE_PK);
      var checkout = await stripe.initEmbeddedCheckout({
        fetchClientSecret: function () { return Promise.resolve(clientSecret); }
      });
      _stripeCheckoutInstance = checkout;
      loading.classList.add('hidden');
      checkout.mount('#stripe-checkout-container');
    } catch (err) {
      console.error('[payment.js] Stripe embedded checkout error:', err);
      loading.classList.add('hidden');
      errorEl.classList.remove('hidden');
    }
  }
})();
