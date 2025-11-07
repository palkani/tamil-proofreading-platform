'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { paymentAPI } from '@/lib/api';

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const amount = searchParams.get('amount');
  const wordCount = searchParams.get('word_count');

  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'razorpay'>('razorpay');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePayment = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await paymentAPI.createPayment({
        amount: parseFloat(amount || '0'),
        currency: 'INR',
        payment_method: paymentMethod,
        payment_type: 'pay_per_use',
        description: `Payment for ${wordCount} words proofreading`,
      });

      if (paymentMethod === 'stripe') {
        // Redirect to Stripe checkout
        // In production, use Stripe Elements
        router.push('/dashboard');
      } else {
        // Razorpay checkout
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: response.payment.amount * 100, // Convert to paise
          currency: 'INR',
          name: 'Tamil Proofreading',
          description: response.payment.description,
          order_id: response.payment_intent.id,
          handler: async function (response: any) {
            try {
              await paymentAPI.verifyPayment(
                response.payment.transaction_id,
                response.razorpay_payment_id
              );
              router.push('/dashboard');
            } catch (err) {
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

        const razorpay = (window as any).Razorpay(options);
        razorpay.open();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

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
          <p className="text-gray-600">Amount: <strong className="text-gray-900">₹{amount}</strong></p>
          <p className="text-gray-600">Words: <strong className="text-gray-900">{wordCount}</strong></p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Method
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="razorpay"
                checked={paymentMethod === 'razorpay'}
                onChange={(e) => setPaymentMethod(e.target.value as 'razorpay')}
                className="mr-2"
              />
              Razorpay
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="stripe"
                checked={paymentMethod === 'stripe'}
                onChange={(e) => setPaymentMethod(e.target.value as 'stripe')}
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

