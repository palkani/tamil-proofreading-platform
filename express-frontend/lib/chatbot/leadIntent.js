/**
 * Heuristic lead-capture trigger.
 *
 * Deliberately rules rather than a model call: it must run on every turn, it
 * must be cheap, and a wrong answer here is annoying rather than dangerous.
 * The API route offers the capture card at most once per session, so a false
 * positive costs one dismissed card.
 */

/** Buying signals — someone evaluating rather than just using the product. */
const BUYING_INTENT = [
  // English
  /\b(pric|cost|paid|upgrade|subscri|plan[s]?\b|billing|invoice|refund|discount|coupon|trial)/i,
  /\b(team|business|enterprise|bulk|volume|institution|college|university|agency)\b/i,
  /\b(buy|purchase|pay|payment|checkout)\b/i,
  // Tamil
  /(விலை|கட்டணம்|சந்தா|திட்டம்|பணம்|செலவு|தள்ளுபடி|வாங்க|கட்டண)/,
];

/** Someone explicitly asking for a human or for follow-up. */
const CONTACT_REQUEST = [
  /\b(contact|email me|reach out|get in touch|speak to|talk to|human|support team|sales|demo|call me)\b/i,
  /(தொடர்பு|பேச|மனித|ஆதரவு|அழை)/,
];

/**
 * Phrases the bot uses when the context did not cover the question.
 *
 * Retrieval count alone is not a reliable "we couldn't answer" signal: with a
 * permissive similarity floor, an off-topic question still pulls back a few
 * near-miss chunks, the model correctly says it does not know, and a
 * count-based check would conclude we had answered. Reading the actual reply
 * catches that — and it is exactly the case where a lead is most valuable.
 */
const UNKNOWN_ANSWER = [
  // English
  /\b(do not|don't|dont) have (the |any |that )?(exact |specific |detailed )?(information|details|pricing|data)/i,
  /\bnot (sure|certain|available)\b/i,
  /\b(no|cannot find|could not find|couldn't find) information\b/i,
  /\bis not (covered|included|mentioned|available) (in|on)\b/i,
  /\bcontact (the )?(ProofTamil )?(team|support|us)\b/i,
  /\bI (cannot|can't|am unable to) (confirm|answer|say)\b/i,
  // Tamil
  /(என்னிடம் இல்லை|தெரியவில்லை|விவரங்கள் இல்லை|தகவல் இல்லை|மன்னிக்கவும்)/,
  /(குழுவைத் தொடர்பு|தொடர்பு கொள்ள)/,
];

function answerSignalsUnknown(answer) {
  return UNKNOWN_ANSWER.some((pattern) => pattern.test(answer));
}



function detectLeadIntent({ message, retrievedCount, alreadyOffered, answer }) {
  if (alreadyOffered) return { capture: false, reason: null };

  const text = message.trim();
  if (!text) return { capture: false, reason: null };

  if (CONTACT_REQUEST.some((pattern) => pattern.test(text))) {
    return { capture: true, reason: 'contact-request' };
  }

  // An unanswerable question is the strongest signal we have: the visitor wants
  // something the site does not cover, so a human follow-up is genuinely the
  // best outcome available. Nothing retrieved is one way to detect that; the
  // bot saying so in its own words is the more reliable one.
  if (retrievedCount === 0 || (answer && answerSignalsUnknown(answer))) {
    return { capture: true, reason: 'unanswered' };
  }

  if (BUYING_INTENT.some((pattern) => pattern.test(text))) {
    return { capture: true, reason: 'buying-intent' };
  }

  return { capture: false, reason: null };
}

module.exports = { detectLeadIntent, answerSignalsUnknown };
