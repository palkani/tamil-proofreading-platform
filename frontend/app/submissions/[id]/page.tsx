'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { submissionAPI, authAPI } from '@/lib/api';
import type { Submission, Suggestion } from '@/types';
import AppHeader from '@/components/AppHeader';
import SubmissionDiff from '@/components/SubmissionDiff';

export default function SubmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  const submissionId = useMemo(() => {
    const raw = params?.id;
    if (!raw) return null;
    if (Array.isArray(raw)) return Number(raw[0]);
    return Number(raw);
  }, [params?.id]);

  useEffect(() => {
    const init = async () => {
      if (!submissionId || Number.isNaN(submissionId)) {
        setError('Invalid submission ID');
        setLoading(false);
        return;
      }

      try {
        const user = await authAPI.getCurrentUser();
        setUserEmail(user.email);
        setShowAdmin(user.role === 'admin');
      } catch (err) {
        router.push('/login');
        return;
      }

      try {
        const data = await submissionAPI.getSubmission(submissionId);
        setSubmission(data);
      } catch (err: any) {
        console.error('Failed to load submission', err);
        setError(err?.response?.data?.error || 'Failed to load submission.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [submissionId, router]);

  const handleLogout = async () => {
    await authAPI.logout();
    setUserEmail('');
    setShowAdmin(false);
    router.push('/');
  };

  const suggestions: Suggestion[] = useMemo(() => {
    if (!submission?.suggestions) return [];

    try {
      const parsed = JSON.parse(submission.suggestions);
      if (Array.isArray(parsed)) {
        return parsed as Suggestion[];
      }
      if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
        return parsed.suggestions as Suggestion[];
      }
      return [];
    } catch (err) {
      console.warn('Unable to parse suggestions', err);
      return [];
    }
  }, [submission?.suggestions]);

  const alternatives: string[] = useMemo(() => {
    if (!submission?.alternatives) return [];

    try {
      const parsed = JSON.parse(submission.alternatives);
      if (Array.isArray(parsed)) {
        return parsed as string[];
      }
      if (parsed?.alternatives && Array.isArray(parsed.alternatives)) {
        return parsed.alternatives as string[];
      }
      return [];
    } catch (err) {
      console.warn('Unable to parse alternatives', err);
      return [];
    }
  }, [submission?.alternatives]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={handleLogout} />
        <div className="max-w-3xl mx-auto py-10 px-4">
          <div className="bg-white shadow rounded-lg p-6 text-red-600">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!submission) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={handleLogout} />

      <div className="max-w-4xl mx-auto py-10 px-4 space-y-6">
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Status</h2>
            <p className="text-sm text-gray-900 capitalize">{submission.status}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Word Count</h2>
              <p className="text-sm text-gray-900">{submission.word_count}</p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Model Used</h2>
              <p className="text-sm text-gray-900">{submission.model_used}</p>
            </div>
          </div>
          {submission.processing_time && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Processing Time</h2>
              <p className="text-sm text-gray-900">{submission.processing_time.toFixed(2)}s</p>
            </div>
          )}
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Submitted</h2>
            <p className="text-sm text-gray-900">{new Date(submission.created_at).toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Original Text</h2>
            <div className="mt-2 p-4 bg-gray-50 rounded-md text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto border border-gray-100">
              {submission.original_text}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900">Proofread Text</h2>
            <div className="mt-2 p-4 bg-green-50 rounded-md text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto border border-green-100">
              {submission.proofread_text || 'Proofread text not yet available.'}
            </div>
          </div>

          {submission.proofread_text && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Comparison</h2>
              <SubmissionDiff original={submission.original_text} proofread={submission.proofread_text} />
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Suggestions</h2>
              <ul className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <li
                    key={`${suggestion.original}-${index}`}
                    className="bg-white border border-gray-200 rounded-md p-4 text-sm text-gray-800"
                  >
                    <p className="font-medium">{suggestion.original} → {suggestion.corrected}</p>
                    {suggestion.reason && (
                      <p className="text-xs text-gray-500 mt-1">{suggestion.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alternatives.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Alternative Sentences</h2>
              <ul className="space-y-2">
                {alternatives.map((alt, index) => (
                  <li
                    key={`${alt}-${index}`}
                    className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-gray-800 whitespace-pre-wrap"
                  >
                    {alt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submission.status === 'failed' && submission.error && (
            <div className="p-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-md">
              Error: {submission.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
