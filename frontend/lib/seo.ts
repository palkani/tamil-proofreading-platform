/**
 * SEO metadata config - mirrors express-frontend/config/seo.js for unified Next.js app.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prooftamil.com';

export type PageKey =
  | 'home'
  | 'workspace'
  | 'howToUse'
  | 'freeTamilEditor'
  | 'ocrTool'
  | 'converterTool'
  | 'aiContentWriterTool'
  | 'eventNameSuggesterTool'
  | 'fontConverterTool'
  | 'emailSpamDetectorTool'
  | 'blog'
  | 'blogPost'
  | 'myBlogs'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'drafts'
  | 'archive'
  | 'account'
  | 'analytics'
  | 'notFound'
  | 'error';

export interface SeoPage {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  pageType?: string;
  noIndex?: boolean;
}

export const seoConfig: Record<string, SeoPage> = {
  home: {
    title: 'ProofTamil - Free Tamil Grammar Checker & AI Proofreading Tool | prooftamil.com',
    description:
      'ProofTamil (prooftamil.com) - Free Tamil proofreading tool with AI-powered grammar checker, spell check, and writing correction.',
    keywords:
      'prooftamil, prooftamil.com, tamil editor, tamil typing, tanglish to tamil, tamil proofreading tool, tamil grammar checker',
    canonical: BASE_URL + '/',
    ogTitle: 'ProofTamil - Free Tamil Grammar Checker & AI Proofreading Tool | prooftamil.com',
    ogDescription: 'ProofTamil - Free Tamil grammar checker with AI proofreading. Check and correct Tamil grammar and spelling online.',
    pageType: 'home',
  },
  workspace: {
    title: 'Tamil Writing Workspace - AI Grammar Checker & Text Editor | ProofTamil',
    description: 'ProofTamil workspace - Write Tamil with AI-powered grammar checking, spelling correction, and smart suggestions.',
    keywords: 'tamil writing assistant, tamil text correction tool, tamil grammar fix tool',
    canonical: BASE_URL + '/workspace',
    ogTitle: 'Tamil Writing Workspace - AI Grammar & Spelling Checker',
    ogDescription: 'Write Tamil with AI assistance. Real-time grammar checking and smart suggestions.',
    pageType: 'workspace',
  },
  howToUse: {
    title: 'How to Use ProofTamil - Tamil Grammar Checker Guide | ProofTamil',
    description: 'Learn how to use ProofTamil Tamil proofreading tool. Step-by-step guide for grammar checking and AI writing correction.',
    keywords: 'how to check tamil grammar, tamil grammar check tutorial, tamil proofreading guide',
    canonical: BASE_URL + '/how-to-use',
    ogTitle: 'How to Use ProofTamil - Tamil Grammar Checker Guide',
    ogDescription: 'Step-by-step guide to using ProofTamil for Tamil grammar checking and proofreading.',
    pageType: 'article',
  },
  freeTamilEditor: {
    title: 'Free Tamil Editor & Tamil Typing Tool Online (Tanglish to Tamil) | ProofTamil',
    description: 'ProofTamil free editor - Free Tamil editor online for Tamil typing + proofreading. Type in Tanglish to get Tamil, fix grammar and spelling.',
    keywords: 'tamil typing, tanglish to tamil, tamil editor, free tamil editor, tamil proofreading free',
    canonical: BASE_URL + '/free-tamil-editor',
    ogTitle: 'Free Tamil Editor Online - ProofTamil',
    ogDescription: 'Edit Tamil text online for free. AI Tamil grammar checker + spell check.',
    pageType: 'landing',
  },
  ocrTool: {
    title: 'Tamil OCR Online Free - Extract Tamil Text from Images & PDFs | ProofTamil',
    description: 'ProofTamil OCR tool - Free Tamil OCR to extract Tamil text from images and PDFs. Upload JPG/PNG/PDF and get editable Tamil text instantly.',
    keywords: 'tamil ocr, tamil ocr online, tamil ocr free, extract tamil text from image, tamil image to text',
    canonical: BASE_URL + '/tools/ocr',
    ogTitle: 'Tamil OCR Online Free - ProofTamil',
    ogDescription: 'Extract Tamil text from images and PDFs online. Fast, free, and accurate Tamil OCR.',
    pageType: 'tool',
  },
  converterTool: {
    title: 'Document Converter Online - Convert PDF DOCX TXT HTML RTF ODT | ProofTamil',
    description: 'Convert documents between PDF, DOCX, TXT, HTML, RTF, and ODT. Preserve Tamil text and formatting.',
    keywords: 'document converter online, tamil document converter, convert pdf to docx tamil',
    canonical: BASE_URL + '/tools/converter',
    ogTitle: 'Document Converter Online - ProofTamil',
    ogDescription: 'Convert Tamil documents between formats. Preserve Tamil text and formatting.',
    pageType: 'tool',
  },
  aiContentWriterTool: {
    title: 'AI Tamil Content Writer - Generate Tamil Blogs, Articles & Captions | ProofTamil',
    description: 'Generate high-quality Tamil content with AI: blogs, essays, articles, and translations.',
    keywords: 'ai tamil content writer, tamil blog generator, tamil article generator',
    canonical: BASE_URL + '/tools/ai-content-writer',
    ogTitle: 'AI Tamil Content Writer - ProofTamil',
    ogDescription: 'Generate Tamil blogs, essays, and articles with AI in seconds.',
    pageType: 'tool',
  },
  eventNameSuggesterTool: {
    title: 'Event Name Suggester - Catchy Tamil & English Event Names | ProofTamil',
    description: 'Generate catchy, realistic event names in Tamil, English, or bilingual style.',
    keywords: 'event name generator tamil, tamil event name suggester, catchy event names tamil',
    canonical: BASE_URL + '/tools/event-name-suggester',
    ogTitle: 'Event Name Suggester - ProofTamil',
    ogDescription: 'Get catchy Tamil/English event name ideas with taglines using AI.',
    pageType: 'tool',
  },
  fontConverterTool: {
    title: 'Tamil Font Converter - Bamini / TSCII to Unicode | ProofTamil',
    description: 'Convert Tamil text between legacy font encodings (Bamini, TSCII) and Unicode.',
    keywords: 'tamil font converter, bamini to unicode, tscii to unicode',
    canonical: BASE_URL + '/tools/font-converter',
    ogTitle: 'Tamil Font Converter - ProofTamil',
    ogDescription: 'Convert Bamini/TSCII Tamil text to clean Unicode (and back) instantly.',
    pageType: 'tool',
  },
  emailSpamDetectorTool: {
    title: 'Email Spam Detector - Check if Email is Spam | ProofTamil',
    description: 'Check if an email (subject and body) looks like spam. Free quick check for Tamil and English emails.',
    keywords: 'email spam checker, spam detector, check spam email',
    canonical: BASE_URL + '/tools/email-spam-detector',
    ogTitle: 'Email Spam Detector - ProofTamil',
    ogDescription: 'Check if an email is spam. Paste subject and body for an instant score.',
    pageType: 'tool',
  },
  blog: {
    title: 'Tamil Writing Blog - ProofTamil | Tips, Examples, Proofreading',
    description: 'ProofTamil blog - Tamil writing tips, proofreading examples, and AI-assisted workflows.',
    keywords: 'tamil blog, tamil writing tips, tamil grammar tips, tamil proofreading examples',
    canonical: BASE_URL + '/blog',
    ogTitle: 'Tamil Writing Blog - ProofTamil',
    ogDescription: 'Tamil writing tips, proofreading examples, and AI-assisted workflows.',
    pageType: 'blogIndex',
  },
  blogPost: {
    title: 'Blog Post | ProofTamil',
    description: 'Tamil writing tips and proofreading examples from ProofTamil.',
    keywords: 'tamil blog, tamil writing, tamil proofreading, tamil grammar checker',
    canonical: BASE_URL + '/blog',
    ogTitle: 'Blog Post | ProofTamil',
    ogDescription: 'Tamil writing tips and proofreading examples from ProofTamil.',
    pageType: 'blogPost',
  },
  myBlogs: {
    title: 'My Blogs - ProofTamil',
    description: 'Manage your Tamil blog posts and drafts.',
    keywords: 'my blogs, tamil blog drafts, prooftamil blog manager',
    canonical: BASE_URL + '/my-blogs',
    ogTitle: 'My Blogs - ProofTamil',
    ogDescription: 'Manage your Tamil blog posts and drafts.',
    pageType: 'myBlogs',
    noIndex: true,
  },
  login: {
    title: 'Login - Tamil Grammar Checker & Proofreading Tool | ProofTamil',
    description: 'Login to ProofTamil - Free Tamil proofreader online. Access your saved drafts and AI-powered Tamil writing assistance.',
    keywords: 'prooftamil login, tamil grammar checker login',
    canonical: BASE_URL + '/login',
    ogTitle: 'Login to ProofTamil - Tamil Grammar Checker',
    ogDescription: 'Login to access your Tamil proofreading workspace and saved drafts.',
    pageType: 'login',
  },
  register: {
    title: 'Sign Up Free - Tamil Grammar Checker & AI Proofreading | ProofTamil',
    description: 'Create your free ProofTamil account. Get unlimited access to AI Tamil grammar checker and writing correction tools.',
    keywords: 'tamil grammar check free, tamil proofreading free, free tamil spell checker signup',
    canonical: BASE_URL + '/register',
    ogTitle: 'Sign Up Free - ProofTamil Tamil Grammar Checker',
    ogDescription: 'Create your free account for AI-powered Tamil grammar checking and proofreading.',
    pageType: 'register',
  },
  dashboard: {
    title: 'Dashboard - Your Tamil Writing Stats | ProofTamil',
    description: 'View your Tamil writing statistics, recent drafts, and proofreading history.',
    keywords: 'tamil writing dashboard, tamil proofreading stats',
    canonical: BASE_URL + '/dashboard',
    ogTitle: 'Dashboard - ProofTamil Tamil Grammar Checker',
    ogDescription: 'View your Tamil writing stats and proofreading history.',
    pageType: 'dashboard',
    noIndex: true,
  },
  contact: {
    title: 'Contact ProofTamil - Tamil Grammar Checker Support | prooftamil.com',
    description: 'Need help with Tamil proofreading? Contact ProofTamil support team.',
    keywords: 'prooftamil contact, tamil grammar checker support, tamil proofreading help',
    canonical: BASE_URL + '/contact',
    ogTitle: 'Contact ProofTamil - Tamil Grammar Checker Support',
    ogDescription: 'Get help with Tamil proofreading and grammar checking. Contact our support team.',
    pageType: 'contact',
  },
  privacy: {
    title: 'Privacy Policy - Tamil Grammar Checker | ProofTamil',
    description: 'ProofTamil privacy policy. Learn how we protect your data when using our Tamil proofreading tool and AI writing assistant.',
    keywords: 'prooftamil privacy, tamil grammar checker privacy',
    canonical: BASE_URL + '/privacy',
    ogTitle: 'Privacy Policy - ProofTamil',
    ogDescription: 'Learn how ProofTamil protects your privacy and data.',
    pageType: 'legal',
  },
  terms: {
    title: 'Terms of Service - Tamil Grammar Checker | ProofTamil',
    description: 'ProofTamil terms of service. Usage terms for our free Tamil proofreading tool and AI grammar checker.',
    keywords: 'prooftamil terms, tamil grammar checker terms',
    canonical: BASE_URL + '/terms',
    ogTitle: 'Terms of Service - ProofTamil',
    ogDescription: 'Terms of service for using ProofTamil Tamil grammar checker.',
    pageType: 'legal',
  },
  drafts: {
    title: 'My Drafts - Tamil Writing Drafts | ProofTamil',
    description: 'View and manage your Tamil writing drafts.',
    keywords: 'tamil drafts, tamil writing drafts, saved tamil text',
    canonical: BASE_URL + '/drafts',
    ogTitle: 'My Drafts - ProofTamil',
    ogDescription: 'View and manage your Tamil writing drafts.',
    pageType: 'drafts',
    noIndex: true,
  },
  archive: {
    title: 'Archive - Your Tamil Drafts | ProofTamil',
    description: 'Access your archived Tamil writing drafts.',
    keywords: 'tamil drafts archive, tamil writing history',
    canonical: BASE_URL + '/archive',
    ogTitle: 'Archive - ProofTamil',
    ogDescription: 'Access your archived Tamil writing drafts.',
    pageType: 'archive',
    noIndex: true,
  },
  account: {
    title: 'Account Settings - ProofTamil',
    description: 'Manage your ProofTamil account settings and preferences.',
    keywords: 'prooftamil account, tamil grammar checker settings',
    canonical: BASE_URL + '/account',
    ogTitle: 'Account Settings - ProofTamil',
    ogDescription: 'Manage your ProofTamil account and preferences.',
    pageType: 'account',
    noIndex: true,
  },
  analytics: {
    title: 'Analytics Dashboard - ProofTamil Admin',
    description: 'ProofTamil analytics dashboard for administrators.',
    keywords: 'prooftamil analytics, admin dashboard',
    canonical: BASE_URL + '/analytics',
    ogTitle: 'Analytics - ProofTamil Admin',
    ogDescription: 'Admin analytics dashboard.',
    pageType: 'admin',
    noIndex: true,
  },
  notFound: {
    title: 'Page Not Found - ProofTamil Tamil Grammar Checker',
    description: 'Page not found. Return to ProofTamil home to use our free Tamil grammar checker.',
    keywords: 'prooftamil, tamil grammar checker',
    canonical: BASE_URL + '/',
    ogTitle: 'Page Not Found - ProofTamil',
    ogDescription: 'Page not found. Return to ProofTamil home.',
    pageType: 'error',
    noIndex: true,
  },
  error: {
    title: 'Error - ProofTamil',
    description: 'An error occurred. Please try again or return to ProofTamil home.',
    keywords: 'prooftamil, tamil grammar checker',
    canonical: BASE_URL + '/',
    ogTitle: 'Error - ProofTamil',
    ogDescription: 'An error occurred. Please try again.',
    pageType: 'error',
    noIndex: true,
  },
};

export function getSeoData(page: string): SeoPage {
  return seoConfig[page] || seoConfig.home;
}

export function getSeoMetadata(page: string) {
  const seo = getSeoData(page);
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: seo.canonical },
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
      url: seo.canonical,
    },
    robots: seo.noIndex ? { index: false, follow: false } : { index: true, follow: true },
  };
}
