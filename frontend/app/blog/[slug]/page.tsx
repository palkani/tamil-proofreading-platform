'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { authAPI, blogAPI } from '@/lib/api';

interface Post {
  id: number;
  slug: string;
  title: string;
  body?: string;
  published_at?: string;
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    authAPI.getCurrentUser().then((user) => {
      setUserEmail(user.email);
      setShowAdmin(user.role === 'admin');
    }).catch(() => {
      setUserEmail('');
      setShowAdmin(false);
    });
  }, []);

  useEffect(() => {
    if (!slug) return;
    blogAPI.getBySlug(slug)
      .then((data) => setPost(data.post))
      .catch(() => setError('Post not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;
  if (error || !post) return <div className="min-h-screen flex items-center justify-center"><p className="text-red-600">{error || 'Not found'}</p><Link href="/blog" className="ml-4 text-[#4F46E5]">Back to blog</Link></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <article className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/blog" className="text-[#4F46E5] font-semibold hover:underline mb-6 inline-block">← Back to blog</Link>
        <h1 className="text-4xl font-bold text-[#0F172A] mb-4">{post.title}</h1>
        {post.published_at && <p className="text-sm text-[#94A3B8] mb-6">{new Date(post.published_at).toLocaleDateString()}</p>}
        <div className="prose prose-gray max-w-none" dangerouslySetInnerHTML={{ __html: post.body || '' }} />
      </article>
    </div>
  );
}
