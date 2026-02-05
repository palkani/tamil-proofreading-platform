import { getSeoMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

const seo = getSeoMetadata('emailSpamDetectorTool');

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: { canonical: seo.canonical },
  openGraph: { title: seo.ogTitle, description: seo.ogDescription, url: seo.canonical },
};

export default function EmailSpamDetectorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
