'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 11.9999C12 11.2071 12.1429 10.456 12.4 9.7605C12.8571 8.47608 13.7143 7.39693 14.8286 6.64788C16.0286 5.8367 17.4857 5.42847 19 5.42847C20.0571 5.42847 21 5.59351 21.7714 5.85701L19.9143 8.78519C19.4857 8.618 18.9429 8.53593 18.3714 8.53593C17.4286 8.53593 16.5857 8.90208 15.9857 9.54518C15.4143 10.1599 15.1 11.0176 15.1 11.9999C15.1 12.9822 15.4143 13.84 15.9857 14.4547C16.5857 15.0978 17.4286 15.4639 18.3857 15.4639C19.0286 15.4639 19.5857 15.3663 20.0429 15.1871C20.5286 14.9794 21 14.6578 21.3857 14.2511C21.5714 14.0529 21.7429 13.8256 21.9 13.5551C22.1857 13.0759 22.4 12.5041 22.5143 11.8579H18.3857V9.42853H24C24 10.4762 23.9 11.4521 23.7143 12.3707C23.3571 14.2739 22.5571 15.8865 21.3571 17.0977C20.0429 18.4109 18.1429 19.1427 15.8571 19.1427C12.8714 19.1427 10.3571 17.7584 8.85715 15.6838C7.34286 13.6603 6.6 11.0176 6.6 8.28594C6.6 3.7997 9.85714 0.571533 14.4143 0.571533C16.9 0.571533 18.8429 1.4761 20.2143 2.84529L17.6 5.36347C16.9143 4.70657 15.8714 4.28594 14.4714 4.28594C11.9429 4.28594 10.0714 6.2997 10.0714 8.90076C10.0714 10.531 10.7857 12.031 12 11.9999Z"
      />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authAPI.register(email, password, name);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = () => {
    setError('Google sign-up is coming soon. Please use email sign-up for now.');
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--surface)]">
      <div className="absolute top-6 left-6 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="ProofTamil" width={40} height={40} className="rounded-full" />
          <span className="text-lg font-semibold">ProofTamil</span>
        </Link>
      </div>

      <div className="min-h-screen flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-5xl bg-white/95 text-[var(--surface)] border border-[var(--surface)]/10 shadow-2xl rounded-3xl overflow-hidden grid md:grid-cols-[1.15fr,1fr]">
          <div className="hidden md:flex flex-col justify-between bg-[var(--surface)] text-[var(--accent-contrast)] p-10">
            <div className="space-y-6">
              <p className="uppercase tracking-[0.4em] text-sm text-[var(--accent-contrast)]/70">Free Tamil Writer</p>
              <h2 className="text-4xl font-bold leading-tight">
                Create a ProofTamil account in seconds.
              </h2>
              <p className="text-sm text-[var(--accent-contrast)]/80 leading-relaxed">
                ProofTamil offers AI-powered proofreading, real-time Tamil typing, and deep writing analytics. Join thousands of creators crafting flawless Tamil content.
              </p>
            </div>

            <ul className="space-y-4 text-sm text-[var(--accent-contrast)]/80">
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-contrast)]"></span>
                Instant Tamil transliteration and autocomplete as you type.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-contrast)]"></span>
                AI proofreading with grammar, style, and sentence alternatives.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-contrast)]"></span>
                Share drafts, revisit history, and collaborate securely.
              </li>
            </ul>
          </div>

          <div className="p-8 sm:p-10 space-y-8">
            <header className="space-y-2">
              <h1 className="text-3xl font-bold">Sign up for ProofTamil</h1>
              <p className="text-sm text-[var(--surface)]/70">
                Choose email or continue with Google. It takes less than a minute.
              </p>
            </header>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignup}
                className="w-full flex items-center justify-center gap-3 rounded-full border border-[var(--surface)]/20 bg-white px-4 py-3 font-semibold text-[var(--surface)] shadow-sm transition hover:bg-[var(--background-muted)]"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-[var(--surface)]/50">
                <span className="h-px flex-1 bg-[var(--surface)]/20" />
                Or use email
                <span className="h-px flex-1 bg-[var(--surface)]/20" />
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleEmailSignup}>
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-semibold">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="w-full rounded-xl border border-[var(--surface)]/20 bg-white px-4 py-3 text-[var(--surface)] shadow-inner focus:outline-none focus:ring-2 focus:ring-[var(--surface)]/40"
                  placeholder="e.g. Kavya Raman"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-[var(--surface)]/20 bg-white px-4 py-3 text-[var(--surface)] shadow-inner focus:outline-none focus:ring-2 focus:ring-[var(--surface)]/40"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-semibold">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="w-full rounded-xl border border-[var(--surface)]/20 bg-white px-4 py-3 text-[var(--surface)] shadow-inner focus:outline-none focus:ring-2 focus:ring-[var(--surface)]/40"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-[var(--surface)] py-3 font-semibold text-[var(--accent-contrast)] shadow-lg transition hover:bg-black/80 disabled:opacity-50"
              >
                {loading ? 'Creating your account…' : 'Create free account'}
              </button>
            </form>

            <p className="text-xs text-[var(--surface)]/60">
              By signing up you agree to receive product updates from ProofTamil. You can unsubscribe anytime.
            </p>

            <div className="text-sm text-[var(--surface)]/70">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[var(--surface)] underline decoration-[var(--surface)]/40 underline-offset-4">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

