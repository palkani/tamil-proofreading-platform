// Conservative Roman input normalizer for IME typing.
// Goal: reduce common typos without being "too smart".

export function normalizeRoman(q: string): string {
  const s = String(q || "").toLowerCase().trim();
  if (!s) return "";

  // Remove non a-z + apostrophe (keep IME-friendly)
  let out = s.replace(/[^a-z']/g, "");

  // Collapse 3+ repeated letters to 2 (e.g., "vaaaan" -> "vaaan" -> "vaan")
  out = out.replace(/(.)\1{2,}/g, "$1$1");

  // Common variants -> canonical (extend over time)
  const variants: Record<string, string> = {
    thamizh: "tamil",
    tamizh: "tamil",
    thamiz: "tamil",
    tamiz: "tamil",
  };
  if (variants[out]) out = variants[out];

  return out;
}


