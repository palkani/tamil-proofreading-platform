'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';

export default function FontConverterPage() {
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    authAPI.getCurrentUser().then((user) => { setUserEmail(user.email); setShowAdmin(user.role === 'admin'); }).catch(() => { setUserEmail(''); setShowAdmin(false); });
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#0F172A] mb-4">Tamil Font Converter</h1>
        <p className="text-[#475569] mb-6">Convert Tamil text between legacy font encodings (Bamini, TSCII) and Unicode.</p>
        <p className="text-[#94A3B8] text-sm">This tool will be available in the unified app.</p>
        <Link href="/" className="inline-block mt-4 text-[#4F46E5] font-semibold hover:underline">← Home</Link>
      </div>
    </div>
  );
}
