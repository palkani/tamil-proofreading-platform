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

    try {
      var res = await fetch('/api/v1/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_code: planCode, country_code: countryCode })
      });

      var data = await res.json();

      if (!res.ok) {
        var msg = (data && data.error) ? data.error : 'Checkout failed. Please try again.';
        throw new Error(msg);
      }

      if (data.checkout_url) {
        // Stripe — redirect to hosted checkout
        window.location.href = data.checkout_url;
      } else if (data.razorpay_order_id) {
        // Razorpay — open modal (restores button if user closes modal)
        openRazorpayModal(data, function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = origText;
          }
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
        color: '#1e3a8a'
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
})();
