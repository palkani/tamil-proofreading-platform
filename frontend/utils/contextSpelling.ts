'use client';

/**
 * Context-aware spelling correction utility for Tamil text
 * Analyzes words in context to provide better spelling suggestions
 */

export interface ContextSpellingIssue {
  word: string;
  startIndex: number;
  endIndex: number;
  suggestions: string[];
  context: string; // Surrounding text for context
  reason: string;
  confidence: number; // 0-1, how confident we are this is an error
}

/**
 * Extract words with their positions and context
 */
function extractWordsWithContext(text: string, wordIndex: number, contextWindow: number = 2): {
  word: string;
  startIndex: number;
  endIndex: number;
  beforeContext: string[];
  afterContext: string[];
} | null {
  // Split text into words while preserving positions
  const words: Array<{ word: string; start: number; end: number }> = [];
  const wordRegex = /[\u0B80-\u0BFF]+/g;
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    words.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (wordIndex < 0 || wordIndex >= words.length) {
    return null;
  }

  const target = words[wordIndex];
  const beforeStart = Math.max(0, wordIndex - contextWindow);
  const afterEnd = Math.min(words.length, wordIndex + contextWindow + 1);

  return {
    word: target.word,
    startIndex: target.start,
    endIndex: target.end,
    beforeContext: words.slice(beforeStart, wordIndex).map((w) => w.word),
    afterContext: words.slice(wordIndex + 1, afterEnd).map((w) => w.word),
  };
}

/**
 * Common Tamil spelling patterns and corrections
 * This is a basic dictionary - in production, this would be more comprehensive
 */
const commonSpellingPatterns: Array<{
  pattern: RegExp;
  correction: string | ((context: string[]) => string);
  reason: string;
}> = [
  // Common vowel length errors
  {
    pattern: /^([\u0B95-\u0BB9])([\u0BBE-\u0BC2])([\u0B95-\u0BB9])$/,
    correction: (context) => {
      // Context-aware: check if this is a verb ending
      if (context.length > 0 && /[\u0BAE\u0BAF\u0BB0\u0BB1]/.test(context[context.length - 1])) {
        return ''; // Might need different vowel length
      }
      return '';
    },
    reason: 'Check vowel length in context',
  },
];

/**
 * Calculate similarity between two Tamil words
 * Uses Levenshtein-like distance for Tamil characters
 */
function wordSimilarity(word1: string, word2: string): number {
  if (word1 === word2) return 1.0;
  if (word1.length === 0 || word2.length === 0) return 0.0;

  // Simple character-based similarity
  const longer = word1.length > word2.length ? word1 : word2;
  const shorter = word1.length > word2.length ? word2 : word1;
  
  if (longer.length === 0) return 1.0;

  // Count matching characters in sequence
  let matches = 0;
  let shorterIdx = 0;
  
  for (let i = 0; i < longer.length && shorterIdx < shorter.length; i++) {
    if (longer[i] === shorter[shorterIdx]) {
      matches++;
      shorterIdx++;
    }
  }

  return matches / longer.length;
}

/**
 * Find potential spelling corrections based on context
 */
function findContextualCorrections(
  word: string,
  beforeContext: string[],
  afterContext: string[],
  dictionary: string[]
): Array<{ word: string; confidence: number; reason: string }> {
  const suggestions: Array<{ word: string; confidence: number; reason: string }> = [];

  // Check against dictionary with context awareness
  for (const dictWord of dictionary) {
    const similarity = wordSimilarity(word, dictWord);
    
    if (similarity > 0.6 && similarity < 1.0) {
      // Check if the dictionary word makes sense in context
      let contextScore = 0.5; // Base score
      
      // If surrounding words suggest a particular grammatical form
      if (afterContext.length > 0) {
        // Check if next word is a verb ending, noun case marker, etc.
        const nextWord = afterContext[0];
        // Simple heuristic: if next word starts with certain markers, adjust score
        if (/^[\u0B95\u0B9F\u0B9E\u0BA3\u0BA4\u0BAE]/.test(nextWord)) {
          contextScore += 0.2;
        }
      }

      const confidence = similarity * 0.7 + contextScore * 0.3;
      
      if (confidence > 0.65) {
        suggestions.push({
          word: dictWord,
          confidence,
          reason: similarity > 0.85 
            ? 'Likely spelling error' 
            : 'Possible spelling variation - check context',
        });
      }
    }
  }

  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/**
 * Analyze text for context-aware spelling issues
 * This is a client-side helper - the main corrections come from the LLM
 */
export function analyzeContextSpelling(
  text: string,
  dictionary: string[] = []
): ContextSpellingIssue[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const issues: ContextSpellingIssue[] = [];
  const wordRegex = /[\u0B80-\u0BFF]+/g;
  const words: Array<{ word: string; index: number }> = [];
  let match;
  let wordIndex = 0;

  // Extract all Tamil words
  while ((match = wordRegex.exec(text)) !== null) {
    words.push({
      word: match[0],
      index: wordIndex++,
    });
  }

  // Analyze each word in context
  for (let i = 0; i < words.length; i++) {
    const wordInfo = extractWordsWithContext(text, i, 2);
    if (!wordInfo) continue;

    // Only check if we have a dictionary to compare against
    if (dictionary.length > 0) {
      const corrections = findContextualCorrections(
        wordInfo.word,
        wordInfo.beforeContext,
        wordInfo.afterContext,
        dictionary
      );

      if (corrections.length > 0) {
        issues.push({
          word: wordInfo.word,
          startIndex: wordInfo.startIndex,
          endIndex: wordInfo.endIndex,
          suggestions: corrections.map((c) => c.word),
          context: [...wordInfo.beforeContext, wordInfo.word, ...wordInfo.afterContext].join(' '),
          reason: corrections[0].reason,
          confidence: corrections[0].confidence,
        });
      }
    }

    // Check for common patterns
    for (const pattern of commonSpellingPatterns) {
      if (pattern.pattern.test(wordInfo.word)) {
        const correction = typeof pattern.correction === 'function'
          ? pattern.correction([...wordInfo.beforeContext, ...wordInfo.afterContext])
          : pattern.correction;

        if (correction) {
          issues.push({
            word: wordInfo.word,
            startIndex: wordInfo.startIndex,
            endIndex: wordInfo.endIndex,
            suggestions: [correction],
            context: [...wordInfo.beforeContext, wordInfo.word, ...wordInfo.afterContext].join(' '),
            reason: pattern.reason,
            confidence: 0.7,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Get context window around a word for better understanding
 */
export function getContextWindow(
  text: string,
  wordStart: number,
  wordEnd: number,
  windowSize: number = 50
): { before: string; word: string; after: string } {
  const beforeStart = Math.max(0, wordStart - windowSize);
  const afterEnd = Math.min(text.length, wordEnd + windowSize);

  return {
    before: text.slice(beforeStart, wordStart),
    word: text.slice(wordStart, wordEnd),
    after: text.slice(wordEnd, afterEnd),
  };
}

