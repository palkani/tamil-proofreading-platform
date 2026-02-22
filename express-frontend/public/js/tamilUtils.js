// Tamil text processing utilities

// Count words in Tamil text.
// For Tamil text that has missing spaces (joined words like "வேண்டும்ஆன்மிக"),
// detects word boundaries inside each token using the pattern:
//   (virama ் or any vowel sign) followed by a pure Tamil vowel (அ–ஔ)
// This catches "வேண்டும்ஆன்மிக" (ம்+ஆ), "வினைஎன்னையே" (ை+எ), etc.
// without generating false positives for valid consonant clusters (ன்ம, க்க).
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  const tokens = trimmed.split(/\s+/).filter(w => w.length > 0);
  let count = tokens.length;

  // Detect intra-token Tamil word boundaries only for tokens that contain Tamil script
  const tamilRange = /[\u0B80-\u0BFF]/;
  // (virama U+0BCD, or vowel signs U+0BBE–U+0BCC) followed by a pure Tamil vowel (U+0B85–U+0B94)
  const joinBoundary = /[\u0BBE-\u0BCD][\u0B85-\u0B94]/g;
  for (const token of tokens) {
    if (tamilRange.test(token)) {
      const joins = (token.match(joinBoundary) || []).length;
      count += joins;
    }
  }
  return count;
}

// Extract plain text from HTML
function htmlToPlainText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

// Convert plain text to HTML with proper formatting
function plainTextToHtml(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>')
    .join('');
}

// Escape HTML special characters
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Find the nearest occurrence of a word in text
function findNearestOccurrence(text, searchWord, approxIndex) {
  if (!text || !searchWord) return null;
  
  const index = text.indexOf(searchWord);
  if (index === -1) return null;
  
  return { position: index, word: searchWord };
}

// Apply a text replacement
function applyReplacement(text, original, replacement, approxIndex = null) {
  if (!text || !original) return { text, changed: false };

  // Try start_index if provided
  if (typeof approxIndex === 'number' && approxIndex >= 0 && approxIndex <= text.length) {
    const candidate = text.slice(approxIndex, approxIndex + original.length);
    if (candidate === original) {
      const newText = text.slice(0, approxIndex) + replacement + text.slice(approxIndex + original.length);
      return { text: newText, changed: newText !== text };
    }
  }

  // Try exact match first
  const exactIdx = text.indexOf(original);
  if (exactIdx !== -1) {
    const newText = text.slice(0, exactIdx) + replacement + text.slice(exactIdx + original.length);
    return { text: newText, changed: newText !== text };
  }
  
  // Try finding similar words
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    if (words[i].includes(original) || original.includes(words[i])) {
      words[i] = replacement;
      return { text: words.join(' '), changed: true };
    }
  }
  
  return { text, changed: false };
}

// Basic Tamil text analysis for spelling/grammar
function analyzeText(text) {
  const issues = [];
  
  if (!text || text.trim().length === 0) {
    return issues;
  }
  
  // Check for repeated words
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1] && words[i].trim().length > 0) {
      issues.push({
        id: `repeat-${i}`,
        title: 'Repeated word detected',
        description: `The word "${words[i]}" appears twice in a row`,
        type: 'style',
        preview: `${words[i]} ${words[i]} → ${words[i]}`,
        fix: (text) => text.replace(`${words[i]} ${words[i]}`, words[i])
      });
    }
  }
  
  // Check for very long sentences (> 200 characters)
  const sentences = text.split(/[।.!?]/);
  sentences.forEach((sentence, idx) => {
    if (sentence.trim().length > 200) {
      issues.push({
        id: `long-sentence-${idx}`,
        title: 'Long sentence',
        description: 'This sentence is very long. Consider breaking it into smaller parts for better readability.',
        type: 'clarity',
        preview: sentence.trim().substring(0, 50) + '...'
      });
    }
  });
  
  return issues;
}

// Get autocomplete suggestions from dictionary
function getAutocompleteSuggestions(partialWord) {
  if (!partialWord || partialWord.length < 2) return [];
  
  return tamilDictionary
    .filter(word => word.startsWith(partialWord))
    .slice(0, 5);
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    countWords,
    htmlToPlainText,
    plainTextToHtml,
    escapeHtml,
    findNearestOccurrence,
    applyReplacement,
    analyzeText,
    getAutocompleteSuggestions
  };
}
