'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';

export default function TermsPage() {
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
        <h1 className="text-4xl font-bold text-[#0F172A] mb-6">Terms of Service</h1>
        <p className="text-[#475569] mb-4">
          By using ProofTamil, you agree to these terms. Our free Tamil proofreading tool, AI grammar checker, and writing correction services are provided &quot;as is.&quot;
        </p>
        <h2 className="text-xl font-semibold text-[#0F172A] mt-6 mb-2">Acceptable use</h2>
        <p className="text-[#475569] mb-4">
          You may not use the service for illegal purposes, to harass others, or to attempt to reverse-engineer or overload our systems.
        </p>
        <h2 className="text-xl font-semibold text-[#0F172A] mt-6 mb-2">Intellectual property</h2>
        <p className="text-[#475569] mb-4">
          You retain ownership of the text you submit. We may use anonymized data to improve our models and service.
        </p>
        <Link href="/" className="text-[#4F46E5] font-semibold hover:underline">Back to Home</Link>
      </div>
    </div>
  );
}
