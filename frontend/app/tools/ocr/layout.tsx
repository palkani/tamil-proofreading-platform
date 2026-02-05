import { getSeoMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

const seo = getSeoMetadata('ocrTool');

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  alternates: { canonical: seo.canonical },
  openGraph: { title: seo.ogTitle, description: seo.ogDescription, url: seo.canonical },
  robots: seo.robots,
};

export default function OCRLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
