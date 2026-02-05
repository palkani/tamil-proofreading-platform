'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { authAPI, blogAPI } from '@/lib/api';

interface Post {
  id: number;
  slug: string;
  title: string;
  excerpt?: string;
  published_at?: string;
}

export default function BlogListPage() {
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
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
    blogAPI.listPublished()
      .then((data) => setPosts(data.posts || []))
      .catch(() => setError('Failed to load blog posts'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#0F172A] mb-2">Tamil Writing Blog</h1>
        <p className="text-[#475569] mb-8">Tips, examples, and proofreading workflows from ProofTamil.</p>
        {userEmail && (
          <Link href="/blog/me" className="inline-block mb-6 text-[#4F46E5] font-semibold hover:underline">My blog posts</Link>
        )}
        {loading && <p className="text-[#475569]">Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && (
          <ul className="space-y-6">
            {posts.length === 0 && <p className="text-[#475569]">No posts yet.</p>}
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/blog/${post.slug}`} className="block p-4 rounded-xl border border-gray-200 bg-white hover:border-[#4F46E5] hover:shadow-md transition-all">
                  <h2 className="text-xl font-semibold text-[#0F172A]">{post.title}</h2>
                  {post.excerpt && <p className="text-[#475569] mt-2 line-clamp-2">{post.excerpt}</p>}
                  {post.published_at && <p className="text-sm text-[#94A3B8] mt-2">{new Date(post.published_at).toLocaleDateString()}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
