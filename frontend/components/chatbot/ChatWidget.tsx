'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LeadCaptureCard } from './LeadCaptureCard';
import { Markdown } from './Markdown';
import { STARTERS, STRINGS, detectUiLang, type UiLang } from './strings';
import { useChat, type Message } from './useChat';

/**
 * Floating ProofTamil assistant.
 *
 * Mounted once in app/layout.tsx so it appears site-wide.
 */

const TAMIL = /[஀-௿]/;

/** Tamil needs its own font stack and looser leading; Latin does not. */
function scriptClass(text: string): string {
  return TAMIL.test(text) ? 'font-tamil' : '';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-6">
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
      <path
        d="m22 2-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2" role="status" aria-label={label}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function ChatWidget() {
  const {
    hydrated,
    sessionId,
    open,
    setOpen,
    messages,
    streaming,
    send,
    leadSubmitted,
    setLeadSubmitted,
  } = useChat();

  const [input, setInput] = useState('');
  const [uiLang, setUiLang] = useState<UiLang>('en');
  const [dismissedLead, setDismissedLead] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const strings = STRINGS[uiLang];

  useEffect(() => setUiLang(detectUiLang()), []);

  // Opening a panel with saved history must land on the newest message. The
  // near-bottom guard below would refuse to scroll here, because a restored
  // conversation starts at scrollTop 0 — i.e. as far from the bottom as
  // possible — leaving the visitor staring at the top of an old thread.
  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open]);

  // Follow the stream, but only when the reader is already near the bottom —
  // yanking the viewport away from someone scrolled up reading is worse than
  // missing the newest token.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom < 120) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (hydrated) launcherRef.current?.focus();
  }, [open, hydrated]);

  // Focus trap + Escape. Without the trap, Tab walks out of an open dialog into
  // the page behind it, which strands keyboard and screen-reader users.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [setOpen],
  );

  function submit(text: string) {
    if (!text.trim() || streaming) return;
    setInput('');
    void send(text);
  }

  /** The card belongs to the newest assistant turn only, and once per session. */
  const leadTarget = useMemo(() => {
    if (leadSubmitted || dismissedLead) return null;
    const last = messages[messages.length - 1];
    return last?.role === 'assistant' && last.leadCapture && !streaming ? last.id : null;
  }, [messages, leadSubmitted, dismissedLead, streaming]);

  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'user')?.content,
    [messages],
  );

  // Render nothing until localStorage has been read, so the open/closed state
  // does not flash the wrong way on load.
  if (!hydrated) return null;

  return (
    <div
      // env() keeps the launcher clear of the iOS home indicator and Android
      // gesture bar rather than sitting underneath them.
      className="fixed right-0 bottom-0 z-50 flex flex-col items-end gap-3 p-4"
      style={{
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={strings.title}
          onKeyDown={handleKeyDown}
          className="flex h-[min(34rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl motion-safe:animate-[fadeIn_150ms_ease-out]"
        >
          {/* ---------------------------------------------------------- header */}
          <header className="flex items-center gap-3 border-b border-line bg-primary px-4 py-3 text-white">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
              PT
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${scriptClass(strings.title)}`}>
                {strings.title}
              </p>
              <p className={`truncate text-xs text-white/80 ${scriptClass(strings.subtitle)}`}>
                {strings.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={strings.close}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <CloseIcon />
            </button>
          </header>

          {/* --------------------------------------------------------- messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain bg-canvas px-3.5 py-3"
          >
            <div
              className={`rounded-xl rounded-tl-sm bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm ${scriptClass(strings.greeting)}`}
            >
              {strings.greeting}
            </div>

            {messages.length === 0 && (
              <div className="mt-3 space-y-1.5">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.text}
                    type="button"
                    onClick={() => submit(starter.text)}
                    lang={starter.lang}
                    className={`block w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-left text-sm text-ink transition-colors hover:border-primary hover:bg-primary-soft ${
                      starter.lang === 'ta' ? 'font-tamil' : ''
                    }`}
                  >
                    {starter.text}
                  </button>
                ))}
              </div>
            )}

            {/* aria-live announces streamed replies without stealing focus. */}
            <div className="space-y-3 pt-3" aria-live="polite" aria-atomic="false">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  sourcesLabel={strings.sourcesLabel}
                  showLeadCard={leadTarget === message.id}
                  leadCard={
                    <LeadCaptureCard
                      strings={strings}
                      sessionId={sessionId}
                      context={lastUserMessage}
                      onSubmitted={() => setLeadSubmitted(true)}
                      onDismiss={() => setDismissedLead(true)}
                    />
                  }
                />
              ))}

              {streaming && messages[messages.length - 1]?.content === '' && (
                <TypingIndicator label={strings.thinking} />
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------ input */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
            className="flex items-end gap-2 border-t border-line bg-surface px-3 py-2.5"
          >
            <label htmlFor="prooftamil-chat-input" className="sr-only">
              {strings.inputPlaceholder}
            </label>
            <textarea
              id="prooftamil-chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a newline. Never hijack Enter
                // while an IME composition is open or Tamil/Tanglish input
                // gets committed half-typed.
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit(input);
                }
              }}
              placeholder={strings.inputPlaceholder}
              maxLength={2000}
              className={`max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 ${scriptClass(input)}`}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              aria-label={strings.send}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      )}

      {/* -------------------------------------------------------------- launcher */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? strings.launcherClose : strings.launcherOpen}
        aria-expanded={open}
        className="flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:bg-primary-hover motion-safe:hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- bubble */

function MessageBubble({
  message,
  sourcesLabel,
  showLeadCard,
  leadCard,
}: {
  message: Message;
  sourcesLabel: string;
  showLeadCard: boolean;
  leadCard: React.ReactNode;
}) {
  const isUser = message.role === 'user';

  // The assistant turn is inserted empty and filled by the stream. Rendering it
  // before the first token produces a blank bubble sitting above the typing
  // indicator — two placeholders for one pending reply.
  if (!isUser && !message.content && !message.sources?.length) return null;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className={`max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap text-white ${scriptClass(message.content)}`}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`max-w-[92%] rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm shadow-sm ${
          message.error ? 'bg-red-50 text-red-800' : 'bg-surface text-ink'
        } ${scriptClass(message.content)}`}
      >
        {message.content ? <Markdown text={message.content} /> : null}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-2.5 border-t border-line pt-2">
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
              {sourcesLabel}
            </p>
            <ul className="mt-1 space-y-0.5">
              {message.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs text-primary underline underline-offset-2 hover:text-primary-hover ${scriptClass(source.title)}`}
                  >
                    {source.title || source.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showLeadCard && leadCard}
    </div>
  );
}
