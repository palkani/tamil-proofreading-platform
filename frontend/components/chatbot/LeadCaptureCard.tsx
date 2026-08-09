'use client';

import { useId, useState } from 'react';

import type { Strings } from './strings';

/**
 * Inline email-capture card.
 *
 * Rendered under the assistant turn whose `meta` line carried
 * `leadCapture: true`. Consent is an unchecked box the visitor must tick — it
 * is never pre-ticked, and the server rejects anything that is not literally
 * `true`.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Props {
  strings: Strings;
  sessionId: string;
  /** The visitor's last message — tells the team what they actually wanted. */
  context?: string;
  onSubmitted: () => void;
  onDismiss: () => void;
}

export function LeadCaptureCard({ strings, sessionId, context, onSubmitted, onDismiss }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const emailId = useId();
  const nameId = useId();
  const consentId = useId();
  const errorId = useId();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Client-side checks mirror the server's so the visitor gets an instant,
    // localised message. The server remains the authority.
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(strings.leadErrorEmail);
      return;
    }
    if (!consent) {
      setError(strings.leadErrorConsent);
      return;
    }

    setStatus('sending');
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          context,
          sessionId,
          pageUrl: window.location.href,
          consent: true,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setStatus('done');
      onSubmitted();
    } catch {
      setStatus('idle');
      setError(strings.leadErrorGeneric);
    }
  }

  if (status === 'done') {
    return (
      <div
        role="status"
        className="mt-2 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-3 text-sm text-ink"
      >
        {strings.leadSuccess}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-sm"
      aria-label={strings.leadTitle}
    >
      <p className="text-sm font-semibold text-ink">{strings.leadTitle}</p>
      <p className="mt-0.5 text-xs text-muted">{strings.leadBody}</p>

      <div className="mt-2.5 space-y-2">
        <div>
          <label htmlFor={emailId} className="sr-only">
            {strings.leadEmailLabel}
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={strings.leadEmailPlaceholder}
            aria-invalid={error === strings.leadErrorEmail}
            aria-describedby={error ? errorId : undefined}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label htmlFor={nameId} className="sr-only">
            {strings.leadNameLabel}
          </label>
          <input
            id={nameId}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={strings.leadNamePlaceholder}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-start gap-2">
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-describedby={error === strings.leadErrorConsent ? errorId : undefined}
            className="mt-0.5 size-4 shrink-0 rounded border-line text-primary accent-primary focus:ring-2 focus:ring-primary/30"
          />
          <label htmlFor={consentId} className="text-xs leading-snug text-ink">
            {strings.leadConsent}
          </label>
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-snug text-muted">{strings.leadPrivacy}</p>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {status === 'sending' ? strings.leadSubmitting : strings.leadSubmit}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          {strings.leadDismiss}
        </button>
      </div>
    </form>
  );
}
