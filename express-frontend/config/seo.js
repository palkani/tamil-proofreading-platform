const BASE_URL = 'https://www.prooftamil.com';

const seoConfig = {
  home: {
    // Title: 56 chars — leads with "Free" (transactional intent), keyword first, brand at end
    title: 'Free Tamil Grammar Checker — AI Proofreader | ProofTamil',
    // Description: 158 chars — leads with high-volume phrase, action verb, expands keyword surface (OCR)
    description: 'Free Tamil grammar checker online — fix Tamil spelling, grammar, and verb conjugation errors in 2 seconds. Includes Tamil OCR for books and handwriting.',
    keywords: 'tamil grammar checker, tamil grammar checker online free, tamil proofreading tool, tamil proofreader online, tamil spell checker, tamil grammar corrector, tamil handwriting to text, tamil ocr online free, tanglish to tamil, tamil writing assistant, tamil AI grammar checker, check tamil grammar online, fix tamil grammar, tamil spelling correction, prooftamil, prooftamil.com',
    canonical: BASE_URL + '/',
    ogTitle: 'Free Tamil Grammar Checker — AI Proofreader | ProofTamil',
    ogDescription: 'Fix Tamil grammar, spelling, and verb errors in 2 seconds. Includes free Tamil handwriting OCR and Tanglish typing. No credit card, no sign-up.',
    pageType: 'home'
  },

  workspace: {
    title: 'Tamil Writing Workspace - AI Grammar Checker & Text Editor | ProofTamil (prooftamil.com)',
    description: 'Write Tamil with confidence using AI-powered grammar checking, spelling correction, and smart suggestions. Free Tamil text correction tool with phonetic typing support.',
    keywords: 'tamil writing assistant, tamil text correction tool, tamil grammar fix tool, tamil sentence correction tool, tamil content writing correction, tamil article proofreading tool, rewrite tamil sentences, improve tamil writing online',
    canonical: BASE_URL + '/workspace',
    ogTitle: 'Tamil Writing Workspace - AI Grammar & Spelling Checker',
    ogDescription: 'Write Tamil with AI assistance. Real-time grammar checking, spelling correction, and smart suggestions.',
    pageType: 'workspace',
    noIndex: true
  },

  howToUse: {
    title: 'How to Use ProofTamil - Tamil Grammar Checker Guide',
    description: 'Step-by-step guide to ProofTamil Tamil grammar checker and spell check. Learn Tanglish typing, fix Tamil errors, and improve your Tamil writing today.',
    keywords: 'how to check tamil grammar, tamil grammar check tutorial, tamil proofreading guide, tamil writing improvement tool, learn tamil grammar correction, tamil spell check guide',
    canonical: BASE_URL + '/how-to-use',
    ogTitle: 'How to Use ProofTamil - Tamil Grammar Checker Guide',
    ogDescription: 'Step-by-step guide to using ProofTamil for Tamil grammar checking and proofreading. Learn to type Tanglish, fix errors, and improve Tamil writing.',
    pageType: 'article',
    faqItems: [
      {
        q: 'How do I check Tamil grammar on ProofTamil?',
        a: 'Visit prooftamil.com, type or paste your Tamil text in the editor, and click "Check Grammar". The AI analyzes the text, highlights all grammar and spelling errors with colored underlines, and shows correction suggestions. Click any suggestion to apply it instantly.'
      },
      {
        q: 'How do I type Tamil on ProofTamil without a Tamil keyboard?',
        a: 'ProofTamil supports Tanglish (phonetic Tamil typing). Type Tamil words using English letters — for example, "naan Tamil padikiren" becomes "நான் தமிழ் படிக்கிறேன்". The transliteration happens in real time as you type.'
      },
      {
        q: 'Does ProofTamil support both spoken and formal Tamil?',
        a: 'Yes! ProofTamil has a Style dropdown with "Spoken Tamil" (பேச்சு தமிழ்) and "Formal Tamil" (இலக்கிய தமிழ்) modes. In Spoken mode, everyday forms like பண்ற, போறேன், வேணும் are treated as correct. In Formal mode, stricter grammar rules apply.'
      },
      {
        q: 'How do I proofread a full Tamil article?',
        a: 'Paste your full article into the ProofTamil workspace at prooftamil.com. The AI checks the entire text and lists all grammar, spelling, and style errors. Free plan supports up to 200 words per check. Upgrade to Pro for unlimited word count.'
      }
    ]
  },

  freeTamilEditor: {
    // Title: 54 chars — em dash, fits Google's 60-char window
    title: 'Free Tamil Editor — Type & Proofread Online | ProofTamil',
    // Description: 158 chars — concrete example (vanakkam → வணக்கம்) makes it memorable
    description: 'Free online Tamil editor — type Tanglish phonetically (vanakkam → வணக்கம்) and get instant AI grammar + spell check. No download, no sign-up needed.',
    keywords: 'free tamil editor, free tamil editor online, online tamil editor, tamil editor online free, tamil text editor, tamil typing online, tamil writing online, type tamil online, write tamil online, tanglish to tamil, phonetic tamil typing, tamil typing tool, tamil typing without keyboard, tamil editor no download, free tamil writing tool, tamil editor for students, tamil article editor, tamil essay editor, tamil proofread online, tamil spell check free, tamil grammar check free, tamil sentence correction, tamil writing correction, free tamil language editor, tamil editing online, edit tamil text online, best free tamil editor, tamil typing keyboard online, tamil unicode editor',
    canonical: BASE_URL + '/free-tamil-editor',
    ogTitle: 'Free Tamil Editor — Type & Proofread Online | ProofTamil',
    ogDescription: 'Free online Tamil editor — Tanglish typing (vanakkam → வணக்கம்) plus AI grammar and spell check. Works on any device. No download, no sign-up.',
    pageType: 'landing',
    includeStructuredData: true,
    // Mirror the visible FAQ on views/pages/free-tamil-editor.ejs (3 questions).
    faqItems: [
      {
        q: 'Is this a free Tamil editing tool?',
        a: 'Yes — this page is designed for free Tamil editing and proofreading online.'
      },
      {
        q: 'Can I paste Tamil text and correct it?',
        a: 'Yes. Paste your Tamil text into the editor and review suggestions to improve grammar and spelling.'
      },
      {
        q: 'Can I convert images or PDFs to Tamil text?',
        a: 'Yes — use our Handwritten Notes into Text tool to convert photos of handwritten Tamil into editable text.'
      }
    ]
  },

  ocrTool: {
    // Title: 50 chars (was 67, over Google's 60-char limit)
    title: 'Tamil OCR Online Free — Image to Text | ProofTamil',
    // Description: 159 chars — file formats listed, action-oriented
    description: 'Free Tamil OCR online — extract Tamil text from JPG, PNG, and PDF images instantly. Convert printed Tamil books and scanned documents to editable text.',
    keywords: 'tamil ocr online free, tamil ocr, tamil image to text, tamil pdf to text, extract tamil text from image, scanned tamil document to text, tamil ocr tool, tamil printed book ocr, tamil unicode ocr',
    canonical: BASE_URL + '/tools/ocr',
    ogTitle: 'Tamil OCR Online Free — Image to Text | ProofTamil',
    ogDescription: 'Extract Tamil text from JPG, PNG, and PDF instantly. Free Tamil OCR — works on printed books, scans, and screenshots. No app, no sign-up.',
    pageType: 'tool',
    faqItems: [
      {
        q: 'How do I extract Tamil text from an image?',
        a: 'Upload your image (JPG, PNG, or PDF) to ProofTamil\'s Tamil OCR tool at prooftamil.com/tools/ocr. The AI automatically extracts all Tamil text from the image in seconds — no download or sign-up required.'
      },
      {
        q: 'What image formats does ProofTamil Tamil OCR support?',
        a: 'ProofTamil\'s Tamil OCR tool supports JPG, PNG, WEBP, and PDF files. Both printed Tamil documents and scanned pages are supported.'
      },
      {
        q: 'Is ProofTamil Tamil OCR free?',
        a: 'Yes, ProofTamil\'s Tamil OCR tool is completely free to use. Upload images and extract Tamil text at prooftamil.com/tools/ocr at no cost.'
      },
      {
        q: 'How accurate is ProofTamil\'s Tamil OCR?',
        a: 'ProofTamil uses Google Vision AI for Tamil OCR, achieving high accuracy for printed Tamil text from documents, books, and printed letters. After extraction, you can proofread and correct the text using ProofTamil\'s AI grammar checker.'
      }
    ]
  },

  handwritingOcrTool: {
    // Title: 56 chars — "handwritten Tamil to text" is the high-intent query phrase
    title: 'Handwritten Tamil to Text — Free Online OCR | ProofTamil',
    // Description: specific use cases (notes, letters, exam answers) for keyword surface.
    // Removed "no sign-up" (2026-08-20 relaunch — free tier now requires sign-in to enforce the 1/month limit).
    description: 'Convert handwritten Tamil notes, letters, and exam answers to editable text in seconds. Free Tamil handwriting OCR — no app, no download, 1 free conversion per month.',
    keywords: 'handwritten tamil to text, tamil handwriting ocr, tamil handwriting to text, convert handwritten tamil notes, tamil notes to digital text, tamil handwriting recognition, tamil ocr handwriting online, photograph tamil notes, tamil whiteboard to text, tamil exam answer ocr',
    canonical: BASE_URL + '/tools/handwriting-ocr',
    ogTitle: 'Handwritten Tamil to Text — Free OCR | ProofTamil',
    ogDescription: 'Photograph handwritten Tamil notes or letters and get clean editable text in seconds. Free Tamil handwriting OCR — works on any device.',
    pageType: 'tool',
    faqItems: [
      {
        q: 'How do I convert handwritten Tamil notes to text?',
        a: 'Visit prooftamil.com/tools/handwriting-ocr, upload a photo (JPG or PNG) of your handwritten Tamil notes, and the AI converts them to editable Tamil Unicode text in seconds. Free users get 2 conversions per day; Pro users get unlimited.'
      },
      {
        q: 'What types of handwritten Tamil content can ProofTamil recognise?',
        a: 'ProofTamil\'s handwriting OCR recognises handwritten Tamil notes, exam answer sheets, personal letters, whiteboard content, and diary entries. Best results come from clear, well-lit photos where the handwriting is legible and the paper lies flat.'
      },
      {
        q: 'Can I digitise old handwritten Tamil letters with this tool?',
        a: 'Yes. Upload a photograph or scan of old handwritten Tamil letters or documents to prooftamil.com/tools/handwriting-ocr. The AI reads the handwriting and produces editable Tamil text. You can then proofread the output using ProofTamil\'s grammar checker.'
      },
      {
        q: 'How accurate is Tamil handwriting OCR compared to printed text OCR?',
        a: 'Printed text OCR (prooftamil.com/tools/ocr) achieves near-perfect accuracy for clean Tamil documents. Handwriting OCR accuracy depends on the legibility of the handwriting and photo quality. Clear, neat handwriting under good lighting gives the best results. Any recognition errors can be corrected with ProofTamil\'s built-in proofreader.'
      }
    ]
  },

  aiContentWriterTool: {
    // Title: 53 chars (was 70, over Google's 60-char limit)
    title: 'AI Tamil Content Writer — Blog Generator | ProofTamil',
    // Description: 158 chars — concrete output types, register support, free signal
    description: 'Generate Tamil blog posts, articles, and essays in seconds with AI. Supports formal and spoken Tamil. Free Tamil content writer at ProofTamil.',
    keywords: 'ai tamil content writer, tamil blog generator, tamil article generator, tamil ai writer, tamil content generation, tamil writing ai, tamil content creator, ai tamil blog, generate tamil content',
    canonical: BASE_URL + '/tools/ai-content-writer',
    ogTitle: 'AI Tamil Content Writer — Blog Generator | ProofTamil',
    ogDescription: 'Generate Tamil blogs, articles, and essays with AI in seconds. Formal and spoken Tamil supported. Free Tamil content writer — start now.',
    pageType: 'tool',
    faqItems: [
      {
        q: 'Can AI write Tamil blog posts and articles?',
        a: 'Yes, ProofTamil\'s AI Tamil content writer at prooftamil.com/tools/ai-content-writer generates full Tamil blog posts, essays, articles, and social media captions using AI. Just provide a topic and style preference to get started.'
      },
      {
        q: 'What types of Tamil content can the AI generate?',
        a: 'ProofTamil\'s AI can generate Tamil blog posts, articles, essays, product descriptions, social media captions, and more — in both formal (இலக்கிய தமிழ்) and spoken (பேச்சு தமிழ்) styles.'
      },
      {
        q: 'Can I use ProofTamil AI to write Tamil content from an English prompt?',
        a: 'Yes, ProofTamil\'s AI content writer accepts English topic descriptions and generates well-written Tamil content. Type your topic or outline in English and get Tamil output ready to publish.'
      },
      {
        q: 'Is the AI Tamil content writer free?',
        a: 'Yes, the AI Tamil content writer is free to use at prooftamil.com. Sign up for a free account to save your generated drafts. A Pro plan is available for unlimited generation without daily limits.'
      }
    ]
  },

  blog: {
    // Title: 52 chars — clean, keyword + brand
    title: 'Tamil Writing & Proofreading Blog | ProofTamil',
    // Description: 157 chars — specific topics listed for AI extractability
    description: 'Guides on Tamil grammar, proofreading techniques, handwriting OCR, AI writing tools, and Tamil language preservation. Articles in Tamil and English.',
    keywords: 'tamil writing blog, tamil grammar guide, tamil proofreading tips, tamil grammar rules, handwritten tamil notes, tamil spelling guide, tamil language articles, tamil ocr guide',
    canonical: BASE_URL + '/blog',
    ogTitle: 'Tamil Writing & Proofreading Blog | ProofTamil',
    ogDescription: '50+ guides on Tamil grammar, proofreading, handwriting OCR, and AI writing tools — in Tamil and English.',
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
    description: 'Need help with Tamil proofreading? Contact ProofTamil support for questions about Tamil grammar checker, spelling correction, and AI writing tools.',
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
    pageType: 'legal',
    // WebPage JSON-LD — served via the seo.jsonLd hook in header.ejs.
    // Stringified here so it lands directly inside <script type="application/ld+json">.
    jsonLd: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Terms of Service',
      url: BASE_URL + '/terms',
      description: 'Terms of Service governing use of ProofTamil, an AI-assisted Tamil writing and OCR platform.',
      inLanguage: 'en',
      isPartOf: { '@type': 'WebSite', name: 'ProofTamil', url: BASE_URL },
    }),
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

  pricing: {
    title: 'ProofTamil Pro Pricing - Unlimited Tamil AI Proofreading Plans',
    description: 'ProofTamil Pro — unlimited AI Tamil proofreading, unlimited words, all correction types, and unlimited draft saves. Affordable monthly and yearly plans.',
    keywords: 'prooftamil pricing, prooftamil pro, tamil grammar checker pro, tamil proofreading subscription, tamil ai writer pro, unlimited tamil proofreading, tamil grammar checker upgrade, tamil ai pro plan, best tamil proofreading tool price',
    canonical: BASE_URL + '/pricing',
    ogTitle: 'ProofTamil Pro Pricing - Unlimited Tamil AI Proofreading',
    ogDescription: 'Upgrade to ProofTamil Pro — unlimited words, unlimited AI checks per day, all correction types. Simple pricing, cancel anytime.',
    pageType: 'pricing',
    // These must mirror the visible FAQ on views/pages/pricing.ejs (same questions
    // and substantially the same answers) — mismatched FAQ markup is a spam-policy risk.
    faqItems: [
      {
        q: 'Can I cancel anytime?',
        a: "Yes. Cancel from your account page at any time. You'll keep Pro access until the end of your billing period."
      },
      {
        q: 'Which payment methods are accepted?',
        a: 'In India: UPI, Credit/Debit cards, Netbanking, and Wallets via Razorpay. Elsewhere: Credit/Debit cards, Apple Pay, and Google Pay via Stripe.'
      },
      {
        q: 'Is my data secure?',
        a: 'Yes. Payments are processed by Razorpay (India) or Stripe (other regions), both PCI-DSS Level 1 certified payment processors. We never store your card details.'
      },
      {
        q: 'What happens to my drafts if I downgrade?',
        a: 'Your drafts are always saved. If you downgrade to Free, you keep access to all your existing drafts but daily AI checks revert to the free limit.'
      }
    ]
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
      "email": "contact@prooftamil.com",
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
