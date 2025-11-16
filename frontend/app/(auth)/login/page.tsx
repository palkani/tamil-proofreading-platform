'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authAPI.login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] via-white to-[#EEF2FF] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 rounded-3xl bg-white/90 p-10 shadow-2xl border border-[#E2E8F0]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#94A3B8] text-center">Proof Tamil</p>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-[#0F172A]">Welcome back</h2>
          <p className="text-center text-sm text-[#475569]">Sign in with your email and password.</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-[#E2E8F0] px-4 py-3 text-sm text-[#0F172A] shadow-sm focus:border-[#4F46E5] focus:ring-[#4F46E5]/20 focus:outline-none"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-2xl border border-[#E2E8F0] px-4 py-3 text-sm text-[#0F172A] shadow-sm focus:border-[#4F46E5] focus:ring-[#4F46E5]/20 focus:outline-none"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full inline-flex justify-center rounded-full border border-transparent bg-gradient-to-r from-[#4F46E5] to-[#6366F1] py-3 px-6 text-sm font-semibold text-white shadow-lg shadow-[#4F46E5]/30 transition-all hover:shadow-xl hover:scale-105 disabled:opacity-60 disabled:hover:scale-100"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center">
            <Link href="/register" className="text-sm font-semibold text-[#4F46E5] hover:text-[#4F46E5]/80">
              Don't have an account? Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

