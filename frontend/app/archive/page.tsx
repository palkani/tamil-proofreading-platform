'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import { authAPI, submissionAPI } from '@/lib/api';
import type { Submission } from '@/types';

const RETENTION_DAYS = 15;

const calculateDaysRemaining = (archivedAt?: string) => {
  if (!archivedAt) return RETENTION_DAYS;
  const archivedDate = new Date(archivedAt);
  const now = new Date();
  const diff = Math.ceil((archivedDate.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000 - now.getTime()) / (24 * 60 * 60 * 1000));
  return diff > 0 ? diff : 0;
};

export default function ArchivePage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [archivedDrafts, setArchivedDrafts] = useState<Submission[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadArchive = async () => {
      try {
        setLoading(true);
        const user = await authAPI.getCurrentUser();
        setUserEmail(user.email);
        setShowAdmin(user.role === 'admin');

        const { submissions, retention_days, message: apiMessage } = await submissionAPI.getArchivedSubmissions();
        setArchivedDrafts(submissions);
        setMessage(apiMessage ?? `Drafts are retained for ${retention_days} days before deletion.`);
      } catch (err: any) {
        // Authentication disabled for testing - skip login requirement
        setUserEmail('test@example.com');
        setShowAdmin(false);
        setError('Unable to load archived drafts. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadArchive();
  }, [router]);

  const archiveSummary = useMemo(() => {
    if (!archivedDrafts.length) {
      return 'No archived drafts at the moment. Archived drafts appear here for 15 days before deletion.';
    }
    return `${archivedDrafts.length} draft${archivedDrafts.length === 1 ? '' : 's'} currently kept for up to ${RETENTION_DAYS} days.`;
  }, [archivedDrafts.length]);

  const handleLogout = async () => {
    await authAPI.logout();
    setUserEmail('');
    setShowAdmin(false);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#f6f6f8] text-[#1c1c1c] font-[var(--font-display)]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={handleLogout} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-12 sm:px-8">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight text-[#1c1c1c]">Archive</h1>
            <p className="text-sm text-[#71717a]">
              {message || 'Drafts moved to archive remain here for 15 days before being permanently deleted.'}
            </p>
          </header>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <section className="rounded-3xl border border-[#e4e4e7] bg-white/90 px-6 py-6 shadow-sm">
            <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#1c1c1c]">Archived drafts</h2>
                <p className="text-xs text-[#71717a]">{archiveSummary}</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#a1a1aa]">
                Retained {RETENTION_DAYS} days
              </span>
            </header>

            {loading ? (
              <div className="mt-8 flex min-h-[160px] items-center justify-center text-sm text-[#71717a]">Loading archived drafts…</div>
            ) : archivedDrafts.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[#e4e4e7] bg-[#fafafc] px-6 py-12 text-center text-sm text-[#71717a]">
                No drafts in archive. When you archive a draft, it will appear here for 15 days before it is deleted.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {archivedDrafts.map((draft) => {
                  const archivedDate = draft.archived_at ? new Date(draft.archived_at) : null;
                  const daysRemaining = calculateDaysRemaining(draft.archived_at);
                  return (
                    <article key={draft.id} className="rounded-2xl border border-[#e4e4e7] bg-white px-5 py-5 shadow-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-[#1c1c1c]">Untitled draft</h3>
                          <p className="text-xs text-[#a1a1aa]">
                            Archived {archivedDate ? archivedDate.toLocaleDateString() : 'recently'} • Word count {draft.word_count}
                          </p>
                        </div>
                        <span className="inline-flex items-center justify-center rounded-full border border-[#fde68a] bg-[#fef9c3] px-3 py-1 text-xs font-semibold text-[#b45309]">
                          {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-[#71717a] line-clamp-3">
                        {draft.original_text?.slice(0, 140) || 'Tamil draft content'}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
