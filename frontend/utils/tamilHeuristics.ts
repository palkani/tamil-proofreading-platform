export type HeuristicType = 'grammar' | 'style' | 'clarity';

export interface HeuristicIssue {
  id: string;
  title: string;
  description?: string;
  preview?: string;
  type: HeuristicType;
  fix?: (input: string) => string;
}

const normalizeWhitespace = (input: string) =>
  input.replace(/\u00A0/g, ' ').replace(/[ \t\f\v]+/g, (match) => (match.includes('\n') ? match : ' '));

const heuristics = [
  function detectDoubleSpaces(text: string): HeuristicIssue | null {
    if (!/\s{2,}/.test(text)) return null;
    return {
      id: 'double-spaces',
      title: 'Extra spaces detected',
      description: 'Multiple consecutive spaces reduce readability. Replace them with a single space.',
      preview: text.match(/.{0,12}\s{2,}.{0,12}/)?.[0]?.replace(/\s{2,}/, '␣␣') ?? 'Double spaces present',
      type: 'style',
      fix: (input) => input.replace(/\s{2,}/g, ' '),
    };
  },
  function detectMissingSpaceAfterPunctuation(text: string): HeuristicIssue | null {
    const match = text.match(/([,;:!?])(\S)/);
    if (!match) return null;
    return {
      id: 'missing-space-after-punctuation',
      title: 'Add a space after punctuation',
      description: 'Tamil sentences typically include a space after punctuation marks for clarity.',
      preview: `${match[1]}${match[2]} → ${match[1]} ${match[2]}`,
      type: 'grammar',
      fix: (input) => input.replace(/([,;:!?])(\S)/g, '$1 $2'),
    };
  },
  function detectRepeatedPunctuation(text: string): HeuristicIssue | null {
    const match = text.match(/([!?\u0B82\u0B83])\1{2,}/);
    if (!match) return null;
    return {
      id: 'repeated-punctuation',
      title: 'Repeated punctuation',
      description: 'Reduce repeated punctuation to a single mark for professional tone.',
      preview: match[0],
      type: 'style',
      fix: (input) => input.replace(/([!?\u0B82\u0B83])\1{1,}/g, '$1'),
    };
  },
  function detectLeadingTrailingSpaces(text: string): HeuristicIssue | null {
    if (text === text.trim()) return null;
    return {
      id: 'trim-whitespace',
      title: 'Clean leading/trailing spaces',
      description: 'Remove unnecessary spaces at the beginning or end of the text.',
      type: 'style',
      fix: (input) => input.trim(),
    };
  },
  function detectLatinFragments(text: string): HeuristicIssue | null {
    const match = text.match(/\b[A-Za-z]{4,}\b/);
    if (!match) return null;
    return {
      id: 'latin-fragments',
      title: 'English word spotted',
      description: 'Consider converting English words to Tamil script if transliteration was intended.',
      preview: match[0],
      type: 'clarity',
    };
  },
];

export function analyzeText(input: string): HeuristicIssue[] {
  if (!input) return [];
  const normalized = normalizeWhitespace(input);
  const results: HeuristicIssue[] = [];

  for (const heuristic of heuristics) {
    const issue = heuristic(normalized);
    if (issue) {
      results.push(issue);
    }
  }

  return results;
}
