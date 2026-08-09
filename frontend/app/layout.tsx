import type { Metadata } from 'next';

import ChatWidget from '@/components/chatbot/ChatWidget';
import './globals.css';

export const metadata: Metadata = {
  title: 'ProofTamil — AI Tamil Writing Tools',
  description:
    'AI Tamil proofreading, handwritten-notes OCR, AI content writing and Tanglish→Tamil transliteration.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Noto Sans Tamil is loaded from Google Fonts rather than next/font so the
          same <link> can be lifted into the Express app verbatim when the widget
          ships there. preconnect first — the font is on the critical path for any
          Tamil reply.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Single site-wide mount. */}
        <ChatWidget />
      </body>
    </html>
  );
}
