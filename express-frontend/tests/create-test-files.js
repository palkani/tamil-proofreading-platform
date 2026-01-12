/**
 * Script to create test files for tools testing
 * Run with: node express-frontend/tests/create-test-files.js
 */

const fs = require('fs');
const path = require('path');

const testFilesDir = path.join(__dirname, 'test-files');

// Create directory if it doesn't exist
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir, { recursive: true });
}

console.log('Creating test files...\n');

// 1. Create minimal PNG image
const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
  0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
  0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82  // IEND
]);

fs.writeFileSync(path.join(testFilesDir, 'test-image.png'), pngBuffer);
console.log('✓ Created test-image.png');

// 2. Create minimal PDF
const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000317 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
398
%%EOF`;

fs.writeFileSync(path.join(testFilesDir, 'test-document.pdf'), pdfContent);
console.log('✓ Created test-document.pdf');

// 3. Create Tamil text file
const tamilText = `விஜய் இன்று சிபிஐ முன்பு ஆஜராக உள்ளார்... இது தேசிய அளவில் கவனத்தை பெற்று வருகிறது.. கரூர் வழக்கு தொடர்பாக நடத்தப்படும் இந்த விசாரணையானது எந்த மாதிரியான தாக்கத்தை அரசியல் களத்தில் விஜய்க்கு பெற்றுத்தரும்? தவெக தொண்டர்கள் என்ன சொல்கிறார்கள்? இதன் சாதக பாதக விளைவுகள் என்ன? இவைகளை பற்றி இங்கே சுருக்கமாக பார்ப்போம்.`;

fs.writeFileSync(path.join(testFilesDir, 'test-tamil.txt'), tamilText, 'utf8');
console.log('✓ Created test-tamil.txt');

// 4. Create a simple HTML file
const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
    <meta charset="UTF-8">
    <title>Test Document</title>
</head>
<body>
    <h1>Test HTML Document</h1>
    <p>விஜய் இன்று சிபிஐ முன்பு ஆஜராக உள்ளார்.</p>
</body>
</html>`;

fs.writeFileSync(path.join(testFilesDir, 'test-document.html'), htmlContent, 'utf8');
console.log('✓ Created test-document.html');

console.log('\n✅ All test files created successfully!');
console.log(`\nTest files location: ${testFilesDir}`);
console.log('\nYou can now run the test suite with:');
console.log('  npm run test:tools\n');

