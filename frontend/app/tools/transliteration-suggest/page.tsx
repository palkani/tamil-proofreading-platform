'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import TransliterationSuggestDropdown from '@/components/TransliterationSuggestDropdown';
import { authAPI } from '@/lib/api';

export default function TransliterationSuggestPage() {
  const [value, setValue] = useState('');
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    authAPI.getCurrentUser().then((user) => { setUserEmail(user.email); setShowAdmin(user.role === 'admin'); }).catch(() => { setUserEmail(''); setShowAdmin(false); });
  }, []);

  const handleSelect = (word: string) => {
    setLastSelected(word);
    // Replace the current token (last segment) with the selected Tamil word, or append
    const trimmed = value.trim();
    const lastSpace = trimmed.lastIndexOf(' ');
    const base = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : '';
    setValue(base + word + ' ');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-[#0F172A] mb-2">Tamil Transliteration Suggest</h1>
        <p className="text-[#475569] mb-6">
          Type in English (romanized) and get letter-by-letter Tamil suggestions. Use ↑↓ to move, Enter or Tab to select, Escape to close.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-[#475569] mb-1">Type here</label>
          <TransliterationSuggestDropdown
            value={value}
            onChange={setValue}
            onSelect={handleSelect}
            placeholder="e.g. t, th, thu, vanakkam..."
            limit={8}
            debounceMs={50}
            inputClassName="text-lg"
          />
        </div>

        {lastSelected && (
          <p className="text-sm text-[#64748B] mb-6">
            Last selected: <span className="font-medium text-[#0F172A]">{lastSelected}</span>
          </p>
        )}

        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 text-[#0F172A] min-h-[120px]">
          <p className="text-sm text-[#64748B] mb-1">Preview</p>
          <p className="text-lg leading-relaxed">{value || '—'}</p>
        </div>

        <Link href="/" className="inline-block mt-8 text-[#4F46E5] font-semibold hover:underline">← Home</Link>
      </div>
    </div>
  );
}
