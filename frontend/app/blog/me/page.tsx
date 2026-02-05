'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import { authAPI, blogAPI } from '@/lib/api';

interface Post {
  id: number;
  slug: string;
  title: string;
  published_at?: string;
}

export default function MyBlogsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authAPI.getCurrentUser().then((user) => {
      setUserEmail(user.email);
      setShowAdmin(user.role === 'admin');
    }).catch(() => {
      router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    blogAPI.listMyPosts()
      .then((data) => setPosts(data.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-[#0F172A] mb-2">My blog posts</h1>
        <p className="text-[#475569] mb-8">Manage your Tamil blog posts and drafts.</p>
        <Link href="/blog" className="inline-block mb-6 text-[#4F46E5] font-semibold hover:underline">← Back to blog</Link>
        {loading && <p className="text-[#475569]">Loading…</p>}
        {!loading && (
          <ul className="space-y-4">
            {posts.length === 0 && <p className="text-[#475569]">You have no blog posts yet.</p>}
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/blog/${post.slug}`} className="block p-4 rounded-xl border border-gray-200 bg-white hover:border-[#4F46E5]">
                  <span className="font-semibold text-[#0F172A]">{post.title}</span>
                  {post.published_at && <span className="text-sm text-[#94A3B8] ml-2">({new Date(post.published_at).toLocaleDateString()})</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
