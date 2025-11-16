'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';

const plans = [
  {
    name: 'Free',
    price: '₹0',
    description: 'For casual writers exploring Proof Tamil.',
    features: ['Up to 2,000 words / month', 'Model A access', 'Community support'],
  },
  {
    name: 'Pro',
    price: '₹999',
    description: 'Best value for professional Tamil creators.',
    features: ['Up to 50,000 words / month', 'Model A + Model B', 'Priority support', 'Draft history & archive'],
  },
  {
    name: 'Studio',
    price: 'Contact',
    description: 'Custom workflows for teams and publishers.',
    features: ['Unlimited word usage', 'Dedicated reviewer seats', 'Custom models & fine-tuning', 'Enterprise SLA'],
  },
];

export default function SubscriptionPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [currentPlan, setCurrentPlan] = useState('free');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setUserEmail(user.email);
        setShowAdmin(user.role === 'admin');
        setCurrentPlan(user.subscription ?? 'free');
      } catch (err) {
        router.push('/login');
      }
    };

    loadUser();
  }, [router]);

  const handleLogout = async () => {
    await authAPI.logout();
    setUserEmail('');
    setShowAdmin(false);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-[var(--font-display)]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-32 sm:px-12 lg:px-16">
        <header className="mb-12 space-y-3">
          <p className="text-sm font-semibold text-[#0EA5E9] uppercase tracking-[0.3em]">Subscription</p>
          <h1 className="text-4xl font-bold tracking-tight text-[#0F172A]">Manage your plan</h1>
          <p className="text-base text-[#475569]">
            Upgrade to unlock unlimited Tamil proofreading, premium models, and team collaboration.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-5 py-2 text-sm text-[#475569]">
            Current plan: <span className="font-semibold uppercase">{currentPlan}</span>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const isActive = plan.name.toLowerCase() === currentPlan;
            return (
              <div
                key={plan.name}
                className={`rounded-[32px] border p-6 shadow-lg transition-all ${
                  isActive
                    ? 'border-[#4F46E5] bg-gradient-to-b from-white to-[#EEF2FF]'
                    : 'border-[#E2E8F0] bg-white hover:-translate-y-1'
                }`}
              >
                <div className="space-y-2 pb-5 border-b border-[#E2E8F0]">
                  <p className="text-sm font-semibold text-[#94A3B8] uppercase tracking-[0.2em]">{plan.name}</p>
                  <p className="text-3xl font-bold text-[#0F172A]">{plan.price}</p>
                  <p className="text-sm text-[#475569]">{plan.description}</p>
                </div>

                <ul className="mt-5 space-y-3 text-sm text-[#0F172A]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-0.5 h-2 w-2 rounded-full bg-[#4F46E5]" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-[#4F46E5] text-white shadow-lg shadow-[#4F46E5]/30 cursor-default'
                      : 'border border-[#E2E8F0] text-[#4F46E5] hover:border-[#4F46E5] hover:bg-[#EEF2FF]'
                  }`}
                  disabled={isActive}
                >
                  {isActive ? 'Current plan' : 'Select plan'}
                </button>
              </div>
            );
          })}
        </section>

        <section className="mt-12 rounded-[32px] border border-[#E2E8F0] bg-white shadow-xl p-8 space-y-4">
          <h2 className="text-2xl font-bold text-[#0F172A]">Need enterprise support?</h2>
          <p className="text-sm text-[#475569]">
            We can tailor Proof Tamil for newsrooms, publishers, and education teams. Add reviewer seats, custom AI
            models, and advanced security controls.
          </p>
          <button className="rounded-full bg-gradient-to-r from-[#0EA5E9] to-[#14B8A6] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0EA5E9]/30 hover:shadow-xl hover:scale-105 transition-all">
            Talk to sales
          </button>
        </section>
      </main>
    </div>
  );
}

