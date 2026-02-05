'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';

export default function HowToUsePage() {
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    authAPI.getCurrentUser().then((user) => {
      setUserEmail(user.email);
      setShowAdmin(user.role === 'admin');
    }).catch(() => {
      setUserEmail('');
      setShowAdmin(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#0F172A] mb-6">How to Use ProofTamil</h1>
        <p className="text-lg text-[#475569] mb-8">
          Step-by-step guide for Tamil grammar checking, spell check, and AI writing correction.
        </p>
        <ol className="list-decimal list-inside space-y-6 text-[#475569]">
          <li><strong className="text-[#0F172A]">Sign up or log in</strong> — Create a free account or sign in to save your work.</li>
          <li><strong className="text-[#0F172A]">Open the workspace</strong> — Go to Workspace or Submit to start writing or paste Tamil text.</li>
          <li><strong className="text-[#0F172A]">Type or paste</strong> — Use phonetic (Tanglish) typing to get Tamil, or paste existing Tamil text.</li>
          <li><strong className="text-[#0F172A]">Run proofreading</strong> — Click to check grammar and spelling; review and apply AI suggestions.</li>
          <li><strong className="text-[#0F172A]">Save and export</strong> — Save drafts and export your corrected text.</li>
        </ol>
        <div className="mt-10">
          <Link href="/submit" className="inline-block px-6 py-3 bg-[#4F46E5] text-white rounded-full font-semibold hover:bg-[#4338CA] transition-colors">
            Open Workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
