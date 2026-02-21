/**
 * OCR Service - Direct implementation using Tesseract.js
 * This allows OCR to work without a separate Python service
 */

const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Reuse a single worker across requests to avoid repeated language downloads/initialization.
// This is a major speed-up vs Tesseract.recognize() per request.
let workerPromise = null;
let workerCurrentLang = null;

async function getWorker(logger) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker({
        logger: logger || undefined,
      });
      // Load the common languages once. (eng+tam) covers both; later we can initialize per-request.
      await worker.loadLanguage('eng+tam');
      await worker.initialize('eng+tam');
      workerCurrentLang = 'eng+tam';
      return worker;
    })().catch((err) => {
      // Reset so the next request creates a fresh worker instead of
      // permanently failing on a rejected promise.
      workerPromise = null;
      workerCurrentLang = null;
      throw err;
    });
  }
  return workerPromise;
}

/**
 * Extract text from image using Tesseract.js
 */
async function extractTextFromImage(imageBuffer, lang = 'eng+tam') {
  try {
    console.log('[OCR] Starting image OCR with language:', lang);

    const logger = (m) => {
      if (m.status === 'recognizing text') {
        console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
      }
    };

    const worker = await getWorker(logger);
    const desiredLang = lang || 'eng+tam';
    if (workerCurrentLang !== desiredLang) {
      try {
        await worker.loadLanguage(desiredLang);
      } catch (e) {
        // If loading the desired language fails, we can still try with eng.
        console.warn('[OCR] Failed to load language, will fallback if needed:', desiredLang, e?.message);
      }
      await worker.initialize(desiredLang);
      workerCurrentLang = desiredLang;
    }

    const { data: { text } } = await worker.recognize(imageBuffer);
    
    console.log('[OCR] Image OCR completed, extracted', text.length, 'characters');
    return text.trim();
  } catch (error) {
    console.error('[OCR] Image OCR error:', error);
    // Fallback to English only if Tamil fails
    if (lang.includes('tam') && lang !== 'eng') {
      console.log('[OCR] Falling back to English only');
      try {
        const worker = await getWorker();
        if (workerCurrentLang !== 'eng') {
          await worker.loadLanguage('eng');
          await worker.initialize('eng');
          workerCurrentLang = 'eng';
        }
        const { data: { text } } = await worker.recognize(imageBuffer);
        return text.trim();
      } catch (e) {
        throw new Error(`OCR failed: ${error.message}`);
      }
    }
    throw error;
  }
}

/**
 * Extract text from PDF
 */
async function extractTextFromPDF(pdfBuffer) {
  try {
    console.log('[OCR] Starting PDF text extraction');
    
    // First, try to extract text directly from PDF
    const pdfData = await pdfParse(pdfBuffer);
    let extractedText = pdfData.text;
    
    // If no text found, we'd need to convert PDF pages to images
    // For now, return what we have
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('PDF contains no extractable text. PDF may be image-based and requires OCR.');
    }
    
    console.log('[OCR] PDF text extraction completed, extracted', extractedText.length, 'characters');
    return extractedText.trim();
  } catch (error) {
    console.error('[OCR] PDF extraction error:', error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

/**
 * Create Word document from extracted text
 */
async function createWordDocument(text, originalFilename) {
  try {
    // Split text into paragraphs for better formatting
    const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Text Extracted from: ${originalFilename}`,
                bold: true,
                size: 32, // 16pt
              }),
            ],
          }),
          new Paragraph({
            text: '_'.repeat(80),
          }),
          // Add each paragraph
          ...paragraphs.map(p => new Paragraph({
            text: p.trim(),
          })),
        ],
      }],
    });

    // Create temporary file
    const tempDir = os.tmpdir();
    const outputFilename = `${path.parse(originalFilename).name}_extracted.docx`;
    const outputPath = path.join(tempDir, outputFilename);
    
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
    
    console.log('[OCR] Word document created:', outputPath);
    return { outputPath, outputFilename };
  } catch (error) {
    console.error('[OCR] Word document creation error:', error);
    // Don't fail the entire request if Word doc creation fails
    // Just return a placeholder filename
    const outputFilename = `${path.parse(originalFilename).name}_extracted.txt`;
    return { outputPath: null, outputFilename };
  }
}

/**
 * Process file and extract text
 */
async function processFile(fileBuffer, filename, mimeType, lang = 'eng+tam') {
  try {
    let extractedText = '';
    
    if (mimeType === 'application/pdf') {
      extractedText = await extractTextFromPDF(fileBuffer);
    } else {
      // Image file
      extractedText = await extractTextFromImage(fileBuffer, lang);
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the file. The image may be too low quality or contain no text.');
    }
    
    // Create Word document
    const { outputPath, outputFilename } = await createWordDocument(extractedText, filename);
    
    return {
      text: extractedText,
      full_text: extractedText,
      download_filename: outputFilename,
      download_path: outputPath,
      char_count: extractedText.length
    };
  } catch (error) {
    console.error('[OCR] File processing error:', error);
    throw error;
  }
}

module.exports = {
  extractTextFromImage,
  extractTextFromPDF,
  createWordDocument,
  processFile
};

