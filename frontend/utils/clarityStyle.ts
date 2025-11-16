'use client';

/**
 * Clarity and Style Analysis for Tamil Text
 * Provides suggestions for improving clarity, style, and readability
 */

export interface ClarityIssue {
  id: string;
  type: 'clarity' | 'style' | 'punctuation' | 'rewrite';
  severity: 'error' | 'warning' | 'suggestion';
  title: string;
  description: string;
  original: string;
  suggestion?: string;
  position: { start: number; end: number };
  context: string;
  reason: string;
}

/**
 * Punctuation marks in Tamil
 */
const tamilPunctuation = {
  period: ['\u0B82', '\u0B83', '.'],
  comma: [',', '\u0B80'],
  question: ['?', '\u0BF0'],
  exclamation: ['!', '\u0BF1'],
  semicolon: [';'],
  colon: [':'],
};

/**
 * Check punctuation usage
 */
const questionIndicators = [
  'எப்படி',
  'ஏன்',
  'எப்போது',
  'எங்கே',
  'எது',
  'எவர்',
  'யார்',
  'முடியுமா',
  'சரியா',
  'ஆமா',
];

const exclamationIndicators = ['அருமை', 'அற்புதம்', 'சிறப்பு', 'வாழ்த்துக்கள்', 'அடடா', 'அச்சோ'];

function pickSentenceEndingMark(sentence: string): string {
  const normalized = sentence.trim();
  const lower = normalized.toLowerCase();

  if (questionIndicators.some((word) => lower.endsWith(word))) {
    return '?';
  }

  if (exclamationIndicators.some((word) => lower.endsWith(word))) {
    return '!';
  }

  return '.';
}

function checkPunctuation(text: string): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  
  // Missing space after punctuation
  const missingSpacePattern = /([.!?\u0B82\u0B83,])([^\s\u0B80-\u0BFF])/g;
  let match;
  while ((match = missingSpacePattern.exec(text)) !== null) {
    issues.push({
      id: `punctuation-space-${match.index}`,
      type: 'punctuation',
      severity: 'warning',
      title: 'Missing space after punctuation',
      description: 'Add a space after punctuation marks for better readability',
      original: match[0],
      suggestion: match[1] + ' ' + match[2],
      position: { start: match.index, end: match.index + match[0].length },
      context: text.slice(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20)),
      reason: 'Tamil text should have spaces after punctuation marks',
    });
  }
  
  // Multiple consecutive punctuation
  const multiplePunctPattern = /([.!?\u0B82\u0B83]){2,}/g;
  while ((match = multiplePunctPattern.exec(text)) !== null) {
    issues.push({
      id: `punctuation-multiple-${match.index}`,
      type: 'punctuation',
      severity: 'suggestion',
      title: 'Multiple punctuation marks',
      description: 'Consider using a single punctuation mark for professional writing',
      original: match[0],
      suggestion: match[1],
      position: { start: match.index, end: match.index + match[0].length },
      context: text.slice(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20)),
      reason: 'Multiple punctuation marks reduce readability',
    });
  }
  
  // Missing punctuation at sentence end
  const sentencePattern = /([^.!?\u0B82\u0B83]+)([.!?\u0B82\u0B83])?/g;
  let sentenceMatch;
  while ((sentenceMatch = sentencePattern.exec(text)) !== null) {
    const rawSentence = sentenceMatch[1];
    const trailingMark = sentenceMatch[2];
    const trimmedSentence = rawSentence.trim();

    if (!trimmedSentence || trimmedSentence.length < 6) {
      continue;
    }

    if (trailingMark && trailingMark.trim()) {
      continue;
    }

    const leadingWhitespace = rawSentence.length - rawSentence.trimStart().length;
    const startIndex = sentenceMatch.index + leadingWhitespace;
    const endIndex = startIndex + trimmedSentence.length;
    const recommendedMark = pickSentenceEndingMark(trimmedSentence);
    const updatedSentence = `${trimmedSentence}${recommendedMark}`;

    issues.push({
      id: `punctuation-missing-${startIndex}`,
      type: 'punctuation',
      severity: 'suggestion',
      title: 'Add sentence-ending punctuation',
      description: 'Complete sentences should end with ., !, ?, or the Tamil sentence marker (।).',
      original: trimmedSentence,
      suggestion: updatedSentence,
      position: { start: startIndex, end: endIndex },
      context: trimmedSentence,
      reason: `The highlighted sentence stops without punctuation. Add "${recommendedMark}" (or another suitable mark) to finish the sentence.`,
    });
  }
  
  return issues;
}

