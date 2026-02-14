import { getSeoMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

const seo = getSeoMetadata('howToUse');

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: seo.alternates,
  openGraph: seo.openGraph,
};

export default function HowToUseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
