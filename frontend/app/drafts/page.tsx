'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { submissionAPI, authAPI } from '@/lib/api';
import AppHeader from '@/components/AppHeader';
import type { Submission, User } from '@/types';
import { extractApiErrorMessage } from '@/utils/errors';

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    loadDrafts();
    loadUser();
  }, []);

  const loadDrafts = async () => {
    try {
      setLoading(true);
      setError('');
      // Fetch all submissions (drafts) - use a large limit to get all
      const { submissions } = await submissionAPI.getSubmissions(1000, 0);
      // Sort by created_at descending (newest first)
      const sorted = submissions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setDrafts(sorted);
    } catch (err) {
      console.error('Error loading drafts:', err);
      setError(extractApiErrorMessage(err, 'Unable to load drafts. Please try again later.'));
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
      setUser({
        id: 0,
        email: 'test@example.com',
        name: 'Test User',
        role: 'writer',
        subscription: 'free',
        is_active: true,
        created_at: '',
        updated_at: '',
      });
    }
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setUser(null);
    router.push('/');
  };

  const handleNewDraft = () => {
    router.push('/workspace');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
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
          {/* Header with New Draft Button */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-3xl font-bold text-[var(--surface)] mb-2 uppercase tracking-wide">
                My Drafts
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} saved
              </p>
            </div>
            <button
              onClick={handleNewDraft}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white font-semibold rounded-full shadow-lg shadow-[#4F46E5]/30 hover:shadow-xl hover:scale-105 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Draft
            </button>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Drafts List */}
          {drafts.length === 0 ? (
            <div className="bg-white/95 shadow-lg rounded-xl border border-[var(--surface)] p-12 text-center">
              <svg
                className="mx-auto h-16 w-16 text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-[var(--surface)] mb-2">No drafts yet</h3>
              <p className="text-[var(--text-secondary)] mb-6">
                Create your first draft to get started with Tamil proofreading
              </p>
              <button
                onClick={handleNewDraft}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white font-semibold rounded-full shadow-lg shadow-[#4F46E5]/30 hover:shadow-xl hover:scale-105 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Create New Draft
              </button>
            </div>
          ) : (
            <div className="bg-white/95 shadow-lg rounded-xl border border-[var(--surface)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--surface)]/20">
                  <thead className="bg-[var(--background-muted)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                        Title / Preview
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                        Words
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[var(--surface)] uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-[var(--surface)]/10">
                    {drafts.map((draft) => {
                      // Extract preview text from original_text or corrected_text
                      const previewText = draft.original_text || draft.corrected_text || '';
                      const preview = previewText.length > 100 
                        ? previewText.substring(0, 100) + '...' 
                        : previewText;
                      
                      return (
                        <tr key={draft.id} className="hover:bg-[var(--background-muted)]/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="max-w-md">
                              <Link
                                href={`/submissions/${draft.id}`}
                                className="text-sm font-medium text-[var(--surface)] hover:text-[#4F46E5] underline"
                              >
                                Draft #{draft.id}
                              </Link>
                              <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                                {preview || 'No content'}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--surface)]/70">
                            {draft.word_count || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusColor(draft.status)}`}>
                              {draft.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                            {formatDate(draft.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <Link
                              href={`/submissions/${draft.id}`}
                              className="text-[#4F46E5] hover:text-[#6366F1] mr-4"
                            >
                              View
                            </Link>
                            <button
                              onClick={() => router.push(`/submit?draft=${draft.id}`)}
                              className="text-[#4F46E5] hover:text-[#6366F1]"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

