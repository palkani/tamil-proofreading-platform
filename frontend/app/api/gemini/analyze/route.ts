import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

type GeminiGenerateContentResult = {
  response?: {
    text?: () => string;
  };
  text?: string;
};

type GeminiRawSuggestion = {
  type?: string;
  severity?: string;
  title?: string;
  description?: string;
  original?: string;
  suggestion?: string;
  confidence?: number;
};

const extractResponseText = (result: GeminiGenerateContentResult): string => {
  if (typeof result.response?.text === 'function') {
    return result.response.text() ?? '';
  }
  return result.text ?? '';
};

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return NextResponse.json(
        { error: 'Invalid text provided' },
        { status: 400 }
      );
    }

    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Gemini API key not found');
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert Tamil language proofreader and grammar checker. Analyze the following Tamil text and provide suggestions for improvements.

Focus on:
1. Grammar errors (subject-verb agreement, case markers, verb conjugation)
2. Style improvements (clarity, sentence structure, word choice)
3. Alternative word suggestions (better or more appropriate words)
4. Punctuation and formatting issues

Return your analysis as a JSON array of suggestions. Each suggestion should have:
- type: "grammar" | "style" | "alternative" | "clarity"
- severity: "error" | "warning" | "suggestion"
- title: Brief title of the issue
- description: Detailed explanation
- original: The text that needs improvement
- suggestion: The improved version
- confidence: Number between 0-1 indicating confidence level

Tamil text to analyze:
${text}

Return ONLY the JSON array, no other text. If no issues found, return empty array [].`;

    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });

    let responseText = extractResponseText(result as GeminiGenerateContentResult);
    if (!responseText) {
      try {
        responseText = JSON.stringify(result);
      } catch (err) {
        console.warn('Failed to serialize Gemini response:', err);
      }
    }

    if (!responseText) {
      console.warn('Empty response from Gemini');
      return NextResponse.json({ suggestions: [], error: 'Empty response from AI' });
    }
    
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in Gemini response:', responseText.substring(0, 200));
      return NextResponse.json({ 
        suggestions: [], 
        error: 'Invalid response format from AI',
        rawResponse: responseText.substring(0, 100)
      });
    }
    
    let parsedSuggestions: unknown;
    try {
      parsedSuggestions = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON response:', parseError);
      return NextResponse.json({ 
        suggestions: [], 
        error: 'Failed to parse AI response'
      });
    }

    if (!Array.isArray(parsedSuggestions)) {
      console.warn('Gemini response was not an array:', parsedSuggestions);
      return NextResponse.json({
        suggestions: [],
        error: 'Invalid response format from AI',
      });
    }

    const suggestions = parsedSuggestions as GeminiRawSuggestion[];
    const formattedSuggestions = suggestions.map((suggestion, index) => ({
      id: `gemini-${Date.now()}-${index}`,
      type: suggestion.type || 'style',
      severity: suggestion.severity || 'suggestion',
      title: suggestion.title || 'Improvement suggestion',
      description: suggestion.description || '',
      original: suggestion.original || '',
      suggestion: suggestion.suggestion || '',
      confidence: typeof suggestion.confidence === 'number' ? suggestion.confidence : 0.7,
    }));
    
    return NextResponse.json({ suggestions: formattedSuggestions });
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze text' },
      { status: 500 }
    );
  }
}
