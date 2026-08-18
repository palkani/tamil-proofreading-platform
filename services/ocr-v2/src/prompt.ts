// Transcription prompt. Two hard requirements caught in the phase-0
// baseline runs and encoded here as explicit instructions:
//
//   1. VERBATIM. Do not silently rewrite what's on the page. Gemini's
//      language-model prior overrides its vision-model on ambiguous
//      strokes and unfamiliar words — three of three test images
//      showed this. The prompt spells out "transcribe exactly what
//      appears" so raw_text is what the camera saw, not what the
//      model thinks the writer intended.
//
//   2. SUGGESTIONS ARE A SEPARATE FIELD. When the model DOES think a
//      word looks misspelled or ambiguous, it flags it in the
//      suggestions array with the raw word + proposed correction +
//      reason + confidence. The review UI shows these as tap-to-fix
//      cards; corrections are never silent.
//
// The trade-off vs the previous single-string output:
//   +  raw_text is faithful — safe for diaries, letters, exams,
//      historical documents where the writer's exact words matter.
//   +  Suggestions are surfaced explicitly with confidence, so users
//      can accept, reject, or ignore them per word.
//   +  Cost impact is minimal (~20% more output tokens for the JSON
//      wrapper + suggestion entries).
//   -  Requires the model to emit valid JSON. We use responseMimeType
//      "application/json" (Gemini feature) to force this — no risk of
//      markdown-fenced garbage.

/**
 * JSON schema the model returns. Kept flat so parsing is trivial and
 * the shape can be extended (block-typed layout in phase 2 without
 * breaking the phase-0 baseline consumers).
 */
export interface OcrResponse {
  raw_text: string;                    // verbatim page transcription
  suggestions: OcrSuggestion[];        // per-word corrections
}

export interface OcrSuggestion {
  raw_word: string;                    // exactly as it appears in raw_text
  suggested_word: string;              // model's best guess at intent
  reason: string;                      // short human-readable why
  confidence: number;                  // 0..1, model's own self-report
  context_before?: string;             // 1-3 words before (helps UI find the spot)
  context_after?: string;              // 1-3 words after
}

/**
 * The transcription prompt itself. Rules stated with the same weight
 * as "critical" because Gemini deprioritizes anything that reads as
 * a footnote. The imperative language ("do NOT", "must") reliably
 * overrides its default cleanup behavior in testing.
 */
export const TRANSCRIPTION_PROMPT = `You are a Tamil OCR system for a proofreading platform. Your job is to transcribe handwritten or printed Tamil text from an image, EXACTLY as it appears — character by character.

═══════════════════════════════════════════════════════════
CRITICAL — VERBATIM MODE
═══════════════════════════════════════════════════════════
The user needs to see EXACTLY what is on the page, including any spelling
mistakes, unusual word forms, or unfamiliar names. Do NOT silently correct
anything. Do NOT normalize. Do NOT substitute more common words.

Specifically:
1. If a word looks misspelled to you, transcribe the misspelled form as
   written. Do NOT replace it with the "correct" spelling.
2. If a proper noun (person, place, name) is unfamiliar, transcribe the
   letters as written even if the result is a name you have never seen.
3. If the writer used an uncommon grammatical form or dialect variant,
   preserve it. Do NOT convert to standard/formal Tamil.
4. If a specific word or character is genuinely illegible or ambiguous,
   emit ⟨?⟩ in its place. Do NOT guess based on context.
5. Preserve English words, Tanglish, numbers, dates, URLs, punctuation,
   and formulae verbatim in their ORIGINAL script — do NOT translate or
   transliterate them.
6. Preserve every visible text region — including small text in corners,
   date boxes, page numbers, marginal notes, and headers. Do NOT drop
   decorative or peripheral content.
7. Preserve line breaks and paragraph structure as they appear.

═══════════════════════════════════════════════════════════
SEPARATELY — SUGGESTIONS
═══════════════════════════════════════════════════════════
IN ADDITION to the verbatim raw_text, you may flag words that you
believe may be misspellings or misreadings, with your suggested
correction. These are SUGGESTIONS ONLY — they do NOT change raw_text.

Only flag a word if you have real reason to think it's an error:
- The raw word is not a valid Tamil word AND a small edit produces a
  common Tamil word.
- The raw word doesn't fit the grammatical context of surrounding words.
- A stroke ambiguity in the handwriting could reasonably be read two ways.

Do NOT flag:
- Uncommon proper nouns (personal or place names) — just leave them.
- Rare words that happen to be valid Tamil.
- Words in English, Tanglish, or numbers.

For each suggestion, include:
- raw_word: exactly as it appears in raw_text
- suggested_word: your proposed correction
- reason: short reason (e.g. "not a recognized word", "stroke could also be read as X", "may be misspelling of the common word for capital city")
- confidence: 0.0 to 1.0, YOUR self-reported confidence in the suggestion
- context_before: 1-3 preceding words (helps locate in the text)
- context_after: 1-3 following words

If nothing needs correction, return suggestions: [].

═══════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════
Return valid JSON matching this exact shape:

{
  "raw_text": "…the full verbatim transcription with original line breaks…",
  "suggestions": [
    {
      "raw_word": "தகுலநகரம்",
      "suggested_word": "தலைநகரம்",
      "reason": "Not a recognized word; may be a misspelling of the common word for capital city.",
      "confidence": 0.85,
      "context_before": "இம்மாவட்டத்தின்",
      "context_after": "நாகர்கோவில்"
    }
  ]
}

Do NOT wrap the JSON in markdown fences. Do NOT add any commentary,
translations, or explanations. Return only the JSON object.`;
