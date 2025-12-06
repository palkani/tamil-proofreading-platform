'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { paymentAPI } from '@/lib/api';
import type { RazorpayCheckoutHandlerPayload, RazorpayOrder } from '@/types';
import { extractApiErrorMessage } from '@/utils/errors';

type PaymentMethod = 'stripe' | 'razorpay';

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayCheckoutHandlerPayload) => void;
  prefill: {
    email?: string;
  };
  theme: {
    color: string;
  };
}

interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const isRazorpayOrder = (intent: unknown): intent is RazorpayOrder => {
  if (!intent || typeof intent !== 'object') {
    return false;
  }
  const candidate = intent as { id?: unknown };
  return typeof candidate.id === 'string';
};

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const amountParam = searchParams.get('amount') ?? '0';
  const wordCount = searchParams.get('word_count') ?? '0';
  const amountValue = Number(amountParam);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('razorpay');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const handlePayment = async () => {
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      setError('Invalid payment amount');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await paymentAPI.createPayment({
        amount: amountValue,
        currency: 'INR',
        payment_method: paymentMethod,
        payment_type: 'pay_per_use',
        description: `Payment for ${wordCount} words proofreading`,
      });

      const { payment, payment_intent } = response;

      if (paymentMethod === 'stripe') {
        router.push('/dashboard');
        return;
      }

      if (!isRazorpayOrder(payment_intent)) {
        setError('Unable to initialize Razorpay checkout.');
        return;
      }

      const RazorpayConstructor = window.Razorpay;
      if (typeof RazorpayConstructor !== 'function') {
        setError('Razorpay SDK not loaded yet.');
        return;
      }

      const options: RazorpayOptions = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
        amount: payment.amount * 100,
        currency: 'INR',
        name: 'Tamil Proofreading',
        description: payment.description,
        order_id: payment_intent.id,
        handler: async (checkoutResponse) => {
          try {
            await paymentAPI.verifyPayment(payment.transaction_id, checkoutResponse.razorpay_payment_id);
            router.push('/dashboard');
          } catch {
            setError('Payment verification failed');
          }
        },
        prefill: {
          email: '',
        },
        theme: {
          color: '#4F46E5',
        },
      };

      if (!options.key) {
        setError('Razorpay key is not configured.');
        return;
      }

      const razorpay = new RazorpayConstructor(options);
      razorpay.open();
    } catch (error) {
      setError(extractApiErrorMessage(error, 'Payment failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Payment</h2>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        <div className="mb-6">
          <p className="text-gray-600">
            Amount: <strong className="text-gray-900">₹{Number.isNaN(amountValue) ? '0' : amountValue}</strong>
          </p>
          <p className="text-gray-600">
            Words: <strong className="text-gray-900">{wordCount}</strong>
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="razorpay"
                checked={paymentMethod === 'razorpay'}
                onChange={() => setPaymentMethod('razorpay')}
                className="mr-2"
              />
              Razorpay
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="stripe"
                checked={paymentMethod === 'stripe'}
                onChange={() => setPaymentMethod('stripe')}
                className="mr-2"
              />
              Stripe
            </label>
          </div>
        </div>

        <button
          onClick={handlePayment}
          disabled={loading}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Pay Now'}
        </button>

        <button
          onClick={() => router.back()}
          className="w-full mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Loading payment details...
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}

