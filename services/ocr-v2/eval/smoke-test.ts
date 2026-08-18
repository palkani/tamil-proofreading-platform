// Smoke test for the pure-logic modules. Runs without hitting Gemini —
// verifies grapheme handling, CER math, and report summarization behave
// as expected on known inputs.
//
// Usage: npx tsx eval/smoke-test.ts

import { graphemes, graphemeCount, scriptOf, normalize, words } from '../src/tamil.js';
import { cer, wer, summarize, formatReport } from '../src/metrics.js';

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error('  ✗', msg); failures++; }
  else       { console.log ('  ✓', msg); }
}
function approx(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) < eps;
}

console.log('\n── Grapheme handling ──');
// கூ = க + ூ = 1 grapheme, 2 code points
assert(graphemeCount('கூ') === 1, 'கூ counts as 1 grapheme (was 1 letter user-visible)');
assert('கூ'.length === 2, 'கூ is 2 code points (would over-count under code-point CER)');
// கூடும் = க + ூ + ட + ு + ம + ் = 3 graphemes
assert(graphemeCount('கூடும்') === 3, 'கூடும் counts as 3 graphemes');
assert('கூடும்'.length === 6, 'கூடும் is 6 code points');
assert(graphemeCount('') === 0, 'empty string is 0 graphemes');
assert(graphemes('abc').length === 3, 'ASCII: 3 graphemes');

console.log('\n── Script routing ──');
assert(scriptOf('க') === 'tamil', 'க classified as tamil');
assert(scriptOf('a') === 'latin', 'a classified as latin');
assert(scriptOf('5') === 'digit', '5 classified as digit');
assert(scriptOf('.') === 'punct', '. classified as punct');
assert(scriptOf(' ') === 'space', 'space classified as space');

console.log('\n── Normalization ──');
assert(normalize('  hello  \r\n') === 'hello', 'trims + normalizes line endings');
assert(normalize('​வணக்கம்‌') === 'வணக்கம்', 'strips zero-width chars');

console.log('\n── Word tokenization ──');
const w = words('வணக்கம் நண்பா  Hello 42');
assert(w.length === 4, `4 words in "வணக்கம் நண்பா  Hello 42" (got ${w.length})`);

console.log('\n── CER math ──');
assert(cer('வணக்கம்', 'வணக்கம்') === 0, 'perfect match → CER 0');
// வழி → வலி is a single grapheme swap in a 3-grapheme word (வ + ழி/லி + no third)
// Actually வழி = வ + ழி = 2 graphemes; வலி = வ + லி = 2 graphemes. Swap of 1/2 = 0.5.
const swap = cer('வலி', 'வழி');
assert(approx(swap, 0.5), `single-swap in 2-grapheme word → CER ~0.5 (got ${swap.toFixed(3)})`);
assert(cer('', 'வணக்கம்') === 1, 'empty prediction → CER 1');
assert(cer('', '') === 0, 'both empty → CER 0');

console.log('\n── WER math ──');
assert(wer('வணக்கம் நண்பா', 'வணக்கம் நண்பா') === 0, 'word-perfect → WER 0');
const werPartial = wer('வணக்கம் salamu', 'வணக்கம் நண்பா');
assert(approx(werPartial, 0.5), `1 of 2 words wrong → WER ~0.5 (got ${werPartial.toFixed(3)})`);

console.log('\n── Report summarization ──');
const report = summarize('smoke', [
  { page: 'a.jpg', cer: 0.02, wer: 0.05, gtGraphemes: 200, predGraphemes: 198, wallMs: 3000, costUsd: 0.001 },
  { page: 'b.jpg', cer: 0.18, wer: 0.32, gtGraphemes: 250, predGraphemes: 245, wallMs: 4200, costUsd: 0.002 },
  { page: 'c.jpg', cer: 0.45, wer: 0.60, gtGraphemes: 180, predGraphemes: 170, wallMs: 5100, costUsd: 0.002 },
  { page: 'd.jpg', cer: 1.0, wer: 1.0, gtGraphemes: 220, predGraphemes: 0, wallMs: 0, error: 'timeout' },
]);
assert(report.n === 4, 'n = 4');
assert(report.successful === 3, 'successful = 3');
assert(report.failed === 1, 'failed = 1');
assert(report.catastrophicRate === 0.5, `catastrophic rate = 0.5 (c,d both > 0.3) (got ${report.catastrophicRate})`);
// Positional 50th percentile on [0.02, 0.18, 0.45, 1.0] → index Math.floor(0.5*4)=2 → 0.45.
// (No linear interpolation — fine for 100+-page runs where the difference vanishes.)
assert(approx(report.medianCer, 0.45), `medianCer = 0.45 for [0.02,0.18,0.45,1.0] — got ${report.medianCer.toFixed(3)}`);
console.log(formatReport(report));

console.log(failures === 0 ? '\nAll smoke tests passed ✓' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
