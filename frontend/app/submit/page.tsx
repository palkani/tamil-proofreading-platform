'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { submissionAPI, paymentAPI } from '@/lib/api';
import type { Submission, Suggestion } from '@/types';

export default function SubmitPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);

  useEffect(() => {
    // Simple word count (in production, use Tamil NLP)
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    setWordCount(words.length);
  }, [text]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setPaymentRequired(false);

    try {
      const result = await submissionAPI.submitText(text);
      setSubmission(result);
      
      // Check if payment is required
      if (result.status === 'pending' && (result as any).payment_required) {
        setPaymentRequired(true);
        setPaymentData((result as any));
      }
    } catch (err: any) {
      if (err.response?.status === 402) {
        // Payment required
        setPaymentRequired(true);
        setPaymentData(err.response.data);
      } else {
        setError(err.response?.data?.error || 'Submission failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setText(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const pollSubmission = async (id: number) => {
    const maxAttempts = 30;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const result = await submissionAPI.getSubmission(id);
        setSubmission(result);
        
        if (result.status === 'completed' || result.status === 'failed') {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Error polling submission:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 2000);
  };

  useEffect(() => {
    if (submission && submission.status === 'processing') {
      pollSubmission(submission.id);
    }
  }, [submission?.id]);

  let suggestions: Suggestion[] = [];
  try {
    if (submission?.suggestions) {
      suggestions = JSON.parse(submission.suggestions);
    }
  } catch (e) {
    // Ignore parse errors
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Submit Text for Proofreading</h1>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        {paymentRequired && (
          <div className="mb-4 rounded-md bg-yellow-50 p-4">
            <div className="text-sm text-yellow-800">
              Payment required: ₹{paymentData?.cost} for {paymentData?.word_count} words
            </div>
            <button
              onClick={() => router.push(`/payment?amount=${paymentData?.cost}&word_count=${paymentData?.word_count}`)}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Proceed to Payment
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Input Text</h2>
            <div className="mb-4">
              <input
                type="file"
                accept=".txt,.doc,.docx"
                onChange={handleFileUpload}
                className="mb-2"
              />
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type your Tamil text here..."
              className="w-full h-96 p-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              dir="rtl"
            />
            <div className="mt-4 flex justify-between items-center">
              <span className="text-sm text-gray-600">
                Word count: <strong>{wordCount}</strong>
              </span>
              <button
                onClick={handleSubmit}
                disabled={loading || !text.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting...' : 'Submit for Proofreading'}
              </button>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Proofread Result</h2>
            {submission ? (
              <div>
                {submission.status === 'processing' && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Processing your text...</p>
                  </div>
                )}
                
                {submission.status === 'completed' && (
                  <div>
                    <div className="mb-4 p-4 bg-green-50 rounded-md">
                      <p className="text-sm text-green-800">
                        Proofreading completed in {submission.processing_time?.toFixed(2)}s
                      </p>
                    </div>
                    <div className="mb-4">
                      <h3 className="font-semibold mb-2">Corrected Text:</h3>
                      <div className="p-4 bg-gray-50 rounded-md min-h-64 max-h-96 overflow-y-auto" dir="rtl">
                        {submission.proofread_text}
                      </div>
                    </div>
                    {suggestions.length > 0 && (
                      <div className="mb-4">
                        <h3 className="font-semibold mb-2">Suggestions:</h3>
                        <ul className="space-y-2">
                          {suggestions.map((suggestion, idx) => (
                            <li key={idx} className="p-3 bg-yellow-50 rounded-md">
                              <p className="text-sm">
                                <strong>{suggestion.original}</strong> → {suggestion.corrected}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">{suggestion.reason}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const blob = new Blob([submission.proofread_text || ''], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `proofread-${submission.id}.txt`;
                        a.click();
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      Download Corrected Text
                    </button>
                  </div>
                )}
                
                {submission.status === 'failed' && (
                  <div className="p-4 bg-red-50 rounded-md">
                    <p className="text-sm text-red-800">
                      Error: {submission.error || 'Processing failed'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Submit text to see proofread results here
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

