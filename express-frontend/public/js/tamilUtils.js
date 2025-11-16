// Tamil text processing utilities

// Count words in Tamil text
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  
  // Split by whitespace and filter out empty strings
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  return words.length;
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
  
  // Try exact match first
  if (text.includes(original)) {
    const newText = text.replace(original, replacement);
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
