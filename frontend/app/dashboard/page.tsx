'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { dashboardAPI, authAPI } from '@/lib/api';
import AppHeader from '@/components/AppHeader';
import type { DashboardStats } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadDashboard();
    loadUser();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await dashboardAPI.getStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUser = async () => {
    try {
      const userData = await authAPI.getCurrentUser();
      setUser(userData);
    } catch (err) {
      // Authentication disabled for testing - skip login requirement
      setUser({ email: 'test@example.com', role: 'user' });
    }
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setUser(null);
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <AppHeader
        showAdmin={user?.role === 'admin'}
        userEmail={user?.email}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-3xl font-bold text-[var(--surface)] mb-6 uppercase tracking-wide">
            Dashboard Overview
          </h2>

          <div className="bg-white/95 shadow-lg rounded-xl border border-[var(--surface)] p-6">
            <h3 className="text-lg font-semibold mb-4 text-[var(--surface)]">Recent Submissions</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--surface)]/20">
                <thead className="bg-[var(--background-muted)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                      Words
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                      Model
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[var(--surface)]/10">
                  {stats?.recent_submissions.map((submission) => (
                    <tr key={submission.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--surface)]">
                        <Link href={`/submissions/${submission.id}`} className="text-[var(--surface)] hover:text-[var(--surface)]/70 underline">
                          {submission.id}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--surface)]/70">
                        {submission.word_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--surface)]/70">
                        {submission.model_used}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          submission.status === 'completed' ? 'bg-green-200 text-green-900' :
                          submission.status === 'processing' ? 'bg-yellow-200 text-yellow-900' :
                          submission.status === 'failed' ? 'bg-red-200 text-red-900' :
                          'bg-[var(--background-muted)] text-[var(--surface)]'
                        }`}>
                          {submission.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--surface)]/70">
                        {new Date(submission.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

