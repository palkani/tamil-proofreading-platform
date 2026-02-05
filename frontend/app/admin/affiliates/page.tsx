'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';
import { useRequireAuth } from '@/lib/useRequireAuth';

export default function AdminAffiliatesPage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useRequireAuth();
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (authLoading || !authUser) return;
    if (authUser.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    setUserEmail(authUser.email);
    setShowAdmin(true);
  }, [authLoading, authUser, router]);

  if (authLoading || !authUser) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#0F172A] mb-4">Affiliate management</h1>
        <p className="text-[#475569] mb-6">Manage affiliate codes and status. Use the main Admin Panel for full controls.</p>
        <Link href="/admin" className="inline-block text-[#4F46E5] font-semibold hover:underline">← Back to Admin Panel</Link>
      </div>
    </div>
  );
}
