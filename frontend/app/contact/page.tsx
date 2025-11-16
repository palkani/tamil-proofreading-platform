'use client';

import { useEffect, useState } from 'react';
import AppHeader from '@/components/AppHeader';
import { authAPI, contactAPI } from '@/lib/api';

interface FormState {
  name: string;
  email: string;
  message: string;
}

export default function ContactPage() {
  const [form, setForm] = useState<FormState>({ name: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setShowAdmin(user.role === 'admin');
        setUserEmail(user.email);
        setForm((prev) => ({ ...prev, name: user.name || prev.name, email: user.email || prev.email }));
      } catch (err) {
        // user not logged in; stay with manual inputs
      }
    };

    loadUser();
  }, []);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess('');
    setError('');

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Please fill in your name, email, and message.');
      return;
    }

    setSubmitting(true);
    try {
      await contactAPI.sendMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      });
      setSuccess('Thanks for reaching out! We will respond shortly.');
      setForm((prev) => ({ ...prev, message: '' }));
    } catch (err: any) {
      const details = err?.response?.data?.error || 'Unable to send message. Please try again.';
      setError(details);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} />
      <main className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-[var(--font-display)]">
        <header className="mb-10 text-center space-y-2">
          <h1 className="text-4xl font-bold text-[var(--surface)] uppercase tracking-[0.3em]">Contact Us</h1>
          <p className="text-sm text-[var(--surface)]/80 max-w-2xl mx-auto">
            Share feedback, report issues, or ask for support. Your message goes directly to our admin team.
          </p>
        </header>

        <section className="bg-white/95 border border-[var(--surface)] rounded-2xl shadow-xl p-6 sm:p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--surface)]/80 uppercase tracking-widest">
                Name
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  className="rounded-xl border border-[var(--surface)]/30 px-4 py-3 text-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--surface)]/50"
                  placeholder="Your full name"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--surface)]/80 uppercase tracking-widest">
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  className="rounded-xl border border-[var(--surface)]/30 px-4 py-3 text-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--surface)]/50"
                  placeholder="you@example.com"
                  required
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--surface)]/80 uppercase tracking-widest">
              Message
              <textarea
                value={form.message}
                onChange={(event) => updateField('message', event.target.value)}
                className="min-h-[160px] rounded-2xl border border-[var(--surface)]/30 px-4 py-3 text-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--surface)]/50"
                placeholder="Let us know how we can help."
                required
              />
            </label>

            {error && <p className="text-sm text-red-700 font-semibold">{error}</p>}
            {success && <p className="text-sm text-green-700 font-semibold">{success}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-[var(--surface)] text-[var(--accent-contrast)] rounded-full shadow-lg uppercase tracking-widest hover:bg-black/80 disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send Message'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
