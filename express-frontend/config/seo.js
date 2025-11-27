const BASE_URL = 'https://prooftamil.com';

const seoConfig = {
  home: {
    title: 'ProofTamil - Free Tamil Grammar Checker & AI Proofreading Tool Online',
    description: 'Free Tamil proofreading tool with AI-powered grammar checker, spell check, and writing correction. Check Tamil grammar online free, fix spelling errors, and improve Tamil writing instantly. Best Tamil AI writing assistant - no download needed!',
    keywords: 'tamil proofreading tool, tamil proofreader online, tamil grammar checker, tamil grammar corrector, tamil spell checker, tamil spell check online, tamil writing assistant, tamil writing correction tool, tamil AI grammar checker, tamil grammar correction online, correct tamil grammar, fix tamil spelling, check tamil grammar free, tamil proofreading free',
    canonical: BASE_URL + '/',
    ogTitle: 'ProofTamil - Free Tamil Grammar Checker & AI Proofreading Tool',
    ogDescription: 'Free Tamil grammar checker with AI proofreading. Check and correct Tamil grammar, spelling, and writing online. Instant results - no download required!',
    pageType: 'home'
  },

  workspace: {
    title: 'Tamil Writing Workspace - AI Grammar Checker & Text Editor | ProofTamil',
    description: 'Write Tamil with confidence using our AI-powered workspace. Real-time grammar checking, spelling correction, and smart suggestions. Free Tamil text correction tool with phonetic typing support.',
    keywords: 'tamil writing assistant, tamil text correction tool, tamil grammar fix tool, tamil sentence correction tool, tamil content writing correction, tamil article proofreading tool, rewrite tamil sentences, improve tamil writing online',
    canonical: BASE_URL + '/workspace',
    ogTitle: 'Tamil Writing Workspace - AI Grammar & Spelling Checker',
    ogDescription: 'Write Tamil with AI assistance. Real-time grammar checking, spelling correction, and smart suggestions.',
    pageType: 'workspace'
  },

  howToUse: {
    title: 'How to Use Tamil Grammar Checker - Step by Step Guide | ProofTamil',
    description: 'Learn how to use ProofTamil Tamil proofreading tool. Step-by-step guide for Tamil grammar checking, spell check, and AI writing correction. Start improving your Tamil writing today!',
    keywords: 'how to check tamil grammar, tamil grammar check tutorial, tamil proofreading guide, tamil writing improvement tool, learn tamil grammar correction, tamil spell check guide',
    canonical: BASE_URL + '/how-to-use',
    ogTitle: 'How to Use ProofTamil - Tamil Grammar Checker Guide',
    ogDescription: 'Step-by-step guide to using ProofTamil for Tamil grammar checking and proofreading.',
    pageType: 'article'
  },

  login: {
    title: 'Login - Tamil Grammar Checker & Proofreading Tool | ProofTamil',
    description: 'Login to ProofTamil - Free Tamil proofreader online. Access your saved drafts, personalized grammar suggestions, and AI-powered Tamil writing assistance.',
    keywords: 'prooftamil login, tamil grammar checker login, tamil proofreading account',
    canonical: BASE_URL + '/login',
    ogTitle: 'Login to ProofTamil - Tamil Grammar Checker',
    ogDescription: 'Login to access your Tamil proofreading workspace and saved drafts.',
    pageType: 'login',
    noIndex: false
  },

  register: {
    title: 'Sign Up Free - Tamil Grammar Checker & AI Proofreading | ProofTamil',
    description: 'Create your free ProofTamil account. Get unlimited access to AI Tamil grammar checker, spell check, and writing correction tools. Sign up now - completely free!',
    keywords: 'tamil grammar check free, tamil proofreading free, tamil grammar correction free tool, free tamil spell checker signup',
    canonical: BASE_URL + '/register',
    ogTitle: 'Sign Up Free - ProofTamil Tamil Grammar Checker',
    ogDescription: 'Create your free account for AI-powered Tamil grammar checking and proofreading.',
    pageType: 'register',
    noIndex: false
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
    title: 'Contact Us - Tamil Grammar Checker Support | ProofTamil',
    description: 'Need help with Tamil proofreading? Contact ProofTamil support team. We are here to help with Tamil grammar checker, spelling correction, and writing assistance queries.',
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

const defaultKeywords = 'tamil proofreading tool, tamil proofreader online, tamil grammar checker, tamil grammar corrector, tamil spell checker, tamil spell check online, tamil writing assistant, tamil writing correction tool, tamil writing improvement tool, tamil grammar correction online, tamil grammar error checker, tamil AI grammar checker, tamil spelling correction tool, tamil spelling corrector online, tamil grammar and spelling checker, tamil AI writing tool, tamil text correction tool, tamil grammar fix tool, tamil grammar rewrite tool, tamil sentence correction tool';

const structuredData = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ProofTamil",
    "url": BASE_URL,
    "logo": BASE_URL + "/images/tamil-logo.svg",
    "description": "Free Tamil proofreading and AI grammar checking platform. Best online tool for Tamil writing correction, spell check, and grammar improvement.",
    "sameAs": [],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": "prooftamil@gmail.com",
      "availableLanguage": ["Tamil", "English"]
    }
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
