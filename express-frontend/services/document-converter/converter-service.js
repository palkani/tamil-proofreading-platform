/**
 * Document Converter Service
 * Wraps the Python Flask API for document conversion
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Converter API URL - can be local or external service
const CONVERTER_API_URL = process.env.CONVERTER_API_URL || 'http://localhost:5001';

class DocumentConverterService {
  constructor() {
    this.apiUrl = CONVERTER_API_URL;
  }

  /**
   * Check if converter service is available
   */
  async healthCheck() {
    try {
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
      const response = await axios.get(`${this.apiUrl}/api/supported-conversions`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('[Converter] Failed to get supported conversions:', error.message);
      return { conversions: {}, formats: [] };
    }
  }

  /**
   * Convert a document
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - Original filename
   * @param {string} toFormat - Target format (pdf, docx, txt, etc.)
   */
  async convertDocument(fileBuffer, filename, toFormat) {
    try {
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
        throw new Error(error.response.data?.error || 'Conversion failed');
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

