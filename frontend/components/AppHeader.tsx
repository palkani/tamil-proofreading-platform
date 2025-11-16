'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

interface AppHeaderProps {
  showAdmin?: boolean;
  userEmail?: string;
  onLogout?: () => void;
}

interface NavLink {
  name: string;
  href: string;
}

export default function AppHeader({ showAdmin = false, userEmail, onLogout }: AppHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const pathname = usePathname();
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };

    if (accountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountMenuOpen]);

  const navLinks: NavLink[] = useMemo(() => {
    const base: NavLink[] = [
      { name: 'Home', href: '/' },
      { name: 'Dashboard', href: '/dashboard' },
      { name: 'Workspace', href: '/submit' },
      { name: 'Archive', href: '/archive' },
      { name: 'Contact', href: '/contact' },
    ];

    if (showAdmin) {
      base.push({ name: 'Admin Panel', href: '/admin' });
    }

    return base;
  }, [showAdmin]);

  const renderLinks = (className?: string) => (
    navLinks.map((link) => {
      const isActive = pathname === link.href;
      return (
        <Link
          key={link.href}
          href={link.href}
          onClick={() => setMobileOpen(false)}
          className={`block px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
            isActive
              ? 'bg-[#4F46E5] text-white shadow-lg shadow-[#4F46E5]/30 scale-105'
              : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
          } ${className ?? ''}`}
        >
          {link.name}
        </Link>
      );
    })
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-b border-[#E2E8F0] shadow-lg">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 group hover:opacity-90 transition-opacity">
              <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#4F46E5] to-[#0EA5E9] shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300 p-2">
                <Image
                  src="/logo.jpg"
                  alt="Proof Tamil logo"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain rounded-[12px]"
                  priority
                />
              </span>
              <span className="flex items-center gap-2">
                <span 
                  className="text-2xl font-extrabold tracking-tight relative"
                  style={{
                    background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #8B5CF6 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textShadow: '0 2px 12px rgba(79, 70, 229, 0.2)',
                    letterSpacing: '-0.01em',
                    fontWeight: 800
                  }}
                >
                  Proof
                </span>
                <span 
                  className="text-2xl font-extrabold tracking-tight relative"
                  style={{
                    background: 'linear-gradient(135deg, #0EA5E9 0%, #14B8A6 50%, #10B981 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textShadow: '0 2px 12px rgba(14, 165, 233, 0.2)',
                    letterSpacing: '-0.01em',
                    fontWeight: 800
                  }}
                >
                  Tamil
                </span>
              </span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {renderLinks('text-sm font-medium px-4 py-2')}
          </div>

          <div className="flex items-center gap-4">
            {userEmail && (
              <div className="relative hidden sm:flex items-center" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-2 text-sm text-[#475569] font-semibold px-4 py-2 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#4F46E5]/40 hover:text-[#0F172A] transition-all"
                >
                  {userEmail}
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M5 7.5L10 12.5L15 7.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {accountMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[#E2E8F0] bg-white shadow-xl z-50 py-3">
                    <p className="px-4 pb-2 text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                      Account
                    </p>
                    <Link
                      href="/account"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-[#4F46E5] text-xs font-bold">
                        AC
                      </span>
                      <div>
                        <p className="font-semibold">Manage account</p>
                        <p className="text-xs text-[#94A3B8]">Update profile & credentials</p>
                      </div>
                    </Link>
                    <Link
                      href="/subscription"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#0EA5E9]/10 text-[#0EA5E9] text-xs font-bold">
                        SB
                      </span>
                      <div>
                        <p className="font-semibold">Subscription & billing</p>
                        <p className="text-xs text-[#94A3B8]">Plan, invoices, usage</p>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            )}
            {!userEmail && (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/login"
                  className="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#475569] hover:border-[#4F46E5] hover:text-[#0F172A] transition-all"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-[#4F46E5] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-[#4F46E5]/30 hover:shadow-xl hover:scale-105 transition-all"
                >
                  Sign Up
                </Link>
              </div>
            )}
            {userEmail && onLogout && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setMobileOpen(false);
                }}
                className="hidden sm:inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-all duration-200 hover:scale-105"
              >
                Logout
              </button>
            )}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center p-2.5 rounded-[12px] text-[#0F172A] hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 transition-all"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation menu"
            >
              <svg
                className="h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white">
          <div className="px-6 pt-4 pb-6 space-y-2">
            {renderLinks('text-base font-medium py-3')}
            {userEmail && (
              <div className="mt-2 space-y-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4">
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">Account</p>
                <p className="text-sm font-semibold text-[#0F172A]">{userEmail}</p>
                <Link
                  href="/account"
                  className="block text-sm text-[#4F46E5] font-semibold py-1"
                  onClick={() => setMobileOpen(false)}
                >
                  Manage account
                </Link>
                <Link
                  href="/subscription"
                  className="block text-sm text-[#0EA5E9] font-semibold py-1"
                  onClick={() => setMobileOpen(false)}
                >
                  Subscription & billing
                </Link>
              </div>
            )}
            {!userEmail && (
              <div className="space-y-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4">
                <Link
                  href="/login"
                  className="block text-base font-semibold text-[#4F46E5] rounded-[12px] px-4 py-3 hover:bg-[#EEF2FF]"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="block text-base font-semibold text-white rounded-[12px] px-4 py-3 bg-[#4F46E5] text-center shadow hover:shadow-lg"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign Up
                </Link>
              </div>
            )}
            {userEmail && onLogout && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setMobileOpen(false);
                }}
                className="block w-full text-left px-4 py-3 rounded-[12px] text-base font-semibold text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-all"
              >
                Logout
              </button>
            )}
            {userEmail && (
              <p className="px-4 py-2 text-sm text-[#475569]">Signed in as {userEmail}</p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