/**
 * Check for clarity issues
 */
function checkClarity(text: string): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  
  // Very long sentences (potential clarity issue)
  const sentences = text.split(/([.!?\u0B82\u0B83]\s+)/);
  sentences.forEach((sentence, index) => {
    const trimmed = sentence.trim();
    if (trimmed.length > 150) {
      issues.push({
        id: `clarity-long-sentence-${index}`,
        type: 'clarity',
        severity: 'suggestion',
        title: 'Long sentence detected',
        description: 'Consider breaking this long sentence into shorter ones for better clarity',
        original: trimmed.slice(0, 50) + '...',
        suggestion: undefined,
        position: { start: text.indexOf(trimmed), end: text.indexOf(trimmed) + trimmed.length },
        context: trimmed.slice(0, 100),
        reason: 'Long sentences can reduce readability and clarity',
      });
    }
  });
  
  // Repeated words (potential clarity issue)
  const repeatedWordPattern = /\b([\u0B80-\u0BFF]+)\s+\1\s+\1/g;
  let match;
  while ((match = repeatedWordPattern.exec(text)) !== null) {
    issues.push({
      id: `clarity-repetition-${match.index}`,
      type: 'clarity',
      severity: 'warning',
      title: 'Repeated word detected',
      description: 'Repeated words may indicate unclear writing. Consider rephrasing.',
      original: match[0],
      suggestion: match[1] + ' (consider rephrasing)',
      position: { start: match.index, end: match.index + match[0].length },
      context: text.slice(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20)),
      reason: 'Excessive repetition can reduce clarity',
    });
  }
  
  // Vague pronouns or references
  const vaguePattern = /(?:அது|இது|அவை|இவை)\s+(?:செய்த|கொண்ட|பெற்ற)/g;
  while ((match = vaguePattern.exec(text)) !== null) {
    issues.push({
      id: `clarity-vague-${match.index}`,
      type: 'clarity',
      severity: 'suggestion',
      title: 'Vague reference detected',
      description: 'Consider using more specific nouns instead of pronouns for clarity',
      original: match[0],
      suggestion: '(specify the subject)',
      position: { start: match.index, end: match.index + match[0].length },
      context: text.slice(Math.max(0, match.index - 30), Math.min(text.length, match.index + match[0].length + 30)),
      reason: 'Vague pronouns can reduce clarity',
    });
  }
  
  return issues;
}

/**
 * Check for style issues
 */
function checkStyle(text: string): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  
  // Inconsistent spacing
  const inconsistentSpacePattern = /([\u0B80-\u0BFF])([.!?\u0B82\u0B83])([\u0B80-\u0BFF])/g;
  let match;
  while ((match = inconsistentSpacePattern.exec(text)) !== null) {
    issues.push({
      id: `style-spacing-${match.index}`,
      type: 'style',
      severity: 'suggestion',
      title: 'Inconsistent spacing',
      description: 'Add space after punctuation for consistent formatting',
      original: match[0],
      suggestion: match[1] + match[2] + ' ' + match[3],
      position: { start: match.index, end: match.index + match[0].length },
      context: text.slice(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20)),
      reason: 'Consistent spacing improves readability',
    });
  }
  
  // Overuse of certain words (style issue)
  const commonWords = ['மிக', 'மிகவும்', 'அதிகம்'];
  commonWords.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = text.match(regex);
    if (matches && matches.length > 3) {
      issues.push({
        id: `style-overuse-${word}`,
        type: 'style',
        severity: 'suggestion',
        title: `Overuse of "${word}"`,
        description: `Consider using synonyms or rephrasing to vary your vocabulary`,
        original: word,
        suggestion: '(use synonyms)',
        position: { start: 0, end: text.length },
        context: text,
        reason: 'Varied vocabulary improves writing style',
      });
    }
  });
  
  // Passive voice detection (style suggestion)
  const passivePattern = /(?:செய்யப்பட்ட|கொடுக்கப்பட்ட|பெறப்பட்ட)/g;
  if (passivePattern.test(text)) {
    issues.push({
      id: 'style-passive',
      type: 'style',
      severity: 'suggestion',
      title: 'Passive voice detected',
      description: 'Consider using active voice for more engaging writing',
      original: '(passive constructions)',
      suggestion: '(rewrite in active voice)',
      position: { start: 0, end: text.length },
      context: text,
      reason: 'Active voice is often clearer and more engaging',
    });
  }
  
  return issues;
}

