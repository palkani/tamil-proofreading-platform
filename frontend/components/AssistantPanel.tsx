'use client';

import { ReactNode, useMemo } from 'react';
import type { Suggestion } from '@/types';

type SuggestionType = 'grammar' | 'style' | 'clarity' | 'alternative';

export interface AssistantSuggestion {
  id: string;
  title: string;
  description?: string;
  type: SuggestionType;
  preview?: string;
  suggestion?: Suggestion;
  onApply?: () => void;
  onIgnore?: () => void;
  sourceText?: string;
  range?: { start: number; end: number };
}

interface AssistantPanelProps {
  realtimeSuggestions?: AssistantSuggestion[];
  deepSuggestions?: AssistantSuggestion[];
  header?: ReactNode;
  footer?: ReactNode;
  loadingRealtime?: boolean;
  loadingDeep?: boolean;
  onAcceptAll?: (suggestions: AssistantSuggestion[]) => void;
}

const typeStyles: Record<SuggestionType, { badge: string; indicator: string; errorColor: string; correctionBg: string }> = {
  grammar: { 
    badge: 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20', 
    indicator: 'bg-[#4F46E5]',
    errorColor: 'text-[#EF4444]',
    correctionBg: 'bg-[#4F46E5] text-white'
  },
  style: { 
    badge: 'bg-[#0EA5E9]/10 text-[#0EA5E9] border border-[#0EA5E9]/20', 
    indicator: 'bg-[#0EA5E9]',
    errorColor: 'text-[#0EA5E9]',
    correctionBg: 'bg-[#0EA5E9] text-white'
  },
  clarity: { 
    badge: 'bg-[#14B8A6]/10 text-[#14B8A6] border border-[#14B8A6]/20', 
    indicator: 'bg-[#14B8A6]',
    errorColor: 'text-[#14B8A6]',
    correctionBg: 'bg-[#14B8A6] text-white'
  },
  alternative: { 
    badge: 'bg-[#4F46E5]/10 text-[#4F46E5] border border-[#4F46E5]/20', 
    indicator: 'bg-[#4F46E5]',
    errorColor: 'text-[#4F46E5]',
    correctionBg: 'bg-[#4F46E5] text-white'
  },
};

