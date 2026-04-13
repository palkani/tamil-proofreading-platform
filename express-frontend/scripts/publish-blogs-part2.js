/**
 * Publish blogs Part 2 (posts 26-50) — Tamil + Bilingual
 * Run: ADMIN_TOKEN=<your-jwt> node scripts/publish-blogs-part2.js
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
  // ── Tamil language posts ──────────────────────────────────────────────────
  {
    title: "தமிழ் இலக்கணம்: அடிப்படை விதிகள் — முழுமையான வழிகாட்டி",
    slug: "tamil-ilakkanam-adippada-vidhigal",
    language: "tamil",
    status: "published",
    meta_description: "தமிழ் இலக்கணத்தின் அடிப்படை விதிகளை எளிமையாக புரிந்துகொள்ளுங்கள். வினைச்சொல், பெயர்ச்சொல், வாக்கிய அமைப்பு மற்றும் புணர்ச்சி விதிகள்.",
    keywords: "தமிழ் இலக்கணம், tamil grammar, தமிழ் விதிகள், இலக்கண வழிகாட்டி",
    excerpt: "தமிழ் இலக்கணம் கற்க விரும்புவோருக்கான எளிமையான வழிகாட்டி. உயிரெழுத்துக்கள், மெய்யெழுத்துக்கள், வினைச்சொற்கள் மற்றும் புணர்ச்சி விதிகளை படிப்படியாக அறியுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் இலக்கணம்</div>
  <h1>தமிழ் இலக்கணம்: அடிப்படை விதிகள் — முழுமையான வழிகாட்டி</h1>
  <div class="subhead">8 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">தமிழ் இலக்கணம் கற்க விரும்புவோருக்கான எளிமையான வழிகாட்டி.</p>
</header>
<section class="content">
  <p>தமிழ் மொழி உலகின் தொன்மையான மொழிகளில் ஒன்று. இதன் இலக்கண அமைப்பு மிகவும் முறைப்படுத்தப்பட்டது. தொல்காப்பியம் முதல் இன்றுவரை தமிழ் இலக்கணம் தொடர்ந்து பரிணாமிக்கிறது.</p>
  <h2>எழுத்துகளின் பகுப்பு</h2>
  <p>தமிழ் எழுத்துகள் மூன்று வகைப்படும்: உயிரெழுத்துக்கள் (12), மெய்யெழுத்துக்கள் (18), உயிர்மெய்யெழுத்துக்கள் (216). இவற்றுடன் ஆய்த எழுத்தும் (ஃ) சேர்ந்து தமிழ் எழுத்து வரிசை முழுமை பெறுகிறது.</p>
  <h2>சொற்களின் வகைகள்</h2>
  <p>தமிழ் சொற்கள் பெயர்ச்சொல், வினைச்சொல், இடைச்சொல், உரிச்சொல் என்று நான்கு வகைப்படும். பெயர்ச்சொல் ஒரு பொருளை குறிக்கும். வினைச்சொல் ஒரு செயலை குறிக்கும். இடைச்சொல் இரண்டு சொற்களை இணைக்கும். உரிச்சொல் பெயர் அல்லது வினையை அடையாளப்படுத்தும்.</p>
  <h2>வாக்கிய அமைப்பு</h2>
  <p>தமிழ் வாக்கியம் பொதுவாக "எழுவாய் — செயப்படுபொருள் — பயனிலை" என்ற வரிசையில் அமையும். "ராம் பழம் சாப்பிட்டான்" என்பதில் ராம் எழுவாய், பழம் செயப்படுபொருள், சாப்பிட்டான் பயனிலை. இந்த SOV (Subject-Object-Verb) வரிசை தமிழின் சிறப்பியல்பு.</p>
  <h2>புணர்ச்சி விதிகள்</h2>
  <p>இரு சொற்கள் சேரும்போது ஏற்படும் ஒலி மாற்றங்களே புணர்ச்சி. "மழை + நீர் = மழைநீர்", "பால் + அடை = பாலடை" என்பது போல் சொற்கள் இணைவது இலக்கண முறை. ProofTamil மூலம் இந்த புணர்ச்சி பிழைகளை தானாகவே கண்டுபிடிக்கலாம்.</p>
  <p>தமிழ் இலக்கணம் கற்கும்போது ProofTamil-ஐ பயன்படுத்துவது மிகவும் உதவியாக இருக்கும். நீங்கள் எழுதும்போது பிழைகளை உடனே சுட்டிக்காட்டும்.</p>
</section>
</article>`,
  },
  {
    title: "தமிழில் சரியாக எழுதுவது எப்படி? 10 முக்கிய குறிப்புகள்",
    slug: "tamilil-sariyaga-ezhuthuvadhu-eppadi",
    language: "tamil",
    status: "published",
    meta_description: "தமிழில் சரியாக எழுதுவதற்கான 10 முக்கியமான குறிப்புகள். எழுத்துப்பிழைகளை தவிர்க்க, இலக்கணம் சரியாக வைத்திருக்க பயனுள்ள வழிகாட்டி.",
    keywords: "தமிழ் எழுத்து, சரியான தமிழ், தமிழ் குறிப்புகள், தமிழ் பிழை திருத்தம்",
    excerpt: "தமிழில் சரியாக எழுத விரும்புகிறீர்களா? இந்த 10 குறிப்புகளை பின்பற்றினால் உங்கள் தமிழ் எழுத்து மேன்மேலும் சிறப்பாகும்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் எழுத்து</div>
  <h1>தமிழில் சரியாக எழுதுவது எப்படி? 10 முக்கிய குறிப்புகள்</h1>
  <div class="subhead">7 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">தமிழில் சரியாக எழுத விரும்புகிறீர்களா? இந்த 10 குறிப்புகளை பின்பற்றுங்கள்.</p>
</header>
<section class="content">
  <p>தமிழ் எழுதும்போது பலர் அடிக்கடி சில பொதுவான பிழைகளை செய்கிறார்கள். இந்த குறிப்புகளை கவனமாக படித்து பின்பற்றினால் உங்கள் தமிழ் எழுத்து கணிசமாக மேம்படும்.</p>
  <h2>1. நெடில் — குறில் வேறுபாட்டை கவனியுங்கள்</h2>
  <p>நெடில் (ஆ, ஈ, ஊ...) மற்றும் குறில் (அ, இ, உ...) தவறாக பயன்படுத்தினால் வேறு பொருள் கிடைக்கும். "மாலை" என்பது "evening" ஆனால் "மலை" என்பது "mountain". இந்த வேறுபாட்டை எப்போதும் கவனியுங்கள்.</p>
  <h2>2. ஒற்றெழுத்தை சரியாக வையுங்கள்</h2>
  <p>மெய்யெழுத்துகளுக்கு புள்ளி சரியாக வேண்டும். "கட்டு" என்பதில் "ட்" என்ற ஒற்று இல்லாமல் "கடு" என்றால் வேறு பொருள். ஒற்றெழுத்தை தவிர்க்காதீர்கள்.</p>
  <h2>3. வினைமுற்றை சரியாக பயன்படுத்துங்கள்</h2>
  <p>ஒவ்வொரு வாக்கியமும் சரியான வினைமுற்றுடன் முடிய வேண்டும். "அவர் சென்றார்" என்பது சரி; "அவர் சென்று" என்பது வாக்கியம் முடிக்காத வினையெச்சம்.</p>
  <h2>4. பேச்சு வழக்கு — எழுத்து வழக்கு வேறுபாடு</h2>
  <p>உரையாடல் தமிழில் "வேணும்", "போகுது" என்று சொல்லலாம். ஆனால் எழுதும்போது "வேண்டும்", "போகிறது" என்று எழுத வேண்டும். எழுத்து வழக்கில் பேச்சு வழக்கை கலைக்காதீர்கள்.</p>
  <h2>5. ProofTamil-ஐ பயன்படுத்துங்கள்</h2>
  <p>நீங்கள் எழுதியதை ProofTamil-இல் சோதித்துப் பாருங்கள். AI தொழில்நுட்பம் உங்கள் எழுத்துப்பிழைகளையும் இலக்கணப்பிழைகளையும் உடனடியாக கண்டுபிடித்து திருத்துகிறது. இது இலவசமாக கிடைக்கிறது.</p>
  <h2>6. அதிகமாக வாசியுங்கள்</h2>
  <p>நல்ல தமிழ் நூல்களை, செய்திகளை, கட்டுரைகளை அதிகமாக வாசிப்பது உங்கள் மொழி உணர்வை வளர்க்கும். சரியான தமிழ் எழுத்தை அதிகமாக பார்க்கப் பார்க்க, சரியான வழக்கு மனதில் பதியும்.</p>
  <h2>7. ஒரு சொல்லை ஒரே மாதிரி எழுதுங்கள்</h2>
  <p>ஒரே கட்டுரையில் ஒரு சொல்லை வெவ்வேறு வழிகளில் எழுதாதீர்கள். "கம்ப்யூட்டர்" என்று ஒரு இடத்தில் எழுதி "கம்பியூட்டர்" என்று வேறு இடத்தில் எழுதுவது தரம் குறைகிறது.</p>
  <h2>8. நிறுத்தக்குறிகளை சரியாக பயன்படுத்துங்கள்</h2>
  <p>முற்றுப்புள்ளி, கேள்விக்குறி, ஆச்சரியக்குறி — இவற்றை சரியான இடத்தில் வையுங்கள். நிறுத்தக்குறிகள் இல்லாமல் எழுதுவது வாசிப்பை கடினமாக்கும்.</p>
  <h2>9. சந்தி பிழைகளை தவிருங்கள்</h2>
  <p>இரண்டு சொற்கள் சேரும்போது சந்தி விதிப்படி மாறும். "பால் + அடை = பாலடை" என்று சரியாக இணைக்க வேண்டும். ProofTamil இந்த சந்தி பிழைகளையும் சரி செய்யும்.</p>
  <h2>10. திரும்பவும் திரும்பவும் திருத்திப் பாருங்கள்</h2>
  <p>எழுதியதை உடனே அனுப்பாதீர்கள். கொஞ்சம் விட்டு மீண்டும் படியுங்கள். புதிய கண்ணோட்டத்தில் பிழைகள் தெளிவாக தெரியும்.</p>
</section>
</article>`,
  },
  {
    title: "தமிழ் எழுத்துப்பிழைகள்: பொதுவான தவறுகளும் திருத்தங்களும்",
    slug: "tamil-ezhutthu-pizhaikal-podhuvana-thavaru",
    language: "tamil",
    status: "published",
    meta_description: "தமிழ் எழுதும்போது பொதுவாக செய்யப்படும் எழுத்துப்பிழைகள் மற்றும் அவற்றை திருத்தும் வழிகள். AI உதவியுடன் பிழையற்ற தமிழ் எழுதுங்கள்.",
    keywords: "தமிழ் எழுத்துப்பிழை, tamil spelling errors, தமிழ் பிழை, spell check tamil",
    excerpt: "தமிழ் எழுதும்போது அடிக்கடி செய்யப்படும் பொதுவான எழுத்துப்பிழைகளை அறிந்து திருத்திக்கொள்ளுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் பிழை திருத்தம்</div>
  <h1>தமிழ் எழுத்துப்பிழைகள்: பொதுவான தவறுகளும் திருத்தங்களும்</h1>
  <div class="subhead">6 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">பொதுவான தமிழ் எழுத்துப்பிழைகளை அறிந்து, சரியான எழுத்தை கற்றுக்கொள்ளுங்கள்.</p>
</header>
<section class="content">
  <p>தமிழ் எழுதும்போது சிறிய கவனக்குறைவு கூட வேறு பொருளைத் தந்துவிடும். சில பிழைகள் அர்த்தத்தை மாற்றும்; வேறு சில பிழைகள் எழுத்தை கொச்சைப்படுத்தும். இந்த பொதுவான பிழைகளை தவிர்ப்பது சுலபமே.</p>
  <h2>குறில் நெடில் பிழைகள்</h2>
  <p>மிகவும் பொதுவான பிழை இதுவே: "மாலை" (evening) என்பதை "மலை" (mountain) என்று எழுதுவது. "காரம்" (spiciness) என்பதை "கரம்" (hand) என்று எழுதுவது. நெடில் எழுத்துகளுக்கு (ஆ, ஈ, ஊ, ஏ, ஐ, ஓ, ஔ) கவனம் செலுத்துங்கள்.</p>
  <h2>ஒற்று பிழைகள்</h2>
  <p>"கட்டு" என்பதை "கடு" என்று எழுதுவது தவறு. "அப்பா" என்பதை "அபா" என்று எழுதுவது தவறு. ஒற்றெழுத்து இல்லாமல் எழுதுவது சொல்லின் அர்த்தத்தை மாற்றும் அல்லது சொல்லை அர்த்தமற்றதாக்கும்.</p>
  <h2>ஆய்த எழுத்து பிழைகள்</h2>
  <p>ஃ என்ற ஆய்த எழுத்தை பலர் தவிர்க்கிறார்கள். "அஃது" என்பதை "அது" என்று எழுதுவது சரியில்லை — இரண்டும் வெவ்வேறு சொற்கள். ஆய்த எழுத்தை முறையாக பயன்படுத்துங்கள்.</p>
  <h2>கிரந்த எழுத்து பிழைகள்</h2>
  <p>ஜ, ஷ, ஸ, ஹ போன்ற கிரந்த எழுத்துகளை தவறாக பயன்படுத்துவதும் பொதுவான பிழை. "ஹோட்டல்" என்பதை "ஓட்டல்" என்று எழுதுவது சில சூழல்களில் ஏற்புடையது; ஆனால் சரியான கிரந்த எழுத்தை தெரிந்துகொள்வது நல்லது.</p>
  <h2>ProofTamil-ஐ பயன்படுத்துங்கள்</h2>
  <p>இந்த எல்லா வகை பிழைகளையும் ProofTamil தானாகவே கண்டுபிடிக்கும். நீங்கள் எழுதியதை ProofTamil-இல் சோதித்துப் பார்த்து, AI திருத்தும் குறிப்புகளை படியுங்கள். ஒவ்வொரு திருத்தமும் ஒரு பாடம் — நாளடைவில் தானாகவே சரியாக எழுத ஆரம்பிப்பீர்கள்.</p>
</section>
</article>`,
  },
  {
    title: "செம்மொழி தமிழ்: வரலாறும் சிறப்பும்",
    slug: "semmozhi-tamil-varalaru-sirappu",
    language: "tamil",
    status: "published",
    meta_description: "செம்மொழி தமிழின் வரலாறு, சங்க இலக்கியம், தொல்காப்பியம் மற்றும் தமிழ் மொழியின் தனித்தன்மை பற்றிய விரிவான கட்டுரை.",
    keywords: "செம்மொழி தமிழ், classical tamil, சங்க இலக்கியம், தொல்காப்பியம், தமிழ் வரலாறு",
    excerpt: "தமிழ் உலகின் மிகத் தொன்மையான செம்மொழிகளில் ஒன்று. இதன் வரலாறும் இலக்கியச் செல்வமும் அளவிட முடியாதவை.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் வரலாறு</div>
  <h1>செம்மொழி தமிழ்: வரலாறும் சிறப்பும்</h1>
  <div class="subhead">9 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">தமிழ் உலகின் மிகத் தொன்மையான செம்மொழிகளில் ஒன்று. இதன் வரலாறும் இலக்கியச் செல்வமும் அளவிட முடியாதவை.</p>
</header>
<section class="content">
  <p>2004-ஆம் ஆண்டு இந்திய அரசு தமிழை "செம்மொழி" என்று அறிவித்தது. ஆனால் தமிழின் செம்மொழித்தன்மை இந்த அறிவிப்புக்கு முன்பே இரண்டாயிரம் ஆண்டுகளாக நிரூபிக்கப்பட்டுள்ளது.</p>
  <h2>தொல்காப்பியம் — தமிழ் இலக்கணத்தின் தாய்</h2>
  <p>தொல்காப்பியம் உலகின் மிகத் தொன்மையான இலக்கண நூல்களில் ஒன்று. கி.மு. 300 வரை பழமையானதாக இதை அறிஞர்கள் கூறுகின்றனர். எழுத்தியல், சொல்லியல், பொருளியல் என்று மூன்று பகுதிகளில் தமிழ் மொழியின் அனைத்து அம்சங்களையும் விரிவாக விளக்குகிறது.</p>
  <h2>சங்க இலக்கியம்</h2>
  <p>கி.மு. 300 முதல் கி.பி. 300 வரையிலான காலத்தில் எழுந்த சங்க இலக்கியம் 2,300-க்கும் மேற்பட்ட கவிதைகளை உள்ளடக்கியது. அகநானூறு, புறநானூறு, நற்றிணை, குறுந்தொகை போன்ற தொகை நூல்கள் உலக இலக்கிய வரைபடத்தில் தனி இடம் பெற்றவை. காதலும் வீரமும் இயற்கையும் போரும் — எல்லாவற்றையும் அழகிய கவிதை வடிவில் பதிவு செய்த ஒரு மக்கள் வாழ்க்கை ஆவணம்.</p>
  <h2>திருக்குறள் — தமிழின் வேதம்</h2>
  <p>திருவள்ளுவர் இயற்றிய திருக்குறள் 1,330 குறள்களில் அறம், பொருள், இன்பம் என்று மூன்று பகுதிகளாக மனித வாழ்வின் அனைத்து அம்சங்களையும் தொட்டுச் செல்கிறது. 40-க்கும் மேற்பட்ட மொழிகளில் மொழிபெயர்க்கப்பட்ட இந்நூல் இன்னும் உலகளவில் மதிக்கப்படுகிறது.</p>
  <h2>இன்றும் வாழும் தமிழ்</h2>
  <p>செம்மொழி தமிழ் வெறும் அகராதியில் இல்லை — இன்றும் 8 கோடிக்கும் மேற்பட்ட மக்கள் தங்கள் அன்றாட வாழ்வில் பயன்படுத்தும் உயிரோட்டமான மொழி இது. ProofTamil போன்ற AI கருவிகள் இந்தத் தொன்மையான மொழியை டிஜிட்டல் யுகத்திலும் தொடர்ந்து செழிக்க வைக்கின்றன.</p>
</section>
</article>`,
  },
  {
    title: "தமிழ் வலைப்பதிவு எழுதுவது எப்படி? படிப்படியான வழிகாட்டி",
    slug: "tamil-blog-ezhuthuvadhu-eppadi",
    language: "tamil",
    status: "published",
    meta_description: "தமிழ் வலைப்பதிவு தொடங்குவது, எழுதுவது, SEO செய்வது பற்றிய முழுமையான வழிகாட்டி. தமிழ் blogger-களுக்கான நடைமுறை குறிப்புகள்.",
    keywords: "தமிழ் blog, தமிழ் வலைப்பதிவு, tamil blogging, blog எழுதுவது",
    excerpt: "தமிழ் வலைப்பதிவு தொடங்கி வெற்றிகரமாக நடத்துவதற்கான படிப்படியான வழிகாட்டி. தலைப்பு தேர்வு முதல் SEO வரை அனைத்தையும் அறியுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் Blogging</div>
  <h1>தமிழ் வலைப்பதிவு எழுதுவது எப்படி? படிப்படியான வழிகாட்டி</h1>
  <div class="subhead">8 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">தமிழ் வலைப்பதிவு தொடங்கி வெற்றிகரமாக நடத்துவதற்கான படிப்படியான வழிகாட்டி.</p>
</header>
<section class="content">
  <p>இன்று தமிழ் இணையத்தில் நல்ல தமிழ் வலைப்பதிவுகளுக்கு மிகுந்த தேவை இருக்கிறது. நீங்கள் கருத்துக்களை பகிர விரும்புகிறீர்களா? வருமானம் ஈட்ட விரும்புகிறீர்களா? இந்த வழிகாட்டி உங்களுக்கானது.</p>
  <h2>தலைப்பு தேர்வு</h2>
  <p>உங்களுக்கு நன்கு தெரிந்த, ஆர்வமான ஒரு தலைப்பை தேர்வு செய்யுங்கள். சமையல், தொழில்நுட்பம், இலக்கியம், சுற்றுலா, சுகாதாரம் — எந்த தலைப்பும் நல்ல வாசகர்களை ஈர்க்கலாம். ஒரு குறிப்பிட்ட நிசை (niche) தேர்வு செய்வது சிறப்பு.</p>
  <h2>எழுதும் முறை</h2>
  <p>வலைப்பதிவு கட்டுரை எழுதும்போது: தலைப்பு (50-60 எழுத்துகள்) → அறிமுகம் (2-3 வரிகள்) → முக்கிய உள்ளடக்கம் (H2 தலைப்புகளுடன்) → முடிவு. வாசகர் கேள்வி கேட்கிறார் என்று எண்ணி அந்த கேள்விக்கு பதில் சொல்வது போல் எழுதுங்கள்.</p>
  <h2>தமிழ் SEO</h2>
  <p>Google-ல் தமிழ் தேடல்கள் நாளுக்கு நாள் அதிகரிக்கின்றன. உங்கள் கட்டுரை தலைப்பில் தேடல் சொற்களை சேர்யுங்கள். "தமிழ் சமையல்" என்று தேடுபவர்களுக்கு "தமிழ் சமையல் குறிப்புகள்" என்ற தலைப்பு நல்லது.</p>
  <h2>ProofTamil-ஐ உபயோகியுங்கள்</h2>
  <p>வலைப்பதிவு பதிப்பிக்கும் முன் ProofTamil-இல் சோதித்துப் பாருங்கள். இலக்கணப் பிழைகள் வாசகர்கள் மனதில் உங்கள் நம்பகத்தன்மையை குறைக்கும். AI திருத்தம் 2 நிமிடத்தில் உங்கள் கட்டுரையை பிழையற்றதாக மாற்றும்.</p>
  <h2>தொடர்ந்து எழுதுங்கள்</h2>
  <p>வாரத்திற்கு ஒரு கட்டுரையாவது எழுதுங்கள். தொடர்ச்சி (consistency) வலைப்பதிவு வளர்ச்சிக்கு மிக முக்கியம். ஆரம்பத்தில் வாசகர் கம்மியாக இருந்தாலும் கலங்காதீர்கள் — நல்ல தமிழ் உள்ளடக்கத்திற்கு எப்போதும் வரவேற்பு இருக்கும்.</p>
</section>
</article>`,
  },
  {
    title: "AI கருவிகள் தமிழ் எழுத்தை எவ்வாறு மேம்படுத்துகின்றன",
    slug: "ai-tools-tamil-writing-improve",
    language: "tamil",
    status: "published",
    meta_description: "செயற்கை நுண்ணறிவு (AI) கருவிகள் தமிழ் எழுத்தை எவ்வாறு எளிமையாக்குகின்றன? ProofTamil, OCR, AI உள்ளடக்கம் பற்றிய விரிவான விளக்கம்.",
    keywords: "AI தமிழ், தமிழ் AI கருவிகள், செயற்கை நுண்ணறிவு தமிழ், ProofTamil",
    excerpt: "AI தொழில்நுட்பம் தமிழ் எழுத்தாளர்களுக்கு எப்படி உதவுகிறது? இலக்கண சோதனையிலிருந்து கையெழுத்து அங்கீகாரம் வரை — AI-யின் பங்களிப்பை அறியுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் தொழில்நுட்பம்</div>
  <h1>AI கருவிகள் தமிழ் எழுத்தை எவ்வாறு மேம்படுத்துகின்றன</h1>
  <div class="subhead">7 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">AI தொழில்நுட்பம் தமிழ் எழுத்தாளர்களுக்கு எப்படி உதவுகிறது என்பதை விரிவாக அறியுங்கள்.</p>
</header>
<section class="content">
  <p>சில ஆண்டுகளுக்கு முன்பு வரை தமிழுக்கான AI கருவிகள் மிகவும் குறைவாகவும் துல்லியமற்றதாகவும் இருந்தன. இன்று நிலை முற்றிலும் மாறியிருக்கிறது. நவீன AI தமிழ் மொழியை ஆழமாக புரிந்துகொண்டு எழுத்தாளர்களுக்கு உண்மையான உதவி செய்கிறது.</p>
  <h2>இலக்கண சோதனை</h2>
  <p>ProofTamil போன்ற கருவிகள் AI மூலம் உங்கள் தமிழ் உரையில் உள்ள இலக்கணப்பிழைகள், எழுத்துப்பிழைகள், சந்தி பிழைகள் ஆகியவற்றை உடனடியாக கண்டுபிடிக்கின்றன. மனித திருத்தாளர் செய்யும் வேலையை நொடியில் செய்கிறது.</p>
  <h2>கையெழுத்து அங்கீகாரம்</h2>
  <p>ProofTamil-இன் Handwriting OCR கருவி கையெழுத்து தமிழ் குறிப்புகளை புகைப்படம் எடுத்து டிஜிட்டல் உரையாக மாற்றுகிறது. மாணவர்களுக்கு, ஆசிரியர்களுக்கு, ஆராய்ச்சியாளர்களுக்கு இது மிகவும் பயனுள்ளது.</p>
  <h2>உள்ளடக்கம் உருவாக்கல்</h2>
  <p>AI Content Writer கருவி ஒரு சிறிய தலைப்பிலிருந்து முழு தமிழ் வலைப்பதிவு கட்டுரையை உருவாக்க உதவுகிறது. இது எழுதும் நேரத்தை மிகவும் குறைக்கிறது. ஆனால் AI உருவாக்கும் உள்ளடக்கத்தை நீங்கள் மதிப்பாய்வு செய்து திருத்துவது அவசியம்.</p>
  <h2>மொழிபெயர்ப்பு</h2>
  <p>ஆங்கிலத்திலிருந்து தமிழுக்கும், தமிழிலிருந்து ஆங்கிலத்திற்கும் AI மொழிபெயர்ப்பு இன்று மிகவும் மேம்பட்டுள்ளது. இது வணிக ஆவணங்களை, வலைத்தளங்களை தமிழாக்கம் செய்ய உதவுகிறது.</p>
  <h2>எதிர்காலம்</h2>
  <p>AI தமிழ் தொழில்நுட்பம் வேகமாக வளர்கிறது. வரும் ஆண்டுகளில் குரல் தமிழ் பரிமாற்றம், நேரடி மொழிபெயர்ப்பு, AI தமிழ் ஆசிரியர் — இவை எல்லாம் சாதாரண பயனர்களுக்கும் கிடைக்கும். தமிழ் எழுத்தாளர்களுக்கு இது ஒரு பொற்காலம்.</p>
</section>
</article>`,
  },
  {
    title: "தமிழ் வினைச்சொற்கள்: காலங்களும் வடிவங்களும்",
    slug: "tamil-vinaisol-kaalankal-vadivangal",
    language: "tamil",
    status: "published",
    meta_description: "தமிழ் வினைச்சொற்களின் காலங்கள் — இறந்தகாலம், நிகழ்காலம், எதிர்காலம் மற்றும் வினை வடிவங்கள் பற்றிய எளிமையான விளக்கம்.",
    keywords: "தமிழ் வினை, tamil verb, தமிழ் காலம், தமிழ் வினைச்சொல்",
    excerpt: "தமிழ் வினைச்சொற்களின் காலங்கள் மற்றும் வடிவங்களை எளிதாக புரிந்துகொள்ளுங்கள். இறந்தகாலம், நிகழ்காலம், எதிர்காலம் — எல்லாவற்றையும் அறியுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் இலக்கணம்</div>
  <h1>தமிழ் வினைச்சொற்கள்: காலங்களும் வடிவங்களும்</h1>
  <div class="subhead">8 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">தமிழ் வினைச்சொற்களின் காலங்கள் மற்றும் வடிவங்களை எளிதாக புரிந்துகொள்ளுங்கள்.</p>
</header>
<section class="content">
  <p>தமிழ் வினைச்சொல் அமைப்பு மிகவும் முறைப்படுத்தப்பட்டது. வினை வேர், காலம் காட்டும் விகுதி, வினை முற்று விகுதி — இந்த மூன்று பகுதிகள் சேர்ந்து ஒரு பூரண வினைச்சொல்லை உருவாக்குகின்றன.</p>
  <h2>நிகழ்காலம்</h2>
  <p>நிகழ்காலம் காட்ட "-கிற-" விகுதி பயன்படுகிறது. "செய்கிறேன்" (நான் செய்கிறேன்), "செய்கிறாய்" (நீ செய்கிறாய்), "செய்கிறான்" (அவன் செய்கிறான்), "செய்கிறாள்" (அவள் செய்கிறாள்), "செய்கிறார்கள்" (அவர்கள் செய்கிறார்கள்), "செய்கிறது" (அது செய்கிறது).</p>
  <h2>இறந்தகாலம்</h2>
  <p>இறந்தகாலம் காட்ட "-த்த-", "-ந்த-", "-ட்ட-" போன்ற விகுதிகள் பயன்படுகின்றன. வினையின் வகையை பொருத்து விகுதி மாறும். "செய்தேன்" (நான் செய்தேன்), "சென்றேன்" (நான் சென்றேன்), "ஓடினேன்" (நான் ஓடினேன்) — மூன்றும் வேறு வேறு வினை வகுப்புகள்.</p>
  <h2>எதிர்காலம்</h2>
  <p>எதிர்காலம் காட்ட "-வ-" விகுதி பயன்படுகிறது. "செய்வேன்" (நான் செய்வேன்), "செய்வாய்" (நீ செய்வாய்), "செய்வான்" (அவன் செய்வான்). எதிர்காலம் சில நேரங்களில் வழக்கமாக செய்யப்படும் செயலையும் குறிக்கும்.</p>
  <h2>எதிர்மறை வினை</h2>
  <p>எதிர்மறை: "செய்யவில்லை" (செய்யல்லை — இறந்தகாலம்), "செய்யமாட்டேன்" (எதிர்காலம் / வழக்கமாக செய்யாதது). இந்த இரண்டையும் மாற்றி மாற்றி பயன்படுத்தாதீர்கள் — பொருள் வேறுபடும்.</p>
</section>
</article>`,
  },
  {
    title: "திருக்குறளிலிருந்து கற்கும் எழுத்து நடை பாடங்கள்",
    slug: "thirukkural-writing-style-lessons",
    language: "tamil",
    status: "published",
    meta_description: "திருக்குறளின் எழுத்து நடையிலிருந்து நவீன எழுத்தாளர்கள் கற்கக்கூடிய மொழி பாடங்கள் — சொல் சிக்கனம், தெளிவு, ஆழம்.",
    keywords: "திருக்குறள், thirukkural writing, தமிழ் எழுத்து நடை, வள்ளுவர் மொழி",
    excerpt: "திருவள்ளுவரின் குறள் நடை இன்றும் சிறந்த எழுத்தாளர்களுக்கு பாடம் சொல்கிறது. சொல் சிக்கனம், தெளிவான கருத்து, அழுத்தமான முடிவு — இவை எல்லாம் குறளில் காணலாம்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் இலக்கியம்</div>
  <h1>திருக்குறளிலிருந்து கற்கும் எழுத்து நடை பாடங்கள்</h1>
  <div class="subhead">7 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">திருவள்ளுவரின் குறள் நடை நவீன எழுத்தாளர்களுக்கு இன்றும் பாடம் சொல்கிறது.</p>
</header>
<section class="content">
  <p>திருக்குறள் 1,330 குறள்களில் மனித வாழ்வின் முழு அனுபவத்தையும் பதிவு செய்கிறது. ஒவ்வொரு குறளும் வெறும் 7 சொற்களில் அல்லது அதற்கும் குறைவான சொற்களில் ஆழமான கருத்தை சொல்கிறது. இந்த சொல் சிக்கனம் எழுத்தாளர்களுக்கு மிகப்பெரிய பாடம்.</p>
  <h2>சொல் சிக்கனம் (Economy of Words)</h2>
  <p>"அகர முதல எழுத்தெல்லாம் ஆதி பகவன் முதற்றே உலகு" — இந்த ஒரு குறளில் உலகின் ஆரம்பம் பற்றிய ஆழமான கருத்து அமைகிறது. அதிக சொற்கள் இல்லை; ஆனால் பொருள் முழுமையாக உள்ளது. நீங்கள் எழுதும்போது "இந்த வார்த்தை தேவையா?" என்று கேளுங்கள்.</p>
  <h2>தெளிவான கருத்து (Clarity)</h2>
  <p>குறளில் ஒவ்வொரு சொல்லும் ஒரு குறிப்பிட்ட பொருளுடன் வருகிறது. தெளிவற்ற, சுற்றி வளைத்த எழுத்து இல்லை. நீங்களும் எழுதும்போது நேரடியாக கருத்தை சொல்லுங்கள். வாசகர் யோசிக்க வேண்டியதில்லை — புரிந்துகொள்ளட்டும்.</p>
  <h2>அழுத்தமான முடிவு (Strong Ending)</h2>
  <p>ஒவ்வொரு குறளும் இரண்டாம் வரியில் அழுத்தமாக முடிகிறது. முதல் வரி ஒரு கருத்தை அறிமுகப்படுத்துகிறது; இரண்டாம் வரி அதை உறுதிப்படுத்துகிறது அல்லது திருப்பம் தருகிறது. கட்டுரைகளிலும் இந்த அமைப்பு — அறிமுகம், உள்ளடக்கம், வலுவான முடிவு — மிகவும் பயனுள்ளது.</p>
  <h2>உவமை பயன்பாடு</h2>
  <p>குறளில் உவமைகள் மிகவும் திட்டமிட்டு பயன்படுத்தப்படுகின்றன. வீணான உவமை இல்லை; ஒவ்வொரு உவமையும் கருத்தை ஒளிரச் செய்கிறது. நீங்கள் எழுதும்போது உவமை பயன்படுத்தினால் அது கருத்தை தெளிவுபடுத்த வேண்டும் — குழப்ப வேண்டியதில்லை.</p>
</section>
</article>`,
  },
  {
    title: "நவீன தமிழ் மொழி: மாற்றங்களும் சவால்களும்",
    slug: "navina-tamil-mozhi-matrangalum-savalkalum",
    language: "tamil",
    status: "published",
    meta_description: "நவீன காலத்தில் தமிழ் மொழி எவ்வாறு மாறுகிறது? டிஜிட்டல் தமிழ், ஆங்கில கலப்பு, இளைஞர் தமிழ் மற்றும் மொழி பாதுகாப்பு பற்றிய ஆராய்ச்சி.",
    keywords: "நவீன தமிழ், modern tamil, தமிழ் மாற்றம், digital tamil, தமிழ் சவால்",
    excerpt: "டிஜிட்டல் யுகத்தில் தமிழ் மொழி வேகமாக மாறுகிறது. இந்த மாற்றங்கள் என்ன? அவை மொழிக்கு நல்லதா கெட்டதா? விரிவாக அறியுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் மொழி</div>
  <h1>நவீன தமிழ் மொழி: மாற்றங்களும் சவால்களும்</h1>
  <div class="subhead">8 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">டிஜிட்டல் யுகத்தில் தமிழ் மொழி வேகமாக மாறுகிறது. இந்த மாற்றங்கள் என்ன என்பதை அறியுங்கள்.</p>
</header>
<section class="content">
  <p>எந்த மொழியும் மாறாமல் இருப்பதில்லை. தமிழும் மாறுகிறது — ஆங்கில சொற்கள் கலக்கின்றன, புதிய வார்த்தைகள் உருவாகின்றன, இளைஞர்கள் புதிய நடையில் எழுதுகிறார்கள். இந்த மாற்றங்களை புரிந்துகொள்வது இன்றைய தமிழ் எழுத்தாளர்களுக்கு அவசியம்.</p>
  <h2>ஆங்கிலக் கலப்பு (Code-Mixing)</h2>
  <p>இன்று பலர் "Meeting-க்கு போகிறேன்", "Mobile charge பண்ணு" என்று எழுதுகிறார்கள். இது இயல்பான மொழி வளர்ச்சி. ஆனால் அதிகாரப்பூர்வ எழுத்தில் — கட்டுரை, ஆவணம், அறிக்கை — தூய தமிழ் அல்லது முறையான வடிவம் வேண்டும்.</p>
  <h2>Tanglish பிரச்சினை</h2>
  <p>தமிழை ஆங்கில எழுத்துகளில் (romanized) எழுதுவது — "vanakkam", "eppadi irukeenga" — டிஜிட்டல் தமிழ் எழுத்தறிவுக்கு ஆபத்தானது. தமிழ் நெடுங்கணக்கில் எழுதும் பழக்கம் இளைஞர்களிடம் குறைகிறது. இது நீண்டகாலத்தில் மொழி வீழ்ச்சிக்கு வழிவகுக்கலாம்.</p>
  <h2>இளைஞர் தமிழ்</h2>
  <p>சமூக ஊடகங்களில் இளைஞர்கள் புதிய வார்த்தைகளையும் வெளிப்பாடுகளையும் உருவாக்குகிறார்கள். "ரொம்ப வலிக்குது மக்கா", "அது வேற level" போன்றவை இன்றைய பேச்சு வழக்கு. இவை பேச்சிலும் சமூக ஊடகங்களிலும் ஏற்புடையவை; ஆனால் எழுத்து வழக்கிற்கு பொருந்தாது.</p>
  <h2>தமிழ் மொழி பாதுகாப்பு</h2>
  <p>மொழியை பாதுகாக்க சட்டங்கள் மட்டும் போதாது — மக்கள் தமிழில் எழுத வேண்டும், படிக்க வேண்டும், பேச வேண்டும். ProofTamil போன்ற கருவிகள் தமிழ் எழுதுவதை எளிதாக்கி மக்களை தமிழில் எழுத ஊக்குவிக்கின்றன. இதுவும் மொழி பாதுகாப்பின் ஒரு முக்கியமான வழி.</p>
</section>
</article>`,
  },
  {
    title: "தமிழ் SEO: Google-ல் தமிழ் உள்ளடக்கம் எப்படி இடம்பெறும்",
    slug: "tamil-seo-google-ulladakkam",
    language: "tamil",
    status: "published",
    meta_description: "Google-ல் தமிழ் வலைப்பதிவு உயர் இடம் பெற வேண்டுமா? தமிழ் SEO குறிப்புகள், keyword research, on-page optimization பற்றிய முழுமையான வழிகாட்டி.",
    keywords: "தமிழ் SEO, Google தமிழ், தமிழ் keyword, தமிழ் வலைத்தளம் SEO",
    excerpt: "உங்கள் தமிழ் வலைப்பதிவை Google-ல் முதல் பக்கத்தில் காண விரும்புகிறீர்களா? இந்த SEO குறிப்புகளை பின்பற்றுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் SEO</div>
  <h1>தமிழ் SEO: Google-ல் தமிழ் உள்ளடக்கம் எப்படி இடம்பெறும்</h1>
  <div class="subhead">7 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">உங்கள் தமிழ் வலைப்பதிவை Google-ல் முதல் பக்கத்தில் காண விரும்புகிறீர்களா? இந்த SEO குறிப்புகளை பின்பற்றுங்கள்.</p>
</header>
<section class="content">
  <p>தமிழில் தேடல் (Search) மிகவும் அதிகரித்துள்ளது. Google-ல் தினமும் கோடிக்கணக்கான தமிழ் தேடல்கள் நடக்கின்றன. நீங்கள் சரியான SEO செய்தால் உங்கள் வலைப்பதிவு இந்த தேடல்களில் தோன்றும்.</p>
  <h2>Keyword Research</h2>
  <p>மக்கள் என்ன தேடுகிறார்கள் என்று முதலில் கண்டுபிடியுங்கள். Google Search Bar-ல் தமிழில் தட்டச்சு செய்யும்போது வரும் Autocomplete பரிந்துரைகள் மிகவும் பயனுள்ளவை. "தமிழ் சமையல்" என்று தட்டி Google என்ன சொல்கிறது என்று பாருங்கள் — அந்த சொற்களை உங்கள் கட்டுரை தலைப்பில் சேர்யுங்கள்.</p>
  <h2>தலைப்பு மற்றும் Meta Description</h2>
  <p>தலைப்பில் முக்கிய keyword பயன்படுத்துங்கள் (60 எழுத்துக்கு உள்ளே). Meta description 155 எழுத்துகளுக்கு உள்ளே, தமிழிலேயே எழுதுங்கள். இவை Google தேடலில் முதலில் தெரிவது — கவர்ச்சியாக எழுதுங்கள்.</p>
  <h2>உள்ளடக்கத் தரம்</h2>
  <p>Google நல்ல, பயனுள்ள, பிழையற்ற உள்ளடக்கத்தை விரும்புகிறது. ProofTamil-இல் ஒவ்வொரு கட்டுரையையும் சோதித்து பிழையற்றதாக வையுங்கள். இலக்கணப்பிழைகள் Google-இன் Quality Rating-ஐ பாதிக்கும்.</p>
  <h2>Internal Linking</h2>
  <p>உங்கள் வலைப்பதிவில் உள்ள மற்ற கட்டுரைகளை ஒன்றோடு ஒன்று இணையுங்கள். இது Google-க்கு உங்கள் தளத்தை புரிந்துகொள்ள உதவுகிறது மற்றும் வாசகர்களை அதிக நேரம் தளத்தில் வைத்திருக்கிறது.</p>
</section>
</article>`,
  },
  {
    title: "தமிழில் கதை எழுதுவது எப்படி? படிப்படியான வழிகாட்டி",
    slug: "tamilil-kathai-ezhuthuvadhu-eppadi",
    language: "tamil",
    status: "published",
    meta_description: "தமிழில் சிறுகதை எழுதுவதற்கான படிப்படியான வழிகாட்டி — கதை அமைப்பு, கதாபாத்திரம், உரையாடல், மொழி நடை பற்றிய விரிவான குறிப்புகள்.",
    keywords: "தமிழ் கதை எழுதுவது, tamil short story, தமிழ் சிறுகதை, கதை எழுதும் முறை",
    excerpt: "தமிழில் கதை எழுத விரும்புகிறீர்களா? கதை அமைப்பு, கதாபாத்திரம் உருவாக்கம், உரையாடல் எழுதும் முறை — அனைத்தையும் இங்கே அறியுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் இலக்கியம்</div>
  <h1>தமிழில் கதை எழுதுவது எப்படி? படிப்படியான வழிகாட்டி</h1>
  <div class="subhead">8 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">தமிழில் கதை எழுத விரும்புகிறீர்களா? இந்த வழிகாட்டி உங்களுக்கானது.</p>
</header>
<section class="content">
  <p>தமிழில் கதை எழுதுவது ஒரு கலை. சங்க காலம் முதல் இன்று வரை தமிழ் கதை மரபு வளர்ந்து கொண்டே வருகிறது. நீங்களும் இந்த மரபில் ஒரு கதை சேர்க்க முடியும்.</p>
  <h2>கதை அமைப்பு</h2>
  <p>எல்லா நல்ல கதைகளுக்கும் ஒரு அடிப்படை அமைப்பு இருக்கும்: அறிமுகம் (Introduction) → உச்சகட்டம் (Climax) → முடிவு (Resolution). அறிமுகத்தில் கதாபாத்திரங்களையும் சூழலையும் அறிமுகப்படுத்துங்கள். உச்சகட்டத்தில் முக்கிய நெருக்கடி வரட்டும். முடிவில் தெளிவு வரட்டும்.</p>
  <h2>கதாபாத்திரம்</h2>
  <p>வாசகர் நேசிக்கும் கதாபாத்திரங்கள் உண்மையானவை போல் தெரிய வேண்டும். அவர்களுக்கு குறைகளும் இருக்க வேண்டும்; பலமும் இருக்க வேண்டும். "திலகம் எப்போதும் நேர்மையான பெண்" என்று சொல்வதை விட "திலகம் நேர்மையானவள், ஆனால் கோபத்தை கட்டுப்படுத்த மிகவும் கஷ்டப்படுகிறாள்" என்பது உண்மையான கதாபாத்திரம்.</p>
  <h2>உரையாடல்</h2>
  <p>உரையாடல் இயற்கையாக வேண்டும். மக்கள் பேசும் மொழியில் எழுதுங்கள் — கதாபாத்திரம் யாரிடம் பேசுகிறது என்று பொருட்டு மொழி நடை மாறட்டும். "ஆம் நான் உனது கஷ்டங்களை புரிந்துகொள்கிறேன்" என்பதை விட "ஆமா, உனக்கு கஷ்டமா இருக்கும் தெரியும்" என்பது இயற்கையானது.</p>
  <h2>மொழி நடை</h2>
  <p>உங்கள் சொந்த குரல் (voice) இருக்கட்டும். வேறு எழுத்தாளர்களை நகலெடுக்காதீர்கள். எழுதிய பிறகு ProofTamil-இல் சோதித்து பிழைகளை நீக்குங்கள். பிறகு சத்தமாக படியுங்கள் — ஓட்டம் (flow) சரியாக இருக்கிறதா என்று கவனியுங்கள்.</p>
</section>
</article>`,
  },
  {
    title: "தொழில்முறை தமிழ் மின்னஞ்சல் எழுதுவது: வழிகாட்டி",
    slug: "thozhilmurai-tamil-email-ezhuthuvadhu",
    language: "tamil",
    status: "published",
    meta_description: "தொழில்முறை தமிழ் மின்னஞ்சல் எழுதுவதற்கான வழிகாட்டி — சரியான வாழ்த்து, உடல் பகுதி, நிறைவு மற்றும் ஔபசாரிக தமிழ் பயன்பாடு.",
    keywords: "தமிழ் email, tamil business email, தமிழ் மின்னஞ்சல், formal tamil email",
    excerpt: "தொழில்முறை தமிழ் மின்னஞ்சல் எழுதும்போது என்ன கவனிக்க வேண்டும்? சரியான வரவேற்பு, ஔபசாரிக மொழி, நிறைவு சொற்கள் — இங்கே அறியுங்கள்.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">தமிழ் தொழில்</div>
  <h1>தொழில்முறை தமிழ் மின்னஞ்சல் எழுதுவது: வழிகாட்டி</h1>
  <div class="subhead">6 நிமிட வாசிப்பு · tamil</div>
  <p class="excerpt">தொழில்முறை தமிழ் மின்னஞ்சல் எழுதும்போது கடைப்பிடிக்க வேண்டிய விதிகளை அறியுங்கள்.</p>
</header>
<section class="content">
  <p>தமிழில் தொழில்முறை மின்னஞ்சல் எழுதுவது ஒரு முக்கியமான திறன். சரியான மொழி, சரியான அமைப்பு — இவை இரண்டும் உங்கள் தொழில்முறை நம்பகத்தன்மையை உறுதி செய்கின்றன.</p>
  <h2>பொருள் வரி (Subject Line)</h2>
  <p>Subject line தெளிவாகவும் சுருக்கமாகவும் இருக்க வேண்டும். "பொருள்: [நீங்கள் என்ன கேட்கிறீர்கள்/சொல்கிறீர்கள்]" என்று எழுதுங்கள். "கேள்வி" என்று மட்டும் போடுவது தெளிவில்லாத Subject line.</p>
  <h2>வரவேற்பு (Salutation)</h2>
  <p>மிகவும் ஔபசாரிக: "மரியாதைக்குரிய திரு/திருமதி [பெயர்] அவர்களுக்கு,". சற்று குறைவான ஔபசாரிக: "அன்புள்ள [பெயர்],". கூட பணிபுரிபவர்களுக்கு: "[பெயர்] அவர்களுக்கு,".</p>
  <h2>உடல் பகுதி (Body)</h2>
  <p>முதல் வாக்கியம்: ஏன் எழுதுகிறீர்கள் என்று சொல்லுங்கள். "மேற்கண்ட பொருளில் கீழ்க்கண்டவற்றை தங்கள் கவனத்திற்கு கொண்டுவர விரும்புகிறேன்." அடுத்த பகுதி: விவரங்கள். கடைசி பகுதி: நீங்கள் என்ன விரும்புகிறீர்கள் என்று கோரிக்கை.</p>
  <h2>நிறைவு (Closing)</h2>
  <p>"தங்கள் உண்மையான,", "நன்றியுடன்,", "மரியாதையுடன்," — இவை சரியான நிறைவு வார்த்தைகள். பிறகு உங்கள் பெயர், பதவி, நிறுவனம், தொடர்பு எண் சேர்யுங்கள்.</p>
  <h2>அனுப்புவதற்கு முன்</h2>
  <p>ProofTamil-இல் முழு மின்னஞ்சலையும் சோதியுங்கள். ஔபசாரிக தமிழ் நடை சரியாக இருக்கிறதா என்று சரிபாருங்கள். ஒரு இலக்கணப்பிழையும் இல்லாமல் அனுப்புங்கள்.</p>
</section>
</article>`,
  },
  // ── Bilingual posts ───────────────────────────────────────────────────────
  {
    title: "Tamil Grammar vs English Grammar: Key Structural Differences",
    slug: "tamil-grammar-vs-english-grammar-differences",
    language: "english",
    status: "published",
    meta_description: "A comparison of Tamil and English grammar — word order, verb placement, articles, gender, and case systems. Essential reading for bilingual writers.",
    keywords: "tamil vs english grammar, tamil english comparison, learn tamil grammar, bilingual tamil",
    excerpt: "Tamil and English have fundamentally different grammar structures. Understanding these differences helps bilingual writers avoid interference errors in both languages.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Language Comparison</div>
  <h1>Tamil Grammar vs English Grammar: Key Structural Differences</h1>
  <div class="subhead">8 min read · english</div>
  <p class="excerpt">Tamil and English have fundamentally different grammar structures. Understanding these differences helps bilingual writers avoid interference errors.</p>
</header>
<section class="content">
  <p>Speakers of both Tamil and English often make predictable errors when writing in their non-dominant language — these are called interference errors, and they stem from applying one language's rules to the other. Understanding the structural differences prevents these mistakes.</p>
  <h2>Word Order</h2>
  <p>English follows Subject-Verb-Object (SVO): "Ram eats rice." Tamil follows Subject-Object-Verb (SOV): "ராம் சோறு சாப்பிட்டான்" (Ram rice ate). This is perhaps the most fundamental structural difference. Tamil bilinguals writing English often place verbs at the end of sentences — a classic interference error.</p>
  <h2>Articles (A, An, The)</h2>
  <p>English has definite (the) and indefinite (a, an) articles that Tamil completely lacks. Tamil conveys definiteness/indefiniteness through context, demonstratives (அந்த, இந்த — that, this), and the numeral ஒரு (one/a). Tamil speakers learning English often omit articles; English speakers learning Tamil often try to add them where none exist.</p>
  <h2>Verb Placement and Agreement</h2>
  <p>In Tamil, the verb always comes at the end and agrees with the subject in person, number, and gender. In English, the verb follows the subject and agrees only in number for third person singular. Tamil's verb agreement system is richer — it distinguishes masculine/feminine/neuter, rational/non-rational, and all three persons in both singular and plural.</p>
  <h2>Case System</h2>
  <p>Tamil has an explicit case system — nominative, accusative, dative, sociative, instrumental, locative, ablative, and vocative — marked by suffixes. English case is mostly lost (only surviving in pronouns: I/me, he/him). Tamil case suffixes replace what English expresses through prepositions and word order.</p>
  <h2>Gender</h2>
  <p>Tamil gender is semantic — masculine (male rational beings), feminine (female rational beings), and neuter (everything else including animals). English gender is primarily biological and grammatical for pronouns only. Tamil has no grammatical gender for nouns the way French or German does.</p>
</section>
</article>`,
  },
  {
    title: "The Digital Tamil Writer's Complete Toolkit 2025",
    slug: "digital-tamil-writer-toolkit-2025",
    language: "english",
    status: "published",
    meta_description: "The complete toolkit for Tamil writers in 2025 — keyboards, fonts, proofreading tools, OCR, writing apps, and publishing platforms reviewed.",
    keywords: "tamil writer tools, tamil keyboard, tamil software 2025, digital tamil writing",
    excerpt: "Everything a modern Tamil writer needs: from typing tools and fonts to AI proofreading, OCR, and publishing platforms. The definitive 2025 toolkit.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Tools</div>
  <h1>The Digital Tamil Writer's Complete Toolkit 2025</h1>
  <div class="subhead">8 min read · english</div>
  <p class="excerpt">Everything a modern Tamil writer needs — typing tools, fonts, AI proofreading, OCR, and publishing platforms. The definitive 2025 toolkit.</p>
</header>
<section class="content">
  <p>Writing Tamil digitally in 2025 is easier than ever, but the landscape of tools can be overwhelming. This curated toolkit covers everything from the basics of typing in Tamil to advanced AI writing assistance.</p>
  <h2>Tamil Keyboard Input</h2>
  <p>Phonetic Tamil keyboards (Google Input Tools, Microsoft Indic Input) let you type Tamil transliterated in English letters and auto-convert to Tamil script. This is the fastest method for most users. InScript keyboard follows the official Indian standard layout — harder to learn initially but faster once mastered. Tamil99 layout was designed specifically for Tamil's script structure and is popular in Tamil Nadu government and academic contexts.</p>
  <h2>Tamil Fonts</h2>
  <p>Noto Sans Tamil and Noto Serif Tamil (Google Fonts) — free, comprehensive, works everywhere. Latha — pre-installed on Windows, good for documents. Vijaya — another Windows Tamil font. For professional publishing, Thamizh Arasan and Bamini are popular in Tamil Nadu, though they require conversion from their proprietary encoding to Unicode.</p>
  <h2>Writing and Editing</h2>
  <p>ProofTamil (prooftamil.com) — AI grammar checker, style suggestions, formal/spoken mode, draft saving. Google Docs — full Unicode Tamil support, collaboration features. Microsoft Word — Tamil spell-check available with language pack. Notion — Tamil input works well for notes and drafts.</p>
  <h2>OCR and Handwriting</h2>
  <p>ProofTamil Handwriting OCR — free for 2 extractions/day, high accuracy, supports mixed Tamil-English. Google Lens — good for printed Tamil, variable for handwriting. Adobe Scan — works for clean printed Tamil documents.</p>
  <h2>Publishing Platforms</h2>
  <p>WordPress and Blogger both fully support Tamil Unicode. Substack works for Tamil newsletters — the editor handles Tamil well. Medium supports Tamil with phonetic input. For formal publishing, ProofTamil's AI Content Writer helps generate and format Tamil blog content ready for publication.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Writing on Social Media: Tips and Best Practices",
    slug: "tamil-writing-social-media-tips",
    language: "english",
    status: "published",
    meta_description: "Best practices for Tamil writing on Facebook, Instagram, Twitter/X, and YouTube. How to engage Tamil audiences effectively on social media.",
    keywords: "tamil social media, tamil facebook writing, tamil instagram, tamil twitter",
    excerpt: "Tamil social media audiences are large, engaged, and underserved by quality Tamil content. Here's how to write Tamil that resonates and gets shared.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Social Media</div>
  <h1>Tamil Writing on Social Media: Tips and Best Practices</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">Tamil social media audiences are large, engaged, and underserved by quality Tamil content. Here's how to write Tamil that resonates and gets shared.</p>
</header>
<section class="content">
  <p>Tamil social media is one of the most active vernacular language communities on the internet. Tamil Facebook groups routinely get tens of thousands of comments; Tamil YouTube videos accumulate millions of views; Tamil Twitter/X discussions trend regularly. The opportunity for Tamil writers who understand their audience is enormous.</p>
  <h2>Platform-Specific Tips</h2>
  <p>Facebook: Long-form posts work well in Tamil Facebook groups — community members read and engage deeply. Use questions to drive comments. Instagram: Captions can be in Tamil — use Tamil hashtags alongside English ones for reach. Stories with Tamil text overlays get high engagement from Tamil followers. Twitter/X: Short, punchy Tamil statements travel far. Tamil threads for complex topics work well. Use Tamil-language hashtags for events and trending topics.</p>
  <h2>Register for Social Media</h2>
  <p>Social media Tamil should generally be casual and warm — closer to spoken Tamil than formal written Tamil. But avoid Tanglish (Tamil transliterated in English) — write in actual Tamil script. Tamil script posts are more likely to be shared within Tamil-speaking networks than Tanglish posts, which can feel inauthentic.</p>
  <h2>What Gets Shared</h2>
  <p>Tamil content that gets widely shared falls into predictable categories: wisdom and quotes (especially Thirukkural references), cultural pride content, humour that references Tamil-specific situations, educational content that genuinely teaches something, and emotional stories about Tamil family and community life. Reference Tamil cultural events — Pongal, Tamil New Year, harvest festivals — authentically.</p>
  <h2>Proofread Before Posting</h2>
  <p>Viral Tamil posts attract intense scrutiny — grammar errors in widely-shared content get screenshot and mocked extensively. For any content you intend to post publicly, run it through ProofTamil first. 30 seconds of proofreading can prevent embarrassing viral corrections.</p>
</section>
</article>`,
  },
  {
    title: "ProofTamil: The Smartest Way to Write Perfect Tamil",
    slug: "prooftamil-write-perfect-tamil",
    language: "english",
    status: "published",
    meta_description: "How ProofTamil uses AI to help Tamil writers catch grammar errors, improve style, convert handwriting to text, and write better Tamil content faster.",
    keywords: "ProofTamil review, tamil grammar checker, AI tamil writing, best tamil tool",
    excerpt: "ProofTamil combines AI grammar checking, handwriting OCR, and content writing in one platform — making it the most complete Tamil writing tool available.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Product Guide</div>
  <h1>ProofTamil: The Smartest Way to Write Perfect Tamil</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">ProofTamil combines AI grammar checking, handwriting OCR, and content writing — the most complete Tamil writing tool available.</p>
</header>
<section class="content">
  <p>Writing flawless Tamil is hard — even native speakers make errors in spelling, sandhi, and register. ProofTamil was built to eliminate this friction: an AI-powered platform that catches every type of Tamil writing error and helps you produce polished content faster.</p>
  <h2>AI Grammar Checking</h2>
  <p>ProofTamil's core feature analyses your Tamil text in real time, flagging spelling errors, grammar mistakes, wrong verb forms, incorrect sandhi, and register violations (mixing formal and spoken Tamil). Every suggestion comes with an explanation so you understand why it's wrong — you learn while you write.</p>
  <h2>Formal vs Spoken Tamil Mode</h2>
  <p>One feature that sets ProofTamil apart: you can select "Spoken Tamil" or "Formal/Written Tamil" mode. The AI then checks your text against the appropriate register standard. A casual social media post gets different checks than a business letter — because the rules genuinely differ between these contexts.</p>
  <h2>Handwriting OCR</h2>
  <p>ProofTamil's handwriting-to-text tool extracts Tamil text from photos of handwritten notes. Upload a JPG or PNG of your notebook, and receive the extracted text with per-word confidence scores in seconds. Free for 2 extractions per day — premium unlocks unlimited usage.</p>
  <h2>Tamil AI Content Writer</h2>
  <p>Need to write a Tamil blog post but don't know where to start? Enter your topic, tone, and word count. The AI generates a structured Tamil draft you can edit and refine. It's not a replacement for your voice — it's a starting point that saves hours of blank-page staring.</p>
  <h2>Free to Start</h2>
  <p>ProofTamil's free tier allows 200-word analysis per check and 30 AI checks per day — more than enough for casual Tamil writers. Pro users get unlimited words, unlimited daily checks, all correction types, and unlimited draft saving. Start free at prooftamil.com.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Language in Technology: NLP, AI, and the Future",
    slug: "tamil-language-technology-nlp-ai-future",
    language: "english",
    status: "published",
    meta_description: "How Natural Language Processing and AI are advancing Tamil language technology — speech recognition, machine translation, text generation, and what comes next.",
    keywords: "tamil NLP, tamil language technology, tamil AI future, tamil speech recognition",
    excerpt: "Tamil NLP has advanced dramatically. From speech recognition to text generation, here's where Tamil language technology stands in 2025 and where it's heading.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Technology</div>
  <h1>Tamil Language in Technology: NLP, AI, and the Future</h1>
  <div class="subhead">8 min read · english</div>
  <p class="excerpt">Tamil NLP has advanced dramatically. Here's where Tamil language technology stands in 2025 and where it's heading.</p>
</header>
<section class="content">
  <p>Tamil presents unique challenges for Natural Language Processing: agglutinative morphology (words formed by chaining suffixes), free word order within clauses, diglossia (the gap between formal and spoken forms), and relatively smaller training corpora compared to English. Despite these challenges, Tamil NLP has made remarkable progress in recent years.</p>
  <h2>Current State of Tamil NLP</h2>
  <p>Pre-trained language models fine-tuned for Tamil now handle several tasks reliably: Part-of-speech tagging (identifying nouns, verbs, adjectives etc.) achieves 95%+ accuracy on standard benchmarks. Named entity recognition (identifying people, places, organisations) is practical for news processing. Sentiment analysis works well for product reviews and social media monitoring. Machine translation between Tamil and English has improved dramatically with neural approaches.</p>
  <h2>Tamil Speech Recognition</h2>
  <p>Google's Tamil speech recognition, Apple's Siri in Tamil, and Amazon Alexa's Tamil support have all improved significantly. For clear speech in standard Tamil, recognition accuracy is now practical for dictation use. Challenges remain for: heavy regional accents, code-switching (mixing Tamil and English mid-sentence), and spontaneous casual speech with disfluencies.</p>
  <h2>Tamil Text Generation</h2>
  <p>Large language models like GPT-4 and Gemini generate acceptable Tamil text, though quality is lower than their English output due to less Tamil training data. Specialised Tamil models and fine-tuned versions of multilingual models perform better on Tamil-specific tasks. ProofTamil's grammar checking and content generation capabilities are built on these advances.</p>
  <h2>What's Coming</h2>
  <p>Research directions with significant near-term impact: better Tamil voice assistants, real-time Tamil subtitle generation for video content, Tamil-specific large language models trained on richer corpora, and improved handwriting recognition for historical Tamil manuscripts. The Tamil language technology ecosystem is receiving more investment and research attention than ever before.</p>
</section>
</article>`,
  },
  {
    title: "Translating English to Tamil: Common Pitfalls and How to Avoid Them",
    slug: "translating-english-to-tamil-pitfalls",
    language: "english",
    status: "published",
    meta_description: "Common mistakes when translating English to Tamil — literal translations, register mismatches, untranslatable concepts, and how to produce natural Tamil translations.",
    keywords: "english to tamil translation, tamil translation mistakes, translate to tamil, tamil localization",
    excerpt: "Translation from English to Tamil is more than word substitution. These common pitfalls produce unnatural Tamil — and here's how to avoid them.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Translation</div>
  <h1>Translating English to Tamil: Common Pitfalls and How to Avoid Them</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Translation from English to Tamil is more than word substitution. These pitfalls produce unnatural Tamil — and here's how to avoid them.</p>
</header>
<section class="content">
  <p>The quality gap between good Tamil translation and bad Tamil translation is enormous — and native Tamil speakers immediately feel the difference. Bad translation sounds stiff, foreign, or even comical. Good translation reads as though it was written originally in Tamil.</p>
  <h2>The Literal Translation Trap</h2>
  <p>"I am fine" translated literally becomes "நான் நன்றாக இருக்கிறேன்" — which is technically correct but formal. In natural Tamil, the response to "How are you?" is "நலமா இருக்கீங்களா?" → "ஆமா நலமா இருக்கேன்" or simply "நலமா இருக்கேன் சார்". The literal translation works but sounds like a textbook; the natural translation sounds like a person.</p>
  <h2>Register Mismatch</h2>
  <p>English business language translates to formal Tamil (செந்தமிழ் நடை), not spoken Tamil. Translating a corporate press release into casual spoken Tamil is as wrong as translating it too formally. Match the register of your source text to the appropriate Tamil register for your audience.</p>
  <h2>Structure Reversal</h2>
  <p>English is SVO (Subject-Verb-Object); Tamil is SOV. Translators often reproduce English word order in Tamil, creating grammatically incorrect and unnatural sentences. Always restructure for Tamil's verb-final word order. Relative clauses, which come after the noun in English, come before it in Tamil.</p>
  <h2>Untranslatable Concepts</h2>
  <p>Some English concepts lack precise Tamil equivalents and require explanatory translation. Conversely, Tamil has rich vocabulary for concepts English lacks: "அன்பு" (love — specifically the warm selfless love of family and community, different from romantic love), "உரிமை" (the right/intimacy that comes from a close relationship). Don't force false equivalents — explain when needed.</p>
  <h2>Proofread Your Translation</h2>
  <p>Even professional translators make errors — wrong verb forms, sandhi mistakes, register violations. After translating, use ProofTamil to check the Tamil output for grammatical correctness. This catches the mechanical errors that human translators miss when focused on the meaning rather than the mechanics.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Journalism: Standards and Best Practices",
    slug: "tamil-journalism-standards-best-practices",
    language: "english",
    status: "published",
    meta_description: "Standards and best practices for Tamil journalism — language accuracy, objectivity, source citation, digital reporting, and Tamil media ethics.",
    keywords: "tamil journalism, tamil media, tamil news writing, tamil reporter",
    excerpt: "Tamil journalism has a rich tradition and specific language standards. This guide covers the writing practices, ethics, and language norms for Tamil reporters and editors.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Journalism</div>
  <h1>Tamil Journalism: Standards and Best Practices</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Tamil journalism has a rich tradition and specific language standards. Here's what every Tamil journalist and editor needs to know.</p>
</header>
<section class="content">
  <p>Tamil journalism has a distinguished 19th-century history — Tamil newspapers predate Indian independence by decades, and Tamil media literacy rates are among the highest of any Indian language community. Today's Tamil journalism spans major print newspapers (Dinamalar, Dinakaran, The Hindu Tamil), digital news platforms, and a vast YouTube news ecosystem.</p>
  <h2>Tamil News Language Standards</h2>
  <p>Tamil news writing uses a distinct formal register different from both spoken Tamil and literary Tamil. It aims for maximum clarity, minimum ambiguity, and neutral tone. Key principles: active voice preferred over passive, short sentences (under 25 words where possible), no spoken-Tamil contractions, consistent use of formal second-person (நீங்கள், அவர்கள் — not நீ, அவங்க), proper Tamil equivalents for English terms where they exist.</p>
  <h2>Objectivity and Attribution</h2>
  <p>Tamil journalism follows the same attribution standards as quality journalism anywhere: claims by individuals must be attributed, not presented as fact. Use "என்று [பெயர்] தெரிவித்தார்" (according to [name]), "என்று அதிகாரிகள் கூறுகிறார்கள்" (officials say) for unverified claims. Reserve unattributed statements for established facts.</p>
  <h2>Headlines and Ledes</h2>
  <p>Tamil news headlines should be factually accurate, informative, and not misleading. The inverted pyramid structure — most important information first — applies equally to Tamil news writing. The lede (first paragraph) should answer who, what, when, where, why, and how within 30-40 words.</p>
  <h2>Digital Tamil Journalism</h2>
  <p>Tamil YouTube journalism has grown enormously — some channels have millions of subscribers. SEO matters for Tamil digital news: headlines should include searchable keywords while remaining accurate. Proofreading is critical — news articles are screenshot and shared extensively, so errors spread rapidly. Use ProofTamil to verify all Tamil news copy before publication.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Language Learning: Complete Roadmap for English Speakers",
    slug: "tamil-language-learning-english-speakers-roadmap",
    language: "english",
    status: "published",
    meta_description: "A complete roadmap for English speakers learning Tamil — script, vocabulary, grammar, conversation practice, and writing skills. Realistic milestones included.",
    keywords: "learn tamil english speaker, tamil for beginners, tamil language roadmap, how to learn tamil",
    excerpt: "Learning Tamil as an English speaker is challenging but achievable with the right roadmap. Here's a realistic progression from zero to functional Tamil literacy.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Learn Tamil</div>
  <h1>Tamil Language Learning: Complete Roadmap for English Speakers</h1>
  <div class="subhead">9 min read · english</div>
  <p class="excerpt">Learning Tamil as an English speaker is challenging but achievable with the right roadmap. Here's realistic progression from zero to functional Tamil literacy.</p>
</header>
<section class="content">
  <p>Tamil is a Category III language for English speakers according to the US Foreign Service Institute — requiring approximately 1,100 classroom hours to reach professional working proficiency. This is harder than French or Spanish (600 hours) but comparable to Hindi. With the right approach, most motivated learners reach conversational proficiency in 18-24 months of consistent study.</p>
  <h2>Phase 1: Script and Foundation (Months 1-2)</h2>
  <p>Goals: Read Tamil script fluently, know 200 core vocabulary words, understand basic sentence structure. Daily practice: 30 minutes of script learning (Drops app or similar), then 30 minutes of vocabulary (Anki Tamil decks). By month 2, you should be able to read simple Tamil text slowly and understand basic greetings and phrases.</p>
  <h2>Phase 2: Core Grammar (Months 3-6)</h2>
  <p>Goals: Understand Tamil verb conjugation (all three tenses), case system, and basic sentence patterns. Resources: "Colloquial Tamil" textbook for structured grammar explanation, Tamil grammar YouTube channels (several excellent ones exist). Start watching Tamil content with Tamil subtitles. Begin writing simple sentences daily and use ProofTamil to check your writing.</p>
  <h2>Phase 3: Conversation (Months 7-12)</h2>
  <p>Goals: Hold basic conversations, understand Tamil speech at normal speed, write simple paragraphs. Key activities: weekly conversation sessions with a native speaker (iTalki), daily Tamil media consumption, writing a short Tamil journal entry each day. At this stage, the gap between formal and spoken Tamil becomes important — focus on the spoken register for conversation.</p>
  <h2>Phase 4: Literacy (Year 2+)</h2>
  <p>Goals: Read Tamil articles and books, write formal Tamil, understand most Tamil content. Read Tamil newspapers and online content daily. Write longer Tamil pieces and use ProofTamil to get feedback on formal Tamil writing. Start distinguishing when formal vs spoken Tamil is appropriate. This phase continues indefinitely — Tamil's literary depth rewards lifetime study.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Content for Global Audiences: Writing Across Cultures",
    slug: "tamil-content-global-audiences-cross-culture",
    language: "english",
    status: "published",
    meta_description: "How to write Tamil content that works for Tamil-speaking audiences across India, Sri Lanka, Singapore, Malaysia, and the global diaspora.",
    keywords: "global tamil content, tamil diaspora, tamil worldwide, tamil international writing",
    excerpt: "Tamil is spoken across five continents. Writing Tamil content that resonates across the global Tamil diaspora requires understanding cultural and linguistic variation.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Global</div>
  <h1>Tamil Content for Global Audiences: Writing Across Cultures</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Tamil is spoken across five continents. Here's how to write Tamil content that resonates across the global Tamil diaspora.</p>
</header>
<section class="content">
  <p>Tamil is not one community — it's dozens of distinct communities across the globe, each with its own cultural context, linguistic influences, and relationship to Tamil identity. Writing Tamil content that serves all these communities requires nuanced thinking.</p>
  <h2>Understanding Your Specific Audience</h2>
  <p>Tamil Nadu Tamil (urban Chennai) — contemporary, urban, heavily influenced by films and social media, open to English loanwords in informal contexts, politically engaged. Sri Lanka Tamil — more conservative formal register, strong connection to classical Tamil, deeply affected by civil conflict history, different cultural references. Singapore/Malaysia Tamil — multilingual environment, code-switching is natural, Tamil identity often tied to Indian cultural heritage. UK/Canada/US Tamil — diaspora identity questions, Tamil as a heritage language for many younger community members, English-dominant with Tamil for community connection.</p>
  <h2>Finding Universal Tamil</h2>
  <p>Standard literary Tamil (செந்தமிழ்) is the one variety understood and respected across all Tamil communities globally. Formal writing in this register reaches the widest possible Tamil audience. This doesn't mean dry or academic — it means avoiding hyper-local slang, cultural references that don't travel, or register choices that feel wrong to particular communities.</p>
  <h2>Cultural References That Travel</h2>
  <p>Safe universal references: Thirukkural quotes, Tamil New Year (Thai Pongal), classical literature references, shared history of Tamil as a classical language. Proceed carefully with: film and celebrity references (varies by region and generation), political references (deeply divisive across Tamil communities), food references (vary significantly by region).</p>
  <h2>Quality and Proofreading</h2>
  <p>Across all Tamil communities, language quality signals respect. Grammatical errors in Tamil content signal that the creator doesn't take the Tamil language seriously — a perception that damages credibility with all Tamil audiences. Ensure all Tamil content is proofread with ProofTamil before distribution to any Tamil community.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Professional Communication: Email, Reports, and Presentations",
    slug: "tamil-professional-communication-guide",
    language: "english",
    status: "published",
    meta_description: "A complete guide to professional Tamil communication — formal emails, business reports, and Tamil presentations for the corporate and government sectors.",
    keywords: "professional tamil, tamil business communication, tamil office, tamil corporate writing",
    excerpt: "Professional Tamil communication — formal emails, business reports, presentations — has specific standards that every Tamil professional needs to master.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Professional</div>
  <h1>Tamil Professional Communication: Email, Reports, and Presentations</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Professional Tamil communication has specific standards — here's what every Tamil professional needs to master.</p>
</header>
<section class="content">
  <p>Tamil Nadu's state government conducts business in Tamil. Tamil-medium schools produce graduates who work in Tamil-medium professional environments. Tamil businesses communicate with Tamil-speaking clients. Professional Tamil writing is not a niche skill — for many Tamil professionals, it's a daily necessity.</p>
  <h2>Business Email in Tamil</h2>
  <p>Structure: Subject line (பொருள்:) → Salutation (மரியாதைக்குரிய / அன்புள்ள) → Purpose statement → Body → Request/Action item → Closing (நன்றியுடன் / மரியாதையுடன்) → Signature. Register: always formal in professional context. Avoid contractions (வேணும் → வேண்டும், போகுது → செல்கிறது).</p>
  <h2>Business Reports in Tamil</h2>
  <p>Tamil business reports follow a formal structure: தலைப்பு (Title), சுருக்கம் (Executive Summary — key findings in 3-4 sentences), முன்னுரை (Introduction — context and objectives), ஆராய்ச்சி முடிவுகள் (Findings), பரிந்துரைகள் (Recommendations), முடிவுரை (Conclusion). Use consistent technical terminology throughout — create a Tamil glossary for your organisation's domain.</p>
  <h2>Tamil Presentations</h2>
  <p>Presentation slides in Tamil: use larger font sizes (18-20px minimum) to compensate for Tamil's visual complexity at distance. Keep slides text-minimal — Tamil audiences read slides more slowly than English audiences because Tamil text carries more visual information per character. Use bilingual slides (Tamil primary, English secondary) for mixed audiences. Practice pronunciation of formal Tamil terms before presenting.</p>
  <h2>Quality Standards</h2>
  <p>Professional Tamil documents should be error-free. Run every document through ProofTamil's formal mode before sending or presenting. Errors in professional communication in Tamil reflect poorly on the individual and the organisation — Tamil-speaking colleagues and clients notice and judge language quality.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Proofreading Services: When to DIY and When to Hire",
    slug: "tamil-proofreading-services-diy-vs-hire",
    language: "english",
    status: "published",
    meta_description: "When is AI Tamil proofreading enough, and when do you need a professional human Tamil editor? A practical decision guide for different content types.",
    keywords: "tamil proofreading service, tamil editor, professional tamil review, tamil content quality",
    excerpt: "AI proofreading handles most Tamil writing needs — but some content requires human expert review. Here's how to decide which approach your content needs.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Proofreading</div>
  <h1>Tamil Proofreading Services: When to DIY and When to Hire</h1>
  <div class="subhead">6 min read · english</div>
  <p class="excerpt">AI proofreading handles most Tamil writing needs — but some content requires human expert review. Here's how to decide.</p>
</header>
<section class="content">
  <p>The question every Tamil writer faces: is AI proofreading enough, or do I need a professional human Tamil editor? The honest answer depends on what you're writing, who the audience is, and what's at stake if there's an error.</p>
  <h2>When AI Proofreading is Sufficient</h2>
  <p>AI Tamil proofreading (like ProofTamil) is sufficient for: blog posts and social media content, business emails and internal communications, student assignments and academic drafts (before final submission), content where speed matters and the audience is forgiving of minor stylistic choices, and high-volume content production where human review of every piece isn't economical.</p>
  <h2>When Human Review is Essential</h2>
  <p>Human Tamil editors add value that AI cannot yet match for: legal documents and contracts (where precise terminology has legal consequences), published books and literary works (where voice, style, and cultural nuance are paramount), high-stakes marketing campaigns (where cultural missteps could damage brand reputation), government and official documents (where Tamil language committee standards apply), and classical or literary Tamil content (which requires deep knowledge of historical usage).</p>
  <h2>The Hybrid Approach</h2>
  <p>The most cost-effective and quality-maximising approach combines both: use ProofTamil for automated checking first — this catches all mechanical errors (spelling, grammar, sandhi, register). Then send to a human editor only the content that remains after AI correction. The human reviewer focuses on meaning, tone, and cultural appropriateness rather than wasting time on comma corrections.</p>
  <h2>Finding Tamil Editors</h2>
  <p>Professional Tamil editors are available through Tamil Nadu's translation industry associations, Upwork and Freelancer (search "Tamil proofreading"), university Tamil departments (for academic content), and Tamil media organisations (for journalism and content writing). Always request a sample edit before engaging for large projects.</p>
</section>
</article>`,
  },
  {
    title: "Using ProofTamil for Tamil Academic Writing",
    slug: "prooftamil-tamil-academic-writing",
    language: "english",
    status: "published",
    meta_description: "How to use ProofTamil to improve Tamil academic writing — setting formal mode, checking grammar, reviewing suggestions, and ensuring academic Tamil standards.",
    keywords: "ProofTamil academic, tamil academic writing, tamil university proofreading, tamil research grammar",
    excerpt: "ProofTamil's formal mode is specifically designed for academic and professional Tamil. Here's how to use it effectively for university-level Tamil writing.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Academic</div>
  <h1>Using ProofTamil for Tamil Academic Writing</h1>
  <div class="subhead">5 min read · english</div>
  <p class="excerpt">ProofTamil's formal mode is specifically designed for academic and professional Tamil. Here's how to use it effectively for university-level writing.</p>
</header>
<section class="content">
  <p>Tamil university students, researchers, and faculty write a substantial amount of formal Tamil — essays, research papers, theses, and academic correspondence. ProofTamil's formal Tamil mode is calibrated for exactly this type of writing.</p>
  <h2>Setting Up for Academic Writing</h2>
  <p>1. Open ProofTamil's workspace. 2. Select "Formal Tamil" mode from the style selector. 3. Paste your academic text. 4. Click "Check Grammar". The AI will now check your text against formal written Tamil standards — not spoken Tamil conventions. Spoken contractions, informal vocabulary, and casual constructions will all be flagged.</p>
  <h2>What ProofTamil Checks for Academic Tamil</h2>
  <p>In formal mode, ProofTamil specifically checks: use of formal verb forms (செய்கிறேன் not செய்றேன்), correct use of honorifics (அவர்கள் not அவங்க for third-person respectful), appropriate formal vocabulary (வேண்டும் not வேணும், செல்கிறது not போகுது), sandhi errors in compound academic terms, and spelling consistency for technical vocabulary.</p>
  <h2>Working Through Suggestions</h2>
  <p>Each suggestion ProofTamil makes comes with an explanation. Don't just accept all suggestions automatically — read each explanation and apply it to your understanding. Academic writing benefits from understanding why each correction is made, not just what the correction is. This turns every proofreading session into a grammar learning session.</p>
  <h2>Before Final Submission</h2>
  <p>Run your final draft through ProofTamil, accept all corrections you agree with, then read the entire document aloud. Hearing your academic Tamil — even your internal reading voice — catches rhythm problems and unclear sentences that visual proofreading misses. A zero-error Tamil academic paper signals the author's language competence to reviewers and examiners.</p>
</section>
</article>`,
  },
  {
    title: "Tamil Writing for Children: Tips for Tamil Parents and Teachers",
    slug: "tamil-writing-for-children-parents-teachers",
    language: "english",
    status: "published",
    meta_description: "How parents and teachers can help children develop Tamil writing skills — age-appropriate approaches, resources, and how to make Tamil writing fun and engaging.",
    keywords: "teach children tamil writing, tamil kids, children learn tamil, tamil school writing",
    excerpt: "Developing Tamil writing skills in children requires age-appropriate approaches that make writing enjoyable. Tips for parents and teachers to encourage Tamil literacy.",
    content_html: `<article class="prooftamil-blog minimal">
<header>
  <div class="kicker">Tamil Education</div>
  <h1>Tamil Writing for Children: Tips for Tamil Parents and Teachers</h1>
  <div class="subhead">7 min read · english</div>
  <p class="excerpt">Developing Tamil writing skills in children requires age-appropriate approaches that make writing enjoyable. Tips for parents and teachers.</p>
</header>
<section class="content">
  <p>Tamil literacy in the next generation is not guaranteed — it must be actively cultivated. Children who don't develop strong Tamil writing skills in their school years often lose Tamil literacy as adults, even if they continue speaking Tamil at home. Parents and teachers play crucial roles in making Tamil writing a skill children develop naturally.</p>
  <h2>Start with Script (Ages 4-6)</h2>
  <p>Make Tamil script learning physical and multi-sensory: sand trays for tracing letters, large chalk letters on the ground, stamp sets with Tamil characters. Apps like Tamil Script Learner make script practice game-like. Connect each letter to familiar words: அ for அம்மா (mother), க for கரும்பு (sugarcane). Celebrate when a child writes their name in Tamil for the first time.</p>
  <h2>Simple Writing (Ages 6-10)</h2>
  <p>Start with copying simple Tamil sentences. Progress to writing about familiar topics: my family, my school, my favourite food. Simple Tamil stories (Panchatantra in Tamil, Aesop in Tamil) provide both reading models and prompts for children's own writing. Praise effort, not perfection — correction should be gentle and instructive, not discouraging.</p>
  <h2>Creative Writing (Ages 10-14)</h2>
  <p>Tamil creative writing competitions, school Tamil magazines, and online Tamil youth platforms provide motivation and audience. Encourage children to write Tamil fan fiction about their favourite characters, Tamil language poetry (குறும்பா is accessible for children), and Tamil social media posts for family groups. Creative investment builds Tamil writing as a personally meaningful skill rather than just a school subject.</p>
  <h2>Using Digital Tools</h2>
  <p>Older children (12+) can use ProofTamil to check their own Tamil writing. This teaches self-editing skills and helps them understand their common errors. Parents can review what errors ProofTamil flagged and use them as teaching moments — "Let me explain why this word should be written differently." Digital tools make Tamil learning feel modern and relevant.</p>
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
