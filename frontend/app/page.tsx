/**
 * Host page for local chatbot development.
 *
 * The production site is served by `express-frontend`; this Next app exists to
 * hold the chatbot (API + widget). This page is the harness you open at
 * http://localhost:3100 to exercise the widget against real RAG data.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">ProofTamil chatbot</h1>
      <p className="mt-3 text-muted">
        Development harness. The floating assistant is mounted site-wide from{' '}
        <code className="rounded bg-primary-soft px-1.5 py-0.5 text-sm text-primary">app/layout.tsx</code>.
      </p>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">Try asking</h2>
      <ul className="mt-3 space-y-2 text-ink">
        <li>How much does ProofTamil cost?</li>
        <li>How does the handwriting OCR work?</li>
        <li lang="ta" className="font-tamil">
          விலை என்ன?
        </li>
      </ul>
    </main>
  );
}
