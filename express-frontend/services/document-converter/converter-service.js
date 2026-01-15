/**
 * Document Converter Service
 * Wraps the Python Flask API for document conversion
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pdfParse = require('pdf-parse');
const { Document, Packer, Paragraph, TextRun } = require('docx');

// Converter API URL - can be local or external service
const CONVERTER_API_URL = process.env.CONVERTER_API_URL || 'http://localhost:5001';

function isLocalhostUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('localhost') || u.includes('127.0.0.1');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlToPlainText(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<\/p\s*>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/div\s*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  return s.trim();
}

function getExt(filename) {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  return ext === 'doc' ? 'docx' : ext;
}

class DocumentConverterService {
  constructor() {
    this.apiUrl = CONVERTER_API_URL;
    // Store converted files in temp dir for direct conversions
    this._directFiles = new Map(); // filename -> absolute path
  }

  /**
   * Check if converter service is available
   */
  async healthCheck() {
    try {
      if (isLocalhostUrl(this.apiUrl)) {
        return {
          status: 'healthy',
          service: 'Document Converter (Direct)',
          implementation: 'Direct (Node.js limited conversions)',
          version: '1.0.0',
        };
      }

      const response = await axios.get(`${this.apiUrl}/api/health`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('[Converter] Health check failed:', error.message);
      return null;
    }
  }

  /**
   * Get supported conversions
   */
  async getSupportedConversions() {
    try {
      if (isLocalhostUrl(this.apiUrl)) {
        // Direct conversion only supports text-based formats reliably in a serverless environment.
        const conversions = {
          pdf: ['txt', 'html'],
          txt: ['docx', 'html'],
          html: ['txt', 'docx'],
        };
        return { conversions, formats: Object.keys(conversions) };
      }

      const response = await axios.get(`${this.apiUrl}/api/supported-conversions`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('[Converter] Failed to get supported conversions:', error.message);
      return { conversions: {}, formats: [] };
    }
  }

  async _directConvertDocument(fileBuffer, filename, toFormat) {
    const start = Date.now();
    const fromFormat = getExt(filename);
    const to = String(toFormat || '').toLowerCase();

    if (!to) {
      const err = new Error('Target format not specified');
      err.details = 'Missing to_format';
      throw err;
    }

    // Read input into plain text (best-effort)
    let text = '';
    if (fromFormat === 'txt') {
      text = Buffer.from(fileBuffer).toString('utf8');
    } else if (fromFormat === 'html') {
      text = htmlToPlainText(Buffer.from(fileBuffer).toString('utf8'));
    } else if (fromFormat === 'pdf') {
      const pdfData = await pdfParse(fileBuffer);
      text = String(pdfData.text || '').trim();
      if (!text) {
        const err = new Error('PDF contains no extractable text');
        err.details = 'This PDF may be scanned/image-based. Please convert to an image and use OCR, or configure the external converter service.';
        throw err;
      }
    } else {
      const err = new Error(`Source format ${fromFormat} not supported in direct mode`);
      err.details = 'Direct converter supports only PDF/TXT/HTML. For DOCX/RTF/ODT/PDF output, configure CONVERTER_API_URL to a deployed converter service.';
      throw err;
    }

    const baseName = path.parse(filename).name;
    const outputFilename = `${baseName}_converted.${to}`;
    const outputPath = path.join(os.tmpdir(), outputFilename);

    // Write output in target format
    if (to === 'txt') {
      fs.writeFileSync(outputPath, text, 'utf8');
    } else if (to === 'html') {
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
      fs.writeFileSync(outputPath, html, 'utf8');
    } else if (to === 'docx') {
      // Create a simple docx with paragraphs, preserving line breaks
      const paragraphs = String(text)
        .replace(/\r\n/g, '\n')
        .split(/\n{2,}/g)
        .map((p) => p.trim())
        .filter(Boolean);

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs.length
              ? paragraphs.map((p) =>
                  new Paragraph({
                    children: [new TextRun({ text: p })],
                  })
                )
              : [new Paragraph({ children: [new TextRun({ text: '' })] })],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outputPath, buffer);
    } else {
      const err = new Error(`Cannot convert ${fromFormat} to ${to}`);
      err.details = 'PDF/RTF/ODT output requires the external converter service (LibreOffice/pandoc).';
      throw err;
    }

    const inputSizeMb = Math.round((Buffer.byteLength(fileBuffer) / (1024 * 1024)) * 100) / 100;
    const outStat = fs.statSync(outputPath);
    const outputSizeMb = Math.round((outStat.size / (1024 * 1024)) * 100) / 100;

    // Save mapping for download
    this._directFiles.set(outputFilename, outputPath);
    // Keep only last 20 files
    if (this._directFiles.size > 20) {
      const firstKey = this._directFiles.keys().next().value;
      const oldPath = this._directFiles.get(firstKey);
      try {
        if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch {
        // ignore
      }
      this._directFiles.delete(firstKey);
    }

    return {
      success: true,
      message: `Successfully converted ${fromFormat.toUpperCase()} to ${to.toUpperCase()}`,
      download_filename: outputFilename,
      input_size_mb: inputSizeMb,
      output_size_mb: outputSizeMb,
      from_format: fromFormat.toUpperCase(),
      to_format: to.toUpperCase(),
      conversion_time_ms: Date.now() - start,
    };
  }

  /**
   * Convert a document
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - Original filename
   * @param {string} toFormat - Target format (pdf, docx, txt, etc.)
   */
  async convertDocument(fileBuffer, filename, toFormat) {
    try {
      if (isLocalhostUrl(this.apiUrl)) {
        return await this._directConvertDocument(fileBuffer, filename, toFormat);
      }

      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: this.getContentType(filename)
      });
      formData.append('to_format', toFormat);

      const response = await axios.post(`${this.apiUrl}/api/convert`, formData, {
        headers: formData.getHeaders(),
        timeout: 120000, // 2 minutes for large files
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return response.data;
    } catch (error) {
      console.error('[Converter] Conversion failed:', error.message);
      if (error.response) {
        const err = new Error(error.response.data?.error || 'Conversion failed');
        err.details = error.response.data?.details || error.response.data?.error || error.message;
        throw err;
      }
      throw error;
    }
  }

  /**
   * Download converted file
   * @param {string} filename - Converted filename
   */
  async downloadFile(filename) {
    try {
      if (isLocalhostUrl(this.apiUrl)) {
        const filePath = this._directFiles.get(filename);
        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error('File not found');
        }
        return fs.createReadStream(filePath);
      }

      const response = await axios.get(`${this.apiUrl}/api/download/${filename}`, {
        responseType: 'stream',
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      console.error('[Converter] Download failed:', error.message);
      throw error;
    }
  }

  /**
   * Get content type from filename
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.rtf': 'application/rtf',
      '.odt': 'application/vnd.oasis.opendocument.text'
    };
    return types[ext] || 'application/octet-stream';
  }
}

module.exports = new DocumentConverterService();

