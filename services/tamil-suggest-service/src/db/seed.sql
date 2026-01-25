-- ====================================================================
-- TAMIL AUTO-SUGGESTION ENGINE - SEED DATA
-- Production-ready seed data with common words, phrases, and rules
-- ====================================================================

-- ====================================================================
-- 1. PHONETIC RULES (Comprehensive rule set)
-- ====================================================================

-- VOWELS (Independent)
INSERT INTO phonetic_rules (input, output, weight, rule_type, priority, notes) VALUES
('aa', 'ஆ', 0.90, 'vowel', 100, 'Long a'),
('ii', 'ஈ', 0.85, 'vowel', 100, 'Long i'),
('uu', 'ஊ', 0.85, 'vowel', 100, 'Long u'),
('ee', 'ஏ', 0.80, 'vowel', 100, 'Long e'),
('oo', 'ஓ', 0.80, 'vowel', 100, 'Long o'),
('ai', 'ஐ', 0.80, 'vowel', 100, 'Diphthong ai'),
('au', 'ஔ', 0.75, 'vowel', 100, 'Diphthong au'),
('a', 'அ', 0.55, 'vowel', 50, 'Short a'),
('i', 'இ', 0.55, 'vowel', 50, 'Short i'),
('u', 'உ', 0.55, 'vowel', 50, 'Short u'),
('e', 'எ', 0.55, 'vowel', 50, 'Short e'),
('o', 'ஒ', 0.55, 'vowel', 50, 'Short o')
ON CONFLICT (input, output) DO NOTHING;

-- DIGRAPHS (Two-letter combinations - highest priority)
INSERT INTO phonetic_rules (input, output, weight, rule_type, priority, notes) VALUES
('ng', 'ங', 0.90, 'digraph', 200, 'Velar nasal'),
('nj', 'ஞ', 0.85, 'digraph', 200, 'Palatal nasal'),
('zh', 'ழ', 1.00, 'digraph', 200, 'Retroflex approximant'),
('th', 'த', 0.80, 'digraph', 180, 'Dental plosive'),
('th', 'த்', 0.75, 'digraph', 180, 'Dental with virama'),
('dh', 'த', 0.75, 'digraph', 180, 'Dental (voiced variant)'),
('sh', 'ஷ', 0.85, 'digraph', 190, 'Palatal fricative'),
('sh', 'ச', 0.60, 'digraph', 180, 'Alternative sh'),
('ch', 'ச', 0.85, 'digraph', 190, 'Palatal plosive'),
('kh', 'க', 0.70, 'digraph', 180, 'Aspirated k'),
('gh', 'க', 0.65, 'digraph', 180, 'Voiced k'),
('bh', 'ப', 0.65, 'digraph', 180, 'Aspirated b'),
('ph', 'ஃப', 0.70, 'digraph', 180, 'Aspirated p (loan words)'),
('ph', 'ப', 0.60, 'digraph', 170, 'Alternative ph')
ON CONFLICT (input, output) DO NOTHING;

-- DOUBLED CONSONANTS (Common doubled forms)
INSERT INTO phonetic_rules (input, output, weight, rule_type, priority, notes) VALUES
('kk', 'க்க', 0.95, 'doubled', 150, 'Geminate க'),
('tt', 'த்த', 0.95, 'doubled', 150, 'Geminate த'),
('pp', 'ப்ப', 0.95, 'doubled', 150, 'Geminate ப'),
('rr', 'ற்ற', 0.95, 'doubled', 150, 'Geminate ற'),
('ll', 'ல்ல', 0.90, 'doubled', 150, 'Geminate ல'),
('ll', 'ள்ள', 0.85, 'doubled', 145, 'Geminate ள'),
('nn', 'ந்ந', 0.85, 'doubled', 150, 'Geminate ந'),
('nn', 'ண்ண', 0.80, 'doubled', 145, 'Geminate ண'),
('mm', 'ம்ம', 0.90, 'doubled', 150, 'Geminate ம'),
('cc', 'ச்ச', 0.85, 'doubled', 150, 'Geminate ச'),
('ss', 'ஸ்ஸ', 0.75, 'doubled', 140, 'Geminate ஸ')
ON CONFLICT (input, output) DO NOTHING;

