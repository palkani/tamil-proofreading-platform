#!/usr/bin/env node
/**
 * Generate the site-wide Open Graph / Twitter Card image at the official
 * 1200×630 dimensions used by Facebook, Twitter, LinkedIn, WhatsApp, Slack,
 * Discord, etc. Writes the result to:
 *   express-frontend/public/images/og-default.png
 *
 * Run when the design needs updating:
 *   node express-frontend/scripts/generate-og-image.js
 *
 * Then commit the regenerated PNG. The image is referenced by header.ejs
 * (og:image + twitter:image) so it appears on every page's social card.
 *
 * Why a script and not a hand-designed PNG: the SVG source is editable in
 * any text editor; one command re-renders the PNG. No Figma/Canva round-trip
 * required for minor tweaks (tagline change, color change, etc.).
 *
 * Dependencies: `sharp` (already in package.json), no native add-ons needed.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_PATH = path.join(__dirname, '..', 'public', 'images', 'og-default.png');
const WIDTH = 1200;
const HEIGHT = 630;

// Brand colors lifted from existing site CSS:
//   #1E1B4B → #312E81 → #4F46E5  (the dark hero gradient used on home + CTAs)
const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#1E1B4B"/>
      <stop offset="50%"  stop-color="#312E81"/>
      <stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
    <radialGradient id="orb1" cx="0%" cy="0%" r="60%">
      <stop offset="0%"   stop-color="#6366F1" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#6366F1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb2" cx="100%" cy="100%" r="50%">
      <stop offset="0%"   stop-color="#F59E0B" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background gradient + decorative orbs (matches the final-CTA design on home.ejs) -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="0" cy="0" r="500" fill="url(#orb1)"/>
  <circle cx="${WIDTH}" cy="${HEIGHT}" r="500" fill="url(#orb2)"/>

  <!-- Brand pill (matches the homepage CTA pill style) -->
  <g transform="translate(80, 90)">
    <rect width="240" height="44" rx="22" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    <circle cx="22" cy="22" r="5" fill="#FBBF24"/>
    <text x="38" y="29" font-family="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="15" font-weight="600" fill="#C7D2FE" letter-spacing="0.5">
      AI · Free to start
    </text>
  </g>

  <!-- Wordmark — the most important element, sized for legibility at Twitter's 600x314 preview crop -->
  <text x="80" y="330" font-family="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="132" font-weight="900" fill="#FFFFFF" letter-spacing="-3">
    ProofTamil
  </text>

  <!-- Amber accent line (replaces the Tamil tagline that previously rendered as tofu
       because Sharp/librsvg uses the system fontconfig and Tamil fonts aren't always
       installed on build machines). To re-enable Tamil text reliably, bundle
       Noto Sans Tamil as base64 in a <defs><style>@font-face{src:url(data:font/woff2;base64,...)}</style></defs>
       block — keeps the SVG self-contained but adds ~1MB. Doing the simple thing for now. -->
  <line x1="80" y1="370" x2="320" y2="370" stroke="#FBBF24" stroke-width="6" stroke-linecap="round"/>

  <!-- Tagline — English benefit, 3 capabilities, large enough to read at Twitter's 600px crop -->
  <text x="80" y="455" font-family="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="42" font-weight="500" fill="rgba(255,255,255,0.95)" letter-spacing="-0.5">
    Tamil grammar checker · Handwriting OCR · AI writing
  </text>

  <!-- Footer URL (small, bottom-right; helps even when image is shared without context) -->
  <text x="${WIDTH - 80}" y="${HEIGHT - 60}" text-anchor="end" font-family="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="500" fill="rgba(199,210,254,0.85)" letter-spacing="0.5">
    prooftamil.com
  </text>
</svg>`;

async function main() {
  await sharp(Buffer.from(SVG))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(OUT_PATH);

  const stat = fs.statSync(OUT_PATH);
  console.log(`✅ Wrote ${OUT_PATH}`);
  console.log(`   ${WIDTH}×${HEIGHT} PNG · ${(stat.size / 1024).toFixed(1)} KB`);
  console.log('');
  console.log('Next: commit the regenerated PNG alongside any SVG/text changes in this script.');
  console.log('Preview your card before pushing:');
  console.log('  - https://www.opengraph.xyz/url/https%3A%2F%2Fwww.prooftamil.com');
  console.log('  - Twitter: https://cards-dev.twitter.com/validator');
  console.log('  - LinkedIn: https://www.linkedin.com/post-inspector');
}

main().catch((e) => {
  console.error('❌ Failed to generate OG image:', e.message || e);
  process.exit(1);
});
