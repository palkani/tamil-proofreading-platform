'use client';

import { useState, useCallback, useEffect } from 'react';
import AppHeader from '@/components/AppHeader';
import { authAPI } from '@/lib/api';
import apiClient from '@/lib/api-client';

const ACCEPT = '.jpg,.jpeg,.png,.pdf,.tiff,.bmp,.gif';
const MAX_MB = 16;

export default function OCRToolPage() {
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState('eng+tam');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Extracting text... Please wait');
  const [error, setError] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copy Text');
  const [downloadFormat, setDownloadFormat] = useState<'docx' | 'txt' | 'html'>('docx');

  const loadUser = useCallback(async () => {
    try {
      const user = await authAPI.getCurrentUser();
      setUserEmail(user.email);
      setShowAdmin(user.role === 'admin');
    } catch {
      setUserEmail('');
      setShowAdmin(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setSourceFilename(f.name);
    setError('');
    setExtractedText('');
    setDownloadFilename(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setSourceFilename(f.name);
      setError('');
      setExtractedText('');
      setDownloadFilename(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const processFile = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setLoadingMessage('Extracting text... Please wait');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lang', lang);
      const res = await apiClient.post('/ocr/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 95000,
      });
      const data = res.data as {
        error?: string;
        full_text?: string;
        text?: string;
        char_count?: number;
        download_filename?: string;
      };
      if (data.error) {
        setError(data.error);
        setExtractedText('');
      } else {
        const text = data.full_text ?? data.text ?? '';
        setExtractedText(text);
        setDownloadFilename(data.download_filename ?? null);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to process file. Please try again.';
      setError(msg);
      setExtractedText('');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractedText);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy Text'), 2000);
    } catch {
      setCopyLabel('Copy failed');
      setTimeout(() => setCopyLabel('Copy Text'), 2000);
    }
  };

  const handleDownload = () => {
    const baseName = (sourceFilename || 'ocr-extracted').replace(/\.[^/.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'ocr-extracted';
    if (downloadFormat === 'docx' && downloadFilename) {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
      const url = `${base.replace(/\/$/, '')}/ocr/download/${encodeURIComponent(downloadFilename)}`;
      window.open(url, '_blank');
      return;
    }
    if (downloadFormat === 'txt') {
      const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (downloadFormat === 'html') {
      const safe = extractedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName}</title></head><body><pre style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui;">${safe}</pre></body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-white">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={() => { setUserEmail(''); setShowAdmin(false); }} />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold mb-4">Tamil OCR Tool</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">Extract Tamil Text from Images & PDFs</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Upload images or PDFs containing Tamil text and get editable text instantly. Powered by Tesseract OCR with Tamil language support.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 mb-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('file-input')?.click()}
            className="border-2 border-dashed border-indigo-300 rounded-xl p-12 text-center bg-blue-50 cursor-pointer transition-all hover:bg-blue-100 hover:border-indigo-400"
          >
            <div className="text-6xl mb-4">📄</div>
            <div className="text-xl font-semibold text-indigo-700 mb-2">Click to upload or drag and drop</div>
            <div className="text-sm text-gray-600">Supports: JPG, PNG, PDF, TIFF, BMP, GIF (Max {MAX_MB}MB)</div>
            <input
              id="file-input"
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">OCR Language:</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="eng+tam">English + Tamil (Recommended)</option>
              <option value="tam">Tamil Only</option>
              <option value="eng">English Only</option>
            </select>
          </div>

          {file && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-indigo-200">
              <div className="flex items-center gap-2 text-indigo-700">
                <span className="text-xl">📎</span>
                <span className="font-semibold">{file.name}</span>
                <span className="text-sm text-gray-600">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={processFile}
              disabled={!file || loading}
              className="px-8 py-4 bg-indigo-600 text-white rounded-full font-semibold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Processing…' : 'Extract Text'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center mb-6">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mb-4" />
            <div className="text-xl font-semibold text-indigo-700">{loadingMessage}</div>
            <div className="text-sm text-gray-600 mt-2">This may take a few moments depending on file size</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-red-700">
              <span className="text-xl">❌</span>
              <span className="font-semibold">{error}</span>
            </div>
          </div>
        )}

        {extractedText && !loading && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Extracted Text</h2>
              <div className="text-sm text-gray-600">{extractedText.length} characters</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 max-h-96 overflow-y-auto mb-6 border border-gray-200 whitespace-pre-wrap text-gray-900 leading-relaxed">
              {extractedText}
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <div className="flex items-center gap-3">
                <label htmlFor="download-format" className="text-sm font-semibold text-gray-700">Download as:</label>
                <select
                  id="download-format"
                  value={downloadFormat}
                  onChange={(e) => setDownloadFormat(e.target.value as 'docx' | 'txt' | 'html')}
                  className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="docx">DOCX (Word)</option>
                  <option value="txt">TXT</option>
                  <option value="html">HTML</option>
                </select>
              </div>
              <button onClick={handleDownload} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 shadow-lg">
                Download
              </button>
              <button onClick={handleCopy} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300">
                {copyLabel}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Tips for Best Results</h3>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start gap-2"><span className="text-indigo-600">•</span> Use high-resolution images (300+ DPI) for better accuracy</li>
            <li className="flex items-start gap-2"><span className="text-indigo-600">•</span> Ensure text is clear and not rotated</li>
            <li className="flex items-start gap-2"><span className="text-indigo-600">•</span> Black text on white background works best</li>
            <li className="flex items-start gap-2"><span className="text-indigo-600">•</span> For Tamil text, select &quot;English + Tamil&quot; or &quot;Tamil Only&quot;</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
