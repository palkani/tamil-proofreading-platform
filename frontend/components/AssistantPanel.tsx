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

  // Group suggestions by type
  const groupedRealtime = useMemo(() => {
    const groups: Record<SuggestionType, AssistantSuggestion[]> = {
      grammar: [],
      style: [],
      clarity: [],
      alternative: []
    };
    realtimeSuggestions.forEach((suggestion) => {
      groups[suggestion.type].push(suggestion);
    });
    return groups;
  }, [realtimeSuggestions]);

  const groupedDeep = useMemo(() => {
    const groups: Record<SuggestionType, AssistantSuggestion[]> = {
      grammar: [],
      style: [],
      clarity: [],
      alternative: []
    };
    deepSuggestions.forEach((suggestion) => {
      groups[suggestion.type].push(suggestion);
    });
    return groups;
  }, [deepSuggestions]);

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
    <aside className="flex h-full flex-col rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
      <div className="border-b border-[#E2E8F0] px-6 py-4 bg-white">
        {header || (
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#1E293B] flex items-center gap-2">
                <svg className="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI Assistant
              </h2>
              {totalSuggestions > 0 && (
                <p className="text-sm text-[#64748B] mt-1">
                  {totalSuggestions} suggestion{totalSuggestions === 1 ? '' : 's'} found
                </p>
              )}
            </div>
            {totalSuggestions > 0 && (
              <button
                type="button"
                disabled={acceptAllHandlers.length === 0}
                onClick={handleAcceptAll}
                className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Accept All
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
        {/* Realtime suggestions grouped by type */}
        {Object.entries(groupedRealtime).map(([type, suggestions]) => (
          suggestions.length > 0 && (
            <SuggestionSection
              key={`realtime-${type}`}
              title={type.charAt(0).toUpperCase() + type.slice(1)}
              emptyHint=""
              loading={false}
              suggestions={suggestions}
              hidden={false}
            />
          )
        ))}

        {/* Deep suggestions grouped by type */}
        {Object.entries(groupedDeep).map(([type, suggestions]) => (
          suggestions.length > 0 && (
            <SuggestionSection
              key={`deep-${type}`}
              title={type.charAt(0).toUpperCase() + type.slice(1)}
              emptyHint=""
              loading={false}
              suggestions={suggestions}
              hidden={false}
            />
          )
        ))}

        {/* Loading states */}
        {loadingRealtime && (
          <div className="flex items-center gap-2 text-sm text-[#64748B]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4F46E5] border-t-transparent"></div>
            <p>Analyzing…</p>
          </div>
        )}
        
        {loadingDeep && !loadingRealtime && (
          <div className="flex items-center gap-2 text-sm text-[#64748B]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4F46E5] border-t-transparent"></div>
            <p>Deep analysis…</p>
          </div>
        )}

        {!loadingRealtime && !loadingDeep && totalSuggestions === 0 && (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-6 py-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#4F46E5]/10 mb-3">
              <svg className="w-6 h-6 text-[#4F46E5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-sm text-[#64748B]">No AI suggestions right now. Paste or edit text to see recommendations.</p>
          </div>
        )}
      </div>

      {footer && (
        <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-6 py-3 text-xs text-[#64748B]">
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
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[#EF4444]" aria-hidden />
        <h3 className="text-sm font-semibold text-[#1E293B]">{title}</h3>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[#64748B]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4F46E5] border-t-transparent"></div>
          <p>Analyzing…</p>
        </div>
      )}

      {!loading && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
      )}
    </section>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AssistantSuggestion }) {
  // Parse preview to extract original and correction
  const previewMatch = suggestion.preview?.match(/^(.+?)\s*→\s*(.+)$/);
  const originalText = suggestion.sourceText || (previewMatch ? previewMatch[1].trim() : '');
  const correctionText = previewMatch ? previewMatch[2].trim() : (suggestion.preview || '');
  const hasCorrection = !!correctionText && originalText !== correctionText;

  return (
    <article className="rounded-lg border border-[#E2E8F0] bg-white p-4 space-y-3 hover:border-[#CBD5E1] transition-colors">
      {originalText && (
        <div>
          <p className="text-xs font-medium text-[#64748B] mb-1">Original:</p>
          <div className="rounded-md bg-[#FEF2F2] border border-[#FCA5A5] px-3 py-2">
            <p className="text-sm text-[#1E293B] leading-relaxed">{originalText}</p>
          </div>
        </div>
      )}
      
      {hasCorrection && (
        <div>
          <p className="text-xs font-medium text-[#64748B] mb-1">Suggestion:</p>
          <div className="rounded-md bg-[#F0FDF4] border border-[#86EFAC] px-3 py-2">
            <p className="text-sm text-[#1E293B] leading-relaxed">{correctionText}</p>
          </div>
        </div>
      )}

      {suggestion.description && (
        <div>
          <p className="text-xs font-medium text-[#64748B] mb-1">Reason:</p>
          <p className="text-sm text-[#475569] leading-relaxed">{suggestion.description}</p>
        </div>
      )}

      {(suggestion.onApply || suggestion.onIgnore) && (
        <div className="flex items-center gap-2 pt-1">
          {suggestion.onApply && (
            <button
              type="button"
              onClick={suggestion.onApply}
              className="flex-1 rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] transition-colors"
            >
              Accept
            </button>
          )}
          {suggestion.onIgnore && (
            <button
              type="button"
              onClick={suggestion.onIgnore}
              className="flex-1 rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#64748B] hover:border-[#CBD5E1] hover:text-[#475569] transition-colors"
            >
              Ignore
            </button>
          )}
        </div>
      )}
    </article>
  );
}
