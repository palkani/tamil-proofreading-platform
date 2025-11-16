'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { submissionAPI, authAPI } from '@/lib/api';
import AssistantPanel, { AssistantSuggestion } from '@/components/AssistantPanel';
import AppHeader from '@/components/AppHeader';
import type { Submission, Suggestion } from '@/types';
import { analyzeText } from '@/utils/tamilHeuristics';
import { convertEnglishToTamil } from '@/utils/transliterate';
import { analyzeContextSpelling, getContextWindow } from '@/utils/contextSpelling';
import { analyzeGrammar, getGrammarRuleExplanation } from '@/utils/tamilGrammar';
import { analyzeClarityStyle, getClarityStyleExplanation } from '@/utils/clarityStyle';
import { checkGrammarSegment, AISuggestion as GeminiSuggestion } from '@/utils/geminiTamilChecker';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false });

const escapeRegExp = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const applyIndexedReplacement = (source: string, start: number, end: number, replacement: string) => {
  if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end <= source.length) {
    return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  }
  return source;
};

type NearestMatch = {
  position: number;
  occurrence: number;
};

const findNearestOccurrence = (source: string, target: string, approximateIndex?: number | null): NearestMatch | null => {
  if (!target || !source.includes(target)) {
    return null;
  }

  const positions: number[] = [];
  let searchIndex = 0;
  while (searchIndex <= source.length) {
    const found = source.indexOf(target, searchIndex);
    if (found === -1) break;
    positions.push(found);
    searchIndex = found + Math.max(target.length, 1);
  }

  if (positions.length === 0) {
    return null;
  }

  if (typeof approximateIndex === 'number' && Number.isFinite(approximateIndex)) {
    let bestIndex = 0;
    let bestDistance = Math.abs(positions[0] - approximateIndex);

    for (let i = 1; i < positions.length; i += 1) {
      const distance = Math.abs(positions[i] - approximateIndex);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return { position: positions[bestIndex], occurrence: bestIndex };
  }

  return { position: positions[0], occurrence: 0 };
};

const replaceNthOccurrence = (source: string, target: string, replacement: string, occurrence: number) => {
  if (!target.trim() || occurrence < 0) {
    return source;
  }

  let startIndex = 0;
  let count = 0;

  while (startIndex <= source.length) {
    const index = source.indexOf(target, startIndex);
    if (index === -1) {
      break;
    }

    if (count === occurrence) {
      return `${source.slice(0, index)}${replacement}${source.slice(index + target.length)}`;
    }

    startIndex = index + Math.max(target.length, 1);
    count += 1;
  }

  return source;
};

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

const plainTextToHtml = (input: string) => {
  if (!input) {
    return '<p></p>';
  }

  const paragraphs = input.split(/\n{2,}/).map((paragraph) => paragraph.trim());
  return paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => {
      const lines = paragraph.split('\n').map((line) => escapeHtml(line));
      return `<p>${lines.join('<br />')}</p>`;
    })
    .join('') || '<p></p>';
};

type ReplacementResult = {
  plain: string;
  html: string;
  changed: boolean;
};

const applyReplacementWithHtml = (
  plain: string,
  html: string,
  target: string,
  replacement: string,
  approximateIndex?: number | null
): ReplacementResult => {
  if (!target.trim()) {
    return { plain, html, changed: false };
  }

  const match = findNearestOccurrence(plain, target, approximateIndex);
  if (!match) {
    return { plain, html, changed: false };
  }

  const nextPlain = `${plain.slice(0, match.position)}${replacement}${plain.slice(match.position + target.length)}`;
  let nextHtml = replaceNthOccurrence(html, target, replacement, match.occurrence);

  if (nextHtml === html) {
    nextHtml = plainTextToHtml(nextPlain);
  }

  return {
    plain: nextPlain,
    html: nextHtml,
    changed: nextPlain !== plain,
  };
};

