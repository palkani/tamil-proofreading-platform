import { getSeoMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

const seo = getSeoMetadata('ocrTool');

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  alternates: seo.alternates,
  openGraph: seo.openGraph,
  robots: seo.robots,
};

export default function OCRLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
