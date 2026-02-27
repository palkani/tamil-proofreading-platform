const BASE_URL = 'https://prooftamil.com';

const seoConfig = {
  home: {
    title: 'ProofTamil - Free Tamil Grammar Checker & AI Proofreading Tool | prooftamil.com',
    description: 'ProofTamil (prooftamil.com) - Free Tamil proofreading tool with AI-powered grammar checker, spell check, and writing correction. Check Tamil grammar online free, fix spelling errors, and improve Tamil writing instantly. Best Tamil AI writing assistant - no download needed! தமிழ் இலக்கண சரிபார்ப்பு இலவசம்.',
    keywords: 'prooftamil, prooftamil.com, proof tamil, proof tamil.com, tamil editor, tamil typing, tanglish to tamil, phonetic tamil typing, tamil typing tool, tamil editor online, tamil proofreading tool, tamil proofreader online, tamil grammar checker, tamil grammar corrector, tamil spell checker, tamil spell check online, tamil writing assistant, tamil writing correction tool, tamil AI grammar checker, tamil grammar correction online, correct tamil grammar, fix tamil spelling, check tamil grammar free, tamil proofreading free, free tamil editor, free tamil editor online, online tamil editor, tamil text editor, tamil writing tool free, type tamil online, write tamil online, tamil language tool, best tamil grammar checker, tamil grammar checker free online',
    canonical: BASE_URL + '/',
    ogTitle: 'ProofTamil - Free Tamil Grammar Checker & AI Proofreading Tool | prooftamil.com',
    ogDescription: 'ProofTamil (prooftamil.com) - Free Tamil grammar checker with AI proofreading. Check and correct Tamil grammar, spelling, and writing online. Instant results - no download required!',
    pageType: 'home'
  },

  workspace: {
    title: 'Tamil Writing Workspace - AI Grammar Checker & Text Editor | ProofTamil (prooftamil.com)',
    description: 'ProofTamil workspace - Write Tamil with confidence using our AI-powered workspace. Real-time grammar checking, spelling correction, and smart suggestions. Free Tamil text correction tool with phonetic typing support.',
    keywords: 'tamil writing assistant, tamil text correction tool, tamil grammar fix tool, tamil sentence correction tool, tamil content writing correction, tamil article proofreading tool, rewrite tamil sentences, improve tamil writing online',
    canonical: BASE_URL + '/workspace',
    ogTitle: 'Tamil Writing Workspace - AI Grammar & Spelling Checker',
    ogDescription: 'Write Tamil with AI assistance. Real-time grammar checking, spelling correction, and smart suggestions.',
    pageType: 'workspace',
    noIndex: true
  },

  howToUse: {
    title: 'How to Use ProofTamil - Tamil Grammar Checker Guide | prooftamil.com',
    description: 'Learn how to use ProofTamil (prooftamil.com) Tamil proofreading tool. Step-by-step guide for Tamil grammar checking, spell check, and AI writing correction. Start improving your Tamil writing today!',
    keywords: 'how to check tamil grammar, tamil grammar check tutorial, tamil proofreading guide, tamil writing improvement tool, learn tamil grammar correction, tamil spell check guide',
    canonical: BASE_URL + '/how-to-use',
    ogTitle: 'How to Use ProofTamil - Tamil Grammar Checker Guide',
    ogDescription: 'Step-by-step guide to using ProofTamil for Tamil grammar checking and proofreading.',
    pageType: 'article'
  },

  freeTamilEditor: {
    title: 'Free Tamil Editor Online - Tamil Typing & Proofreading Tool | ProofTamil (prooftamil.com)',
    description: 'Free Tamil editor online — type in Tanglish (phonetic English) to get Tamil instantly, or paste existing Tamil text for AI grammar and spell check. 100% free, no download, no sign-up required. Best free online Tamil text editor at prooftamil.com.',
    keywords: 'free tamil editor, free tamil editor online, online tamil editor, tamil editor online free, tamil text editor, tamil typing online, tamil writing online, type tamil online, write tamil online, tanglish to tamil, phonetic tamil typing, tamil typing tool, tamil typing without keyboard, tamil editor no download, free tamil writing tool, tamil editor for students, tamil article editor, tamil essay editor, tamil proofread online, tamil spell check free, tamil grammar check free, tamil sentence correction, tamil writing correction, free tamil language editor, tamil editing online, edit tamil text online, best free tamil editor, tamil typing keyboard online, tamil unicode editor',
    canonical: BASE_URL + '/free-tamil-editor',
    ogTitle: 'Free Tamil Editor Online - Type & Proofread Tamil | ProofTamil',
    ogDescription: 'Free online Tamil editor — type Tanglish to get Tamil, paste text, get instant AI grammar & spelling corrections. No download, no sign-up required.',
    pageType: 'landing',
    includeStructuredData: true
  },

  ocrTool: {
    title: 'Tamil OCR Online Free - Extract Tamil Text from Images & PDFs | ProofTamil (prooftamil.com)',
    description: 'ProofTamil OCR tool - Free Tamil OCR tool to extract Tamil text from images and PDFs. Upload JPG/PNG/PDF and get editable Tamil text instantly. Best OCR for Tamil documents online.',
    keywords: 'tamil ocr, tamil ocr online, tamil ocr free, extract tamil text from image, tamil image to text, tamil pdf to text, scanned tamil document to text, tamil ocr tool',
    canonical: BASE_URL + '/tools/ocr',
    ogTitle: 'Tamil OCR Online Free - ProofTamil',
    ogDescription: 'Extract Tamil text from images and PDFs online. Fast, free, and accurate Tamil OCR.',
    pageType: 'tool'
  },

  handwritingOcrTool: {
    title: 'Tamil Handwriting to Text - Handwritten Notes OCR | ProofTamil (prooftamil.com)',
    description: 'Extract Tamil text from handwritten notes, whiteboard, or letters. Upload an image of handwritten Tamil and get editable text instantly. Free Tamil handwriting OCR online.',
    keywords: 'tamil handwriting ocr, handwritten tamil to text, tamil notes to text, tamil handwriting recognition, handwritten tamil ocr online',
    canonical: BASE_URL + '/tools/handwriting-ocr',
    ogTitle: 'Tamil Handwriting to Text - ProofTamil',
    ogDescription: 'Convert handwritten Tamil notes to editable text. Upload an image and get text instantly.',
    pageType: 'tool'
  },

  converterTool: {
    title: 'Document Converter Online - Convert PDF DOCX TXT HTML RTF ODT | ProofTamil',
    description: 'Convert documents between PDF, DOCX, TXT, HTML, RTF, and ODT. Preserve Tamil text and formatting. Fast online document converter for Tamil files.',
    keywords: 'document converter online, tamil document converter, convert pdf to docx tamil, convert docx to txt tamil, convert html to docx tamil, rtf converter, odt converter',
    canonical: BASE_URL + '/tools/converter',
    ogTitle: 'Document Converter Online - ProofTamil',
    ogDescription: 'Convert Tamil documents between formats. Preserve Tamil text and formatting.',
    pageType: 'tool'
  },

  aiContentWriterTool: {
    title: 'AI Tamil Content Writer - Generate Tamil Blogs, Articles & Captions | ProofTamil',
    description: 'Generate high-quality Tamil content with AI: blogs, essays, articles, and translations. Create Tamil writing faster with a Tamil-friendly AI content writer.',
    keywords: 'ai tamil content writer, tamil blog generator, tamil article generator, tamil content generation, tamil writing ai, tamil content creator',
    canonical: BASE_URL + '/tools/ai-content-writer',
    ogTitle: 'AI Tamil Content Writer - ProofTamil',
    ogDescription: 'Generate Tamil blogs, essays, and articles with AI in seconds.',
    pageType: 'tool'
  },

  eventNameSuggesterTool: {
    title: 'Event Name Suggester - Catchy Tamil & English Event Names | ProofTamil',
    description: 'Generate catchy, realistic event names in Tamil, English, or bilingual style. Provide event type, theme, audience, and get ready-to-use name ideas with taglines.',
    keywords: 'event name generator tamil, tamil event name suggester, event name ideas tamil, catchy event names tamil, ai event name generator, event branding tamil',
    canonical: BASE_URL + '/tools/event-name-suggester',
    ogTitle: 'Event Name Suggester - ProofTamil',
    ogDescription: 'Get catchy Tamil/English event name ideas with taglines using AI.',
    pageType: 'tool'
  },

  emailSpamDetectorTool: {
    title: 'Email Spam Detector - Check if Email is Spam | ProofTamil',
    description: 'Check if an email (subject and body) looks like spam. Uses heuristics: keywords, link density, caps, urgency language. Free quick check for Tamil and English emails.',
    keywords: 'email spam checker, spam detector, check spam email, email filter, spam score',
    canonical: BASE_URL + '/tools/email-spam-detector',
    ogTitle: 'Email Spam Detector - ProofTamil',
    ogDescription: 'Check if an email is spam. Paste subject and body for an instant heuristic-based score.',
    pageType: 'tool'
  },

  blog: {
    title: 'Tamil Writing Blog - ProofTamil (prooftamil.com) | Tips, Examples, Proofreading',
    description: 'ProofTamil blog - Read Tamil writing tips, proofreading examples, and AI-assisted workflows. Learn Tamil grammar, spelling, and style with practical examples.',
    keywords: 'tamil blog, tamil writing tips, tamil grammar tips, tamil proofreading examples, tamil spelling tips, tamil editor tips, tanglish to tamil tips',
    canonical: BASE_URL + '/blog',
    ogTitle: 'Tamil Writing Blog - ProofTamil',
    ogDescription: 'Tamil writing tips, proofreading examples, and AI-assisted workflows.',
    pageType: 'blogIndex'
  },

  blogPost: {
    // NOTE: blog post pages override these dynamically in routes/index.js
    title: 'Blog Post | ProofTamil',
    description: 'Tamil writing tips and proofreading examples from ProofTamil.',
    keywords: 'tamil blog, tamil writing, tamil proofreading, tamil grammar checker',
    canonical: BASE_URL + '/blog',
    ogTitle: 'Blog Post | ProofTamil',
    ogDescription: 'Tamil writing tips and proofreading examples from ProofTamil.',
    pageType: 'blogPost'
  },

  myBlogs: {
    title: 'My Blogs - ProofTamil',
    description: 'Manage your Tamil blog posts and drafts.',
    keywords: 'my blogs, tamil blog drafts, prooftamil blog manager',
    canonical: BASE_URL + '/my-blogs',
    ogTitle: 'My Blogs - ProofTamil',
    ogDescription: 'Manage your Tamil blog posts and drafts.',
    pageType: 'myBlogs',
    noIndex: true
  },

  login: {
    title: 'Login - Tamil Grammar Checker & Proofreading Tool | ProofTamil',
    description: 'Login to ProofTamil - Free Tamil proofreader online. Access your saved drafts, personalized grammar suggestions, and AI-powered Tamil writing assistance.',
    keywords: 'prooftamil login, tamil grammar checker login, tamil proofreading account',
    canonical: BASE_URL + '/login',
    ogTitle: 'Login to ProofTamil - Tamil Grammar Checker',
    ogDescription: 'Login to access your Tamil proofreading workspace and saved drafts.',
    pageType: 'login',
    noIndex: true
  },

  register: {
    title: 'Sign Up Free - Tamil Grammar Checker & AI Proofreading | ProofTamil',
    description: 'Create your free ProofTamil account. Get unlimited access to AI Tamil grammar checker, spell check, and writing correction tools. Sign up now - completely free!',
    keywords: 'tamil grammar check free, tamil proofreading free, tamil grammar correction free tool, free tamil spell checker signup',
    canonical: BASE_URL + '/register',
    ogTitle: 'Sign Up Free - ProofTamil Tamil Grammar Checker',
    ogDescription: 'Create your free account for AI-powered Tamil grammar checking and proofreading.',
    pageType: 'register',
    noIndex: true
  },

  dashboard: {
    title: 'Dashboard - Your Tamil Writing Stats | ProofTamil',
    description: 'View your Tamil writing statistics, recent drafts, and proofreading history. Track your progress with AI-powered Tamil grammar and spelling analysis.',
    keywords: 'tamil writing dashboard, tamil proofreading stats, tamil grammar check history',
    canonical: BASE_URL + '/dashboard',
    ogTitle: 'Dashboard - ProofTamil Tamil Grammar Checker',
    ogDescription: 'View your Tamil writing stats and proofreading history.',
    pageType: 'dashboard',
    noIndex: true
  },

  contact: {
    title: 'Contact ProofTamil - Tamil Grammar Checker Support | prooftamil.com',
    description: 'Need help with Tamil proofreading? Contact ProofTamil (prooftamil.com) support team. We are here to help with Tamil grammar checker, spelling correction, and writing assistance queries.',
    keywords: 'prooftamil contact, tamil grammar checker support, tamil proofreading help, tamil writing tool support',
    canonical: BASE_URL + '/contact',
    ogTitle: 'Contact ProofTamil - Tamil Grammar Checker Support',
    ogDescription: 'Get help with Tamil proofreading and grammar checking. Contact our support team.',
    pageType: 'contact'
  },

  privacy: {
    title: 'Privacy Policy - Tamil Grammar Checker | ProofTamil',
    description: 'ProofTamil privacy policy. Learn how we protect your data when using our Tamil proofreading tool, grammar checker, and AI writing assistant.',
    keywords: 'prooftamil privacy, tamil grammar checker privacy, tamil proofreading privacy policy',
    canonical: BASE_URL + '/privacy',
    ogTitle: 'Privacy Policy - ProofTamil',
    ogDescription: 'Learn how ProofTamil protects your privacy and data.',
    pageType: 'legal'
  },

  terms: {
    title: 'Terms of Service - Tamil Grammar Checker | ProofTamil',
    description: 'ProofTamil terms of service. Usage terms for our free Tamil proofreading tool, AI grammar checker, and writing correction services.',
    keywords: 'prooftamil terms, tamil grammar checker terms, tamil proofreading terms of service',
    canonical: BASE_URL + '/terms',
    ogTitle: 'Terms of Service - ProofTamil',
    ogDescription: 'Terms of service for using ProofTamil Tamil grammar checker.',
    pageType: 'legal'
  },

  drafts: {
    title: 'My Drafts - Tamil Writing Drafts | ProofTamil',
    description: 'View and manage your Tamil writing drafts. Access all your saved drafts and continue editing.',
    keywords: 'tamil drafts, tamil writing drafts, tamil proofreading drafts, saved tamil text',
    canonical: BASE_URL + '/drafts',
    ogTitle: 'My Drafts - ProofTamil',
    ogDescription: 'View and manage your Tamil writing drafts.',
    pageType: 'drafts',
    noIndex: true
  },

  archive: {
    title: 'Archive - Your Tamil Drafts | ProofTamil',
    description: 'Access your archived Tamil writing drafts. Review past proofreading sessions and grammar corrections.',
    keywords: 'tamil drafts archive, tamil writing history, tamil proofreading archive',
    canonical: BASE_URL + '/archive',
    ogTitle: 'Archive - ProofTamil',
    ogDescription: 'Access your archived Tamil writing drafts.',
    pageType: 'archive',
    noIndex: true
  },

  account: {
    title: 'Account Settings - ProofTamil',
    description: 'Manage your ProofTamil account settings. Update profile, preferences, and Tamil proofreading options.',
    keywords: 'prooftamil account, tamil grammar checker settings',
    canonical: BASE_URL + '/account',
    ogTitle: 'Account Settings - ProofTamil',
    ogDescription: 'Manage your ProofTamil account and preferences.',
    pageType: 'account',
    noIndex: true
  },

  analytics: {
    title: 'Analytics Dashboard - ProofTamil Admin',
    description: 'ProofTamil analytics dashboard for administrators.',
    keywords: 'prooftamil analytics, admin dashboard',
    canonical: BASE_URL + '/analytics',
    ogTitle: 'Analytics - ProofTamil Admin',
    ogDescription: 'Admin analytics dashboard.',
    pageType: 'admin',
    noIndex: true
  },

  pricing: {
    title: 'Pricing - ProofTamil Pro Plans | Unlimited Tamil AI Proofreading',
    description: 'ProofTamil Pro plans — unlimited AI Tamil proofreading, unlimited words, all correction types (grammar, style, rewrite), and save unlimited drafts. Affordable monthly and yearly plans. Start free, upgrade anytime.',
    keywords: 'prooftamil pricing, prooftamil pro, tamil grammar checker pro, tamil proofreading subscription, tamil ai writer pro, unlimited tamil proofreading, tamil grammar checker upgrade, tamil ai pro plan, best tamil proofreading tool price',
    canonical: BASE_URL + '/pricing',
    ogTitle: 'ProofTamil Pro Pricing - Unlimited Tamil AI Proofreading',
    ogDescription: 'Upgrade to ProofTamil Pro — unlimited words, unlimited AI checks per day, all correction types. Simple pricing, cancel anytime.',
    pageType: 'pricing'
  },

  billingSuccess: {
    title: 'Payment Successful - ProofTamil Pro',
    description: 'Your ProofTamil Pro subscription is now active. Enjoy unlimited Tamil AI proofreading.',
    canonical: BASE_URL + '/billing/success',
    pageType: 'billing',
    noIndex: true
  },

  billingCancel: {
    title: 'Checkout Cancelled - ProofTamil',
    description: 'Checkout cancelled. Your free plan is still active. Return to pricing to try again.',
    canonical: BASE_URL + '/billing/cancel',
    pageType: 'billing',
    noIndex: true
  },

  affiliate: {
    title: 'Affiliate Dashboard - ProofTamil',
    description: 'Manage your ProofTamil affiliate account. View referrals, earnings, and your unique referral link.',
    canonical: BASE_URL + '/affiliate/dashboard',
    pageType: 'affiliate',
    noIndex: true
  },

  notFound: {
    title: 'Page Not Found - ProofTamil Tamil Grammar Checker',
    description: 'Page not found. Return to ProofTamil home to use our free Tamil grammar checker and proofreading tool.',
    keywords: 'prooftamil, tamil grammar checker',
    canonical: BASE_URL + '/',
    ogTitle: 'Page Not Found - ProofTamil',
    ogDescription: 'Page not found. Return to ProofTamil home.',
    pageType: 'error',
    noIndex: true
  },

  error: {
    title: 'Error - ProofTamil',
    description: 'An error occurred. Please try again or return to ProofTamil home.',
    keywords: 'prooftamil, tamil grammar checker',
    canonical: BASE_URL + '/',
    ogTitle: 'Error - ProofTamil',
    ogDescription: 'An error occurred. Please try again.',
    pageType: 'error',
    noIndex: true
  }
};

