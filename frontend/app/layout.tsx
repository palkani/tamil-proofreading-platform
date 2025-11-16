import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = "https://www.prooftamil.com";
const brandTitle = "ProofTamil";
const brandDescription = "ProofTamil — AI-powered Tamil proofreading, typing assistance, and writing tools for creators, students, and professionals.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: brandTitle,
  description: brandDescription,
  keywords: [
    "ProofTamil",
    "Tamil proofreading",
    "Tamil typing",
    "Tamil writer",
    "free Tamil writer",
    "Tamil grammar checker",
    "Tamil content editor",
    "Tamil spell check",
  ],
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `${brandTitle} — Tamil Proofreading & Typing Studio`,
    description: brandDescription,
    url: siteUrl,
    siteName: brandTitle,
    locale: "en_IN",
    type: "website",
    images: [
      {
        url: `${siteUrl}/logo.jpg`,
        width: 512,
        height: 512,
        alt: `${brandTitle} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${brandTitle} | Tamil Proofreading & Typing Tools`,
    description: brandDescription,
    images: [`${siteUrl}/logo.jpg`],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: brandTitle,
              url: siteUrl,
              description: brandDescription,
              potentialAction: {
                "@type": "SearchAction",
                target: `${siteUrl}/search?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
      </body>
    </html>
  );
}