export default function AssistantPanel({
  realtimeSuggestions = [],
  deepSuggestions = [],
  header,
  footer,
  loadingRealtime = false,
  loadingDeep = false,
  onAcceptAll,
}: AssistantPanelProps) {
  const totalSuggestions = realtimeSuggestions.length + deepSuggestions.length;
  const hasRealtime = realtimeSuggestions.length > 0;
  const hasDeep = deepSuggestions.length > 0;

  const acceptAllHandlers = useMemo(
    () => [
      ...realtimeSuggestions.filter((item) => item.onApply).map((item) => item.onApply!),
      ...deepSuggestions.filter((item) => item.onApply).map((item) => item.onApply!),
    ],
    [realtimeSuggestions, deepSuggestions]
  );

  const handleAcceptAll = () => {
    // Collect all suggestions with their metadata
    const allSuggestions = [
      ...realtimeSuggestions.filter((item) => item.onApply),
      ...deepSuggestions.filter((item) => item.onApply),
    ];
    
    if (allSuggestions.length === 0) return;
    
    // If custom batch handler is provided, use it
    if (onAcceptAll) {
      onAcceptAll(allSuggestions);
      return;
    }
    
    // Fallback: apply sequentially in reverse order
    const sortedSuggestions = allSuggestions.sort((a, b) => {
      const aMatches = a.id.match(/(?:-|^)(\d+)(?:-|$)/g);
      const bMatches = b.id.match(/(?:-|^)(\d+)(?:-|$)/g);
      
      if (aMatches && aMatches.length > 0 && bMatches && bMatches.length > 0) {
        const aPos = parseInt(aMatches[0].replace(/-/g, ''), 10);
        const bPos = parseInt(bMatches[0].replace(/-/g, ''), 10);
        return bPos - aPos;
      }
      return 0;
    });
    
    const appliedIds = new Set<string>();
    
    sortedSuggestions.forEach((suggestion, index) => {
      setTimeout(() => {
        if (appliedIds.has(suggestion.id)) {
          return;
        }
        
        try {
          suggestion.onApply?.();
          appliedIds.add(suggestion.id);
        } catch (error) {
          console.error('Failed to apply suggestion', error);
        }
      }, index * 150);
    });
  };

  return (
    <aside className="flex h-full flex-col rounded-[24px] border border-[#E2E8F0] bg-white shadow-xl overflow-hidden">
      <div className="border-b border-[#E2E8F0] px-6 py-5 bg-[#F8FAFC]">
        {header || (
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#0F172A] mb-1">AI Assistant</h2>
              <p className="text-xs text-[#475569] font-medium">
                {loadingRealtime || loadingDeep
                  ? 'Analyzing your draft…'
                  : totalSuggestions === 0
                  ? 'No issues detected right now.'
                  : `${totalSuggestions} suggestion${totalSuggestions === 1 ? '' : 's'} ready.`}
              </p>
            </div>
            <button
              type="button"
              disabled={acceptAllHandlers.length === 0}
              onClick={handleAcceptAll}
              className="rounded-full bg-[#4F46E5] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-[#4F46E5]/30 hover:shadow-xl hover:shadow-[#4F46E5]/40 hover:scale-105 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              Accept All
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 text-sm">
        <SuggestionSection
          title="Live suggestions"
          emptyHint="Keep typing—real-time tips appear here."
          loading={loadingRealtime}
          suggestions={realtimeSuggestions}
          hidden={!hasRealtime && !loadingRealtime}
        />

        <SuggestionSection
          title="Deep rewrites"
          emptyHint="Submit your draft to receive rewrite options."
          loading={loadingDeep}
          suggestions={deepSuggestions}
          hidden={!hasDeep && !loadingDeep}
        />

        {!loadingRealtime && !loadingDeep && totalSuggestions === 0 && (
          <div className="rounded-[24px] border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-6 py-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-[20px] bg-[#4F46E5]/10 mb-4">
              <svg className="w-6 h-6 text-[#4F46E5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-sm text-[#475569] font-medium">No AI suggestions right now. Paste or edit text to see recommendations.</p>
          </div>
        )}
      </div>

      {footer && (
        <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4 text-xs text-[#475569]">
          {footer}
        </div>
      )}
    </aside>
  );
}

interface SuggestionSectionProps {
  title: string;
  emptyHint: string;
  loading: boolean;
  suggestions: AssistantSuggestion[];
  hidden?: boolean;
}

function SuggestionSection({ title, emptyHint, loading, suggestions, hidden = false }: SuggestionSectionProps) {
  if (hidden) return null;

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#4F46E5] shadow-md" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5]">{title}</h3>
      </header>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-[#475569]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#4F46E5] border-t-transparent"></div>
          <p className="font-medium">Analyzing…</p>
        </div>
      )}

      {!loading && suggestions.length === 0 ? (
        <p className="text-xs text-[#94A3B8] font-medium pl-7">{emptyHint}</p>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
      )}
    </section>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AssistantSuggestion }) {
  const style = typeStyles[suggestion.type] ?? typeStyles.grammar;
  
  // Parse preview to extract original and correction
  // Format: "original text → corrected text" or just "text"
  const previewMatch = suggestion.preview?.match(/^(.+?)\s*→\s*(.+)$/);
  const originalText = previewMatch ? previewMatch[1].trim() : (suggestion.preview || suggestion.title);
  const correctionText = previewMatch ? previewMatch[2].trim() : null;
  const hasCorrection = !!correctionText;

  // For grammar suggestions, extract the error word
  // The preview format is typically "original → corrected" where original might be a word or sentence
  // We need to identify what part is the error - typically it's the last word or a specific word
  // For now, we'll show the full original text and highlight differences
  const getErrorWord = (original: string, corrected: string): string => {
    // Try to find the differing word - common case: last word differs
    const originalWords = original.trim().split(/\s+/);
    const correctedWords = corrected.trim().split(/\s+/);
    
    // If single word, return it
    if (originalWords.length === 1 && correctedWords.length === 1) {
      return originalWords[0];
    }
    
    // Find the last differing word
    for (let i = originalWords.length - 1; i >= 0; i--) {
      if (originalWords[i] !== correctedWords[i]) {
        return originalWords[i];
      }
    }
    
    // Fallback: return last word
    return originalWords[originalWords.length - 1] || '';
  };

  const errorWord = hasCorrection ? getErrorWord(originalText, correctionText) : '';
  const errorIndex = errorWord ? originalText.indexOf(errorWord) : -1;
  const textParts = errorIndex >= 0 ? {
    before: originalText.slice(0, errorIndex),
    error: errorWord,
    after: originalText.slice(errorIndex + errorWord.length)
  } : { before: originalText, error: '', after: '' };

  if (suggestion.type === 'grammar') {
    return (
      <article className="rounded-[28px] border border-[#E2E8F0] bg-white shadow-lg p-5 space-y-4">
        <header className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" aria-hidden />
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#EF4444]">Grammar</h3>
        </header>
        {hasCorrection && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] mb-1">Original</p>
              <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-base font-semibold text-[#B91C1C]">
                {originalText}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] mb-1">Suggestion</p>
              <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-base font-semibold text-[#15803D]">
                {correctionText}
              </div>
            </div>
          </div>
        )}
        {suggestion.description && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] mb-1">Reason</p>
            <p className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 text-sm text-[#475569] leading-relaxed">
              {suggestion.description}
            </p>
          </div>
        )}
        {(suggestion.onApply || suggestion.onIgnore) && (
          <div className="flex items-center gap-3 pt-2">
            {suggestion.onApply && (
              <button
                type="button"
                onClick={suggestion.onApply}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-[#4F46E5] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-[#4F46E5]/30 transition-all hover:shadow-xl hover:scale-105"
              >
                Accept
              </button>
            )}
            {suggestion.onIgnore && (
              <button
                type="button"
                onClick={suggestion.onIgnore}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-[#E2E8F0] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#475569] transition-all hover:border-[#4F46E5] hover:text-[#4F46E5]"
              >
                Ignore
              </button>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="space-y-3">
      {originalText && (
        <div className="bg-white rounded-[20px] border border-[#E2E8F0] p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-[12px] bg-[#4F46E5]/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#4F46E5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#0F172A] leading-relaxed">
                {textParts.before}
                {textParts.error && (
                  <span className="bg-[#EF4444]/20 text-[#EF4444] px-1 rounded border-b-2 border-dotted border-[#EF4444]">
                    {textParts.error}
                  </span>
                )}
                {textParts.after}
              </p>
            </div>
          </div>
        </div>
      )}

      <article className="bg-white rounded-[24px] border-2 border-[#4F46E5] p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <span className={`h-2.5 w-2.5 rounded-full ${style.indicator}`} aria-hidden />
          <span className="text-xs font-semibold text-[#0F172A] uppercase tracking-wide">
            {suggestion.type}
          </span>
        </div>

        <div className="space-y-4">
          {hasCorrection && (
            <div className="space-y-2">
              <p className="text-sm text-[#0F172A] leading-relaxed">
                {textParts.before}
                {textParts.error && (
                  <>
                    <span className={`${style.errorColor} font-semibold`}>
                      {textParts.error}
                    </span>
                    <span className={`${style.correctionBg} px-2 py-0.5 rounded-[8px] ml-1 font-semibold`}>
                      {correctionText}
                    </span>
                  </>
                )}
                {textParts.after}
              </p>
            </div>
          )}

          {!hasCorrection && suggestion.preview && (
            <p className="text-sm text-[#0F172A] leading-relaxed">{suggestion.preview}</p>
          )}

          {suggestion.description && (
            <p className="text-xs text-[#475569] leading-relaxed">{suggestion.description}</p>
          )}

          {(suggestion.onApply || suggestion.onIgnore) && (
            <div className="flex items-center gap-3 pt-2">
              {suggestion.onApply && (
                <button
                  type="button"
                  onClick={suggestion.onApply}
                  className="rounded-[12px] bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:bg-[#4338CA] transition-all duration-200"
                >
                  Apply suggestion
                </button>
              )}
              {suggestion.onIgnore && (
                <button
                  type="button"
                  onClick={suggestion.onIgnore}
                  className="text-sm text-[#94A3B8] hover:text-[#475569] font-medium transition-colors duration-200"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
