'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
  useId,
} from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export interface SuggestItem {
  word: string;
  text: string;
  score: number;
  type: 'dictionary' | 'transliteration' | 'fuzzy';
}

export interface SuggestResponse {
  success: boolean;
  input: string;
  suggestions: SuggestItem[];
  latency_ms?: number;
}

const DEBOUNCE_MS = 50;
const DEFAULT_LIMIT = 5;

async function fetchSuggestions(
  q: string,
  limit: number = DEFAULT_LIMIT
): Promise<SuggestItem[]> {
  if (!q.trim() || !API_BASE) return [];
  const url = `${API_BASE.replace(/\/$/, '')}/suggest?q=${encodeURIComponent(q.trim())}&limit=${limit}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return [];
  const data: SuggestResponse = await res.json();
  if (!data?.success || !Array.isArray(data.suggestions)) return [];
  return data.suggestions.map((s) => ({
    word: s.word ?? s.text ?? '',
    text: s.text ?? s.word ?? '',
    score: typeof s.score === 'number' ? s.score : 0,
    type: s.type ?? 'dictionary',
  })).filter((s) => s.word || s.text);
}

export interface TransliterationSuggestDropdownProps {
  /** Current input value (controlled). */
  value: string;
  /** Called when input changes. */
  onChange: (value: string) => void;
  /** Called when user selects a suggestion (e.g. to insert or replace). */
  onSelect?: (word: string) => void;
  /** Placeholder for the input. */
  placeholder?: string;
  /** Max suggestions to request. */
  limit?: number;
  /** Debounce delay in ms. */
  debounceMs?: number;
  /** Optional class for the wrapper. */
  className?: string;
  /** Optional class for the input. */
  inputClassName?: string;
  /** If true, use a textarea instead of input. */
  multiline?: boolean;
}

export default function TransliterationSuggestDropdown({
  value,
  onChange,
  onSelect,
  placeholder = 'Type in English (e.g. vanakkam) for Tamil suggestions...',
  limit = DEFAULT_LIMIT,
  debounceMs = DEBOUNCE_MS,
  className = '',
  inputClassName = '',
  multiline = false,
}: TransliterationSuggestDropdownProps) {
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const listId = useId();

  const fetchForQuery = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const list = await fetchSuggestions(q, limit);
        setSuggestions(list);
        setHighlightIndex(0);
        setOpen(list.length > 0);
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchForQuery(value);
    }, debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, debounceMs, fetchForQuery]);

  const select = useCallback(
    (item: SuggestItem) => {
      const word = item.word || item.text;
      if (word && onSelect) onSelect(word);
      setOpen(false);
      setSuggestions([]);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!open || suggestions.length === 0) {
        if (e.key === 'Escape') setOpen(false);
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((i) => (i + 1) % suggestions.length);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          select(suggestions[highlightIndex]);
          return;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          return;
        default:
          return;
      }
    },
    [open, suggestions, highlightIndex, select]
  );

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightIndex, open]);

  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div className={`relative ${className}`}>
      <InputComponent
        ref={inputRef as any}
        type={multiline ? undefined : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && suggestions[highlightIndex] ? `${listId}-${highlightIndex}` : undefined}
        className={`w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5] ${inputClassName}`}
      />
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg"
        >
          {suggestions.map((item, i) => {
            const word = item.word || item.text;
            const scorePct = Math.round((item.score ?? 0) * 100);
            const isActive = i === highlightIndex;
            return (
              <li
                key={`${word}-${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(item);
                }}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-left ${isActive ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'text-[#0F172A] hover:bg-[#F8FAFC]'}`}
              >
                <span className="font-medium">{word}</span>
                <span className="text-sm text-[#64748B]">
                  {scorePct}% {item.type !== 'dictionary' && `· ${item.type}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#64748B]">
          ...
        </span>
      )}
    </div>
  );
}