const splitSentences = (text: string) =>
  text
    .split(/(?<=[.?!\u0BE4\u0BF0\u0BF2\n])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const findClosestSentence = (content: string, alternative: string) => {
  const sentences = splitSentences(content);
  if (sentences.length === 0) {
    return null;
  }

  const altTokens = alternative.split(/\s+/u).filter(Boolean);
  if (altTokens.length === 0) {
    return null;
  }

  let bestSentence: string | null = null;
  let bestScore = 0;

  sentences.forEach((sentence) => {
    const sentenceTokens = sentence.split(/\s+/u).filter(Boolean);
    if (sentenceTokens.length === 0) {
      return;
    }

    const overlap = sentenceTokens.filter((token) => altTokens.includes(token)).length;
    const score = overlap / Math.max(altTokens.length, sentenceTokens.length);

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  });

  if (!bestSentence || bestScore === 0) {
    return null;
  }

  return bestSentence;
};

const typeOptions: AssistantSuggestion['type'][] = ['grammar', 'style', 'clarity', 'alternative'];
const normalizeSuggestionType = (value?: string): AssistantSuggestion['type'] => {
  if (!value) return 'grammar';
  const lowered = value.toLowerCase();
  
  const match = typeOptions.find((option) => option === lowered);
  if (match) return match;
  
  const grammarSubtypes = ['case', 'agreement', 'tense', 'verb', 'number', 'particle', 'punctuation'];
  const claritySubtypes = ['word_order', 'sentence_structure', 'clarity', 'rewrite'];
  const styleSubtypes = ['spelling', 'context', 'style'];
  
  if (grammarSubtypes.includes(lowered)) return 'grammar';
  if (claritySubtypes.includes(lowered)) return 'clarity';
  if (styleSubtypes.includes(lowered)) return 'style';
  
  return 'grammar';
};

const normalizeSnippet = (value?: string) => (value ? value.replace(/\s+/g, ' ').trim() : '');

const suggestionMatchesText = (suggestion: AssistantSuggestion, docText: string) => {
  if (!docText) {
    return false;
  }

  const normalizedDoc = docText.normalize('NFC');

  if (suggestion.range) {
    const { start, end } = suggestion.range;
    if (
      typeof start === 'number' &&
      typeof end === 'number' &&
      start >= 0 &&
      end > start &&
      end <= normalizedDoc.length
    ) {
      const slice = normalizedDoc.slice(start, end);
      const normalizedSlice = normalizeSnippet(slice);
      if (!normalizedSlice) {
        return false;
      }
      if (suggestion.sourceText) {
        return normalizeSnippet(suggestion.sourceText.normalize('NFC')) === normalizedSlice;
      }
      return true;
    }
    return false;
  }

  if (suggestion.sourceText) {
    const snippet = normalizeSnippet(suggestion.sourceText.normalize('NFC'));
    if (!snippet) return false;
    return normalizedDoc.includes(snippet);
  }

  return true;
};

const filterSuggestionsForText = (suggestions: AssistantSuggestion[], docText: string) =>
  suggestions.filter((item) => suggestionMatchesText(item, docText));

export default function SubmitPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [editorHTML, setEditorHTML] = useState('');
  const [loading, setLoading] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [realtimeSuggestions, setRealtimeSuggestions] = useState<AssistantSuggestion[]>([]);
  const [deepSuggestions, setDeepSuggestions] = useState<AssistantSuggestion[]>([]);
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [handledSuggestionIds, setHandledSuggestionIds] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<number | null>(null);
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [mode, setMode] = useState<'list' | 'editor'>('editor');
  const [infoMessage, setInfoMessage] = useState('');
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isApplyingAllRef = useRef(false);
  const isInitializingRef = useRef(false);
  const analysisTimeoutRef = useRef<number | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);

  // Memoized word count - lightweight computation
  const wordCount = useMemo(() => {
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    return words.length;
  }, [text]);

  const clearPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fallbackPollSubmission = useCallback(
    (id: number) => {
      clearPolling();
      let attempts = 0;

      pollingRef.current = window.setInterval(async () => {
        attempts += 1;
        try {
          const result = await submissionAPI.getSubmission(id);
          setSubmission(result);
          if (result.status === 'completed' || result.status === 'failed') {
            clearPolling();
          }
        } catch (pollErr) {
          console.error('Error polling submission:', pollErr);
          clearPolling();
        }

        if (attempts >= 30) {
          clearPolling();
        }
      }, 2000);
    },
    [clearPolling]
  );

  const startSubmissionStream = useCallback(
    (id: number) => {
      if (typeof window === 'undefined') return;

      const token = localStorage.getItem('token');
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');
      const streamUrl = `${base}/stream/submissions/${id}${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      clearPolling();

      const source = new EventSource(streamUrl);
      eventSourceRef.current = source;

      const handleStatus = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.status) {
            setSubmission((prev) => (prev ? { ...prev, status: data.status } : prev));
          }
        } catch (parseErr) {
          console.error('Failed to parse status event', parseErr);
        }
      };

      const handleResult = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.submission) {
            setSubmission(data.submission as Submission);
          }
        } catch (parseErr) {
          console.error('Failed to parse result event', parseErr);
        }
      };

      const handleFailure = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.message) {
            setError(data.message);
            setSubmission((prev) => (prev ? { ...prev, status: 'failed', error: data.message } : prev));
          }
        } catch (parseErr) {
          console.error('Failed to parse failure event', parseErr);
        }
      };

      const handleEnd = (_event: Event) => {
        source.close();
        if (eventSourceRef.current === source) {
          eventSourceRef.current = null;
        }
        clearPolling();
      };

      source.addEventListener('status', handleStatus as EventListener);
      source.addEventListener('result', handleResult as EventListener);
      source.addEventListener('failure', handleFailure as EventListener);
      source.addEventListener('end', handleEnd as EventListener);

      source.onerror = (event) => {
        console.error('SSE connection error', event);
        source.close();
        if (eventSourceRef.current === source) {
          eventSourceRef.current = null;
        }
        fallbackPollSubmission(id);
      };
    },
    [clearPolling, fallbackPollSubmission]
  );

  // Single consolidated useEffect for initialization
  useEffect(() => {
    const init = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setUserEmail(user.email);
        setShowAdmin(user.role === 'admin');

        const list = await submissionAPI.getSubmissions(6, 0);
        setRecentSubmissions(list.submissions);
      } catch (err) {
        // Authentication disabled for testing - skip login requirement
        setUserEmail('test@example.com');
        setShowAdmin(false);
      }
    };

    init();
  }, [router]);

  // Debug: Track mode changes
  useEffect(() => {
    console.log('Mode changed to:', mode, 'editorHTML length:', editorHTML.length, 'text length:', text.length);
  }, [mode, editorHTML, text]);

  // Consolidated text handling - only runs when not initializing and in editor mode
  useEffect(() => {
    // Skip completely if initializing or not in editor mode
    if (isInitializingRef.current || mode !== 'editor') return;

    const trimmed = text.trim();
    
    // Clear everything if text is empty
    if (trimmed.length === 0) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      clearPolling();
      setRealtimeSuggestions([]);
      setRealtimeLoading(false);
      setDeepSuggestions([]);
      setHandledSuggestionIds([]);
      setSubmission(null);
      setError('');
      return;
    }

    // Filter existing suggestions
    setRealtimeSuggestions((prev) => filterSuggestionsForText(prev, text));
    setDeepSuggestions((prev) => filterSuggestionsForText(prev, text));

    // Debounced text analysis - only run if text has content
    if (analysisTimeoutRef.current) {
      window.clearTimeout(analysisTimeoutRef.current);
    }

    // Don't start loading if we're initializing
    if (!isInitializingRef.current) {
      setRealtimeLoading(true);
    }
    
    analysisTimeoutRef.current = window.setTimeout(() => {
      // Double-check flag after timeout
      if (isInitializingRef.current || isApplyingAllRef.current) {
        setRealtimeLoading(false);
        return;
      }

      // Run analysis asynchronously to prevent blocking
      setTimeout(() => {
        // Triple-check flag before running expensive operations
        if (isInitializingRef.current || isApplyingAllRef.current) {
          setRealtimeLoading(false);
          return;
        }

        try {
          const issues = analyzeText(text);
          const suggestionsList: AssistantSuggestion[] = issues.map((issue) => ({
            id: `heuristic-${issue.id}`,
            title: issue.title,
            description: issue.description,
            type: issue.type,
            preview: issue.preview,
            sourceText: issue.preview?.split('→')[0]?.trim() || issue.preview || issue.title,
            onApply: issue.fix
              ? () => {
                  const next = issue.fix ? issue.fix(text) : text;
                  if (next !== text) {
                    setText(next);
                    setEditorHTML(plainTextToHtml(next));
                  }
                }
              : undefined,
          }));

          try {
            const contextIssues = analyzeContextSpelling(text, []);
            contextIssues.forEach((issue, index) => {
              if (issue.suggestions.length > 0 && issue.confidence > 0.7) {
                const context = getContextWindow(text, issue.startIndex, issue.endIndex, 30);
                suggestionsList.push({
                  id: `context-spelling-${issue.startIndex}-${index}`,
                  title: `Context-aware spelling: "${issue.word}"`,
                  description: `${issue.reason}. Context: "${context.before}${context.word}${context.after}"`,
                  type: 'grammar',
                  preview: `${issue.word} → ${issue.suggestions[0]}`,
                  sourceText: issue.word,
                  range: { start: issue.startIndex, end: issue.endIndex },
                  onApply: () => {
                    const corrected = 
                      text.slice(0, issue.startIndex) + 
                      issue.suggestions[0] + 
                      text.slice(issue.endIndex);
                    setText(corrected);
                    setEditorHTML(plainTextToHtml(corrected));
                    setHandledSuggestionIds(prev => [...prev, `context-spelling-${issue.startIndex}-${index}`]);
                  },
                });
              }
            });
          } catch (err) {
            console.debug('Context spelling analysis error:', err);
          }

          try {
            const grammarIssues = analyzeGrammar(text);
            grammarIssues.forEach((issue, index) => {
              if (issue.corrected && issue.severity !== 'suggestion') {
                suggestionsList.push({
                  id: `grammar-${issue.type}-${issue.position.start}-${index}`,
                  title: `Grammar ${issue.type}: ${issue.title}`,
                  description: `${issue.description}. ${getGrammarRuleExplanation(issue.rule)}`,
                  type: issue.type === 'case' || issue.type === 'agreement' || issue.type === 'tense' 
                    ? 'grammar' 
                    : issue.type === 'word_order' || issue.type === 'sentence_structure'
                    ? 'clarity'
                    : 'style',
                  preview: issue.corrected ? `${issue.original} → ${issue.corrected}` : issue.original,
                  sourceText: issue.original,
                  range: issue.position,
                  onApply: issue.corrected ? () => {
                    const corrected = 
                      text.slice(0, issue.position.start) + 
                      issue.corrected + 
                      text.slice(issue.position.end);
                    setText(corrected);
                    setEditorHTML(plainTextToHtml(corrected));
                    setHandledSuggestionIds(prev => [...prev, `grammar-${issue.type}-${issue.position.start}-${index}`]);
                  } : undefined,
                });
              }
            });
          } catch (err) {
            console.debug('Grammar analysis error:', err);
          }

          try {
            const clarityIssues = analyzeClarityStyle(text);
            clarityIssues.forEach((issue, index) => {
              if (issue.suggestion) {
                // Map clarity issue types to suggestion types
                const suggestionType: AssistantSuggestion['type'] = 
                  issue.type === 'clarity' || issue.type === 'rewrite' ? 'clarity' : 'style';
                
                suggestionsList.push({
                  id: `clarity-${issue.type}-${index}`,
                  title: issue.title,
                  description: issue.description || getClarityStyleExplanation(issue.type),
                  type: suggestionType,
                  preview: issue.suggestion,
                  sourceText: issue.original || text,
                  onApply: undefined, // Clarity suggestions are informational only
                });
              }
            });
          } catch (err) {
            console.debug('Clarity analysis error:', err);
          }

          setRealtimeSuggestions(suggestionsList);
          setRealtimeLoading(false);
        } catch (err) {
          console.error('Error in text analysis:', err);
          setRealtimeLoading(false);
        }
      }, 0);
    }, 1000); // Increased debounce to 1000ms

    return () => {
      if (analysisTimeoutRef.current) {
        window.clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
    };
  }, [text, clearPolling, mode]);

  // Handle deep suggestions from submission
  useEffect(() => {
    if (!submission || submission.status !== 'completed' || isInitializingRef.current) {
      if (submission?.status === 'failed') {
        setDeepSuggestions([]);
      }
      return;
    }

    let parsedSuggestions: Suggestion[] = [];
    let parsedAlternatives: string[] = [];

    try {
      if (submission.suggestions) {
        parsedSuggestions = JSON.parse(submission.suggestions);
      }
    } catch (parseErr) {
      console.error('Failed to parse suggestions JSON', parseErr);
    }

    try {
      if (submission.alternatives) {
        parsedAlternatives = JSON.parse(submission.alternatives);
      }
    } catch (parseErr) {
      console.error('Failed to parse alternatives JSON', parseErr);
    }

    const deep: AssistantSuggestion[] = [];

    parsedSuggestions.forEach((s, index) => {
      const rawOriginal = typeof s.original === 'string' ? s.original : '';
      const original = rawOriginal.trim();
      const corrected = typeof s.corrected === 'string' ? s.corrected.trim() : '';
      if (!original || !corrected || original === corrected) {
        return;
      }

      const id = `suggestion-${index}-${original}-${corrected}`;
      if (handledSuggestionIds.includes(id)) return;

      deep.push({
        id,
        title: original,
        description: s.reason,
        preview: `${original} → ${corrected}`,
        type: normalizeSuggestionType(s.type),
        sourceText: original,
        range:
          Number.isFinite(s.start_index) && Number.isFinite(s.end_index)
            ? { start: Number(s.start_index), end: Number(s.end_index) }
            : undefined,
        onApply: () => {
          let workingPlain = text;
          let workingHtml = editorHTML;
          const approxIndex = Number.isFinite(s.start_index) ? Number(s.start_index) : null;
          const candidates: string[] = [];

          if (
            Number.isFinite(s.start_index) &&
            Number.isFinite(s.end_index) &&
            s.end_index > s.start_index &&
            s.end_index <= text.length
          ) {
            const indexedSegment = text.slice(s.start_index, s.end_index);
            if (indexedSegment.trim().length > 0) {
              candidates.push(indexedSegment);
            }
          }

          if (rawOriginal && !candidates.includes(rawOriginal)) {
            candidates.push(rawOriginal);
          }
          if (original && !candidates.includes(original)) {
            candidates.push(original);
          }

          for (const candidate of candidates) {
            const { plain, html, changed } = applyReplacementWithHtml(workingPlain, workingHtml, candidate, corrected, approxIndex);
            if (changed) {
              workingPlain = plain;
              workingHtml = html;
              break;
            }
          }

          if (workingPlain !== text) {
            setText(workingPlain);
            setEditorHTML(workingHtml);
          }
          setHandledSuggestionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setDeepSuggestions((prev) => prev.filter((item) => item.id !== id));
        },
        onIgnore: () => {
          setHandledSuggestionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setDeepSuggestions((prev) => prev.filter((item) => item.id !== id));
        },
      });
    });

    parsedAlternatives.forEach((alt, index) => {
      const trimmed = alt.trim();
      if (!trimmed) {
        return;
      }

      const id = `alternative-${index}-${trimmed}`;
      if (handledSuggestionIds.includes(id)) return;

      deep.push({
        id,
        title: 'Alternative sentence',
        description: 'LLM generated alternative phrasing.',
        preview: trimmed,
        type: 'alternative',
        sourceText: trimmed,
        onApply: () => {
          const targetSentence = findClosestSentence(text, trimmed);
          if (!targetSentence) {
            return;
          }
          const { plain, html, changed } = applyReplacementWithHtml(text, editorHTML, targetSentence, trimmed);
          if (!changed) {
            return;
          }
          setText(plain);
          setEditorHTML(html);
          setHandledSuggestionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setDeepSuggestions((prev) => prev.filter((item) => item.id !== id));
        },
        onIgnore: () => {
          setHandledSuggestionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setDeepSuggestions((prev) => prev.filter((item) => item.id !== id));
        },
      });
    });

    setDeepSuggestions(deep);
  }, [submission, handledSuggestionIds, text, editorHTML]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      clearPolling();
      if (analysisTimeoutRef.current) {
        window.clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, [clearPolling]);

  const submitForProofreading = useCallback(
    async (plainText: string, htmlText: string) => {
      if (loading) return;

      setLoading(true);
      setError('');
      setInfoMessage('');

      try {
        const response = await submissionAPI.submitText({ text: plainText, html: htmlText });
        setSubmission(response);
        startSubmissionStream(response.id);
        setInfoMessage('Text submitted for proofreading. Suggestions will appear shortly.');
      } catch (err: any) {
        setError(err?.message || 'Failed to submit text for proofreading');
        console.error('Submission error:', err);
      } finally {
        setLoading(false);
      }
    },
    [loading, startSubmissionStream]
  );

  const handlePasteProofread = useCallback(
    (payload: { html: string; plain: string }) => {
      const convertedPlain = convertEnglishToTamil(payload.plain);
      const convertedHtml = plainTextToHtml(convertedPlain);
      
      setText(convertedPlain);
      setEditorHTML(convertedHtml);
      if (!loading) {
        submitForProofreading(convertedPlain, convertedHtml);
      }
    },
    [loading, submitForProofreading]
  );

  const handleNewDraft = useCallback(() => {
    console.log('handleNewDraft called');
    
    // Stop ALL ongoing operations immediately
    if (analysisTimeoutRef.current) {
      window.clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    clearPolling();
    
    // Set flag to block analysis during initialization
    isInitializingRef.current = true;
    
    // Set mode FIRST to trigger editor rendering
    setMode('editor');
    
    // Then set all other state
    setRealtimeSuggestions([]);
    setDeepSuggestions([]);
    setHandledSuggestionIds([]);
    setRealtimeLoading(false);
    setInfoMessage('');
    setError('');
    setSubmission(null);
    setText('');
    setEditorHTML('<p></p>');
    
    // Reset flag after a delay to allow analysis to resume
    setTimeout(() => {
      isInitializingRef.current = false;
      console.log('New draft initialization complete');
    }, 2000);
  }, [clearPolling]);

  const handleOpenDraft = useCallback((item: Submission) => {
    console.log('handleOpenDraft called with item:', item.id);
    
    // Stop ALL ongoing operations immediately
    if (analysisTimeoutRef.current) {
      window.clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    clearPolling();
    
    // Set flag to block analysis during initialization
    isInitializingRef.current = true;
    
    const draftText = item.original_text || '';
    const draftHTML = item.original_html || draftText || '<p></p>';
    
    console.log('Setting mode to editor, draftText length:', draftText.length);
    
    // Set mode FIRST to trigger editor rendering
    setMode('editor');
    
    // Then set all other state
    setRealtimeSuggestions([]);
    setDeepSuggestions([]);
    setHandledSuggestionIds([]);
    setRealtimeLoading(false);
    setInfoMessage('');
    setError('');
    setSubmission(item);
    setText(draftText);
    setEditorHTML(draftHTML);
    
    // Reset flag after a delay to allow analysis to resume
    setTimeout(() => {
      isInitializingRef.current = false;
      console.log('Initialization complete, analysis can resume');
    }, 2000);
  }, [clearPolling]);

  const handleBackToList = () => {
    setInfoMessage('');
    setMode('list');
    isInitializingRef.current = false;
  };

  // Stable callbacks for editor
  const handleEditorChange = useCallback((html: string) => {
    if (!isInitializingRef.current) {
      setEditorHTML(html);
    }
  }, []);

  const handleEditorPlainTextChange = useCallback((plain: string) => {
    if (!isInitializingRef.current) {
      setText(plain);
    }
  }, []);

  const handleArchiveDraft = async (submissionId: number) => {
    try {
      setArchivingId(submissionId);
      setError('');
      setInfoMessage('');
      const response = await submissionAPI.archiveSubmission(submissionId);
      setRecentSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
      setInfoMessage('Draft moved to Archive. It will be permanently deleted after 15 days.');
      if (submission?.id === submissionId) {
        setSubmission(null);
        setText('');
        setEditorHTML('');
        setMode('list');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to archive draft');
    } finally {
      setArchivingId(null);
    }
  };

  const handleLogout = useCallback(() => {
    authAPI.logout();
    router.push('/');
  }, [router]);

  const handleCheckWithGemini = useCallback(async () => {
    if (!text.trim() || geminiLoading) return;
    
    setGeminiLoading(true);
    setError('');
    
    try {
      const geminiResults = await checkGrammarSegment(text, 2000);
      
      const geminiSuggestions: AssistantSuggestion[] = geminiResults.map((result, index) => ({
        id: `gemini-${result.id}-${index}`,
        title: result.title,
        description: result.description,
        type: result.type as AssistantSuggestion['type'],
        preview: result.original && result.suggestion 
          ? `${result.original} → ${result.suggestion}` 
          : result.suggestion || result.original,
        sourceText: result.original,
        range: result.position,
        onApply: result.suggestion && result.original ? () => {
          const suggestionId = `gemini-${result.id}-${index}`;
          let nextContent = text;
          
          if (result.position && result.position.start >= 0 && result.position.end > result.position.start) {
            nextContent = text.substring(0, result.position.start) + result.suggestion + text.substring(result.position.end);
          } else {
            const match = findNearestOccurrence(text, result.original, null);
            if (match) {
              nextContent = text.substring(0, match.position) + result.suggestion + text.substring(match.position + result.original.length);
            } else {
              nextContent = text.replace(result.original, result.suggestion);
            }
          }
          
          if (nextContent !== text) {
            setText(nextContent);
            setEditorHTML(plainTextToHtml(nextContent));
          }
          setHandledSuggestionIds((prev) => (prev.includes(suggestionId) ? prev : [...prev, suggestionId]));
          setDeepSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
        } : undefined,
        onIgnore: () => {
          setDeepSuggestions((prev) => prev.filter((s) => s.id !== `gemini-${result.id}-${index}`));
        },
      }));
      
      setDeepSuggestions(geminiSuggestions);
      
      if (geminiSuggestions.length === 0) {
        setInfoMessage('Gemini AI found no issues in your Tamil text. Great work!');
        setTimeout(() => setInfoMessage(''), 3000);
      }
    } catch (err) {
      console.error('Gemini AI error:', err);
      setError('Failed to analyze text with Gemini AI. Please try again.');
    } finally {
      setGeminiLoading(false);
    }
  }, [text, geminiLoading]);

  const handleAcceptAll = useCallback(() => {
    if (!submission || submission.status !== 'completed') return;

    isApplyingAllRef.current = true;
    setRealtimeLoading(false);

    let parsedSuggestions: Suggestion[] = [];
    try {
      if (submission.suggestions) {
        parsedSuggestions = JSON.parse(submission.suggestions);
      }
    } catch (parseErr) {
      console.error('Failed to parse suggestions JSON', parseErr);
      isApplyingAllRef.current = false;
      return;
    }

    let workingPlain = text;
    let workingHtml = editorHTML;

    parsedSuggestions.forEach((s) => {
      const original = typeof s.original === 'string' ? s.original.trim() : '';
      const corrected = typeof s.corrected === 'string' ? s.corrected.trim() : '';
      if (!original || !corrected || original === corrected) {
        return;
      }

      const approxIndex = Number.isFinite(s.start_index) ? Number(s.start_index) : null;
      const candidates: string[] = [];

      if (
        Number.isFinite(s.start_index) &&
        Number.isFinite(s.end_index) &&
        s.end_index > s.start_index &&
        s.end_index <= workingPlain.length
      ) {
        const indexedSegment = workingPlain.slice(s.start_index, s.end_index);
        if (indexedSegment.trim().length > 0) {
          candidates.push(indexedSegment);
        }
      }

      if (original && !candidates.includes(original)) {
        candidates.push(original);
      }

      for (const candidate of candidates) {
        const { plain, html, changed } = applyReplacementWithHtml(workingPlain, workingHtml, candidate, corrected, approxIndex);
        if (changed) {
          workingPlain = plain;
          workingHtml = html;
          break;
        }
      }
    });

    setText(workingPlain);
    setEditorHTML(workingHtml);
    setHandledSuggestionIds((prev) => [
      ...prev,
      ...parsedSuggestions.map((s, index) => {
        const original = typeof s.original === 'string' ? s.original.trim() : '';
        const corrected = typeof s.corrected === 'string' ? s.corrected.trim() : '';
        return `suggestion-${index}-${original}-${corrected}`;
      }),
    ]);
    setDeepSuggestions([]);
    setInfoMessage('');
    isApplyingAllRef.current = false;
  }, [submission, text, editorHTML]);

  const filteredDrafts = useMemo(() => {
    if (!searchQuery.trim()) {
      return recentSubmissions;
    }
    const query = searchQuery.toLowerCase();
    return recentSubmissions.filter(
      (item) =>
        (item.name || 'Untitled Draft').toLowerCase().includes(query) ||
        (item.original_text || '').toLowerCase().includes(query)
    );
  }, [recentSubmissions, searchQuery]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8FAFC] via-white to-[#F1F5F9] text-[#0F172A] font-[var(--font-display)]">
      <AppHeader showAdmin={showAdmin} userEmail={userEmail} onLogout={handleLogout} />
      {mode === 'list' ? (
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-16 pt-32 sm:px-12 lg:px-16">
          <div className="flex flex-col gap-8">
            <div className="space-y-8">
              <div>
                <h1 className="text-4xl font-bold text-[#0F172A] mb-4">Your Workspace</h1>
                <p className="text-lg text-[#475569]">Manage your drafts and start new writing projects</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search drafts..."
                      className="w-full rounded-2xl border-2 border-[#E2E8F0] bg-white px-6 py-4 pl-12 text-base text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-4 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                    />
                    <svg
                      className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#94A3B8]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <button
                  onClick={handleNewDraft}
                  className="rounded-2xl bg-[#4F46E5] px-8 py-4 text-base font-semibold text-white shadow-lg hover:shadow-xl hover:bg-[#4338CA] transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  + New Draft
                </button>
              </div>

              {error && (
                <div className="rounded-2xl border-2 border-[#FCA5A5] bg-[#FEE2E2] px-6 py-4 text-sm text-[#991B1B]">
                  {error}
                </div>
              )}

              {infoMessage && (
                <div className="rounded-2xl border-2 border-[#A7F3D0] bg-[#ECFDF5] px-6 py-4 text-sm text-[#065F46]">
                  {infoMessage}
                </div>
              )}

              {filteredDrafts.length === 0 ? (
                <div className="rounded-3xl border-2 border-[#E2E8F0] bg-white p-12 text-center shadow-lg">
                  <svg
                    className="mx-auto h-16 w-16 text-[#94A3B8] mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-[#0F172A] mb-2">
                    {searchQuery
                      ? `No drafts found matching "${searchQuery}". Try a different search term or create a new draft.` 
                      : 'Your drafts will appear here once you begin writing. Click "New Draft" to get started.'}
                  </h3>
                  {!searchQuery && (
                    <button
                      onClick={handleNewDraft}
                      className="mt-6 rounded-2xl bg-[#4F46E5] px-8 py-4 text-base font-semibold text-white shadow-lg hover:shadow-xl hover:bg-[#4338CA] transition-all duration-200 inline-flex items-center gap-2"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Create Your First Draft
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredDrafts.map((item) => (
                    <div
                      key={item.id}
                      className="group rounded-3xl border-2 border-[#E2E8F0] bg-white overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-[#4F46E5]/10 transition-all duration-300 hover:-translate-y-2 hover:border-[#4F46E5] focus-within:ring-4 focus-within:ring-[#4F46E5]/20"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleOpenDraft(item);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            handleOpenDraft(item);
                          }
                        }}
                        className="p-6 cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <h3 className="text-xl font-bold text-[#0F172A] flex-1">
                            {item.name || 'Untitled Draft'}
                          </h3>
                        </div>
                        <p className="text-sm text-[#64748B] line-clamp-3 mb-4 min-h-[4.5rem]">
                          {item.original_text || 'No content'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="border-t border-[#E2E8F0] px-6 py-4 bg-[#F8FAFC] flex items-center justify-between">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleArchiveDraft(item.id);
                          }}
                          disabled={archivingId === item.id}
                          className="text-sm text-[#64748B] hover:text-[#4F46E5] font-medium transition-colors disabled:opacity-50"
                        >
                          {archivingId === item.id ? 'Archiving...' : 'Archive'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-screen flex-col bg-[#F5F6FA] overflow-hidden pt-24" data-testid="editor-view">
          <main className="w-full flex-1 overflow-hidden px-6 pb-8 sm:px-12">
            <div className="mx-auto flex h-full max-w-7xl flex-col gap-8">
              <div className="grid h-full gap-8 items-stretch auto-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
                <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-4 border-b border-[#E2E8F0] px-6 py-4">
                    <button
                      onClick={() => setMode('list')}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#4F46E5] transition-colors"
                      title="View all drafts"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to Drafts
                    </button>
                    <h1 className="text-lg font-semibold text-[#1E293B] flex-1 text-center">
                      {submission?.name || 'Untitled draft'}
                    </h1>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#10B981] font-medium">
                        ● Saved just now
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                    <div className="flex-1 min-h-[500px] overflow-auto px-8 py-6">
                      {mode === 'editor' ? (
                        <RichTextEditor
                          key={`editor-${submission?.id || 'new'}`}
                          value={editorHTML}
                          onChange={handleEditorChange}
                          onPlainTextChange={handleEditorPlainTextChange}
                          onPasteContent={handlePasteProofread}
                          placeholder="Write or paste your Tamil text here..."
                        />
                      ) : null}
                    </div>
                    <div className="border-t border-[#E2E8F0] px-8 py-3 bg-[#F8FAFC]">
                      <div className="flex items-center justify-between text-sm text-[#64748B]">
                        <span>{wordCount} words • {handledSuggestionIds.length} accepted</span>
                        <button
                          onClick={handleCheckWithGemini}
                          disabled={!text.trim() || geminiLoading || wordCount === 0}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {geminiLoading ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                              Check Grammar
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <AssistantPanel
                  realtimeSuggestions={realtimeSuggestions}
                  deepSuggestions={deepSuggestions}
                  loadingRealtime={realtimeLoading}
                  loadingDeep={geminiLoading}
                  onAcceptAll={handleAcceptAll}
                />
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
