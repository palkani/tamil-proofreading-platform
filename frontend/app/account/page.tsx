'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';

export default function AccountPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setUserEmail(user.email);
        setUserName(user.name ?? '');
        setShowAdmin(user.role === 'admin');
      } catch (err) {
        router.push('/login');
      }
    };

    loadUser();
  }, [router]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('Your account updates will be available soon.');
    setTimeout(() => setSaving(false), 800);
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setUserEmail('');
    setShowAdmin(false);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-[var(--font-display)]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={handleLogout} />
      <main className="mx-auto w-full max-w-4xl px-6 pb-20 pt-32 sm:px-12 lg:px-16">
        <header className="mb-10 space-y-3">
          <p className="text-sm font-semibold text-[#6366F1] uppercase tracking-[0.3em]">Account Center</p>
          <h1 className="text-4xl font-bold tracking-tight text-[#0F172A]">Manage your profile</h1>
          <p className="text-base text-[#475569]">
            Update your personal details and keep your Proof Tamil account secure.
          </p>
        </header>

        <section className="rounded-[32px] border border-[#E2E8F0] bg-white shadow-xl p-8 space-y-8">
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label htmlFor="name" className="text-sm font-semibold text-[#475569] block mb-2">
                Display name
              </label>
              <input
                id="name"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                className="w-full rounded-2xl border border-[#E2E8F0] px-4 py-3 text-sm shadow-sm focus:border-[#4F46E5] focus:ring-[#4F46E5]/20 focus:outline-none"
                placeholder="Your name"
              />
            </div>

            <div>
              <label htmlFor="email" className="text-sm font-semibold text-[#475569] block mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={userEmail}
                disabled
                className="w-full rounded-2xl border border-[#E2E8F0] px-4 py-3 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#4F46E5] to-[#6366F1] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4F46E5]/30 hover:shadow-xl hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-[#E2E8F0] px-6 py-3 text-sm font-semibold text-[#4F46E5] hover:border-[#4F46E5] hover:bg-[#EEF2FF] transition-all"
              >
                Change password
              </button>
            </div>
          </form>

          {message && (
            <div className="rounded-2xl border border-[#4F46E5]/20 bg-[#EEF2FF] px-4 py-3 text-sm text-[#4F46E5]">
              {message}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

