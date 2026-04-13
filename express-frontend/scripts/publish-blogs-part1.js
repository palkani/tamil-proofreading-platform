/**
 * Publish blogs Part 1 (posts 1-25)
 * Run: ADMIN_TOKEN=<your-jwt> node scripts/publish-blogs-part1.js
 * Get token: browser DevTools → Application → Cookies → access_token value
 */
const https = require('https');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'https://prooftamil.com';
const TOKEN    = process.env.ADMIN_TOKEN || '';

if (!TOKEN) {
  console.error('❌  Set ADMIN_TOKEN env var to your JWT access_token cookie value');
  process.exit(1);
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url  = new URL(path, BASE_URL);
    const lib  = url.protocol === 'https:' ? https : http;
    const req  = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Cookie': `access_token=${TOKEN}`,
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const POSTS = [
  {
    title: "How to Use AI for Tamil Proofreading: A Complete Guide",
    slug: "ai-tamil-proofreading-complete-guide",
    language: "english",
    status: "published",
    meta_description: "Learn how AI-powered tools like ProofTamil can help you write flawless Tamil content. Step-by-step guide to AI proofreading for Tamil writers.",
    keywords: "tamil proofreading, AI tamil, tamil grammar checker, tamil writing tool",
    excerpt: "Discover how artificial intelligence is transforming Tamil proofreading — catching errors humans miss, suggesting natural phrasing, and helping writers produce polished Tamil content faster than ever.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Writing</div>
  <h1>How to Use AI for Tamil Proofreading: A Complete Guide</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Discover how artificial intelligence is transforming Tamil proofreading — catching errors humans miss, suggesting natural phrasing, and helping writers produce polished Tamil content faster than ever.</p>
</header>
<section class="content">
  <p>Tamil is one of the world's oldest classical languages, with a rich literary tradition spanning more than 2,000 years. Yet writing flawless Tamil — whether for blogs, business communication, or academic papers — remains challenging even for native speakers. Spelling variants, formal vs spoken register differences, and complex grammar rules create constant opportunities for errors.</p>
  <h2>What AI Proofreading Does for Tamil Writers</h2>
  <p>AI-powered Tamil proofreading tools analyse your text in real time, detecting spelling mistakes, grammatical errors, and stylistic inconsistencies. Unlike simple spell-checkers, modern AI understands context — it knows the difference between a correctly spelled word used in the wrong context and a genuine typo. ProofTamil, for example, uses large language models trained on Tamil corpora to offer suggestions that sound natural rather than mechanical.</p>
  <p>The core capabilities you get from AI Tamil proofreading include: automated detection of spelling errors (எழுத்துப்பிழை), grammar corrections (இலக்கணப்பிழை), style suggestions for formal vs spoken Tamil, and explanations for every suggestion so you learn as you write.</p>
  <h2>Step-by-Step: Using ProofTamil</h2>
  <p>1. Paste or type your Tamil text into the workspace editor. 2. Select your writing style — "Spoken Tamil" for casual content, "Formal/Written Tamil" for academic or official documents. 3. Click "Check Grammar" and review the AI suggestions panel on the right. 4. Accept corrections with one click or review the explanation to decide yourself. 5. Export or copy your polished text.</p>
  <h2>Common Errors AI Catches That Humans Miss</h2>
  <p>Native speakers are often blind to their habitual errors. Common mistakes AI reliably catches include: confusion between similar-sounding words like "அவன்" and "அவர்", incorrect use of the negative particle "இல்லை" vs "இல்லன்", wrong tense agreement in complex sentences, and missing pulli (ஃ) or incorrect use of aaytham. These subtle errors slip past even experienced Tamil writers but are immediately flagged by trained AI models.</p>
  <h2>AI Proofreading vs Human Proofreading</h2>
  <p>AI tools are fast, available 24/7, consistent, and free from the bias of familiarity. However, human editors still excel at cultural nuance, creative voice, and highly specialised domains. The best approach combines both: use AI for a first pass to catch mechanical errors, then have a human reviewer assess tone, flow, and audience appropriateness. For most bloggers and business writers, AI proofreading alone is sufficient.</p>
  <p>Start writing better Tamil today. ProofTamil's free tier gives you 200 words per analysis — enough to refine any email, social post, or short blog before hitting publish.</p>
</section>
</article>`,
  },
  {
    title: "10 Common Tamil Grammar Mistakes and How to Fix Them",
    slug: "common-tamil-grammar-mistakes",
    language: "english",
    status: "published",
    meta_description: "Avoid the 10 most common Tamil grammar mistakes. Practical examples and corrections every Tamil writer needs to know.",
    keywords: "tamil grammar mistakes, tamil grammar rules, tamil writing errors, tamil proofreading",
    excerpt: "Even fluent Tamil speakers make these 10 grammar mistakes regularly. Learn what they are and how to correct them for cleaner, more professional Tamil writing.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Grammar</div>
  <h1>10 Common Tamil Grammar Mistakes and How to Fix Them</h1>
  <div class="subhead">8 min read · english</div>
  <p class="excerpt">Even fluent Tamil speakers make these 10 grammar mistakes regularly. Learn what they are and how to correct them.</p>
</header>
<section class="content">
  <p>Tamil grammar is nuanced, with rules governing verb agreement, case suffixes, and tense formation that don't always match spoken patterns. These are the ten mistakes that appear most often in written Tamil — along with clear corrections.</p>
  <h2>1. Confusing ஆனால் and ஆனாலும்</h2>
  <p>"ஆனால்" means "but" (simple contrast), while "ஆனாலும்" means "even so / nevertheless" (concessive). Writers frequently use them interchangeably, creating logical inconsistencies in their sentences.</p>
  <h2>2. Wrong Negative Verb Forms</h2>
  <p>Using "செய்யவில்லை" (did not do) when "செய்யமாட்டேன்" (will not do) is needed — or vice versa — is extremely common. The Tamil tense system requires attention to whether the negation is past, present, or future.</p>
  <h2>3. Case Suffix Errors with Pronouns</h2>
  <p>Attaching the wrong case marker — especially dative (-க்கு) vs accusative (-ஐ) — changes sentence meaning entirely. "அவனுக்கு பாடம் கற்பித்தேன்" (I taught him a lesson) vs "அவனை பாடம் கற்பித்தேன்" carry subtly different meanings.</p>
  <h2>4. Mixing Formal and Spoken Register</h2>
  <p>Using spoken contractions like "வேணும்" (want) in a formal document instead of "வேண்டும்" is among the most common stylistic mistakes. Always match your register to your audience.</p>
  <h2>5. Incorrect Sandhi (புணர்ச்சி)</h2>
  <p>When two words combine in Tamil, phonological changes occur. Writing "பால் + அடை = பாலடை" is correct, but many writers write "பால் அடை" (with a space) or merge incorrectly. ProofTamil's sandhi checker catches these automatically.</p>
  <h2>6. Repeated Subject in Complex Sentences</h2>
  <p>Tamil routinely drops the subject when it is clear from context. Repeating "நான்" in every clause sounds unnatural and is grammatically unnecessary in most cases.</p>
  <h2>7. Wrong Verb-Subject Agreement for Plural Nouns</h2>
  <p>Non-rational plural nouns (things, animals) take third-person singular verb forms — "மரங்கள் வளர்கிறது" not "வளர்கின்றன". This rule surprises many writers.</p>
  <h2>8. Overuse of ஆக as a Suffix</h2>
  <p>The adverbial suffix "ஆக" is correct in many places, but writers overuse it where other constructions are more natural. "விரைவாக" is fine; "விரைவாக ஓடுதலாக" is redundant.</p>
  <h2>9. Incorrect Spelling of Loan Words</h2>
  <p>English loanwords adopted into Tamil have accepted spellings. "கம்ப்யூட்டர்" vs "கம்பியூட்டர்" — the first follows conventional Tamil phonology for this word; the second is a common error.</p>
  <h2>10. Missing Aaytham (ஃ) in Classical Borrowings</h2>
  <p>Words like "அஃது" (that — classical) are often written as "அது" in contexts where the classical form is required. Know your audience and the appropriate register.</p>
  <p>Catching all ten of these consistently requires practice — or a good AI proofreading tool. ProofTamil flags every one of them automatically.</p>
</section>
</article>`,
  },
  {
    title: "Formal vs Spoken Tamil: Key Differences Every Writer Must Know",
    slug: "formal-vs-spoken-tamil-differences",
    language: "english",
    status: "published",
    meta_description: "Understand the critical differences between formal (written) Tamil and spoken Tamil. When to use each and how to switch registers correctly.",
    keywords: "formal tamil, spoken tamil, written tamil, tamil register, tamil diglossia",
    excerpt: "Tamil has two distinct registers — formal written Tamil and colloquial spoken Tamil. Understanding when and how to use each is essential for every Tamil writer.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Writing</div>
  <h1>Formal vs Spoken Tamil: Key Differences Every Writer Must Know</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">Tamil has two distinct registers — formal written Tamil and colloquial spoken Tamil. Understanding when and how to use each is essential for every Tamil writer.</p>
</header>
<section class="content">
  <p>Tamil is a diglossic language — meaning it has two co-existing varieties used in different social contexts. This isn't a matter of "correct" vs "incorrect" Tamil; both registers are entirely valid. The challenge for writers is knowing which to use and how to execute it consistently.</p>
  <h2>The Core Distinction</h2>
  <p>Formal Tamil (செந்தமிழ் / மரபு நடை) is used in newspapers, academic writing, official documents, literature, and broadcasting. Spoken Tamil (பேச்சு வழக்கு) is used in everyday conversation, casual social media, and informal communication. The differences are systematic: vocabulary, verb forms, pronouns, and even sentence structure differ between the two.</p>
  <h2>Key Vocabulary Differences</h2>
  <p>Formal: "வேண்டும்" → Spoken: "வேணும்" (want/need). Formal: "இல்லை" → Spoken: "இல்ல" (no/not). Formal: "என்ன" → Spoken: "என்னா" (what). Formal: "எப்போது" → Spoken: "எப்போ" (when). These contractions are natural in speech but inappropriate in most written contexts.</p>
  <h2>Verb Form Differences</h2>
  <p>In formal Tamil, verbs fully conjugate. In spoken Tamil, forms are compressed. "செய்கிறேன்" (I am doing — formal) becomes "செய்றேன்" in spoken Tamil. "வருகிறார்கள்" (they are coming — formal) becomes "வர்றாங்க" in spoken registers.</p>
  <h2>When to Use Each</h2>
  <p>Use formal Tamil for: news articles, academic papers, official correspondence, book writing, formal emails, and any public-facing professional content. Use spoken Tamil for: social media posts targeting casual engagement, WhatsApp messages, dialogue in stories or screenplays, and content aimed at broad popular audiences.</p>
  <h2>The Danger of Mixing Registers</h2>
  <p>The most common mistake writers make is mixing registers within the same document — formal structure with spoken vocabulary, or vice versa. This creates an inconsistent tone that signals lack of care to readers. ProofTamil's style selector lets you lock your target register and flags any deviations automatically.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Script for Beginners: A Complete Introduction",
    slug: "tamil-script-beginners-introduction",
    language: "english",
    status: "published",
    meta_description: "A beginner's guide to Tamil script — the alphabet, vowels, consonants, compound characters, and how the writing system works.",
    keywords: "tamil script, tamil alphabet, learn tamil, tamil letters, tamil writing system",
    excerpt: "Tamil script is an abugida with 12 vowels, 18 consonants, and 216 compound characters. This guide explains the system clearly for complete beginners.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Learn Tamil</div>
  <h1>Tamil Script for Beginners: A Complete Introduction</h1>
  <div class="subhead">9 min read · english</div>
  <p class="excerpt">Tamil script is an abugida with 12 vowels, 18 consonants, and 216 compound characters. This guide explains the system clearly for complete beginners.</p>
</header>
<section class="content">
  <p>Tamil script (தமிழ் எழுத்து) has been in continuous use for over 2,000 years, making it one of the oldest writing systems still in active use. While it looks complex at first glance, the system is highly logical and learnable once you understand its underlying structure.</p>
  <h2>The Basic Components</h2>
  <p>Tamil uses an abugida system, meaning consonants carry an inherent vowel sound that is modified by adding diacritics. The script has: 12 vowels (உயிரெழுத்து), 18 consonants (மெய்யெழுத்து), 1 special character — the Aaytham (ஃ), and 216 compound characters (உயிர்மெய்யெழுத்து) formed by combining consonants with vowels.</p>
  <h2>The 12 Vowels</h2>
  <p>அ ஆ இ ஈ உ ஊ எ ஏ ஐ ஒ ஓ ஔ — these range from short to long versions of the same sounds. Short "அ" is like "a" in "cup"; long "ஆ" is like "a" in "father". The length distinction is phonemically significant in Tamil — it changes word meaning.</p>
  <h2>The 18 Consonants</h2>
  <p>Tamil consonants fall into three groups: vallinam (hard: க ச ட த ப ற), mellinam (soft/nasal: ங ஞ ண ன ம ன), and idaiyinam (medium: ய ர ல வ ழ ள). Each consonant by itself is pronounced with a short "a" following it — க = "ka".</p>
  <h2>Compound Characters</h2>
  <p>Each consonant combines with each vowel to form a compound character. க + ஆ = கா (kaa), க + இ = கி (ki), க + உ = கு (ku). These are not separate memorisation units — once you learn the vowel diacritics, you can read any compound character by combining what you know.</p>
  <h2>Tips for Learning</h2>
  <p>Learn vowels first, then consonants in groups, then practice reading short words. Digital tools like ProofTamil can help you proofread as you practise writing, immediately flagging incorrectly formed characters. The keyboard layout (InScript or Phonetic) is also worth learning early so you can type Tamil fluently.</p>
</section>
</article>`,
  },
  {
    title: "Tamil OCR Technology: How It Works and Best Tools in 2025",
    slug: "tamil-ocr-technology-how-it-works",
    language: "english",
    status: "published",
    meta_description: "How Tamil OCR technology converts printed and handwritten Tamil text to digital format. Review of the best Tamil OCR tools available in 2025.",
    keywords: "tamil OCR, tamil text recognition, tamil handwriting OCR, tamil image to text",
    excerpt: "Tamil OCR has advanced dramatically with AI. Modern tools can now accurately extract Tamil text from scanned documents, photos, and even handwritten notes.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Technology</div>
  <h1>Tamil OCR Technology: How It Works and Best Tools in 2025</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Tamil OCR has advanced dramatically with AI. Modern tools can now accurately extract Tamil text from scanned documents, photos, and even handwritten notes.</p>
</header>
<section class="content">
  <p>Optical Character Recognition (OCR) for Tamil has historically lagged behind English OCR due to the script's complexity — compound characters, vowel diacritics, and ligatures make Tamil harder to segment and recognise than Latin scripts. However, AI-based vision models have fundamentally changed what is possible.</p>
  <h2>How Tamil OCR Works</h2>
  <p>Modern Tamil OCR follows a pipeline: image preprocessing (contrast enhancement, deskewing, noise removal) → character segmentation (identifying individual glyphs) → recognition (matching glyphs to Unicode characters using a trained model) → post-processing (applying language model to correct errors). AI models trained on millions of Tamil character samples now achieve 95%+ accuracy on clean printed text.</p>
  <h2>Printed Text vs Handwriting</h2>
  <p>Printed Tamil OCR is now quite reliable. Handwritten Tamil OCR remains harder — individual writing styles vary enormously, and Tamil's complex compound characters are particularly challenging to segment in handwriting. Vision-language models like Google's Gemini have dramatically improved handwriting recognition by understanding context rather than just pixel patterns.</p>
  <h2>ProofTamil's Handwriting OCR Tool</h2>
  <p>ProofTamil offers a free handwriting-to-text tool powered by Gemini Vision. Upload a photo of handwritten Tamil notes (JPG, PNG, or WEBP) and receive extracted text in seconds, along with per-word confidence scores. The tool handles both pure Tamil and mixed Tamil-English handwriting.</p>
  <h2>Use Cases</h2>
  <p>Tamil OCR is transforming digitisation of historical manuscripts, enabling students to convert handwritten notes to searchable text, helping businesses digitise printed Tamil forms, and powering accessibility tools for visually impaired Tamil readers who use screen readers. The technology is now accessible enough for individual writers and students — not just institutions.</p>
</section>
</article>`,
  },
  {
    title: "Converting Handwritten Tamil Notes to Digital Text with AI",
    slug: "handwritten-tamil-notes-to-digital-text",
    language: "english",
    status: "published",
    meta_description: "Step-by-step guide to converting handwritten Tamil notes to digital text using AI-powered OCR. Free tools and tips for best results.",
    keywords: "handwritten tamil to text, tamil handwriting recognition, tamil notes digitize, tamil OCR free",
    excerpt: "AI can now read your handwritten Tamil notes with high accuracy. Here's how to digitise your notes in seconds using free AI-powered tools.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Tools</div>
  <h1>Converting Handwritten Tamil Notes to Digital Text with AI</h1>
  <div class="subhead">5 min read · english</div>
  <p class="excerpt">AI can now read your handwritten Tamil notes with high accuracy. Here's how to digitise your notes in seconds using free AI-powered tools.</p>
</header>
<section class="content">
  <p>Every Tamil student, teacher, and writer has notebooks full of handwritten content — valuable notes, drafts, and records that remain inaccessible to search engines, screen readers, or text editors. Digitising this content manually is painfully slow. AI OCR solves this.</p>
  <h2>What You Need</h2>
  <p>A smartphone with a decent camera (even a 12MP camera is sufficient for clear OCR), good lighting, and a free OCR tool. ProofTamil's Handwriting OCR tool is free for up to 2 extractions per day — enough for most occasional use.</p>
  <h2>How to Get the Best Results</h2>
  <p>1. Photograph your notes in natural light or under bright white artificial light. Avoid shadows across the page. 2. Keep the camera parallel to the page — tilted shots reduce accuracy significantly. 3. Ensure your handwriting is reasonably clear; very cramped or overlapping letters reduce confidence scores. 4. Use plain white or cream paper for maximum contrast. 5. Upload as JPG or PNG (WEBP also supported on ProofTamil).</p>
  <h2>Using ProofTamil's OCR Tool</h2>
  <p>Visit prooftamil.com/tools/handwriting-ocr. Upload your image or drag-and-drop it. Select "Tamil only" or "Tamil + English mixed" based on your notes' content. Click Extract — results appear within 2 seconds. You'll see the full extracted text plus per-word confidence scores. High-confidence words (90%+) are shown in green; uncertain words in yellow so you can verify them.</p>
  <h2>After Extraction</h2>
  <p>Once you have your digital text, use ProofTamil's workspace to proofread it — the OCR output may contain minor errors that the grammar checker can flag. Then export to .txt, copy to your document editor, or save as a draft for later editing.</p>
</section>
</article>`,
  },
  {
    title: "Tamil SEO: How to Rank Tamil Content on Google",
    slug: "tamil-seo-rank-content-google",
    language: "english",
    status: "published",
    meta_description: "Complete Tamil SEO guide: keyword research, on-page optimisation, structured data, and content strategy to rank Tamil articles on Google.",
    keywords: "tamil SEO, tamil content marketing, rank tamil blog, google tamil search, tamil keywords",
    excerpt: "Ranking Tamil content on Google requires specific strategies around keyword research, on-page SEO, and technical implementation. This guide covers everything.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil SEO</div>
  <h1>Tamil SEO: How to Rank Tamil Content on Google</h1>
  <div class="subhead">8 min read · english</div>
  <p class="excerpt">Ranking Tamil content on Google requires specific strategies around keyword research, on-page SEO, and technical implementation.</p>
</header>
<section class="content">
  <p>There are over 80 million Tamil speakers worldwide, with tens of millions actively searching Google in Tamil. Yet Tamil SEO remains dramatically underexploited — meaning well-optimised Tamil content can achieve top rankings with relatively modest competition.</p>
  <h2>Tamil Keyword Research</h2>
  <p>Tamil keyword research differs from English because users search in multiple scripts: pure Tamil Unicode ("தமிழ் இலக்கணம்"), Tamil transliterated in English letters ("tamil ilakkanam"), and English terms for Tamil topics ("tamil grammar rules"). Target all three variants. Google Search Console shows which queries bring traffic to your site — use this to find high-volume Tamil keywords you're not yet ranking for.</p>
  <h2>On-Page SEO for Tamil Content</h2>
  <p>Title tag: include your primary Tamil keyword + English equivalent for maximum reach. Keep it under 60 characters. Meta description: write it in Tamil for Tamil-language pages (under 155 characters). H1: use the Tamil keyword naturally. URL slug: use transliterated Tamil or English — Google handles both, but English slugs tend to get more clicks from international audiences.</p>
  <h2>Content Quality Is Still King</h2>
  <p>Google's quality signals apply equally to Tamil content: comprehensiveness, freshness, authoritative sourcing, and clear writing. AI proofreading is especially important for Tamil SEO — grammatical errors signal low quality to Google's quality raters, reducing your E-E-A-T score. ProofTamil's grammar checker ensures your Tamil content is error-free before publishing.</p>
  <h2>Structured Data for Tamil Content</h2>
  <p>Implement FAQPage, Article, and BreadcrumbList JSON-LD schemas. FAQPage schema is particularly powerful for Tamil content since voice search in Tamil is growing rapidly and FAQ-structured answers appear in Google's featured snippets. Write FAQ answers in both Tamil and English for maximum reach.</p>
  <h2>Building Tamil Backlinks</h2>
  <p>Guest post on established Tamil news sites (Dinamalar, Vikatan online), Tamil education platforms, and Tamil diaspora community sites. Links from Tamil-language domains carry relevance signals for Tamil queries. Internal linking between your Tamil articles also helps Google understand your site's Tamil topical authority.</p>
</section>
</article>`,
  },
  {
    title: "The History and Evolution of the Tamil Language",
    slug: "history-evolution-tamil-language",
    language: "english",
    status: "published",
    meta_description: "Explore the 2,000-year history of the Tamil language — from Sangam literature to modern digital Tamil. One of the world's oldest living languages.",
    keywords: "tamil language history, classical tamil, sangam literature, tamil evolution, ancient tamil",
    excerpt: "Tamil is one of the world's oldest living languages with an unbroken literary tradition of over 2,000 years. Here's the remarkable story of its evolution.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Culture</div>
  <h1>The History and Evolution of the Tamil Language</h1>
  <div class="subhead">9 min read · english</div>
  <p class="excerpt">Tamil is one of the world's oldest living languages with an unbroken literary tradition of over 2,000 years.</p>
</header>
<section class="content">
  <p>Tamil (தமிழ்) is not just old — it is the only ancient classical language that has survived as a living, spoken, and written language into the 21st century without significant interruption. Sanskrit, Greek, and Latin are studied as classical languages; Tamil is studied as both a classical language and used by 80+ million people daily.</p>
  <h2>The Sangam Period (300 BCE – 300 CE)</h2>
  <p>The earliest datable Tamil literature belongs to the Sangam period — a remarkable flowering of poetry and prose produced by academies (Sangam) of Tamil scholars. Poems from collections like Purananuru, Akananuru, and the grammar text Tolkappiyam reveal a sophisticated literary culture. Tolkappiyam, the oldest surviving Tamil grammar, demonstrates that Tamil had already developed complex linguistic rules by at least 300 BCE.</p>
  <h2>Medieval Tamil (600 – 1300 CE)</h2>
  <p>The medieval period saw the rise of devotional literature — the Tevaram hymns of the Nayanmars and the Nalayira Divya Prabandham of the Alvars. This era also produced Thirukkural, composed by Thiruvalluvar, which remains the most widely quoted Tamil text. The Chola empire's patronage of Tamil literature produced enormous scholarly output and spread Tamil culture across Southeast Asia.</p>
  <h2>Colonial Period and Standardisation</h2>
  <p>European missionaries, particularly Robert Caldwell (1814-1891), made significant contributions to Tamil linguistics. Caldwell's comparative grammar of Dravidian languages established Tamil's place within the Dravidian family and influenced 19th-century standardisation efforts. The introduction of printing in Tamil script standardised spelling and made texts accessible across regions.</p>
  <h2>Modern Tamil and Digital Age</h2>
  <p>Independent India declared Tamil a Scheduled Language in 1950, and Tamil Nadu has vigorously promoted Tamil in education and government. In 2004, Tamil was designated a Classical Language of India — the first to receive this honour. Today, Tamil is fully represented in Unicode, has millions of web pages, active social media communities, and AI tools specifically built for Tamil language processing.</p>
</section>
</article>`,
  },
  {
    title: "Professional Tamil Writing for Business Communication",
    slug: "professional-tamil-writing-business",
    language: "english",
    status: "published",
    meta_description: "Master professional Tamil writing for business emails, reports, and official communication. Formal Tamil grammar, vocabulary, and etiquette guide.",
    keywords: "tamil business writing, formal tamil, professional tamil email, tamil office communication",
    excerpt: "Professional Tamil communication requires mastering formal register, appropriate vocabulary, and business etiquette. This guide covers everything you need.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Business</div>
  <h1>Professional Tamil Writing for Business Communication</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Professional Tamil communication requires mastering formal register, appropriate vocabulary, and business etiquette.</p>
</header>
<section class="content">
  <p>As Tamil Nadu's economy grows and Tamil diaspora businesses expand globally, professional Tamil writing has become an increasingly important skill. Whether you're writing to government offices, Tamil-speaking clients, or publishing corporate reports, formal Tamil must meet specific standards.</p>
  <h2>Essential Formal Tamil Vocabulary for Business</h2>
  <p>Replace casual words with formal equivalents: "வேணும்" → "வேண்டும்", "பண்றோம்" → "செய்கிறோம்", "போகுது" → "செல்கிறது". In subject lines and headings: use "பொருள்:" (Subject:) and "அன்புள்ள" (Dear — formal) or "மரியாதைக்குரிய" (Respected — very formal) for salutations.</p>
  <h2>Structure of a Formal Tamil Email</h2>
  <p>Opening salutation: "மரியாதைக்குரிய [பெயர்] அவர்களுக்கு," — Reference line: "பொருள்: [topic]" — Body: state purpose, provide details, make request — Closing: "உங்கள் உண்மையான / நன்றியுடன்," — Signature: full name, designation, organisation.</p>
  <h2>Common Business Letter Phrases</h2>
  <p>"மேற்கண்ட பொருளில்" (In reference to the above matter), "தங்கள் பரிசீலனைக்கு" (For your consideration), "விரைவில் பதில் அளிக்க வேண்டுகிறோம்" (We request a prompt reply), "இணைப்பில் காணலாம்" (Please find in the attachment).</p>
  <h2>Proofreading Before Sending</h2>
  <p>A formal Tamil communication with grammatical errors reflects poorly on the organisation. Run every business document through ProofTamil before sending — set the mode to "Formal Tamil" to ensure the AI specifically checks for formal register violations, inappropriate contractions, and spelling errors that would undermine professional credibility.</p>
</section>
</article>`,
  },
  {
    title: "How to Write Tamil Blog Posts That Rank on Search Engines",
    slug: "write-tamil-blog-posts-rank-search",
    language: "english",
    status: "published",
    meta_description: "A practical guide to writing Tamil blog posts that rank well on Google. Content structure, keyword placement, and SEO best practices for Tamil writers.",
    keywords: "tamil blog writing, tamil blogging tips, write tamil blog, tamil content SEO",
    excerpt: "Writing Tamil blog posts that rank requires combining good writing with smart SEO. Here's a practical framework any Tamil blogger can follow.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Blogging</div>
  <h1>How to Write Tamil Blog Posts That Rank on Search Engines</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Writing Tamil blog posts that rank requires combining good writing with smart SEO. Here's a practical framework any Tamil blogger can follow.</p>
</header>
<section class="content">
  <p>Tamil blogging has exploded over the past decade. Platforms like Blogger, WordPress, and Medium all support Tamil Unicode fully, and Google indexes Tamil content reliably. The opportunity for Tamil writers to build audiences and generate income through blogging has never been better — if they understand how to optimise their content.</p>
  <h2>Start With Keyword Research</h2>
  <p>Before writing, identify what your target reader is actually searching for. Use Google's autocomplete in Tamil, Google Search Console (if you have an existing site), or tools like Ubersuggest with Tamil queries. Target long-tail keywords — "தமிழ் இலக்கணம் பயிற்சி" (Tamil grammar exercises) is less competitive and more targetable than just "தமிழ் இலக்கணம்".</p>
  <h2>Blog Post Structure for SEO</h2>
  <p>H1: Your primary keyword phrase. H2s: related subtopics (these show in featured snippets). Short paragraphs (3-4 sentences). Include your keyword naturally in the first paragraph. Use lists and numbered steps where appropriate — Google loves structured content. Aim for 800-1,500 words for most Tamil blog topics.</p>
  <h2>Write for Humans First</h2>
  <p>Google's Helpful Content Update penalises content written primarily for search engines. Write genuinely useful content, then optimise. Tamil readers appreciate clear, well-structured writing that respects their time. Avoid padding your posts with repetitive content just to hit a word count.</p>
  <h2>Proofread Every Post</h2>
  <p>Google's quality raters explicitly look for spelling and grammar errors as signals of low-quality content. A Tamil blog post full of spelling mistakes will struggle to rank regardless of its keyword targeting. Use ProofTamil to proofread every post before publishing — it takes less than 2 minutes and can dramatically improve your ranking potential.</p>
  <h2>Promote Your Posts</h2>
  <p>Share on Tamil Facebook groups, Tamil Twitter communities, and WhatsApp channels. Build backlinks by commenting thoughtfully on other Tamil blogs with links to your relevant posts. Submit your site to Google Search Console and request indexing for new posts to accelerate discovery.</p>
</section>
</article>`,
  },
  {
    title: "AI and the Tamil Language: What's Changing in 2025",
    slug: "ai-tamil-language-2025-changes",
    language: "english",
    status: "published",
    meta_description: "How artificial intelligence is transforming Tamil language processing in 2025 — from NLP models to translation, speech recognition, and proofreading tools.",
    keywords: "AI tamil language, tamil NLP, tamil AI 2025, tamil language technology",
    excerpt: "AI is reshaping what is possible for Tamil language — from speech recognition to translation and writing assistance. Here's what's changed and what's coming.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Technology</div>
  <h1>AI and the Tamil Language: What's Changing in 2025</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">AI is reshaping what is possible for Tamil language — from speech recognition to translation and writing assistance.</p>
</header>
<section class="content">
  <p>Five years ago, AI tools for Tamil were primitive — basic spell-checkers and rudimentary translators that produced awkward output. In 2025, the landscape has transformed dramatically. Large language models trained on multilingual data including Tamil can now write, edit, translate, and understand Tamil at a level that would have seemed impossible a decade ago.</p>
  <h2>Tamil NLP Has Matured</h2>
  <p>Natural Language Processing (NLP) models like mBERT, XLM-R, and Indic BERT have been trained on substantial Tamil corpora. These models understand Tamil morphology, syntax, and semantics well enough to power useful applications. Google Translate's Tamil output has improved markedly, and specialised tools like ProofTamil use these underlying models with domain-specific fine-tuning for Tamil grammar and style.</p>
  <h2>Tamil Speech Recognition</h2>
  <p>Google's speech recognition for Tamil, powered by Whisper-class models, now achieves practical accuracy for clear speech. Tamil voice input is reliable on Android and iOS. This opens up dictation as a viable writing method for Tamil — speak your content and use AI proofreading tools to refine the transcription.</p>
  <h2>Vision AI for Tamil Documents</h2>
  <p>Multimodal models like Gemini can now extract Tamil text from images with high accuracy — a breakthrough for digitising handwritten notes, printed documents, and historical manuscripts. ProofTamil's handwriting OCR tool uses this capability to let users extract Tamil text from photos in seconds.</p>
  <h2>What's Still Hard for AI</h2>
  <p>Dialect variation remains challenging — AI models trained predominantly on formal Tamil struggle with regional dialects like Jaffna Tamil, Sri Lanka Tamil, or Chennai slang. Cultural nuance, humour, and proverbs remain areas where human editors outperform AI. Machine translation between Tamil and English still makes semantic errors in complex sentences. These are active research areas with rapid improvement.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Literature Through the Ages: Sangam to Modern Era",
    slug: "tamil-literature-sangam-to-modern",
    language: "english",
    status: "published",
    meta_description: "A survey of Tamil literature from ancient Sangam poetry through medieval devotional texts to modern fiction and contemporary writing.",
    keywords: "tamil literature, sangam poetry, tamil classical literature, modern tamil writing, thirukkural",
    excerpt: "Tamil literature spans 2,500 years — from ancient Sangam love poems to modern short stories. Here's a guide to the major periods and their landmark works.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Literature</div>
  <h1>Tamil Literature Through the Ages: Sangam to Modern Era</h1>
  <div class="subhead">10 min read · english</div>
  <p class="excerpt">Tamil literature spans 2,500 years — from ancient Sangam love poems to modern short stories.</p>
</header>
<section class="content">
  <p>The depth and continuity of Tamil literary tradition is extraordinary. While other ancient literary traditions require translation and scholarly mediation to reach modern readers, educated Tamil speakers can still engage directly with much of Sangam-era poetry — a testament to the remarkable continuity of the language.</p>
  <h2>Sangam Literature (300 BCE – 300 CE)</h2>
  <p>The Sangam corpus comprises over 2,300 poems in eight anthologies (Ettuthokai) and ten idylls (Pattupattu). The poems are divided by theme into akam (love, interior emotion) and puram (war, heroism, public life). The Five Landscapes (aintiṇai) system — each landscape (kurinji, marutam, mullai, neytal, paalai) associated with specific seasons, flora, and emotional states — creates a sophisticated metaphorical framework unlike anything in contemporary world literature.</p>
  <h2>Epic Period: Cilappatikaram and Manimekalai</h2>
  <p>The twin epics Cilappatikaram (by Ilanko Atikal) and Manimekalai (by Sattanar) together form Tamil's answer to Greek tragedy and Buddhist philosophy. Cilappatikaram's heroine Kannaki is one of Tamil literature's most enduring characters — her story of wrongful justice and divine retribution is still performed as street theatre and referenced in contemporary Tamil writing.</p>
  <h2>Medieval Devotional Literature</h2>
  <p>The Bhakti movement produced the Tevaram (devotional hymns to Shiva by Appar, Sundarar, and Thirugnana Sambandhar) and the Nalayira Divya Prabandham (4,000 verses devoted to Vishnu by the Alvars). Thiruvalluvar's Thirukkural — 1,330 couplets on ethics, governance, and love — transcends religious affiliation and is arguably the most universally respected Tamil text.</p>
  <h2>Modern Tamil Literature (19th Century – Present)</h2>
  <p>The colonial period brought new forms — the novel, short story, and newspaper essay — that transformed Tamil literary production. Writers like Subramania Bharati brought political fire to Tamil poetry; Jayakanthan and Pudhumaipithan pioneered social realism in fiction. Contemporary writers like Perumal Murugan have achieved international recognition, with translations into dozens of languages.</p>
</section>
</article>`,
  },
  {
    title: "How to Proofread Tamil Documents Effectively",
    slug: "proofread-tamil-documents-effectively",
    language: "english",
    status: "published",
    meta_description: "A systematic approach to proofreading Tamil documents — from manual techniques to AI-assisted tools — ensuring error-free Tamil content every time.",
    keywords: "proofread tamil, tamil document editing, tamil error checking, tamil proofreading tips",
    excerpt: "Effective Tamil proofreading requires a systematic approach. Combine manual review techniques with AI tools for consistently error-free Tamil content.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Proofreading</div>
  <h1>How to Proofread Tamil Documents Effectively</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">Effective Tamil proofreading requires a systematic approach. Combine manual review techniques with AI tools for consistently error-free Tamil content.</p>
</header>
<section class="content">
  <p>Proofreading Tamil is not simply re-reading your work. Experienced proofreaders use systematic techniques to catch errors that casual re-reading misses. This guide combines traditional proofreading strategies with modern AI tools for maximum accuracy.</p>
  <h2>The Four Error Categories to Check</h2>
  <p>1. Spelling errors (எழுத்துப்பிழை) — incorrect character sequences or missing/extra letters. 2. Grammar errors (இலக்கணப்பிழை) — wrong verb forms, case errors, agreement mistakes. 3. Register errors — mixing formal and spoken Tamil inappropriately. 4. Typographic errors — wrong punctuation, spacing issues, incorrect numerals.</p>
  <h2>Manual Proofreading Techniques</h2>
  <p>Read aloud — hearing the text exposes rhythm errors and unclear sentences. Read backwards (sentence by sentence, not word by word) — this forces attention on each sentence's structure rather than allowing flow to carry you past errors. Print and mark — screen proofreading misses errors that paper review catches. Use a ruler to cover lines below where you're reading to prevent your eye from jumping ahead.</p>
  <h2>AI-Assisted Proofreading with ProofTamil</h2>
  <p>Manual proofreading and AI proofreading catch different error types. AI is better at systematic grammar rules, sandhi errors, and spelling consistency. Humans are better at detecting tone inconsistencies, cultural inappropriateness, and meaning-level errors. Use ProofTamil first (set to your target register — formal or spoken), accept or review all suggestions, then manually re-read with fresh eyes.</p>
  <h2>Final Checklist Before Publishing</h2>
  <p>✓ All proper nouns spelled consistently. ✓ Dates and numbers formatted consistently. ✓ No mixed registers. ✓ Opening and closing are appropriately formal/informal. ✓ No accidentally repeated words ("தமிழ் தமிழ்"). ✓ Quotation marks and punctuation correct. ✓ ProofTamil shows zero errors.</p>
</section>
</article>`,
  },
  {
    title: "Learning Tamil in 2025: The Most Effective Methods",
    slug: "learning-tamil-effective-methods-2025",
    language: "english",
    status: "published",
    meta_description: "The most effective methods to learn Tamil in 2025 — from apps and online courses to immersion and AI writing tools. A practical roadmap for beginners.",
    keywords: "learn tamil, tamil learning tips, how to learn tamil, tamil for beginners, tamil language course",
    excerpt: "Learning Tamil is more accessible than ever in 2025, with apps, AI tools, online courses, and Tamil media all available on demand. Here's the most effective path.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Learn Tamil</div>
  <h1>Learning Tamil in 2025: The Most Effective Methods</h1>
  <div class="subhead">8 min read · english</div>
  <p class="excerpt">Learning Tamil is more accessible than ever in 2025. Here's the most effective path from beginner to confident writer.</p>
</header>
<section class="content">
  <p>Tamil has a reputation as a difficult language to learn — its ancient grammar, complex script, and diglossia (the gap between formal and spoken forms) genuinely present challenges. But structured learning combined with modern tools makes Tamil acquisition much faster than it was for previous generations.</p>
  <h2>Start with the Script (Week 1-2)</h2>
  <p>Don't try to speak before you can read. Tamil script follows a perfectly logical pattern — once you understand the vowel + consonant combination system, you can decode any written word phonetically. Apps like Drops and Learn Tamil Script provide gamified script learning. Dedicate 20 minutes per day and you can learn to read basic Tamil in 2 weeks.</p>
  <h2>Build Core Vocabulary (Month 1-3)</h2>
  <p>Learn the 500 most common Tamil words using spaced repetition (Anki decks for Tamil are available free). Focus on the spoken Tamil vocabulary first — this is what you'll hear in Tamil films, music, and conversation. Formal Tamil vocabulary can come later when you start reading written Tamil.</p>
  <h2>Immerse in Tamil Media</h2>
  <p>Tamil has one of the world's most prolific film industries (Kollywood). Watch Tamil films with Tamil subtitles (not English). Listen to Tamil radio, podcasts, and music. Follow Tamil news channels. Immersion builds pattern recognition far faster than structured study alone — you start to feel when something is right rather than having to consciously apply rules.</p>
  <h2>Practice Writing with AI Feedback</h2>
  <p>Once you can write basic sentences, use ProofTamil to practice writing and get instant feedback. Write a paragraph, run it through the proofreader, and study every suggestion. This targeted feedback loop — write, check, learn from corrections, write again — accelerates grammar acquisition dramatically compared to textbook exercises.</p>
  <h2>Find a Conversation Partner</h2>
  <p>iTalki, Tandem, and Tamil diaspora Facebook groups all offer language exchange partners. Even one hour per week of conversation with a native speaker dramatically accelerates fluency. Don't be embarrassed about mistakes — Tamil native speakers are almost universally encouraging to learners.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Punctuation: The Complete Writer's Guide",
    slug: "tamil-punctuation-complete-guide",
    language: "english",
    status: "published",
    meta_description: "Complete guide to Tamil punctuation rules — full stops, commas, question marks, quotation marks, and other punctuation in Tamil writing.",
    keywords: "tamil punctuation, tamil writing rules, tamil full stop, tamil comma usage, tamil grammar punctuation",
    excerpt: "Tamil punctuation has specific rules that differ from English in important ways. This complete guide covers every punctuation mark you need for Tamil writing.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Grammar</div>
  <h1>Tamil Punctuation: The Complete Writer's Guide</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">Tamil punctuation has specific rules that differ from English in important ways. This complete guide covers every punctuation mark you need.</p>
</header>
<section class="content">
  <p>Modern Tamil writing uses punctuation marks (நிறுத்தக்குறிகள்) derived largely from English conventions, adapted to Tamil grammatical structures. Many Tamil writers — especially those who learned Tamil before formal punctuation education — use punctuation inconsistently. This guide standardises your practice.</p>
  <h2>Full Stop (.) — முற்றுப்புள்ளி</h2>
  <p>Use after every complete sentence that makes a statement. In Tamil, the verb comes at the end of the sentence, so the full stop follows the final verb form. "அவர் வீட்டிற்கு சென்றார்." — note the full stop after the verb.</p>
  <h2>Comma (,) — அல்புள்ளி</h2>
  <p>Use to separate: items in a list, clauses in compound sentences, introductory phrases from the main clause. Tamil commas follow the same logic as English commas but require care around verb-final structure. Avoid comma splices — joining two independent Tamil clauses with only a comma.</p>
  <h2>Question Mark (?) — வினாக்குறி</h2>
  <p>Tamil question sentences often don't require structural change (unlike English which inverts subject and verb) — instead, the question particle "ஆ" or "என்று" signals a question. The question mark still appears at the sentence end: "நீ வருவாயா?"</p>
  <h2>Quotation Marks (" ") — மேற்கோள் குறிகள்</h2>
  <p>Use double quotation marks for direct speech and single quotation marks for quotations within quotations. In Tamil, the reporting verb typically comes after the quoted speech: "நான் சென்றேன்" என்று அவர் கூறினார்.</p>
  <h2>Dash (—) and Ellipsis (…)</h2>
  <p>The em-dash is used for parenthetical interruptions and dramatic pauses — just as in English. The ellipsis indicates trailing off or omission. Both are acceptable in Tamil writing but should be used sparingly. Overuse weakens impact.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Verb Conjugation: A Complete Simple Guide",
    slug: "tamil-verb-conjugation-complete-guide",
    language: "english",
    status: "published",
    meta_description: "Master Tamil verb conjugation — present, past, and future tenses, negative forms, and person/number agreement. Clear examples throughout.",
    keywords: "tamil verb conjugation, tamil tenses, tamil grammar verbs, tamil verb forms",
    excerpt: "Tamil verb conjugation follows logical patterns once you understand the system. This guide walks through tenses, persons, and negative forms with clear examples.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Grammar</div>
  <h1>Tamil Verb Conjugation: A Complete Simple Guide</h1>
  <div class="subhead">9 min read · english</div>
  <p class="excerpt">Tamil verb conjugation follows logical patterns once you understand the system — tenses, persons, and negative forms with clear examples.</p>
</header>
<section class="content">
  <p>Tamil verbs are highly regular and follow systematic conjugation patterns. The core verb stem remains stable, while suffixes added to it encode tense, person, number, and gender. Once you learn the suffix system, you can conjugate any Tamil verb correctly.</p>
  <h2>Basic Verb Structure</h2>
  <p>Tamil verb = verb stem + tense marker + personal suffix. Example: "செய்" (do) + "கிற்" (present) + "ேன்" (I) = "செய்கிறேன்" (I am doing). The tense marker signals whether action is present, past, or future; the personal suffix specifies who is doing it.</p>
  <h2>Present Tense</h2>
  <p>Marker: "-கிற-". I do: செய்கிறேன். You do: செய்கிறாய். He does: செய்கிறான். She does: செய்கிறாள். They do (people): செய்கிறார்கள். It does/they do (non-rational): செய்கிறது.</p>
  <h2>Past Tense</h2>
  <p>Markers vary by verb class: "-த்த-", "-ந்த-", "-ட்ட-". Example with செய்: செய்தேன் (I did), செய்தாய் (you did), செய்தான் (he did), செய்தாள் (she did), செய்தார்கள் (they did). The past marker choice is determined by the verb's phonological class — a systematic but learnable rule.</p>
  <h2>Future Tense</h2>
  <p>Marker: "-வ-". I will do: செய்வேன். You will do: செய்வாய். He will do: செய்வான். This tense is also used for habitual present action in some contexts: "நான் தினமும் பாலகம் சேர்வேன்" (I take milk every day).</p>
  <h2>Negative Forms</h2>
  <p>Negation in Tamil uses either the negative verb suffix or "இல்லை". Past negative: செய்யவில்லை (did not do). Future/habitual negative: செய்யமாட்டேன் (will not do / don't do). These two are not interchangeable — using the wrong one changes the temporal meaning entirely.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Language Preservation in the Digital Age",
    slug: "tamil-language-preservation-digital-age",
    language: "english",
    status: "published",
    meta_description: "How digital technology, AI, and online communities are helping preserve and grow the Tamil language for future generations.",
    keywords: "tamil language preservation, digital tamil, tamil online, tamil language future",
    excerpt: "The digital age poses both threats and opportunities for Tamil. Here's how technology, AI, and Tamil communities are working to ensure the language thrives.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Culture</div>
  <h1>Tamil Language Preservation in the Digital Age</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">The digital age poses both threats and opportunities for Tamil. Here's how technology and community are ensuring the language thrives.</p>
</header>
<section class="content">
  <p>Languages die when younger generations stop learning and using them. Tamil faces the pressure that all non-English languages face in the internet era — a gravitational pull toward English as the language of global technology, opportunity, and social media. Yet Tamil's prospects are better than most minority languages, for reasons both historical and technological.</p>
  <h2>Tamil's Digital Strengths</h2>
  <p>Tamil was one of the earliest non-Latin scripts to achieve comprehensive Unicode support, enabling Tamil text to work reliably across all digital platforms. Tamil has tens of millions of active social media users, a thriving online news ecosystem, and millions of web pages. YouTube's Tamil content is among the most-watched regional language content globally. These facts mean Tamil has genuine digital vitality — not just institutional preservation.</p>
  <h2>The Threat of Code-Switching</h2>
  <p>The biggest threat to Tamil in the digital age isn't technology — it's the habit of writing Tamil in English letters (Tanglish: "vanakkam", "eppadi irukeenga?") rather than Tamil script. While Tanglish is a natural form of code-switching in casual communication, the generation that grows up never writing Tamil script is a generation that loses Tamil literacy. Encouraging Tamil-script digital writing — even for casual messages — is the single most important preservation action.</p>
  <h2>AI as a Preservation Tool</h2>
  <p>AI tools that make Tamil writing easier and more accurate actually encourage Tamil usage. When typing in Tamil script is effortless (phonetic keyboards) and errors are caught automatically (AI proofreading), the friction of choosing Tamil over English decreases. ProofTamil was built partly from this philosophy — making Tamil writing easier increases Tamil writing frequency.</p>
  <h2>Digitising Tamil Heritage</h2>
  <p>The digitisation of palm-leaf manuscripts, historical newspapers, and rare literary texts makes Tamil's 2,000-year heritage accessible to future generations. Projects like the Digital Library of India, Tamilnadu Archives digitisation, and university manuscript libraries are preserving irreplaceable Tamil knowledge in searchable, accessible formats.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Dialects Explained: Understanding Regional Variations",
    slug: "tamil-dialects-regional-variations",
    language: "english",
    status: "published",
    meta_description: "A guide to the major Tamil dialects — Chennai Tamil, Madurai Tamil, Sri Lanka Tamil, Singapore Tamil, and their key differences.",
    keywords: "tamil dialects, regional tamil, sri lanka tamil, madurai tamil, chennai tamil, iyer tamil",
    excerpt: "Tamil isn't one uniform language — it has fascinating regional and social dialects. Understanding these variations helps writers communicate more effectively.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Language</div>
  <h1>Tamil Dialects Explained: Understanding Regional Variations</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Tamil has fascinating regional and social dialects. Understanding these variations helps writers communicate more effectively with different audiences.</p>
</header>
<section class="content">
  <p>Standard written Tamil (செந்தமிழ்) serves as a common written form understood by educated Tamil speakers everywhere. But spoken Tamil varies enormously by region, social group, and historical community — differences that any serious Tamil writer needs to understand.</p>
  <h2>Major Regional Dialects</h2>
  <p>Chennai Tamil is the urban standard — heavily influenced by English loanwords and a fast, clipped speech pattern. Madurai Tamil preserves more classical features, with slower delivery and distinct phonology (the "zh" sound is more clearly articulated). Coimbatore Tamil has its own characteristic vocabulary and intonation. Tirunelveli Tamil is often considered the most "classical" in vocabulary preservation.</p>
  <h2>Sri Lanka Tamil</h2>
  <p>Sri Lanka Tamil (spoken in Jaffna and other Northern/Eastern provinces) has preserved many features of older Tamil that have disappeared from Indian Tamil. Vocabulary differs significantly — some words that sound archaic in India are everyday usage in Sri Lanka. Sri Lanka Tamil also has its own distinct phonological features and is considered a prestige variety among Tamil literary scholars.</p>
  <h2>Diaspora Tamil</h2>
  <p>Tamil communities in Singapore, Malaysia, the UK, Canada, and the US have developed their own varieties, mixing Tamil with local languages. Singapore Tamil mixes Tamil with Malay, English, and Mandarin borrowings. Malaysian Tamil preserves many features from the plantation Tamil community's historical background. These diaspora varieties are linguistically fascinating and culturally significant.</p>
  <h2>Writing Across Dialects</h2>
  <p>For formal writing, always use standard literary Tamil — this is understood across all dialect communities. For creative writing, dialogue can authentically represent characters' dialect backgrounds. When writing for a specific regional audience, incorporate appropriate vocabulary and idioms. ProofTamil's grammar checker targets standard Tamil norms — regional dialect forms won't be flagged as errors, but formal register violations will.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Unicode, Typefaces, and Digital Publishing",
    slug: "tamil-unicode-typefaces-digital-publishing",
    language: "english",
    status: "published",
    meta_description: "Everything Tamil writers and publishers need to know about Tamil Unicode, fonts, typefaces, and digital publishing best practices.",
    keywords: "tamil unicode, tamil fonts, tamil typeface, tamil digital publishing, tamil web fonts",
    excerpt: "Understanding Tamil Unicode and typefaces is essential for digital publishers. This guide covers everything you need to publish Tamil content correctly online.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Technology</div>
  <h1>Tamil Unicode, Typefaces, and Digital Publishing</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">Understanding Tamil Unicode and typefaces is essential for digital publishers. This guide covers everything you need to publish Tamil content correctly online.</p>
</header>
<section class="content">
  <p>Tamil script entered Unicode in version 1.0 (1991) and has since been continuously refined. Tamil characters occupy the Unicode range U+0B80 to U+0BFF. This standardisation means Tamil text typed on any compliant system can be read on any other compliant system — the foundation of Tamil's robust digital presence today.</p>
  <h2>Tamil Unicode Encoding</h2>
  <p>Modern Tamil text must use Unicode (specifically UTF-8 encoding on the web). Older Tamil documents may use proprietary encodings like TAB, TAM, or TSCII — these are not universally readable and should be converted to Unicode for any new publishing. If you receive Tamil content in an unreadable encoding, conversion tools are available online.</p>
  <h2>Recommended Tamil Web Fonts</h2>
  <p>Noto Sans Tamil (Google) — the most comprehensive and compatible Tamil web font, free, and covers all Unicode Tamil characters. Noto Serif Tamil — for traditional, literary feel. Latha — Microsoft's Tamil font, widely available on Windows. For web publishing, use Google Fonts' Noto Sans Tamil with a simple link tag — it loads reliably and renders correctly on all devices.</p>
  <h2>Font Size and Readability</h2>
  <p>Tamil characters are visually denser than Latin characters at the same font size. What reads comfortably at 16px in English may need 17-18px in Tamil for equivalent readability. Line height should be 1.7-1.8 for Tamil body text (vs 1.5 for English). These adjustments significantly improve reading experience for Tamil audiences.</p>
  <h2>Publishing Checklist for Tamil Digital Content</h2>
  <p>✓ Use UTF-8 encoding declared in HTML meta charset tag. ✓ Include a Tamil web font in your CSS. ✓ Set appropriate font size (17-18px for body text). ✓ Set line-height to 1.7-1.8. ✓ Test rendering on both Windows and Mac (they render Tamil slightly differently). ✓ Test on mobile — Tamil characters should render clearly at all screen sizes. ✓ Proofread with ProofTamil before publishing.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Content Marketing: Reaching 80 Million Tamil Speakers",
    slug: "tamil-content-marketing-80-million-speakers",
    language: "english",
    status: "published",
    meta_description: "How brands and businesses can use Tamil content marketing to reach 80 million Tamil speakers globally. Strategy, channels, and content creation guide.",
    keywords: "tamil content marketing, reach tamil audience, tamil marketing, tamil digital marketing",
    excerpt: "80 million Tamil speakers represent a massive, underserved content market. Here's how brands can build authentic Tamil content marketing strategies.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Marketing</div>
  <h1>Tamil Content Marketing: Reaching 80 Million Tamil Speakers</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">80 million Tamil speakers represent a massive, underserved content market. Here's how to build authentic Tamil content marketing strategies.</p>
</header>
<section class="content">
  <p>Tamil speakers represent one of the world's largest language communities — concentrated in Tamil Nadu (80M+), Sri Lanka (3M+), Singapore, Malaysia, the UK, Canada, and across the global diaspora. Yet most global brands still treat Tamil as an afterthought, doing basic translation rather than genuine localisation. This represents a massive opportunity for brands willing to invest properly.</p>
  <h2>Why Tamil Content Marketing Works</h2>
  <p>Tamil consumers respond strongly to content in their own language — research consistently shows higher engagement, trust, and conversion rates from native-language content vs translated English content. Tamil social media users are highly active, sharing Tamil content enthusiastically within their networks. Tamil YouTube channels routinely achieve millions of views. The Tamil content consumption appetite far exceeds current supply.</p>
  <h2>Key Channels for Tamil Content</h2>
  <p>YouTube: Tamil content gets massive organic reach. Even modest production-quality videos in Tamil outperform polished English content with Tamil audiences. Facebook groups: Tamil Facebook groups are extraordinarily active — community-based Tamil marketing works exceptionally well here. WhatsApp: Tamil content shared in family and friend groups reaches deep into the community. Tamil news sites: sponsored content on Dinamalar, Vikatan, and The Hindu Tamil reaches large educated audiences.</p>
  <h2>Creating Authentic Tamil Content</h2>
  <p>Never simply translate English content word-for-word. Tamil audiences immediately recognise awkward translation and it damages brand credibility. Work with native Tamil writers who understand your audience's cultural context. Use appropriate cultural references — Tamil festivals, film references, food, and family values resonate deeply. Proofread everything with a Tamil grammar tool before publishing — errors signal disrespect to the audience.</p>
  <h2>Measuring Tamil Content Success</h2>
  <p>Track separately from your English content: Tamil-specific social engagement rates, Tamil search traffic via Google Search Console (filter by Tamil-language queries), Tamil email newsletter open rates, and conversion rates from Tamil-language landing pages. Tamil audiences often convert differently from English-language audiences — longer consideration cycles but higher loyalty once won.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Sandhi Rules: Understanding Compound Word Formation",
    slug: "tamil-sandhi-rules-compound-words",
    language: "english",
    status: "published",
    meta_description: "A clear guide to Tamil sandhi (punarchi) rules — how words combine and change when they meet in Tamil compound words and phrases.",
    keywords: "tamil sandhi, tamil punarchi, tamil compound words, tamil phonology, tamil grammar rules",
    excerpt: "Tamil sandhi (புணர்ச்சி) rules govern how sounds change at word boundaries. Understanding these rules is essential for correct written Tamil.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Grammar</div>
  <h1>Tamil Sandhi Rules: Understanding Compound Word Formation</h1>
  <div class="subhead">8 min read · english</div>
  <p class="excerpt">Tamil sandhi (புணர்ச்சி) rules govern how sounds change at word boundaries. Understanding these rules is essential for correct written Tamil.</p>
</header>
<section class="content">
  <p>When two words meet in Tamil, the sounds at their junction often change — this phenomenon is called sandhi (புணர்ச்சி). These changes are not random; they follow specific, learnable rules. Incorrect sandhi is one of the most common errors in written Tamil, and one that AI proofreading tools like ProofTamil check automatically.</p>
  <h2>Types of Tamil Sandhi</h2>
  <p>Tamil has two major sandhi types: தனிமை புணர்ச்சி (isolation sandhi — words that always combine) and வேற்றுமை புணர்ச்சி (case sandhi — changes triggered by grammatical case). Within these, specific rules govern what happens when vowels meet vowels, consonants meet vowels, and consonants meet consonants.</p>
  <h2>Key Sandhi Rules</h2>
  <p>Vowel + Vowel: when a word ending in a vowel meets a word beginning with a vowel, a connecting consonant (usually "வ்" or "ய்") is inserted. Example: "பா" + "அடி" = "பாவடி" (not "பா அடி"). Consonant + Vowel: some consonants are softened or strengthened when they meet vowels at word boundaries. This is particularly important in compound words.</p>
  <h2>Common Sandhi Errors</h2>
  <p>The most common sandhi error is simply writing two words separately when they should be combined, or combining them without applying the phonological change. "பால் அடை" should be "பாலடை". "மழை நீர்" should be "மழைநீர்". Checking these requires knowing both the sandhi rules and which word combinations standardly occur as compounds.</p>
  <h2>Practical Tips</h2>
  <p>When in doubt about whether to combine two words or keep them separate, ask: do these words commonly co-occur as a single concept? If yes, they're likely a compound and should follow sandhi rules. ProofTamil's grammar checker automatically detects common sandhi errors and suggests the correct combined form, making this one of the most practical applications of AI grammar checking for Tamil writers.</p>
</section>
</article>`,
  },
  {
    title: "Writing Tamil Academic Research Papers",
    slug: "writing-tamil-academic-research-papers",
    language: "english",
    status: "published",
    meta_description: "A guide to writing academic research papers in Tamil — structure, formal register, citations, and technical vocabulary for Tamil academic writing.",
    keywords: "tamil academic writing, tamil research paper, formal tamil writing, tamil university writing",
    excerpt: "Academic Tamil writing has its own conventions and standards. This guide covers structure, formal register, citations, and technical vocabulary for Tamil researchers.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Academic</div>
  <h1>Writing Tamil Academic Research Papers</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Academic Tamil writing has its own conventions and standards. This guide covers structure, formal register, citations, and technical vocabulary for Tamil researchers.</p>
</header>
<section class="content">
  <p>Tamil academic writing is governed by conventions established by Tamil universities, research journals, and scholarly tradition. Writers who are fluent in everyday Tamil but new to academic writing often struggle with the specific register, citation formats, and structural conventions expected in Tamil scholarship.</p>
  <h2>Register and Vocabulary</h2>
  <p>Tamil academic writing uses a highly formal register with preference for Sanskritised or classical Tamil vocabulary over English loanwords where Tamil equivalents exist. "ஆராய்ச்சி" (research) not "ரிசர்ச்"; "கோட்பாடு" (theory) not "தியரி"; "முறைமை" (methodology) not "மெத்தடாலஜி". However, technical terms without established Tamil equivalents are acceptable in their English form, often transliterated.</p>
  <h2>Standard Academic Structure</h2>
  <p>Tamil academic papers follow IMRaD structure (Introduction-Methods-Results-Discussion): அறிமுகம் (Introduction) — research context, problem statement, objectives. ஆராய்ச்சி முறைமை (Methodology) — data collection, analytical approach. முடிவுகள் (Results) — findings. கலந்துரையாடல் (Discussion) — interpretation, implications. முடிவுரை (Conclusion) — summary, future directions. நூல்விவரம் (Bibliography).</p>
  <h2>Citation Standards</h2>
  <p>Most Tamil academic journals follow their own citation format — check the specific journal's guidelines. In general, citations include author name (Tamil convention puts surname last), year, title in Tamil, journal name, volume, issue, and page numbers. For books: author, year, title, place, publisher. English sources cited within Tamil papers typically retain their English titles in parentheses.</p>
  <h2>Proofreading Tamil Academic Writing</h2>
  <p>Academic Tamil must be grammatically impeccable — errors undermine the credibility of the research. Use ProofTamil's formal mode proofreading to catch all grammar and spelling errors before submission. Have a subject-matter expert review technical terminology. Many Tamil universities require papers to pass through a Tamil language committee review — ensuring your language is correct from the start saves significant revision time.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Writing Style Guide for Websites and Apps",
    slug: "tamil-writing-style-guide-websites-apps",
    language: "english",
    status: "published",
    meta_description: "A practical Tamil writing style guide for website and app content — UX writing, navigation labels, error messages, and content tone in Tamil.",
    keywords: "tamil UX writing, tamil website content, tamil app writing, tamil style guide",
    excerpt: "Writing Tamil for digital products requires specific guidelines for UX writing, navigation, error messages, and consistent tone. This style guide covers it all.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Digital</div>
  <h1>Tamil Writing Style Guide for Websites and Apps</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">Writing Tamil for digital products requires specific guidelines for UX writing, navigation, error messages, and consistent tone.</p>
</header>
<section class="content">
  <p>As more Tamil-language apps and websites emerge, the need for consistent Tamil UX writing guidelines has become urgent. Without a style guide, teams produce inconsistent Tamil — some features in formal register, others in casual, some using loanwords, others with forced Tamil equivalents. This inconsistency damages user experience and brand credibility.</p>
  <h2>Register and Tone</h2>
  <p>For most consumer apps: use a friendly, semi-formal register — not as formal as government communication, not as casual as WhatsApp. Use "நீங்கள்" (you — formal) rather than "நீ" (you — informal) for most user-facing copy. This respects users without feeling bureaucratic. Exceptions: games and highly casual social apps can use "நீ" for warmth.</p>
  <h2>Navigation and Button Labels</h2>
  <p>Keep labels short — Tamil compound words can become very long. "தொடங்குக" (Start) is better than "தொடங்கவும்". "சேமி" (Save) over "சேமிக்கவும்". "மூடு" (Close). "திரும்பு" (Back). "உள்நுழைக" (Log in). "வெளியேறு" (Log out). "பதிவேற்று" (Upload). Avoid mixing English and Tamil in the same label — pick one language per UI element.</p>
  <h2>Error Messages</h2>
  <p>Error messages should be clear, friendly, and action-oriented. Tell users what happened and what to do next. Bad: "பிழை ஏற்பட்டது" (An error occurred). Better: "மின்னஞ்சல் முகவரி தவறானது. சரியான முகவரியை உள்ளிடவும்." (Email address is incorrect. Please enter the correct address.)</p>
  <h2>Consistency Rules</h2>
  <p>Create a term glossary for your product — standardise how key product concepts are named in Tamil and stick to those terms throughout. Inconsistent terminology (sometimes "அமைப்புகள்", sometimes "settings") confuses users. Proofread all Tamil content through ProofTamil before each release — consistent grammar signals quality to Tamil-speaking users who notice and care about language precision.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Numerals and the Tamil Number System",
    slug: "tamil-numerals-number-system",
    language: "english",
    status: "published",
    meta_description: "A complete guide to Tamil numerals, the traditional Tamil number system, and how to write numbers correctly in Tamil text.",
    keywords: "tamil numerals, tamil numbers, tamil number system, write numbers in tamil",
    excerpt: "Tamil has its own numeral system with unique characters. This guide explains when to use Tamil numerals vs Arabic numerals and how to write numbers in Tamil text.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Language</div>
  <h1>Tamil Numerals and the Tamil Number System</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">Tamil has its own numeral system with unique characters. This guide explains when to use Tamil numerals and how to write numbers correctly in Tamil text.</p>
</header>
<section class="content">
  <p>Tamil has its own numeral characters (தமிழ் இலக்கங்கள்) — ௦ ௧ ௨ ௩ ௪ ௫ ௬ ௭ ௮ ௯ (0-9). These are distinct from the Arabic/Hindu numerals (0-9) used globally. Additionally, Tamil has a traditional system for larger numbers that differs from the Western system in important ways.</p>
  <h2>Tamil vs Arabic Numerals</h2>
  <p>In modern Tamil publishing, Arabic numerals (0-9) are used in most contexts — news articles, scientific writing, business documents, and digital content. Traditional Tamil numerals appear in literary contexts, religious texts, traditional calendar systems, and situations where cultural authenticity is important. Mixing numeral types within the same document is generally avoided.</p>
  <h2>Large Number Names in Tamil</h2>
  <p>Tamil's large number vocabulary differs from English in significant ways: நூறு = 100, ஆயிரம் = 1,000, பத்தாயிரம் = 10,000, லட்சம் = 100,000 (one lakh), கோடி = 10,000,000 (one crore). These units (especially lakh and crore) are used in Indian English as well as Tamil, but writers targeting global English audiences should add Western equivalents in parentheses.</p>
  <h2>Fractional and Ordinal Numbers</h2>
  <p>Fractions in Tamil: half = அரை (or 1/2), quarter = கால் (or 1/4), three-quarters = முக்கால். Ordinals: first = முதல், second = இரண்டாவது, third = மூன்றாவது. In formal writing, ordinals above ten are typically written as "10-வது", "11-வது" rather than spelled out fully.</p>
  <h2>Writing Dates and Years in Tamil</h2>
  <p>Tamil uses two calendar systems: the Gregorian calendar (கிரகோரியன் நாட்காட்டி) with Tamil month names (தை, மாசி, பங்குனி...) and the traditional Tamil calendar. For modern documents, use the Gregorian calendar. Date format in Tamil: day-month-year — "15 ஆகஸ்ட் 2025". Years are written as Arabic numerals in most contexts.</p>
</section>
</article>`,
  },
];

async function publishAll() {
  console.log(`\n🚀 Publishing ${POSTS.length} blog posts to ${BASE_URL}\n`);
  let ok = 0, fail = 0;

  for (let i = 0; i < POSTS.length; i++) {
    const p = POSTS[i];
    process.stdout.write(`[${i + 1}/${POSTS.length}] ${p.title.substring(0, 55)}… `);
    try {
      const r = await post('/api/blog/publish', p);
      if (r.status === 200 || r.status === 201) {
        console.log(`✅ ${r.status}`);
        ok++;
      } else {
        console.log(`❌ ${r.status} — ${JSON.stringify(r.body).substring(0, 100)}`);
        fail++;
      }
    } catch (e) {
      console.log(`❌ Network error: ${e.message}`);
      fail++;
    }
    if (i < POSTS.length - 1) await sleep(1500);
  }

  console.log(`\n✅ ${ok} published  ❌ ${fail} failed\n`);
}

publishAll();
