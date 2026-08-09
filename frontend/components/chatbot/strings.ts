/**
 * UI copy, English and Tamil.
 *
 * The bot answers in whatever language the visitor writes; these strings only
 * cover the chrome around it, chosen once from the browser locale.
 */

export type UiLang = 'en' | 'ta';

export function detectUiLang(): UiLang {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith('ta')) ? 'ta' : 'en';
}

export interface Strings {
  launcherOpen: string;
  launcherClose: string;
  title: string;
  subtitle: string;
  greeting: string;
  inputPlaceholder: string;
  send: string;
  close: string;
  thinking: string;
  sourcesLabel: string;
  errorGeneric: string;
  retry: string;
  // Lead capture card
  leadTitle: string;
  leadBody: string;
  leadEmailLabel: string;
  leadEmailPlaceholder: string;
  leadNameLabel: string;
  leadNamePlaceholder: string;
  leadConsent: string;
  leadPrivacy: string;
  leadSubmit: string;
  leadSubmitting: string;
  leadDismiss: string;
  leadSuccess: string;
  leadErrorEmail: string;
  leadErrorConsent: string;
  leadErrorGeneric: string;
}

const en: Strings = {
  launcherOpen: 'Open the ProofTamil assistant',
  launcherClose: 'Close the ProofTamil assistant',
  title: 'ProofTamil Assistant',
  subtitle: 'Ask about our Tamil writing tools',
  greeting:
    "Hi! I'm ProofBot. I can explain how ProofTamil's proofreader, handwriting OCR, content writer and Tanglish tools work — and answer questions about plans and accounts.",
  inputPlaceholder: 'Ask a question…',
  send: 'Send message',
  close: 'Close',
  thinking: 'ProofBot is typing',
  sourcesLabel: 'Sources',
  errorGeneric: 'Something went wrong. Please try again.',
  retry: 'Try again',
  leadTitle: 'Want us to follow up?',
  leadBody: "Leave your email and the ProofTamil team will get back to you.",
  leadEmailLabel: 'Email',
  leadEmailPlaceholder: 'you@example.com',
  leadNameLabel: 'Name (optional)',
  leadNamePlaceholder: 'Your name',
  leadConsent: 'You can email me about ProofTamil.',
  leadPrivacy: 'We only use this to reply. No spam, and you can opt out any time.',
  leadSubmit: 'Send',
  leadSubmitting: 'Sending…',
  leadDismiss: 'No thanks',
  leadSuccess: "Thank you — we've got it. The team will be in touch soon.",
  leadErrorEmail: 'Please enter a valid email address.',
  leadErrorConsent: 'Please tick the box so we know it’s okay to email you.',
  leadErrorGeneric: "That didn't go through. Please try again.",
};

const ta: Strings = {
  launcherOpen: 'ProofTamil உதவியாளரைத் திறக்க',
  launcherClose: 'ProofTamil உதவியாளரை மூட',
  title: 'ProofTamil உதவியாளர்',
  subtitle: 'எங்கள் தமிழ் எழுத்துக் கருவிகள் பற்றிக் கேளுங்கள்',
  greeting:
    'வணக்கம்! நான் ProofBot. ProofTamil-இன் திருத்தி, கையெழுத்து OCR, உள்ளடக்க எழுத்தாளர் மற்றும் தமிங்கிலக் கருவிகள் எப்படி வேலை செய்கின்றன என்பதையும், திட்டங்கள் மற்றும் கணக்கு பற்றிய கேள்விகளையும் விளக்க முடியும்.',
  inputPlaceholder: 'உங்கள் கேள்வியைக் கேளுங்கள்…',
  send: 'செய்தியை அனுப்பு',
  close: 'மூடு',
  thinking: 'ProofBot தட்டச்சு செய்கிறது',
  sourcesLabel: 'ஆதாரங்கள்',
  errorGeneric: 'ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
  retry: 'மீண்டும் முயற்சி',
  leadTitle: 'நாங்கள் தொடர்பு கொள்ளலாமா?',
  leadBody: 'உங்கள் மின்னஞ்சலை விடுங்கள், ProofTamil குழு உங்களைத் தொடர்பு கொள்ளும்.',
  leadEmailLabel: 'மின்னஞ்சல்',
  leadEmailPlaceholder: 'you@example.com',
  leadNameLabel: 'பெயர் (விருப்பம்)',
  leadNamePlaceholder: 'உங்கள் பெயர்',
  leadConsent: 'ProofTamil பற்றி எனக்கு மின்னஞ்சல் அனுப்பலாம்.',
  leadPrivacy:
    'பதிலளிக்க மட்டுமே இதைப் பயன்படுத்துகிறோம். ஸ்பேம் இல்லை, எப்போது வேண்டுமானாலும் விலகலாம்.',
  leadSubmit: 'அனுப்பு',
  leadSubmitting: 'அனுப்புகிறது…',
  leadDismiss: 'வேண்டாம்',
  leadSuccess: 'நன்றி — கிடைத்தது. விரைவில் தொடர்பு கொள்கிறோம்.',
  leadErrorEmail: 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
  leadErrorConsent: 'மின்னஞ்சல் அனுப்ப அனுமதி அளிக்க பெட்டியைத் தேர்ந்தெடுக்கவும்.',
  leadErrorGeneric: 'அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
};

export const STRINGS: Record<UiLang, Strings> = { en, ta };

/**
 * Starter prompts. Both languages are always shown regardless of UI language —
 * a bilingual audience should see straight away that Tamil is a first-class
 * input, not a fallback.
 */
export const STARTERS: { text: string; lang: 'en' | 'ta' }[] = [
  { text: 'How does the Tamil proofreader work?', lang: 'en' },
  { text: 'விலை என்ன?', lang: 'ta' },
  { text: 'How do I convert handwritten notes to text?', lang: 'en' },
  { text: 'தமிங்கிலத்தை தமிழாக மாற்ற முடியுமா?', lang: 'ta' },
];
