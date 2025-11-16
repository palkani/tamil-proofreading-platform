'use client';

/**
 * Advanced Tamil Grammar Analysis
 * Detects grammar issues including case markers, verb conjugations, sentence structure, etc.
 */

export interface GrammarIssue {
  id: string;
  type: 'case' | 'verb' | 'agreement' | 'word_order' | 'particle' | 'sentence_structure' | 'tense' | 'number';
  severity: 'error' | 'warning' | 'suggestion';
  title: string;
  description: string;
  original: string;
  corrected: string;
  position: { start: number; end: number };
  context: string;
  rule: string; // Grammar rule being violated
}

/**
 * Tamil case markers (வேற்றுமை உருபுகள்)
 */
const caseMarkers = {
  nominative: '', // எழுவாய்
  accusative: ['ஐ', 'ஆய்'], // செயப்படுபொருள்
  instrumental: ['ஆல்', 'ஓடு'], // கருவி
  dative: ['க்கு', 'க்காக'], // பெறுதல்
  ablative: ['இலிருந்து', 'ஆல்'], // பிரிதல்
  genitive: ['இன்', 'உடைய'], // உடைமை
  locative: ['இல்', 'ஆக'], // இடம்
  vocative: ['ஏ', 'ஓ'], // விளி
};

/**
 * Common verb endings for different tenses
 */
const verbEndings = {
  present: ['கிறான்', 'கிறாள்', 'கிறது', 'கிறார்கள்'],
  past: ['த்தான்', 'த்தாள்', 'த்தது', 'த்தார்கள்'],
  future: ['ப்பான்', 'ப்பாள்', 'ப்பது', 'ப்பார்கள்'],
  perfect: ['யிருக்கிறான்', 'யிருக்கிறாள்', 'யிருக்கிறது'],
};

/**
 * Subject-verb agreement patterns
 */
const agreementPatterns = {
  singular: {
    masculine: ['ன்', 'ான்'],
    feminine: ['ள்', 'ாள்'],
    neuter: ['து', 'ம்'],
  },
  plural: {
    masculine: ['ர்கள்', 'ர்கள்'],
    feminine: ['ர்கள்', 'ர்கள்'],
    neuter: ['ங்கள்', 'ங்கள்'],
  },
};

/**
 * Common grammar error patterns
 */
const grammarPatterns: Array<{
  pattern: RegExp;
  type: GrammarIssue['type'];
  severity: GrammarIssue['severity'];
  rule: string;
  fix?: (match: RegExpMatchArray, context: string) => string | null;
}> = [
  // Missing case marker after noun
  {
    pattern: /([\u0B95-\u0BB9]+)\s+([\u0B95-\u0BB9]+[\u0BC0-\u0BC2]?)\s+(?:செய்தான்|செய்தாள்|செய்தது)/,
    type: 'case',
    severity: 'error',
    rule: 'Accusative case marker (ஐ) may be missing for direct object',
    fix: (match) => {
      // Check if accusative marker is missing
      if (!/[\u0B86\u0B90]/.test(match[1])) {
        return match[1] + 'ஐ';
      }
      return null;
    },
  },
  // Incorrect verb ending for subject
  {
    pattern: /([\u0B95-\u0BB9]+[\u0BC0-\u0BC2]?)\s+(?:செய்தான்|செய்தாள்|செய்தது)/,
    type: 'agreement',
    severity: 'error',
    rule: 'Verb ending should agree with subject gender/number',
  },
  // Missing space before verb
  {
    pattern: /([\u0B95-\u0BB9]+)([\u0B95-\u0BB9]+(?:கிறான்|த்தான்|ப்பான்))/,
    type: 'word_order',
    severity: 'warning',
    rule: 'Space may be needed before verb',
    fix: (match) => match[1] + ' ' + match[2],
  },
  // Incorrect particle usage
  {
    pattern: /([\u0B95-\u0BB9]+)\s+(?:உம்|ஓ|ஏ)\s+([\u0B95-\u0BB9]+)/,
    type: 'particle',
    severity: 'suggestion',
    rule: 'Check particle placement and usage',
  },
  // Double case markers
  {
    pattern: /([\u0B95-\u0BB9]+)([\u0B86\u0B90\u0B87\u0BA9])([\u0B86\u0B90\u0B87\u0BA9])/,
    type: 'case',
    severity: 'error',
    rule: 'Double case markers detected - remove redundant marker',
  },
  // Incorrect tense usage
  {
    pattern: /(?:நேற்று|இன்று|நாளை)\s+([\u0B95-\u0BB9]+(?:த்தான்|த்தாள்|த்தது))/,
    type: 'tense',
    severity: 'warning',
    rule: 'Tense may not match time reference',
  },
];

