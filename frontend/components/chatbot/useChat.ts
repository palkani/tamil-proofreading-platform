'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Versioned so a future format change can be detected rather than crash on load. */
const STORAGE_KEY = 'prooftamil.chatbot.v1';

export interface Source {
  url: string;
  title: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  /** Set on the assistant turn that should render the email-capture card. */
  leadCapture?: boolean;
  error?: boolean;
}

interface Persisted {
  sessionId: string;
  open: boolean;
  messages: Message[];
  leadSubmitted: boolean;
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function load(): Persisted {
  const fresh: Persisted = { sessionId: newId(), open: false, messages: [], leadSubmitted: false };
  if (typeof window === 'undefined') return fresh;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;

    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : fresh.sessionId,
      open: parsed.open === true,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      leadSubmitted: parsed.leadSubmitted === true,
    };
  } catch {
    // Corrupt or unreadable storage (private mode, quota, hand-edited value)
    // must not take the widget down — start clean instead.
    return fresh;
  }
}

export function useChat() {
  // Start from the SSR-safe default and hydrate in an effect: reading
  // localStorage during render would produce a server/client mismatch.
  const [hydrated, setHydrated] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const state = load();
    setSessionId(state.sessionId);
    setOpen(state.open);
    setMessages(state.messages);
    setLeadSubmitted(state.leadSubmitted);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sessionId, open, messages, leadSubmitted } satisfies Persisted),
      );
    } catch {
      // Quota or private-browsing refusal — the conversation simply will not
      // survive a reload. Not worth surfacing to the visitor.
    }
  }, [hydrated, sessionId, open, messages, leadSubmitted]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;

      const userMessage: Message = { id: newId(), role: 'user', content: question };
      const assistantId = newId();

      // Snapshot the history that goes to the API before the optimistic update,
      // so the in-flight assistant placeholder is never sent back as context.
      const history = [...messages, userMessage].map(({ role, content }) => ({ role, content }));

      setMessages((current) => [
        ...current,
        userMessage,
        { id: assistantId, role: 'assistant', content: '' },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (changes: Partial<Message>) =>
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, ...changes } : message)),
        );

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId,
            messages: history,
            pageUrl: window.location.href,
            locale: navigator.language,
          }),
        });

        if (!response.body) throw new Error('No response body');

        // `stream: true` is essential: a Tamil grapheme spans up to 3 UTF-8
        // bytes and can land across a chunk boundary. Decoding each chunk
        // independently would emit replacement characters mid-word.
        const decoder = new TextDecoder('utf-8');
        const reader = response.body.getReader();
        let buffer = '';
        let answer = '';

        const handleLine = (raw: string) => {
          const trimmed = raw.trim();
          if (!trimmed) return;

          let event: { type?: string; value?: string; leadCapture?: boolean; sources?: Source[] };
          try {
            event = JSON.parse(trimmed);
          } catch {
            return; // Ignore anything that is not a complete JSON object.
          }

          if (event.type === 'token' && typeof event.value === 'string') {
            answer += event.value;
            patch({ content: answer });
          } else if (event.type === 'meta') {
            patch({ sources: event.sources ?? [], leadCapture: event.leadCapture === true });
          } else if (event.type === 'error') {
            patch({ content: event.value ?? 'Something went wrong.', error: true });
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Keep the trailing fragment — it is an incomplete line until the
          // next chunk arrives.
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          lines.forEach(handleLine);
        }

        buffer += decoder.decode();
        if (buffer.trim()) handleLine(buffer);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          patch({ content: 'Sorry — I could not reach the assistant. Please try again.', error: true });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, sessionId, streaming],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  return {
    hydrated,
    sessionId,
    open,
    setOpen,
    messages,
    streaming,
    send,
    reset,
    leadSubmitted,
    setLeadSubmitted,
  };
}