/**
 * Generate sentence rewrite suggestions
 */
function generateRewriteSuggestions(text: string): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  
  // Complex sentences that could be simplified
  const sentences = text.split(/([.!?\u0B82\u0B83]\s+)/);
  sentences.forEach((sentence, index) => {
    const trimmed = sentence.trim();
    
    // Check for multiple clauses (potential rewrite candidate)
    const clauseCount = (trimmed.match(/(?:ஏனெனில்|ஆனால்|ஆகவே|எனினும்|எனவே)/g) || []).length;
    if (clauseCount > 2 && trimmed.length > 80) {
      issues.push({
        id: `rewrite-complex-${index}`,
        type: 'rewrite',
        severity: 'suggestion',
        title: 'Complex sentence - consider rewriting',
        description: 'This sentence has multiple clauses. Consider breaking it into simpler sentences.',
        original: trimmed.slice(0, 60) + '...',
        suggestion: 'Break into 2-3 simpler sentences',
        position: { start: text.indexOf(trimmed), end: text.indexOf(trimmed) + trimmed.length },
        context: trimmed,
        reason: 'Simpler sentences improve readability',
      });
    }
    
    // Awkward phrasing detection (basic)
    const awkwardPatterns = [
      /(?:மிகவும்|அதிகம்)\s+(?:மிகவும்|அதிகம்)/, // Redundant intensifiers
      /(?:என்று|என)\s+(?:என்று|என)/, // Repeated conjunctions
    ];
    
    awkwardPatterns.forEach((pattern, pIndex) => {
      if (pattern.test(trimmed)) {
        issues.push({
          id: `rewrite-awkward-${index}-${pIndex}`,
          type: 'rewrite',
          severity: 'suggestion',
          title: 'Awkward phrasing detected',
          description: 'Consider rephrasing for better flow and clarity',
          original: trimmed.slice(0, 50),
          suggestion: '(rephrase for clarity)',
          position: { start: text.indexOf(trimmed), end: text.indexOf(trimmed) + trimmed.length },
          context: trimmed,
          reason: 'Rephrasing can improve clarity and flow',
        });
      }
    });
  });
  
  return issues;
}

/**
 * Main analysis function for clarity, style, punctuation, and rewrite suggestions
 */
export function analyzeClarityStyle(text: string): ClarityIssue[] {
  if (!text || text.trim().length === 0) {
    return [];
  }
  
  const issues: ClarityIssue[] = [];
  
  // Check punctuation
  issues.push(...checkPunctuation(text));
  
  // Check clarity
  issues.push(...checkClarity(text));
  
  // Check style
  issues.push(...checkStyle(text));
  
  // Generate rewrite suggestions
  issues.push(...generateRewriteSuggestions(text));
  
  // Remove duplicates
  const uniqueIssues = issues.filter((issue, index, self) =>
    index === self.findIndex((i) => i.id === issue.id)
  );
  
  return uniqueIssues;
}

/**
 * Get explanation for clarity/style rules
 */
export function getClarityStyleExplanation(reason: string): string {
  const explanations: Record<string, string> = {
    'Tamil text should have spaces after punctuation marks': 'Proper spacing after punctuation improves readability and follows Tamil writing conventions.',
    'Multiple punctuation marks reduce readability': 'Using multiple punctuation marks (like !!! or ???) is informal and reduces readability.',
    'Complete sentences should have ending punctuation': 'Every complete sentence should end with appropriate punctuation (., !, ?, or Tamil punctuation marks).',
    'Long sentences can reduce readability and clarity': 'Breaking long sentences into shorter ones makes your writing easier to understand.',
    'Excessive repetition can reduce clarity': 'Repeating the same word multiple times can make writing unclear. Consider using synonyms or rephrasing.',
    'Vague pronouns can reduce clarity': 'Using specific nouns instead of vague pronouns (அது, இது) makes your writing clearer.',
    'Consistent spacing improves readability': 'Consistent spacing throughout your text creates a professional appearance.',
    'Varied vocabulary improves writing style': 'Using a variety of words instead of repeating the same ones makes your writing more engaging.',
    'Active voice is often clearer and more engaging': 'Active voice (subject does action) is usually clearer than passive voice (action is done to subject).',
    'Simpler sentences improve readability': 'Breaking complex sentences into simpler ones helps readers understand your message better.',
    'Rephrasing can improve clarity and flow': 'Rewording awkward phrases makes your writing flow more naturally.',
  };
  
  return explanations[reason] || reason;
}

