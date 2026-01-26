-- Common spoken Tamil words supplement
-- These are frequently used words often missing from Wikipedia titles

BEGIN;

INSERT INTO tamil_words (tamil_text, transliteration, alternate_spellings, frequency, category, source, is_verified) VALUES
-- Negative/refusal words
('வேண்டாம்','vendam','["vendum", "vendaam", "ventam"]',9500,'common','manual_common',true),
('இல்லை','illai','["illa", "illay", "ille"]',9400,'common','manual_common',true),
('கூடாது','koodaathu','["koodathu", "kudaathu", "kudathu"]',8500,'common','manual_common',true),
('முடியாது','mudiyaathu','["mudiyathu", "mudiyadu"]',8400,'common','manual_common',true),
('தெரியாது','theriyaathu','["theriyathu", "teriyaathu", "teriyathu"]',8300,'common','manual_common',true),

-- Affirmative words
('வேண்டும்','vendum','["venum", "vennum", "ventum"]',9500,'common','manual_common',true),
('ஆமா','aama','["ama", "aamaa"]',9300,'common','manual_common',true),
('சரி','sari','["sarri", "cari"]',9200,'common','manual_common',true),
('ஓகே','oke','["okay", "ok"]',8800,'common','manual_common',true),

-- Greetings
('வணக்கம்','vanakkam','["vanakam", "vannakkam"]',9600,'common','manual_common',true),
('நன்றி','nandri','["nanri", "nandhi"]',9500,'common','manual_common',true),
('நமஸ்காரம்','namaskaram','["namaskaram", "namaskaaram"]',8000,'common','manual_common',true),

-- Common verbs
('போகணும்','poganum','["pokanum", "ponum"]',9000,'common','manual_common',true),
('வரணும்','varanum','["varnum", "varranum"]',8900,'common','manual_common',true),
('சாப்பிடணும்','saappidanum','["sappidanum", "sapidanum"]',8800,'common','manual_common',true),
('பார்க்கணும்','paarkanum','["parkanum", "pakkanum"]',8700,'common','manual_common',true),
('செய்யணும்','seyyanum','["seiyanum", "seyanum"]',8600,'common','manual_common',true),
('சொல்லணும்','sollanum','["solanum", "sonnanum"]',8500,'common','manual_common',true),
('கேக்கணும்','kekkanum','["kekanum", "ketkanum"]',8400,'common','manual_common',true),
('படிக்கணும்','padikkanum','["padikanum", "padikaNum"]',8300,'common','manual_common',true),
('எழுதணும்','ezhuthanum','["eludanum", "ezuthanum"]',8200,'common','manual_common',true),

-- Pronouns
('நான்','naan','["nan", "naa"]',9800,'common','manual_common',true),
('நீ','nee','["ni", "nii"]',9700,'common','manual_common',true),
('அவன்','avan','["aavan", "avn"]',9600,'common','manual_common',true),
('அவள்','aval','["avl", "aaval"]',9500,'common','manual_common',true),
('நாம்','naam','["nam", "namm"]',9400,'common','manual_common',true),
('நாங்க','naanga','["nanga", "naangal"]',9300,'common','manual_common',true),
('நீங்க','neenga','["ninga", "neengal"]',9200,'common','manual_common',true),
('அவங்க','avanga','["avangal", "avunga"]',9100,'common','manual_common',true),

-- Question words
('என்ன','enna','["yenna", "ina"]',9700,'common','manual_common',true),
('எப்படி','eppadi','["yeppadi", "epdi"]',9600,'common','manual_common',true),
('எங்கே','enge','["yenge", "engay"]',9500,'common','manual_common',true),
('எப்போ','eppo','["yeppo", "eppa"]',9400,'common','manual_common',true),
('ஏன்','yen','["en", "yean"]',9300,'common','manual_common',true),
('யார்','yaar','["yar", "aar"]',9200,'common','manual_common',true),
('எது','edhu','["edu", "ethu"]',9100,'common','manual_common',true),

