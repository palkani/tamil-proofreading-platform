import { NextResponse } from 'next/server';
import apiClient from '@/lib/api-client';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prooftamil.com';

export async function GET() {
  try {
    const res = await apiClient.get('/blog/posts');
    const posts = (res.data as { posts?: { slug: string; title: string; excerpt?: string; published_at?: string }[] }).posts || [];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ProofTamil Blog</title>
    <link>${BASE_URL}/blog</link>
    <description>Tamil writing tips, proofreading examples, and AI-assisted workflows.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${BASE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    ${posts.map((p) => {
      const link = `${BASE_URL}/blog/${encodeURIComponent(p.slug)}`;
      const pubDate = p.published_at ? new Date(p.published_at).toUTCString() : new Date().toUTCString();
      const desc = (p.excerpt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const title = (p.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `<item><title>${title}</title><link>${link}</link><description>${desc}</description><pubDate>${pubDate}</pubDate><guid isPermaLink="true">${link}</guid></item>`;
    }).join('\n    ')}
  </channel>
</rss>`;
    return new NextResponse(xml, {
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  } catch {
    return new NextResponse('<?xml version="1.0"?><rss version="2.0"><channel><title>ProofTamil Blog</title><link>' + BASE_URL + '/blog</link><description>Blog</description></channel></rss>', {
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  }
}
