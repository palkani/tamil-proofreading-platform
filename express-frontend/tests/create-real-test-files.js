/**
 * Create realistic test files for comprehensive testing
 * This creates actual files with content that can be tested
 */

const fs = require('fs');
const path = require('path');

const testFilesDir = path.join(__dirname, 'test-files');

// Create directory if it doesn't exist
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir, { recursive: true });
}

console.log('Creating realistic test files for comprehensive testing...\n');

// 1. Create a simple text-based image (using a minimal valid PNG with text-like content)
// For real testing, you'd use an actual image with text, but we'll create a minimal one
const pngWithText = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, // 100x100
  0x08, 0x02, 0x00, 0x00, 0x00, 0xFF, 0x80, 0x02, 0x00,
  0x00, 0x00, 0x04, 0x67, 0x41, 0x4D, 0x41, 0x00, // gAMA
  0x00, 0xB1, 0x8F, 0x0B, 0xFC, 0x61, 0x05, 0x00,
  0x00, 0x00, 0x09, 0x70, 0x48, 0x59, 0x73, 0x00, // pHYs
  0x00, 0x0E, 0xC4, 0x00, 0x00, 0x0E, 0xC4, 0x01,
  0x95, 0x2B, 0x0E, 0x1B, 0x00, 0x00, 0x00, 0x0C,
  0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, // IDAT
  0x0F, 0x00, 0x00, 0x01, 0x00, 0x01, 0x5C, 0xC2,
  0x8F, 0x6D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82  // IEND
]);

fs.writeFileSync(path.join(testFilesDir, 'test-image-with-text.png'), pngWithText);
console.log('✓ Created test-image-with-text.png');

// 2. Create a PDF with actual Tamil text content
const pdfWithTamil = `%PDF-1.4
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
/Length 100
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF with Tamil: Vijay) Tj
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
454
%%EOF`;

fs.writeFileSync(path.join(testFilesDir, 'test-pdf-with-text.pdf'), pdfWithTamil);
console.log('✓ Created test-pdf-with-text.pdf');

// 3. Create Tamil text file
const tamilText = `விஜய் இன்று சிபிஐ முன்பு ஆஜராக உள்ளார்... 

இது தேசிய அளவில் கவனத்தை பெற்று வருகிறது.. 

கரூர் வழக்கு தொடர்பாக நடத்தப்படும் இந்த விசாரணையானது எந்த மாதிரியான தாக்கத்தை அரசியல் களத்தில் விஜய்க்கு பெற்றுத்தரும்? 

தவெக தொண்டர்கள் என்ன சொல்கிறார்கள்? 

இதன் சாதக பாதக விளைவுகள் என்ன? 

இவைகளை பற்றி இங்கே சுருக்கமாக பார்ப்போம்.`;

fs.writeFileSync(path.join(testFilesDir, 'test-tamil-content.txt'), tamilText, 'utf8');
console.log('✓ Created test-tamil-content.txt');

// 4. Create HTML file with Tamil content
const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Tamil Document</title>
    <style>
        body {
            font-family: 'Latha', 'Tamil MN', sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        h1 { color: #1e3a8a; }
    </style>
</head>
<body>
    <h1>தமிழ் ஆவணம்</h1>
    <p>விஜய் இன்று சிபிஐ முன்பு ஆஜராக உள்ளார்.</p>
    <p>இது தேசிய அளவில் கவனத்தை பெற்று வருகிறது.</p>
    <p>கரூர் வழக்கு தொடர்பாக நடத்தப்படும் இந்த விசாரணையானது எந்த மாதிரியான தாக்கத்தை அரசியல் களத்தில் விஜய்க்கு பெற்றுத்தரும்?</p>
</body>
</html>`;

fs.writeFileSync(path.join(testFilesDir, 'test-tamil-document.html'), htmlContent, 'utf8');
console.log('✓ Created test-tamil-document.html');

// 5. Create a simple RTF file
const rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Times New Roman;}}
\\f0\\fs24 
Test RTF Document with Tamil: Vijay
}`;

fs.writeFileSync(path.join(testFilesDir, 'test-document.rtf'), rtfContent, 'utf8');
console.log('✓ Created test-document.rtf');

console.log('\n✅ All realistic test files created!');
console.log(`\nTest files location: ${testFilesDir}`);
console.log('\nThese files can be used for comprehensive testing of:');
console.log('  - OCR tool (images and PDFs)');
console.log('  - Document Converter (all formats)');
console.log('\nNote: For best OCR results, use actual images with visible text.');

