'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setUserEmail(user.email);
        setShowAdmin(user.role === 'admin');
      } catch (err) {
        // User is not logged in, which is fine for the homepage
        setUserEmail('');
        setShowAdmin(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    await authAPI.logout();
    setUserEmail('');
    setShowAdmin(false);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-[var(--font-display)]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={handleLogout} />
      {/* Hero Section */}
      <div className="relative max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 pt-32 pb-24 lg:pt-40 lg:pb-32">
        <div className="text-center space-y-8">
          <div className="flex justify-center animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#4F46E5] to-[#0EA5E9] rounded-[24px] blur-2xl opacity-20 animate-pulse"></div>
              <div className="relative bg-white rounded-[24px] p-4 shadow-xl">
                <Image
                  src="/logo.jpg"
                  alt="Proof Tamil logo"
                  width={140}
                  height={140}
                  priority
                  className="drop-shadow-lg rounded-[20px]"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-6 animate-slide-up">
            <h1 className="text-7xl sm:text-8xl lg:text-9xl font-extrabold tracking-tight leading-[0.9]">
              <span className="flex items-center justify-center gap-4 sm:gap-5 lg:gap-6">
                <span 
                  className="relative inline-block"
                  style={{
                    background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 30%, #8B5CF6 60%, #6366F1 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    backgroundSize: '200% auto',
                    animation: 'gradient-shift 5s ease infinite',
                    filter: 'drop-shadow(0 4px 16px rgba(79, 70, 229, 0.4))',
                    letterSpacing: '-0.03em',
                    fontWeight: 900,
                    lineHeight: '1'
                  }}
                >
                  Proof
                </span>
                <span 
                  className="relative inline-block"
                  style={{
                    background: 'linear-gradient(135deg, #0EA5E9 0%, #14B8A6 30%, #10B981 60%, #14B8A6 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    backgroundSize: '200% auto',
                    animation: 'gradient-shift 5s ease infinite 0.7s',
                    filter: 'drop-shadow(0 4px 16px rgba(14, 165, 233, 0.4))',
                    letterSpacing: '-0.03em',
                    fontWeight: 900,
                    lineHeight: '1'
                  }}
                >
                  Tamil
                </span>
              </span>
              <br />
              <span 
                className="text-[#475569] text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[0.15em] mt-3 inline-block uppercase"
                style={{
                  letterSpacing: '0.15em',
                  fontWeight: 700
                }}
              >
                Studio
              </span>
            </h1>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0F172A] max-w-5xl mx-auto leading-tight">
              From Thought to Text — Where AI Meets Tamil Brilliance
            </h2>
            <p className="text-xl sm:text-2xl lg:text-3xl text-[#475569] font-semibold max-w-4xl mx-auto leading-relaxed">
              AI-powered Tamil proofreading, typing assistance, and free Tamil writer tools to sharpen every sentence.
            </p>
            <p className="text-base sm:text-lg text-[#94A3B8] max-w-3xl mx-auto leading-relaxed">
              Proof Tamil combines instant Tamil typing support, grammar checking, transliteration, and professional proofreading workflows so creators can publish flawless Tamil content faster.
            </p>
          </div>
          
          <div className="flex justify-center gap-4 pt-4 animate-fade-in">
            {userEmail ? (
              <>
                <Link
                  href="/submit"
                  className="group relative px-8 py-4 bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white rounded-full shadow-xl shadow-[#4F46E5]/30 hover:shadow-2xl hover:shadow-[#4F46E5]/40 font-semibold text-sm uppercase tracking-wider hover:scale-105 transition-all duration-300 overflow-hidden"
                >
                  <span className="relative z-10">Open Workspace</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#6366F1] to-[#4F46E5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>
                <Link
                  href="/dashboard"
                  className="px-8 py-4 bg-white border-2 border-[#E2E8F0] text-[#4F46E5] rounded-full shadow-lg hover:shadow-xl font-semibold text-sm uppercase tracking-wider hover:scale-105 hover:border-[#4F46E5] transition-all duration-300"
                >
                  View Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="group relative px-8 py-4 bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white rounded-full shadow-xl shadow-[#4F46E5]/30 hover:shadow-2xl hover:shadow-[#4F46E5]/40 font-semibold text-sm uppercase tracking-wider hover:scale-105 transition-all duration-300 overflow-hidden"
                >
                  <span className="relative z-10">Sign In</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#6366F1] to-[#4F46E5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>
                <Link
                  href="/register"
                  className="px-8 py-4 bg-white border-2 border-[#E2E8F0] text-[#4F46E5] rounded-full shadow-lg hover:shadow-xl font-semibold text-sm uppercase tracking-wider hover:scale-105 hover:border-[#4F46E5] transition-all duration-300"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: 'AI-Powered Proofreading',
              text: 'Advanced Tamil-aware language models for grammar, spelling, and style corrections in seconds.',
              icon: '✨',
            },
            {
              title: 'Realtime Tamil Typing',
              text: 'Phonetic transliteration, auto-complete, and keyboard shortcuts tuned for fast Tamil typing.',
              icon: '⌨️',
            },
            {
              title: 'Free Tamil Writer Workspace',
              text: 'Draft, compare revisions, and export high-quality Tamil articles, blog posts, and scripts for free.',
              icon: '📝',
            },
          ].map((feature, index) => (
            <div
              key={feature.title}
              className="group bg-white rounded-[24px] border border-[#E2E8F0] p-8 text-left space-y-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#4F46E5]/10 to-[#0EA5E9]/10 mb-2 text-2xl">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-[#0F172A] leading-tight">
                {feature.title}
              </h3>
              <p className="text-[#475569] text-sm leading-relaxed">{feature.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