-- CONSONANTS (Single letters)
INSERT INTO phonetic_rules (input, output, weight, rule_type, priority, notes) VALUES
('k', 'க', 0.70, 'consonant', 60, 'Velar plosive'),
('g', 'க', 0.65, 'consonant', 55, 'Voiced k variant'),
('c', 'ச', 0.60, 'consonant', 60, 'Palatal plosive'),
('j', 'ஜ', 0.60, 'consonant', 60, 'Voiced palatal'),
('t', 'த', 0.60, 'consonant', 60, 'Dental plosive'),
('d', 'த', 0.55, 'consonant', 55, 'Voiced t variant'),
('n', 'ந', 0.55, 'consonant', 60, 'Dental nasal'),
('n', 'ன', 0.50, 'consonant', 55, 'Alveolar nasal'),
('n', 'ண', 0.45, 'consonant', 50, 'Retroflex nasal'),
('p', 'ப', 0.60, 'consonant', 60, 'Bilabial plosive'),
('b', 'ப', 0.55, 'consonant', 55, 'Voiced p variant'),
('m', 'ம', 0.65, 'consonant', 65, 'Bilabial nasal'),
('y', 'ய', 0.55, 'consonant', 60, 'Palatal approximant'),
('r', 'ர', 0.55, 'consonant', 60, 'Alveolar trill'),
('r', 'ற', 0.50, 'consonant', 55, 'Alveolar tap'),
('l', 'ல', 0.55, 'consonant', 60, 'Alveolar lateral'),
('l', 'ள', 0.50, 'consonant', 55, 'Retroflex lateral'),
('l', 'ழ', 0.45, 'consonant', 50, 'Retroflex approximant'),
('v', 'வ', 0.70, 'consonant', 65, 'Labio-dental approximant'),
('w', 'வ', 0.65, 'consonant', 60, 'Alternative v'),
('s', 'ச', 0.55, 'consonant', 55, 'Tamil s (palatal)'),
('s', 'ஸ', 0.50, 'consonant', 50, 'Sanskrit s (loan words)'),
('h', 'ஹ', 0.50, 'consonant', 55, 'Glottal fricative (loan words)'),
('f', 'ஃப', 0.50, 'consonant', 55, 'F for loan words'),
('f', 'ப', 0.35, 'consonant', 45, 'Alternative f→p'),
('z', 'ஸ', 0.45, 'consonant', 50, 'Z for loan words')
ON CONFLICT (input, output) DO NOTHING;

-- ENDING PATTERNS (Common Tamil word endings)
INSERT INTO phonetic_rules (input, output, weight, rule_type, priority, notes) VALUES
('am', 'அம்', 0.85, 'ending', 120, 'Common ending -am'),
('an', 'அன்', 0.85, 'ending', 120, 'Common ending -an'),
('um', 'உம்', 0.85, 'ending', 120, 'Common ending -um'),
('al', 'அல்', 0.80, 'ending', 110, 'Common ending -al'),
('ar', 'அர்', 0.80, 'ending', 110, 'Common ending -ar'),
('il', 'இல்', 0.80, 'ending', 110, 'Common ending -il'),
('in', 'இன்', 0.80, 'ending', 110, 'Common ending -in'),
('kal', 'கள்', 0.85, 'ending', 120, 'Plural marker -kal')
ON CONFLICT (input, output) DO NOTHING;

-- SPECIAL CASES (Common Tanglish patterns)
INSERT INTO phonetic_rules (input, output, weight, rule_type, priority, notes) VALUES
('q', 'க', 0.40, 'special', 40, 'Q→K for loan words'),
('x', 'க்ஸ', 0.45, 'special', 40, 'X for loan words')
ON CONFLICT (input, output) DO NOTHING;

-- ====================================================================
-- 2. COMMON TAMIL WORDS (Top 200 most frequent)
-- ====================================================================

INSERT INTO tamil_words (word, frequency, kind) VALUES
-- Greetings & Common phrases
('வணக்கம்', 10000, 'word'),
('வணக்கம்!', 9500, 'word'),
('நன்றி', 9000, 'word'),
('நலம்', 8500, 'word'),
('எப்படி', 8000, 'word'),
('எப்படியிருக்கிறீர்கள்', 7500, 'phrase'),
('எப்படி இருக்கீங்க', 7000, 'phrase'),
('நன்றாக', 6500, 'word'),
('நல்லா', 6000, 'word'),