/**
 * Analyze sentence structure
 */
function analyzeSentenceStructure(sentence: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  
  // Check for subject-verb-object order
  const hasSubject = /[\u0B95-\u0BB9]+[\u0BC0-\u0BC2]?\s+(?:ஆன|ஆகிய|ஆனது)/.test(sentence);
  const hasVerb = /(?:செய்தான்|செய்தாள்|செய்தது|கிறான்|கிறாள்|கிறது)/.test(sentence);
  const hasObject = /[\u0B95-\u0BB9]+(?:ஐ|ஆய்)/.test(sentence);
  
  if (hasVerb && !hasSubject && sentence.length > 20) {
    issues.push({
      id: 'missing-subject',
      type: 'sentence_structure',
      severity: 'warning',
      title: 'Possible missing subject',
      description: 'Sentence may be missing a clear subject',
      original: sentence.slice(0, 30),
      corrected: '',
      position: { start: 0, end: Math.min(30, sentence.length) },
      context: sentence,
      rule: 'Tamil sentences typically require a subject',
    });
  }
  
  return issues;
}

/**
 * Check case marker usage
 */
function checkCaseMarkers(text: string, wordStart: number, wordEnd: number): GrammarIssue | null {
  const word = text.slice(wordStart, wordEnd);
  const before = text.slice(Math.max(0, wordStart - 20), wordStart);
  const after = text.slice(wordEnd, Math.min(text.length, wordEnd + 20));
  
  // Check if noun needs a case marker based on context
  const needsAccusative = /(?:செய்தான்|செய்தாள்|செய்தது|கிறான்|கிறாள்|கிறது)/.test(after);
  const hasCaseMarker = /[\u0B86\u0B90\u0B87\u0BA9\u0B95\u0B9F\u0B9E\u0BA3\u0BA4\u0BAE]/.test(word);
  
  if (needsAccusative && !hasCaseMarker && word.length > 2) {
    return {
      id: `case-marker-${wordStart}`,
      type: 'case',
      severity: 'suggestion',
      title: 'Consider adding accusative case marker',
      description: 'Direct objects in Tamil often require the accusative case marker (ஐ)',
      original: word,
      corrected: word + 'ஐ',
      position: { start: wordStart, end: wordEnd },
      context: before + word + after,
      rule: 'Accusative case marker for direct objects',
    };
  }
  
  return null;
}

/**
 * Check verb agreement
 */
function checkVerbAgreement(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  
  // Pattern: subject + verb
  const subjectVerbPattern = /([\u0B95-\u0BB9]+[\u0BC0-\u0BC2]?)\s+([\u0B95-\u0BB9]+(?:கிறான்|கிறாள்|கிறது|த்தான்|த்தாள்|த்தது))/g;
  let match;
  
  while ((match = subjectVerbPattern.exec(text)) !== null) {
    const subject = match[1];
    const verb = match[2];
    const subjectEnd = subject.slice(-2);
    const verbEnd = verb.slice(-3);
    
    // Check if verb ending matches subject
    const isMasculineSubject = /[ன்|ான்]$/.test(subjectEnd);
    const isFeminineSubject = /[ள்|ாள்]$/.test(subjectEnd);
    const isNeuterSubject = /[து|ம்]$/.test(subjectEnd);
    
    const isMasculineVerb = /(?:கிறான்|த்தான்|ப்பான்)$/.test(verbEnd);
    const isFeminineVerb = /(?:கிறாள்|த்தாள்|ப்பாள்)$/.test(verbEnd);
    const isNeuterVerb = /(?:கிறது|த்தது|ப்பது)$/.test(verbEnd);
    
    if (isMasculineSubject && !isMasculineVerb) {
      issues.push({
        id: `agreement-${match.index}`,
        type: 'agreement',
        severity: 'error',
        title: 'Subject-verb agreement issue',
        description: `Subject "${subject}" appears masculine but verb "${verb}" doesn't match`,
        original: match[0],
        corrected: subject + ' ' + verb.replace(/(?:கிறாள்|த்தாள்|ப்பாள்|கிறது|த்தது|ப்பது)$/, 'கிறான்'),
        position: { start: match.index, end: match.index + match[0].length },
        context: text.slice(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20)),
        rule: 'Verb must agree with subject in gender and number',
      });
    } else if (isFeminineSubject && !isFeminineVerb) {
      issues.push({
        id: `agreement-${match.index}`,
        type: 'agreement',
        severity: 'error',
        title: 'Subject-verb agreement issue',
        description: `Subject "${subject}" appears feminine but verb "${verb}" doesn't match`,
        original: match[0],
        corrected: subject + ' ' + verb.replace(/(?:கிறான்|த்தான்|ப்பான்|கிறது|த்தது|ப்பது)$/, 'கிறாள்'),
        position: { start: match.index, end: match.index + match[0].length },
        context: text.slice(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20)),
        rule: 'Verb must agree with subject in gender and number',
      });
    }
  }
  
  return issues;
}

