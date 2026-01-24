export type Suggestion = {
  text: string;
  score: number; // higher is better
  meta?: Record<string, unknown>;
};

export type SuggestRequest = {
  q: string;
  prev?: string;
  limit: number;
};

export type CorpusItem = {
  text: string;
  frequency: number;
  kind: "word" | "phrase";
};

export type BigramRow = {
  word: string;
  next_word: string;
  frequency: number;
};

export type PhoneticCandidate = {
  tamilPrefix: string;
  phoneticScore: number; // 0..1 (higher is better)
};