-- Basic words
('அது', 9500, 'word'),
('இது', 9400, 'word'),
('எது', 8500, 'word'),
('இதை', 8000, 'word'),
('என்ன', 8500, 'word'),
('எங்கே', 8000, 'word'),
('எப்போது', 7500, 'word'),
('எத்தனை', 7000, 'word'),
('யார்', 8500, 'word'),
('எதற்கு', 7000, 'word'),
('எப்படி', 8000, 'word'),
('ஏன்', 8500, 'word'),

-- Pronouns
('நான்', 9000, 'word'),
('நீ', 8500, 'word'),
('நீங்கள்', 9500, 'word'),
('அவர்', 9000, 'word'),
('அவர்கள்', 8500, 'word'),
('அவன்', 7500, 'word'),
('அவள்', 7500, 'word'),
('அவை', 7000, 'word'),
('நாம்', 8000, 'word'),
('நாங்கள்', 7500, 'word'),
('எனக்கு', 8500, 'word'),
('உனக்கு', 7500, 'word'),
('உங்களுக்கு', 8000, 'word'),

-- Common verbs
('இருக்கிறேன்', 8000, 'word'),
('இருக்கிறீர்கள்', 7500, 'word'),
('இருக்கிறார்', 7000, 'word'),
('செல்கிறேன்', 7000, 'word'),
('வருகிறேன்', 7500, 'word'),
('சாப்பிடுகிறேன்', 6500, 'word'),
('பார்க்கிறேன்', 7000, 'word'),
('கேட்கிறேன்', 6500, 'word'),
('சொல்கிறேன்', 7000, 'word'),
('செய்கிறேன்', 7500, 'word'),
('படிக்கிறேன்', 6500, 'word'),
('எழுதுகிறேன்', 6000, 'word'),

-- Political & News terms
('திமுக', 7000, 'word'),
('அதிமுக', 6500, 'word'),
('காங்கிரஸ்', 6000, 'word'),
('பாஜக', 6500, 'word'),
('கட்சி', 7000, 'word'),
('கூட்டணி', 6500, 'word'),
('தலைவர்', 7000, 'word'),
('முதலமைச்சர்', 7500, 'word'),
('அமைச்சர்', 6500, 'word'),
('மக்கள்', 8000, 'word'),
('நாடு', 7000, 'word'),
('மாநிலம்', 6500, 'word'),
('அரசு', 7500, 'word'),
('அரசாங்கம்', 6000, 'word'),
('நிகழ்ச்சி', 6500, 'word'),
('நிகழ்வு', 6000, 'word'),

-- Time & Date
('இன்று', 8000, 'word'),
('நேற்று', 7500, 'word'),
('நாளை', 7500, 'word'),
('இப்போது', 8000, 'word'),
('பிறகு', 7000, 'word'),
('முன்', 7000, 'word'),
('மணி', 7500, 'word'),
('நேரம்', 7000, 'word'),
('வருடம்', 6500, 'word'),
('மாதம்', 7000, 'word'),
('வாரம்', 6500, 'word'),
('நாள்', 7500, 'word'),

-- Common adjectives
('நல்ல', 8000, 'word'),
('பெரிய', 7500, 'word'),
('சிறிய', 7000, 'word'),
('புதிய', 7500, 'word'),
('பழைய', 6500, 'word'),
('அழகான', 7000, 'word'),
('நல்லது', 7500, 'word'),
('கெட்டது', 6000, 'word'),
('சரியான', 6500, 'word'),
('தவறான', 6000, 'word'),

-- Common phrases
('எப்படி இருக்கீங்க', 7000, 'phrase'),
('என்ன செய்கிறீர்கள்', 6500, 'phrase'),
('எனக்கு தெரியும்', 6500, 'phrase'),
('எனக்கு தெரியாது', 6000, 'phrase'),
('சரி வருகிறேன்', 6000, 'phrase'),
('பார்க்கலாம்', 6500, 'phrase'),
('போகலாம்', 6500, 'phrase'),
('வரலாம்', 6500, 'phrase')
ON CONFLICT (word) DO UPDATE SET frequency = GREATEST(tamil_words.frequency, EXCLUDED.frequency);

