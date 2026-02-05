'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';

export default function PrivacyPage() {
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    authAPI.getCurrentUser().then((user) => {
      setUserEmail(user.email);
      setShowAdmin(user.role === 'admin');
    }).catch(() => {
      setUserEmail('');
      setShowAdmin(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#0F172A] mb-6">Privacy Policy</h1>
        <p className="text-[#475569] mb-4">
          ProofTamil (&quot;we&quot;) respects your privacy. This policy describes how we collect, use, and protect your data when you use our Tamil proofreading tool, grammar checker, and related services.
        </p>
        <h2 className="text-xl font-semibold text-[#0F172A] mt-6 mb-2">Data we collect</h2>
        <p className="text-[#475569] mb-4">
          We collect account information (email, name) and the text you submit for proofreading. We use this to provide the service, improve our models, and communicate with you.
        </p>
        <h2 className="text-xl font-semibold text-[#0F172A] mt-6 mb-2">How we use your data</h2>
        <p className="text-[#475569] mb-4">
          Your text is processed by our AI systems to provide grammar and spelling suggestions. We do not sell your personal data or content to third parties.
        </p>
        <h2 className="text-xl font-semibold text-[#0F172A] mt-6 mb-2">Contact</h2>
        <p className="text-[#475569] mb-4">
          For privacy-related questions, contact us at prooftamil@gmail.com.
        </p>
        <Link href="/" className="text-[#4F46E5] font-semibold hover:underline">Back to Home</Link>
      </div>
    </div>
  );
}
