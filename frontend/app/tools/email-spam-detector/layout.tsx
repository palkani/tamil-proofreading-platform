import { getSeoMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

const seo = getSeoMetadata('emailSpamDetectorTool');

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: seo.alternates,
  openGraph: seo.openGraph,
};

export default function EmailSpamDetectorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
