'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
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
  const pathname = usePathname();

  const navLinks: NavLink[] = useMemo(() => {
    const base: NavLink[] = [
      { name: 'Home', href: '/' },
      { name: 'Dashboard', href: '/dashboard' },
      { name: 'Submit Text', href: '/submit' },
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
          className={`block px-3 py-2 rounded-md text-base font-medium ${
            isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'
          } ${className ?? ''}`}
        >
          {link.name}
        </Link>
      );
    })
  );

  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center">
            <Link href="/" className="text-lg sm:text-xl font-bold text-indigo-600">
              Tamil Proofreading
            </Link>
          </div>

          <div className="hidden md:flex space-x-2 lg:space-x-4">
            {renderLinks('text-sm sm:text-base px-2 py-1 sm:px-3 sm:py-2')}
          </div>

          <div className="flex items-center space-x-3">
            {userEmail && (
              <span className="hidden sm:inline text-xs sm:text-sm text-gray-600">
                {userEmail}
              </span>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setMobileOpen(false);
                }}
                className="text-sm text-gray-600 hover:text-indigo-600"
              >
                Logout
              </button>
            )}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation menu"
            >
              <svg
                className="h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {renderLinks()}
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setMobileOpen(false);
                }}
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
              >
                Logout
              </button>
            )}
            {userEmail && (
              <p className="px-3 py-2 text-xs text-gray-500">Signed in as {userEmail}</p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
