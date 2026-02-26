/**
 * Replace black background in proof-tamil-logo.png with white.
 * Run from repo root: node express-frontend/scripts/logo-black-to-white.js
 * Or from express-frontend: node scripts/logo-black-to-white.js
 */
const path = require('path');
const fs = require('fs');

const sharp = require('sharp');

const IMAGE_PATH = path.join(__dirname, '..', 'public', 'images', 'proof-tamil-logo.png');
const BLACK_THRESHOLD = 80; // Pixels with R,G,B all <= this become white (higher = more aggressive)

async function main() {
  if (!fs.existsSync(IMAGE_PATH)) {
    console.error('Logo not found:', IMAGE_PATH);
    process.exit(1);
  }

  const image = sharp(IMAGE_PATH);
  const meta = await image.metadata();
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const bytes = new Uint8Array(data);

  for (let i = 0; i < bytes.length; i += channels) {
    const r = bytes[i];
    const g = bytes[i + 1];
    const b = bytes[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      bytes[i] = 255;
      bytes[i + 1] = 255;
      bytes[i + 2] = 255;
      if (channels === 4) bytes[i + 3] = 255;
    }
  }

  await sharp(bytes, {
    raw: { width, height, channels }
  })
    .png()
    .toFile(IMAGE_PATH);

  console.log('Logo background converted to white:', IMAGE_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