-- Common expressions
('தெரியும்','theriyum','["teriyum", "teriyam"]',9000,'common','manual_common',true),
('புரியுது','puriyuthu','["puriyudhu", "puriuthu"]',8900,'common','manual_common',true),
('தெரியல','theriyala','["teriyala", "therila"]',8800,'common','manual_common',true),
('புரியல','puriyala','["puriala", "purila"]',8700,'common','manual_common',true),
('வேணாம்','venaam','["venam", "venaam"]',9400,'common','manual_common',true),

-- Time words
('இப்போ','ippo','["ippa", "ipo"]',9200,'common','manual_common',true),
('அப்புறம்','appuram','["aprom", "approm"]',9100,'common','manual_common',true),
('இன்னைக்கு','innaiku','["inniku", "inikku"]',9000,'common','manual_common',true),
('நேத்து','netthu','["nettu", "naethu"]',8900,'common','manual_common',true),
('நாளைக்கு','naalaikku','["nalaiku", "nalaikku"]',8800,'common','manual_common',true),

-- Family
('அம்மா','amma','["ama", "ammaa"]',9700,'common','manual_common',true),
('அப்பா','appa','["apa", "appaa"]',9600,'common','manual_common',true),
('அண்ணன்','annan','["anna", "annaN"]',9500,'common','manual_common',true),
('அக்கா','akka','["aka", "akkaa"]',9400,'common','manual_common',true),
('தம்பி','thambi','["tambi", "thambii"]',9300,'common','manual_common',true),
('தங்கை','thangai','["tangai", "thangachi"]',9200,'common','manual_common',true),
('மாமா','maama','["mama", "maamaa"]',9100,'common','manual_common',true),
('அத்தை','aththai','["athai", "attai"]',9000,'common','manual_common',true),
('பாட்டி','paatti','["patti", "paati"]',8900,'common','manual_common',true),
('தாத்தா','thaaththa','["thatha", "taata"]',8800,'common','manual_common',true),

-- Common nouns
('வீடு','veedu','["vidu", "viidu"]',9400,'common','manual_common',true),
('வேலை','velai','["velei", "velay"]',9300,'common','manual_common',true),
('பணம்','panam','["paisa", "kassu"]',9200,'common','manual_common',true),
('சாப்பாடு','saappaadu','["sappadu", "sapadu"]',9100,'common','manual_common',true),
('தண்ணி','thanni','["tanni", "thaneer"]',9000,'common','manual_common',true),
('காபி','kaapi','["kapi", "coffee"]',8900,'common','manual_common',true),
('டீ','dee','["tea", "thea"]',8800,'common','manual_common',true),

-- Adjectives
('நல்ல','nalla','["nala", "nallaa"]',9300,'common','manual_common',true),
('கெட்ட','ketta','["keta", "kettaa"]',8800,'common','manual_common',true),
('பெரிய','periya','["peria", "perya"]',9200,'common','manual_common',true),
('சின்ன','sinna','["chinna", "sina"]',9100,'common','manual_common',true),
('புதுசு','pudhusu','["pudusu", "puthu"]',9000,'common','manual_common',true),
('பழசு','pazhasu','["palasu", "pazhaya"]',8900,'common','manual_common',true),

-- Particles and connectors
('தான்','thaan','["tan", "taan"]',9500,'common','manual_common',true),
('கூட','kooda','["kuda", "kuuda"]',9400,'common','manual_common',true),
('மட்டும்','mattum','["matum", "maatum"]',9300,'common','manual_common',true),
('போல','pola','["maadiri", "polla"]',9200,'common','manual_common',true),
('ஆனா','aana','["ana", "aanaal"]',9100,'common','manual_common',true),
('அப்போ','appo','["appa", "approm"]',9000,'common','manual_common',true)

ON CONFLICT (transliteration) DO UPDATE SET 
  frequency = GREATEST(tamil_words.frequency, EXCLUDED.frequency),
  alternate_spellings = EXCLUDED.alternate_spellings,
  is_verified = EXCLUDED.is_verified;

COMMIT;
