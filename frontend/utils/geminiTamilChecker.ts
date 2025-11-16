'use client';

export interface AISuggestion {
  id: string;
  type: 'grammar' | 'style' | 'alternative' | 'clarity';
  severity: 'error' | 'warning' | 'suggestion';
  title: string;
  description: string;
  original: string;
  suggestion: string;
  position?: { start: number; end: number };
  confidence: number;
}

export async function analyzeWithGemini(text: string): Promise<AISuggestion[]> {
  if (!text || text.trim().length < 10) {
    return [];
  }
  
  try {
    const response = await fetch('/api/gemini/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Gemini API error:', error);
      return [];
    }
    
    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    console.error('Error analyzing with Gemini:', error);
    return [];
  }
}

export async function getWordAlternatives(word: string, context: string): Promise<string[]> {
  if (!word || word.trim().length === 0) {
    return [];
  }
  
  try {
    const response = await fetch('/api/gemini/alternatives', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ word, context }),
    });
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.alternatives || [];
  } catch (error) {
    console.error('Error getting word alternatives:', error);
    return [];
  }
}

export async function checkGrammarSegment(text: string, maxLength: number = 500): Promise<AISuggestion[]> {
  if (text.length <= maxLength) {
    return analyzeWithGemini(text);
  }
  
  const sentences = text.split(/[.!?।\n]+/).filter(s => s.trim().length > 0);
  let currentChunk = '';
  const chunks: string[] = [];
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  const allSuggestions: AISuggestion[] = [];
  
  for (const chunk of chunks.slice(0, 5)) {
    const suggestions = await analyzeWithGemini(chunk);
    allSuggestions.push(...suggestions);
  }
  
  return allSuggestions;
}
