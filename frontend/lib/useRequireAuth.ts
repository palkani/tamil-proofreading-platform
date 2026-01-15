'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import type { User } from '@/types';

type RequireAuthResult = {
  user: User | null;
  loading: boolean;
};

export function useRequireAuth(): RequireAuthResult {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        let token: string | null = null;
        if (typeof window !== 'undefined') {
          // Support OAuth flows that redirect back with ?access_token=... (store it, then clean URL)
          try {
            const url = new URL(window.location.href);
            const tokenFromUrl = url.searchParams.get('access_token');
            if (tokenFromUrl && tokenFromUrl.trim()) {
              localStorage.setItem('token', tokenFromUrl);
              url.searchParams.delete('access_token');
              window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
            }
          } catch {
            // ignore URL parsing issues
          }

          token = localStorage.getItem('token');
        }
        if (!token) {
          router.replace('/login');
          return;
        }

        const current = await authAPI.getCurrentUser();
        if (cancelled) return;
        setUser(current);
      } catch (_err) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
        }
        router.replace('/login');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { user, loading };
}


