import { Fragment, type ReactNode } from 'react';

/**
 * Minimal markdown renderer for assistant replies.
 *
 * XSS posture: this builds React elements and NEVER touches
 * `dangerouslySetInnerHTML`, so every piece of model output is escaped by React
 * as text. Raw HTML in a reply renders as visible characters rather than
 * markup. That is a stronger guarantee than sanitising an HTML string, and it
 * is why this exists instead of react-markdown + rehype-sanitize.
 *
 * Supported: headings, unordered/ordered lists, **bold**, *italic*, `code`,
 * [links](url) and bare URLs. Anything else falls through as plain text.
 */

/** Only http(s) links are rendered as anchors. Blocks javascript:, data:, vbscript:. */
function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw, 'https://www.prooftamil.com');
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function Anchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      // noopener defeats reverse-tabnabbing; noreferrer keeps the chat URL out
      // of the destination's referer log.
      rel="noopener noreferrer nofollow"
      className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
    >
      {children}
    </a>
  );
}

// Ordered by precedence — the alternation is scanned left to right per match.
const INLINE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(`[^`]+`)|(https?:\/\/[^\s<>()]+)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  INLINE.lastIndex = 0;

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-i${index++}`;
    const [token] = match;

    if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = linkMatch ? safeHref(linkMatch[2]) : null;
      // A rejected protocol degrades to the link's visible text — never a
      // clickable element, never silently dropped.
      nodes.push(
        href && linkMatch ? (
          <Anchor key={key} href={href}>
            {linkMatch[1]}
          </Anchor>
        ) : (
          <Fragment key={key}>{linkMatch ? linkMatch[1] : token}</Fragment>
        ),
      );
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-primary-soft px-1 py-0.5 text-[0.85em] text-primary">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const href = safeHref(token);
      nodes.push(
        href ? (
          <Anchor key={key} href={href}>
            {token}
          </Anchor>
        ) : (
          <Fragment key={key}>{token}</Fragment>
        ),
      );
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n');
        const key = `b${blockIndex}`;

        const heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
        if (heading && lines.length === 1) {
          return (
            <p key={key} className="mt-2 mb-1 font-semibold first:mt-0">
              {renderInline(heading[2], key)}
            </p>
          );
        }

        if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
          return (
            <ul key={key} className="my-1.5 list-disc space-y-1 pl-5 first:mt-0">
              {lines.map((line, i) => (
                <li key={`${key}-${i}`}>{renderInline(line.replace(/^\s*[-*•]\s+/, ''), `${key}-${i}`)}</li>
              ))}
            </ul>
          );
        }

        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
          return (
            <ol key={key} className="my-1.5 list-decimal space-y-1 pl-5 first:mt-0">
              {lines.map((line, i) => (
                <li key={`${key}-${i}`}>
                  {renderInline(line.replace(/^\s*\d+[.)]\s+/, ''), `${key}-${i}`)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={key} className="my-1.5 first:mt-0 last:mb-0">
            {lines.map((line, i) => (
              <Fragment key={`${key}-${i}`}>
                {i > 0 && <br />}
                {renderInline(line, `${key}-${i}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
