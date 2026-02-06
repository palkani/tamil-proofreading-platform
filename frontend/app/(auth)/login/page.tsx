'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI } from '@/lib/api';
import { extractApiErrorMessage } from '@/utils/errors';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setError('Google sign-in is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }
    setGoogleLoading(true);
    setError('');
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback';
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
        return;
      }
      // Redirect is handled by Supabase
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Google sign-in failed'));
    }
    setGoogleLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authAPI.login(email, password);
      router.replace('/drafts');
    } catch (error) {
      setError(extractApiErrorMessage(error, 'Login failed'));
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

          {supabase && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E2E8F0]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-[#94A3B8]">Or continue with</span>
              </div>
            </div>
          )}
          {supabase && (
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full inline-flex justify-center items-center gap-2 rounded-full border border-[#E2E8F0] bg-white py-3 px-6 text-sm font-semibold text-[#0F172A] shadow-sm hover:bg-[#F8FAFC] disabled:opacity-60"
              >
                {googleLoading ? (
                  'Redirecting…'
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </button>
            </div>
          )}

          <div className="text-center">
            <Link href="/register" className="text-sm font-semibold text-[#4F46E5] hover:text-[#4F46E5]/80">
              Don&apos;t have an account? Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