-- ====================================================================
-- 3. TAMIL BIGRAMS (Common word pairs for context)
-- ====================================================================

INSERT INTO tamil_bigrams (word, next_word, frequency) VALUES
-- Greeting patterns
('வணக்கம்', 'நண்பா', 5000),
('வணக்கம்', 'அனைவருக்கும்', 4500),
('வணக்கம்', 'எல்லாருக்கும்', 4000),
('நல்ல', 'காலை', 3500),
('நல்ல', 'மதியம்', 3000),
('நல்ல', 'மாலை', 3000),
('நல்ல', 'இரவு', 3500),

-- Common verb phrases
('என்ன', 'செய்கிறீர்கள்', 4000),
('எப்படி', 'இருக்கிறீர்கள்', 4500),
('எங்கு', 'செல்கிறீர்கள்', 3000),
('எப்போது', 'வருகிறீர்கள்', 3000),

-- Political phrases
('முதலமைச்சர்', 'மு.க.ஸ்டாலின்', 3000),
('திமுக', 'கூட்டணி', 2500),
('அதிமுக', 'கூட்டணி', 2000),
('கூட்டணி', 'கட்சிகள்', 2500),

-- Pronouns + verbs
('நான்', 'செல்கிறேன்', 3500),
('நான்', 'வருகிறேன்', 3500),
('நீங்கள்', 'செல்கிறீர்கள்', 3000),
('அவர்', 'சொன்னார்', 3000),
('அவர்கள்', 'வந்தார்கள்', 2500),

-- Common conjunctions
('அது', 'சரி', 3000),
('இது', 'தவறு', 2500),
('ஆனால்', 'நான்', 2500),
('மற்றும்', 'அவர்', 2000)
ON CONFLICT (word, next_word) DO UPDATE SET frequency = GREATEST(tamil_bigrams.frequency, EXCLUDED.frequency);

-- ====================================================================
-- 4. ACCEPTANCE EVENTS (Sample data for testing)
-- ====================================================================

-- Sample user acceptance patterns
INSERT INTO accept_events (input, selected, context_word, session_id) VALUES
('vanakkam', 'வணக்கம்', NULL, 'session_001'),
('nandri', 'நன்றி', 'வணக்கம்', 'session_001'),
('nalam', 'நலம்', 'நன்றி', 'session_001'),
('eppadi', 'எப்படி', NULL, 'session_002'),
('irukkireerkal', 'இருக்கிறீர்கள்', 'எப்படி', 'session_002'),
('nallaa', 'நல்லா', NULL, 'session_003');

-- ====================================================================
-- 5. REFRESH MATERIALIZED VIEWS
-- ====================================================================

REFRESH MATERIALIZED VIEW acceptance_frequency;

-- ====================================================================
-- 6. UPDATE STATISTICS
-- ====================================================================

ANALYZE tamil_words;
ANALYZE tamil_bigrams;
ANALYZE phonetic_rules;
ANALYZE accept_events;

-- ====================================================================
-- 7. VERIFICATION QUERIES
-- ====================================================================

-- Count records
SELECT 'phonetic_rules' as table_name, COUNT(*) as count FROM phonetic_rules
UNION ALL
SELECT 'tamil_words', COUNT(*) FROM tamil_words
UNION ALL
SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams
UNION ALL
SELECT 'accept_events', COUNT(*) FROM accept_events;

-- Sample queries to verify setup
-- Top 10 most common words:
-- SELECT word, frequency FROM tamil_words ORDER BY frequency DESC LIMIT 10;

-- Top 10 bigrams for context:
-- SELECT word, next_word, frequency FROM tamil_bigrams ORDER BY frequency DESC LIMIT 10;

-- Phonetic rules by type:
-- SELECT rule_type, COUNT(*) FROM phonetic_rules WHERE enabled = true GROUP BY rule_type ORDER BY COUNT(*) DESC;

-- ====================================================================
-- END OF SEED DATA
-- ====================================================================
