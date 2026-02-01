/**
 * Favicon Generator Script
 * 
 * This script generates PNG favicons from the SVG favicon.
 * Run: node scripts/generate-favicons.js
 * 
 * Requires: npm install sharp
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not installed. Install with: npm install sharp');
  console.log('\nAlternatively, use an online tool like https://realfavicongenerator.net/');
  console.log('Upload the favicon.svg file from public/images/');
  process.exit(0);
}

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-192x192.png', size: 192 },
  { name: 'favicon-512x512.png', size: 512 },
];

const svgPath = path.join(__dirname, '../public/images/favicon.svg');
const outputDir = path.join(__dirname, '../public/images');

async function generateFavicons() {
  const svgBuffer = fs.readFileSync(svgPath);
  
  for (const { name, size } of sizes) {
    const outputPath = path.join(outputDir, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: ${name} (${size}x${size})`);
  }
  
  // Generate ICO (using 16x16 and 32x32)
  console.log('\nFor favicon.ico, combine 16x16 and 32x32 PNGs using:');
  console.log('https://icoconvert.com/ or similar tool');
  
  console.log('\nFavicons generated successfully!');
}

generateFavicons().catch(console.error);
