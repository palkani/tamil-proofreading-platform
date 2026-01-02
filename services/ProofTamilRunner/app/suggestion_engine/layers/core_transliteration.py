"""
Layer A: Core Transliteration (strict).

Uses existing transliteration mechanism to generate strict transliterations.
For single consonant inputs, ensures both base consonant and consonant + pulli.
"""

import logging
from typing import List, Optional
from app.suggestion_engine.types import Candidate
from app.suggestion_engine.normalization import (
    get_consonant_base,
    is_valid_tamil_word,
    normalize_unicode,
)
from app.adapters.aksharamukha import AksharaAdapter
from app.clients.transliterator_client import build_client
from app.core.config import settings

logger = logging.getLogger(__name__)


class CoreTransliterationLayer:
    """Layer A: Core strict transliteration."""

    def __init__(self, adapter: Optional[AksharaAdapter] = None, client=None):
        self.adapter = adapter or AksharaAdapter()
        self.client = client or build_client()
        self.runner_enabled = settings.TRANSLITERATOR_ENABLED

    async def generate(
        self, q: str, mode: str, request_id: str = "n/a"
    ) -> List[Candidate]:
        """
        Generate core transliteration candidates.
        
        For single consonant inputs (like "m", "k", "t"), ensures:
        - base consonant (ம)
        - consonant + pulli (ம்)
        """
        candidates: List[Candidate] = []
        q_lower = q.lower().strip()

        if not q_lower:
            return candidates

        # Try external runner first if enabled
        runner_candidates = []
        if self.runner_enabled and self.client:
            try:
                data = await self.client.transliterate(q)
                outputs = [
                    s.get("word") or s.get("ta")
                    for s in data.get("suggestions", [])
                    if s
                ]
                for out in outputs:
                    if out and is_valid_tamil_word(out):
                        runner_candidates.append(
                            Candidate(
                                word=normalize_unicode(out),
                                base_score=0.95,
                                source_layer="core_runner",
                                debug={"runner": True},
                            )
                        )
            except Exception as e:
                logger.warning(
                    "core_transliteration_runner_failed request_id=%s error=%s",
                    request_id,
                    str(e),
                )

        # Fallback to adapter
        adapter_candidates = []
        if not runner_candidates:
            try:
                outputs = await self.adapter.transliterate(q, mode)
                for out in outputs:
                    if out and is_valid_tamil_word(out):
                        adapter_candidates.append(
                            Candidate(
                                word=normalize_unicode(out),
                                base_score=0.90,
                                source_layer="core_adapter",
                                debug={"runner": False},
                            )
                        )
            except Exception as e:
                logger.warning(
                    "core_transliteration_adapter_failed request_id=%s error=%s",
                    request_id,
                    str(e),
                )

        # Combine runner and adapter results
        candidates.extend(runner_candidates)
        candidates.extend(adapter_candidates)

        # For multi-character words, generate variations from existing transliterations
        if len(q_lower) > 1 and q_lower.isalpha() and candidates:
            # Generate variations for common Tamil spelling patterns
            variations = self._generate_word_variations(candidates)
            candidates.extend(variations)

        # For single consonant inputs, ensure base + pulli forms
        if len(q_lower) == 1 and q_lower.isalpha():
            consonant_base = get_consonant_base(q_lower)
            if consonant_base:
                # Base consonant
                base_candidate = Candidate(
                    word=consonant_base,
                    base_score=0.85,
                    source_layer="core_consonant_base",
                    debug={"consonant": True},
                )
                candidates.append(base_candidate)

                # Consonant + pulli
                pulli_candidate = Candidate(
                    word=consonant_base + "\u0BCD",  # ்
                    base_score=0.88,
                    source_layer="core_consonant_pulli",
                    debug={"consonant": True, "pulli": True},
                )
                candidates.append(pulli_candidate)

        # Deduplicate by word (keep highest score)
        seen = {}
        for cand in candidates:
            word = cand.word
            if word not in seen or seen[word].base_score < cand.base_score:
                seen[word] = cand

        return list(seen.values())

    def _generate_word_variations(
        self, existing_candidates: List[Candidate]
    ) -> List[Candidate]:
        """
        Generate common Tamil spelling variations for multi-character words.
        
        For words like "enathu" -> "எநது", generates variations like:
        - எனது (alternative spelling with "ன" instead of "ந")
        - எநது (original)
        """
        variations: List[Candidate] = []
        
        # If we already have a transliteration, generate variations from it
        if not existing_candidates:
            return variations
            
        base_word = existing_candidates[0].word
        
        # Common Tamil spelling variations
        # Pattern: Replace similar sounding characters that are commonly interchanged
        variation_patterns = [
            # "ந" <-> "ன" variations (very common in Tamil)
            (("ந", "ன"), 0.85),
            (("ன", "ந"), 0.85),
            # "த" <-> "ட" variations (less common, lower score)
            (("த", "ட"), 0.75),
            (("ட", "த"), 0.75),
            # "ர" <-> "ற" variations
            (("ர", "ற"), 0.80),
            (("ற", "ர"), 0.80),
            # "ல" <-> "ள" variations
            (("ல", "ள"), 0.80),
            (("ள", "ல"), 0.80),
        ]
        
        seen_variations = {base_word}  # Track to avoid duplicates
        
        for (char1, char2), score_multiplier in variation_patterns:
            if char1 in base_word:
                # Generate variation by replacing first occurrence
                variant = base_word.replace(char1, char2, 1)
                if variant != base_word and variant not in seen_variations and is_valid_tamil_word(variant):
                    seen_variations.add(variant)
                    variations.append(
                        Candidate(
                            word=normalize_unicode(variant),
                            base_score=0.80 * score_multiplier,
                            source_layer="core_variation",
                            debug={"variation": f"{char1}->{char2}"},
                        )
                    )
                
                # Also try replacing all occurrences for some patterns
                if char1 in variant and char1 != char2:
                    variant_all = variant.replace(char1, char2)
                    if variant_all != base_word and variant_all not in seen_variations and is_valid_tamil_word(variant_all):
                        seen_variations.add(variant_all)
                        variations.append(
                            Candidate(
                                word=normalize_unicode(variant_all),
                                base_score=0.75 * score_multiplier,
                                source_layer="core_variation",
                                debug={"variation": f"{char1}->{char2} (all)"},
                            )
                        )
        
        return variations

