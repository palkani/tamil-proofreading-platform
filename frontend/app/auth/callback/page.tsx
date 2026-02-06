'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
      setStatus('error');
      setMessage('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }

    const run = async () => {
      // After OAuth redirect, tokens may be in URL hash; allow a moment for Supabase to parse them
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!session?.access_token && !sessionError) {
        await new Promise((r) => setTimeout(r, 200));
        const next = await supabase.auth.getSession();
        session = next.data.session;
        sessionError = next.error;
      }
      if (sessionError) {
        setStatus('error');
        setMessage(sessionError.message || 'Failed to get session');
        return;
      }
      if (!session?.access_token) {
        setStatus('error');
        setMessage('No session. Try signing in again.');
        return;
      }
      try {
        const res = await apiClient.post('/auth/supabase-token', {
          access_token: session.access_token,
        });
        const accessToken = res.data?.access_token;
        if (accessToken && typeof window !== 'undefined') {
          localStorage.setItem('token', accessToken);
        }
        setStatus('ok');
        router.replace('/');
      } catch (err: unknown) {
        const msg = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to sign in';
        setStatus('error');
        setMessage(String(msg));
      }
    };

    run();
  }, [router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-[#475569]">Signing you in…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] px-4">
        <p className="text-red-600 text-center mb-4">{message}</p>
        <a href="/login" className="text-[#4F46E5] font-semibold hover:underline">Back to login</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <p className="text-[#475569]">Redirecting…</p>
    </div>
  );
}