/**
 * Check word order
 */
function checkWordOrder(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  
  // Tamil typically follows SOV (Subject-Object-Verb) order
  // Check for unusual patterns
  const verbFirstPattern = /^(?:கிறான்|கிறாள்|கிறது|த்தான்|த்தாள்|த்தது)\s+/;
  if (verbFirstPattern.test(text.trim())) {
    issues.push({
      id: 'word-order-verb-first',
      type: 'word_order',
      severity: 'warning',
      title: 'Unusual word order',
      description: 'Tamil typically follows Subject-Object-Verb order. Verb appears at the beginning.',
      original: text.trim().slice(0, 30),
      corrected: '',
      position: { start: 0, end: Math.min(30, text.length) },
      context: text,
      rule: 'Tamil follows SOV word order',
    });
  }
  
  return issues;
}

/**
 * Main grammar analysis function
 */
export function analyzeGrammar(text: string): GrammarIssue[] {
  if (!text || text.trim().length === 0) {
    return [];
  }
  
  const issues: GrammarIssue[] = [];
  
  // Split into sentences
  const sentences = text.split(/([.!?]\s+|[\u0B82\u0B83]\s+)/);
  
  for (const sentence of sentences) {
    if (!sentence.trim() || sentence.trim().length < 5) continue;
    
    // Check sentence structure
    issues.push(...analyzeSentenceStructure(sentence));
    
    // Check verb agreement
    issues.push(...checkVerbAgreement(sentence));
    
    // Check word order
    issues.push(...checkWordOrder(sentence));
    
    // Check grammar patterns
    for (const pattern of grammarPatterns) {
      const regex = new RegExp(pattern.pattern);
      let match;
      
      while ((match = regex.exec(sentence)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const context = sentence.slice(Math.max(0, start - 20), Math.min(sentence.length, end + 20));
        
        let corrected = match[0];
        if (pattern.fix) {
          const fixResult = pattern.fix(match, context);
          if (fixResult) {
            corrected = fixResult;
          }
        }
        
        issues.push({
          id: `${pattern.type}-${start}-${Date.now()}`,
          type: pattern.type,
          severity: pattern.severity,
          title: `Grammar ${pattern.type} issue`,
          description: pattern.rule,
          original: match[0],
          corrected: corrected,
          position: { start, end },
          context,
          rule: pattern.rule,
        });
      }
    }
    
    // Check case markers for nouns
    const wordRegex = /[\u0B80-\u0BFF]+/g;
    let wordMatch;
    while ((wordMatch = wordRegex.exec(sentence)) !== null) {
      const issue = checkCaseMarkers(sentence, wordMatch.index, wordMatch.index + wordMatch[0].length);
      if (issue) {
        issues.push(issue);
      }
    }
  }
  
  // Remove duplicates
  const uniqueIssues = issues.filter((issue, index, self) =>
    index === self.findIndex((i) => i.id === issue.id)
  );
  
  return uniqueIssues;
}

/**
 * Get grammar rule explanation
 */
export function getGrammarRuleExplanation(rule: string): string {
  const explanations: Record<string, string> = {
    'Accusative case marker for direct objects': 'In Tamil, direct objects (the thing receiving the action) often take the accusative case marker "ஐ" (ai).',
    'Verb must agree with subject in gender and number': 'Tamil verbs change their endings based on the subject\'s gender (masculine, feminine, neuter) and number (singular, plural).',
    'Tamil follows SOV word order': 'Tamil typically follows Subject-Object-Verb word order, unlike English which uses SVO.',
    'Tamil sentences typically require a subject': 'While Tamil allows subject omission in some contexts, clear subjects improve readability.',
  };
  
  return explanations[rule] || rule;
}