const defaultKeywords = 'prooftamil, prooftamil.com, tamil proofreading tool, tamil proofreader online, tamil grammar checker, tamil grammar corrector, tamil spell checker, tamil spell check online, tamil writing assistant, tamil writing correction tool, tamil writing improvement tool, tamil grammar correction online, tamil grammar error checker, tamil AI grammar checker, tamil spelling correction tool, tamil spelling corrector online, tamil grammar and spelling checker, tamil AI writing tool, tamil text correction tool, tamil grammar fix tool, tamil grammar rewrite tool, tamil sentence correction tool';

const structuredData = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ProofTamil",
    "alternateName": ["prooftamil", "prooftamil.com", "Proof Tamil", "ProofTamil.com"],
    "url": BASE_URL,
    "logo": {
      "@type": "ImageObject",
      "url": BASE_URL + "/images/favicon-512x512.png",
      "width": 512,
      "height": 512
    },
    "description": "ProofTamil (prooftamil.com) - Free Tamil proofreading and AI grammar checking platform. Best online tool for Tamil writing correction, spell check, and grammar improvement. தமிழ் இலக்கண சரிபார்ப்பு இலவச கருவி.",
    "foundingDate": "2024",
    "areaServed": ["IN", "SG", "MY", "LK", "CA", "US", "GB", "AU"],
    "knowsAbout": ["Tamil language", "Tamil grammar", "Tamil proofreading", "AI writing tools"],
    "sameAs": [
      "https://prooftamil.com"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": "prooftamil@gmail.com",
      "availableLanguage": ["Tamil", "English"]
    }
  },
  
  brand: {
    "@context": "https://schema.org",
    "@type": "Brand",
    "name": "ProofTamil",
    "alternateName": ["prooftamil", "prooftamil.com"],
    "url": BASE_URL,
    "logo": BASE_URL + "/images/tamil-logo.svg",
    "description": "ProofTamil - The leading free Tamil grammar checker and AI proofreading tool. Visit prooftamil.com for instant Tamil writing correction.",
    "slogan": "Free Tamil Grammar Checker & AI Proofreading Tool"
  },

  webApplication: {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "ProofTamil - Tamil Grammar Checker & Proofreading Tool",
    "alternateName": ["Tamil Grammar Checker", "Tamil Proofreader Online", "Tamil Spell Checker", "Tamil Writing Assistant", "Tamil AI Grammar Tool"],
    "applicationCategory": "UtilitiesApplication",
    "applicationSubCategory": "Grammar Checker",
    "operatingSystem": "Web Browser",
    "browserRequirements": "Requires JavaScript",
    "url": BASE_URL,
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    },
    "description": "Free online Tamil grammar checker and proofreading tool with AI-powered corrections. Check Tamil spelling, fix grammar errors, and improve your Tamil writing instantly. Best Tamil writing assistant - no download needed!",
    "featureList": [
      "Tamil Grammar Checker",
      "Tamil Spell Check Online",
      "Tamil Proofreading Tool",
      "AI Tamil Writing Correction",
      "Tamil Grammar Corrector",
      "Tamil Spelling Correction",
      "Tamil Sentence Correction",
      "Tamil Article Proofreading",
      "Tamil Content Writing Correction",
      "Phonetic Tamil Typing",
      "Tanglish to Tamil Converter",
      "Real-time Grammar Suggestions",
      "Free Tamil Writing Tool"
    ],
    "screenshot": BASE_URL + "/images/tamil-logo.svg",
    "softwareVersion": "2.0",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "1250",
      "bestRating": "5",
      "worstRating": "1"
    },
    "inLanguage": ["ta", "en"],
    "isAccessibleForFree": true
  },

  faqPage: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is the best free Tamil grammar checker online?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "ProofTamil is the best free Tamil grammar checker online. It uses advanced AI to detect and correct Tamil grammar errors, spelling mistakes, and provides writing suggestions. It's completely free with no download required."
        }
      },
      {
        "@type": "Question",
        "name": "How do I check Tamil grammar online for free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "To check Tamil grammar free: 1) Go to prooftamil.com 2) Type or paste your Tamil text 3) Click 'Check Grammar' 4) Review AI suggestions and apply corrections. It's instant and completely free!"
        }
      },
      {
        "@type": "Question",
        "name": "Can ProofTamil fix Tamil spelling errors?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, ProofTamil is also a Tamil spell checker. It detects spelling errors including commonly confused letters like ல, ழ, ள and suggests the correct spelling based on context."
        }
      },
      {
        "@type": "Question",
        "name": "Is ProofTamil a free Tamil proofreading tool?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, ProofTamil is a completely free Tamil proofreading tool. You can proofread unlimited Tamil text, check grammar, fix spelling, and improve your writing without any cost or subscription."
        }
      },
      {
        "@type": "Question",
        "name": "Does ProofTamil work for Tamil article proofreading?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! ProofTamil is perfect for Tamil article proofreading, blog writing, content correction, and even Tamil story writing. It handles all types of Tamil content with AI-powered accuracy."
        }
      },
      {
        "@type": "Question",
        "name": "How does Tamil AI grammar checker work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "ProofTamil's Tamil AI grammar checker uses Google's Gemini AI to analyze your Tamil text. It understands Tamil grammar rules, sandhi, verb conjugation, and context to provide accurate corrections and suggestions."
        }
      },
      {
        "@type": "Question",
        "name": "Can I use ProofTamil on mobile?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, ProofTamil works perfectly on mobile phones and tablets. Just open prooftamil.com in your browser to check Tamil grammar, spelling, and proofread your text on any device."
        }
      },
      {
        "@type": "Question",
        "name": "What Tamil writing errors can ProofTamil fix?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "ProofTamil fixes: Tamil grammar errors, spelling mistakes, verb conjugation errors, sandhi rule violations, subject-verb agreement issues, punctuation errors, and provides sentence rewriting suggestions."
        }
      },
      {
        "@type": "Question",
        "name": "Where can I find a free Tamil editor online?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "ProofTamil offers the best free Tamil editor online at prooftamil.com/free-tamil-editor. You can type in Tanglish (phonetic English like 'vanakkam') and it auto-converts to Tamil, or paste existing Tamil text. No download or sign-up required — start typing immediately."
        }
      },
      {
        "@type": "Question",
        "name": "How do I type Tamil online without a Tamil keyboard?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "With ProofTamil's phonetic typing (Tanglish), you can type Tamil words using English letters on any keyboard. For example, type 'vanakkam' to get வணக்கம், 'nandri' to get நன்றி. It works on any device — no special keyboard or app download needed."
        }
      },
      {
        "@type": "Question",
        "name": "Is ProofTamil useful for Tamil students and writers?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! ProofTamil is widely used by Tamil students writing essays, journalists proofreading articles, content creators writing blogs, and anyone who wants to improve their Tamil writing. It catches grammar errors, spelling mistakes, and even suggests better phrasing."
        }
      },
      {
        "@type": "Question",
        "name": "What is the difference between ProofTamil Free and Pro?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "ProofTamil Free gives 200 words per analysis and 30 AI checks per day — plenty for casual writing. ProofTamil Pro (paid) unlocks unlimited words per analysis, unlimited daily checks, all correction types (grammar, style, and rewrite), and unlimited draft saves. Visit prooftamil.com/pricing for details."
        }
      }
    ]
  },

  softwareApplication: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ProofTamil Tamil Grammar Checker",
    "operatingSystem": "Web",
    "applicationCategory": "Productivity",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "850"
    }
  }
};

function getSeoData(page) {
  return seoConfig[page] || seoConfig.home;
}

function getDefaultKeywords() {
  return defaultKeywords;
}

function getStructuredData() {
  return structuredData;
}

module.exports = {
  seoConfig,
  getSeoData,
  getDefaultKeywords,
  getStructuredData,
  BASE_URL
};
