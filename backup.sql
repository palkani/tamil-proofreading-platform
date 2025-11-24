--
-- PostgreSQL database dump
--

\restrict 0n2oYJmqU2kmdF9RJssdEMa15RKs2gY5TZ5Qgt4BlqlbZN4xMertf6RMbtxs4AR

-- Dumped from database version 16.9 (415ebe8)
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.activity_events (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    event_type character varying(50) NOT NULL,
    metadata jsonb,
    occurred_at timestamp with time zone NOT NULL
);


ALTER TABLE public.activity_events OWNER TO neondb_owner;

--
-- Name: activity_events_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.activity_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.activity_events_id_seq OWNER TO neondb_owner;

--
-- Name: activity_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.activity_events_id_seq OWNED BY public.activity_events.id;


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.contact_messages (
    id bigint NOT NULL,
    user_id bigint,
    email character varying(160) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone,
    subject character varying(255) NOT NULL
);


ALTER TABLE public.contact_messages OWNER TO neondb_owner;

--
-- Name: contact_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.contact_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.contact_messages_id_seq OWNER TO neondb_owner;

--
-- Name: contact_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.contact_messages_id_seq OWNED BY public.contact_messages.id;


--
-- Name: daily_activity_stats; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.daily_activity_stats (
    id bigint NOT NULL,
    date date NOT NULL,
    registrations bigint DEFAULT 0 NOT NULL,
    logins bigint DEFAULT 0 NOT NULL,
    drafts_created bigint DEFAULT 0 NOT NULL,
    ai_requests bigint DEFAULT 0 NOT NULL,
    suggestions_accepted bigint DEFAULT 0 NOT NULL,
    avg_ai_latency numeric DEFAULT 0,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.daily_activity_stats OWNER TO neondb_owner;

--
-- Name: daily_activity_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.daily_activity_stats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_activity_stats_id_seq OWNER TO neondb_owner;

--
-- Name: daily_activity_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.daily_activity_stats_id_seq OWNED BY public.daily_activity_stats.id;


--
-- Name: daily_visit_stats; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.daily_visit_stats (
    id bigint NOT NULL,
    date date NOT NULL,
    total_visits bigint DEFAULT 0 NOT NULL,
    unique_visitors bigint DEFAULT 0 NOT NULL,
    unique_users bigint DEFAULT 0 NOT NULL,
    bounce_rate numeric DEFAULT 0,
    avg_session_time numeric DEFAULT 0,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.daily_visit_stats OWNER TO neondb_owner;

--
-- Name: daily_visit_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.daily_visit_stats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_visit_stats_id_seq OWNER TO neondb_owner;

--
-- Name: daily_visit_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.daily_visit_stats_id_seq OWNED BY public.daily_visit_stats.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'INR'::text,
    status text DEFAULT 'pending'::text,
    payment_method text NOT NULL,
    payment_type text NOT NULL,
    transaction_id text,
    gateway_payment_id text,
    invoice_number text,
    invoice_url text,
    description text,
    metadata jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


ALTER TABLE public.payments OWNER TO neondb_owner;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO neondb_owner;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.refresh_tokens (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash character varying(128) NOT NULL,
    user_agent character varying(255),
    ip_address character varying(64),
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.refresh_tokens OWNER TO neondb_owner;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.refresh_tokens_id_seq OWNER TO neondb_owner;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.submissions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    original_text text NOT NULL,
    original_html text,
    request_id character varying(64),
    proofread_text text,
    word_count bigint NOT NULL,
    model_used text NOT NULL,
    status text DEFAULT 'pending'::text,
    suggestions jsonb,
    alternatives jsonb,
    include_alternatives boolean DEFAULT false,
    error text,
    processing_time numeric,
    cost numeric DEFAULT 0,
    archived boolean DEFAULT false,
    archived_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


ALTER TABLE public.submissions OWNER TO neondb_owner;

--
-- Name: submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.submissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.submissions_id_seq OWNER TO neondb_owner;

--
-- Name: submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.submissions_id_seq OWNED BY public.submissions.id;


--
-- Name: tamil_words; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tamil_words (
    id bigint NOT NULL,
    tamil_text character varying(255) NOT NULL,
    transliteration character varying(255) NOT NULL,
    alternate_spellings text,
    frequency bigint DEFAULT 0,
    category text DEFAULT 'common'::text,
    meaning text,
    example text,
    is_verified boolean DEFAULT false,
    source character varying(100),
    user_confirmed bigint DEFAULT 0,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


ALTER TABLE public.tamil_words OWNER TO neondb_owner;

--
-- Name: tamil_words_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.tamil_words_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tamil_words_id_seq OWNER TO neondb_owner;

--
-- Name: tamil_words_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.tamil_words_id_seq OWNED BY public.tamil_words.id;


--
-- Name: usages; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.usages (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    word_count bigint NOT NULL,
    model_used text NOT NULL,
    submission_id bigint,
    date timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


ALTER TABLE public.usages OWNER TO neondb_owner;

--
-- Name: usages_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.usages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usages_id_seq OWNER TO neondb_owner;

--
-- Name: usages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.usages_id_seq OWNED BY public.usages.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text,
    role text DEFAULT 'writer'::text,
    subscription text DEFAULT 'free'::text,
    subscription_end timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: visit_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.visit_events (
    id bigint NOT NULL,
    session_id character varying(64) NOT NULL,
    user_id bigint,
    route character varying(255) NOT NULL,
    referrer character varying(500),
    truncated_ip character varying(20),
    user_agent_hash character varying(64),
    country_code character varying(2),
    device_type character varying(20),
    occurred_at timestamp with time zone NOT NULL
);


ALTER TABLE public.visit_events OWNER TO neondb_owner;

--
-- Name: visit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.visit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.visit_events_id_seq OWNER TO neondb_owner;

--
-- Name: visit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.visit_events_id_seq OWNED BY public.visit_events.id;


--
-- Name: activity_events id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.activity_events ALTER COLUMN id SET DEFAULT nextval('public.activity_events_id_seq'::regclass);


--
-- Name: contact_messages id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contact_messages ALTER COLUMN id SET DEFAULT nextval('public.contact_messages_id_seq'::regclass);


--
-- Name: daily_activity_stats id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.daily_activity_stats ALTER COLUMN id SET DEFAULT nextval('public.daily_activity_stats_id_seq'::regclass);


--
-- Name: daily_visit_stats id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.daily_visit_stats ALTER COLUMN id SET DEFAULT nextval('public.daily_visit_stats_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: submissions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.submissions ALTER COLUMN id SET DEFAULT nextval('public.submissions_id_seq'::regclass);


--
-- Name: tamil_words id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tamil_words ALTER COLUMN id SET DEFAULT nextval('public.tamil_words_id_seq'::regclass);


--
-- Name: usages id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usages ALTER COLUMN id SET DEFAULT nextval('public.usages_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: visit_events id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.visit_events ALTER COLUMN id SET DEFAULT nextval('public.visit_events_id_seq'::regclass);


--
-- Data for Name: activity_events; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.activity_events (id, user_id, event_type, metadata, occurred_at) FROM stdin;
\.


--
-- Data for Name: contact_messages; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.contact_messages (id, user_id, email, message, created_at, subject) FROM stdin;
\.


--
-- Data for Name: daily_activity_stats; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.daily_activity_stats (id, date, registrations, logins, drafts_created, ai_requests, suggestions_accepted, avg_ai_latency, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: daily_visit_stats; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.daily_visit_stats (id, date, total_visits, unique_visitors, unique_users, bounce_rate, avg_session_time, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.payments (id, user_id, amount, currency, status, payment_method, payment_type, transaction_id, gateway_payment_id, invoice_number, invoice_url, description, metadata, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.refresh_tokens (id, user_id, token_hash, user_agent, ip_address, expires_at, revoked_at, created_at, updated_at) FROM stdin;
1	2	60fce926dbb0a62ad1fee52ebc54708ce0f882bd4534213547253db510ae3bb1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	24.126.167.72	2025-11-29 21:27:30.235804+00	\N	2025-11-22 21:27:30.27867+00	2025-11-22 21:27:30.27867+00
2	3	75d9bef8d8689ff8563badcbfbe589350e401819ce3932a0d48103e3fe1063f3	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	24.126.167.72	2025-11-29 21:44:09.142558+00	\N	2025-11-22 21:44:09.185043+00	2025-11-22 21:44:09.185043+00
3	3	eb9608ecdab292dfc02f8d40c51980d794cb55badda8c1037cc4e8d5aff8482a	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36	24.126.167.72	2025-11-29 22:26:39.527351+00	\N	2025-11-22 22:26:39.56722+00	2025-11-22 22:26:39.56722+00
\.


--
-- Data for Name: submissions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.submissions (id, user_id, original_text, original_html, request_id, proofread_text, word_count, model_used, status, suggestions, alternatives, include_alternatives, error, processing_time, cost, archived, archived_at, created_at, updated_at, deleted_at) FROM stdin;
1	1	வணக்கம் இது ஒரு சோதனை வரைவு. இது சேமிக்கப்பட வேண்டும்.	<p>வணக்கம் இது ஒரு சோதனை வரைவு. இது சேமிக்கப்பட வேண்டும்.</p>	2ef86e4e-c60b-4e9a-977b-7beb72b76ff3	வணக்கம்! இது ஒரு சோதனை வரைவு. இது சேமிக்கப்பட வேண்டும்.	8	model_a	completed	[{"type": "punctuation", "reason": "Missing punctuation at the end of the greeting. A comma or exclamation mark is needed for clarity.", "original": "வணக்கம் இது", "corrected": "வணக்கம்!", "end_index": 0, "start_index": 0}, {"type": "clarity", "reason": "No correction needed; the sentence is correct.", "original": "சேமிக்கப்பட வேண்டும்.", "corrected": "சேமிக்கப்பட வேண்டும்.", "end_index": 0, "start_index": 0}]	["வணக்கம்! இது ஒரு சோதனை வரைவு. இது சேமிக்கப்பட வேண்டும்.", "வணக்கம்!", "இது ஒரு சோதனை வரைவு.?!", "இது சேமிக்கப்பட வேண்டும்.?!"]	f		4.834068594	0	f	\N	2025-11-16 20:04:15.760795+00	2025-11-16 20:04:20.956443+00	\N
2	1	tamil	tamil&nbsp;	73fdbbec-cc27-4be3-8f27-631d64164883	tamil	1	model_a	completed	[]	["tamil.?!"]	f		1.534558164	0	f	\N	2025-11-17 14:08:05.863523+00	2025-11-17 14:08:08.022471+00	\N
10	1	தமிழ் தமிழ் tamil	தமிழ் தமிழ் tamil	a80c3531-2c49-4f4f-b525-86d774f3a925	தமிழ் தமிழ் tamil	3	model_a	completed	[]	["தமிழ் தமிழ் tamil.?!"]	f		0.939402022	0	f	\N	2025-11-17 14:43:40.88204+00	2025-11-17 14:43:42.098658+00	\N
3	1	tamil	tamil	6945379e-79d7-4af2-bb74-0b797143995c	tamil	1	model_a	completed	[]	["tamil.?!"]	f		1.841177002	0	f	\N	2025-11-17 14:15:28.275011+00	2025-11-17 14:15:30.470332+00	\N
4	1	tamil	tamil	b711c348-7277-477c-9523-6658c6b053d7	tamil	1	model_a	completed	[]	["tamil.?!"]	f		1.707795864	0	f	\N	2025-11-17 14:15:35.69813+00	2025-11-17 14:15:37.768293+00	\N
5	1	tamil	tamil	2a9f53a8-5a03-4bd0-be8e-f430ffe4655c	tamil	1	model_a	completed	[]	["tamil.?!"]	f		0.636389333	0	f	\N	2025-11-17 14:18:07.582542+00	2025-11-17 14:18:08.865631+00	\N
11	1	தமிழ் thenral	தமிழ் thenral	6f3ce099-950d-452d-9a2e-bcd8efda72f9	தமிழ் தென்றல்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'thenral' should be corrected to 'தென்றல்' to follow proper Tamil spelling rules, as it is a common spelling mistake.", "original": "தமிழ் thenral", "corrected": "தமிழ் தென்றல்", "end_index": 0, "start_index": 0}]	["தமிழ் தென்றல்", "தமிழ் தென்றல்.?!"]	f		2.614362702	0	f	\N	2025-11-17 14:48:25.126735+00	2025-11-17 14:48:28.333952+00	\N
6	1	tamil	tamil	78fe448b-7f35-4026-8006-8bb15ef47a03	tamil	1	model_a	completed	[]	["tamil.?!"]	f		0.809711741	0	f	\N	2025-11-17 14:34:53.254532+00	2025-11-17 14:34:54.423279+00	\N
7	1	தமிழ் tamil	தமிழ் tamil	7aa623c5-f971-4894-8ee2-6f8f987157ed	தமிழ்	2	model_a	completed	[{"type": "clarity", "reason": "Redundant use of 'tamil' in English; the word 'தமிழ்' is sufficient to convey the meaning.", "original": "தமிழ் tamil", "corrected": "தமிழ்", "end_index": 0, "start_index": 0}]	["தமிழ்", "தமிழ்.?!"]	f		2.131035911	0	f	\N	2025-11-17 14:34:55.42875+00	2025-11-17 14:34:57.864692+00	\N
14	1	thenral	thenral&nbsp;	84cbe532-231f-4d64-86a0-e502c47658df	தென்றல்	1	model_a	completed	[{"type": "spelling", "reason": "The word 'thenral' should be spelled as 'தென்றல்' to adhere to Tamil spelling conventions.", "original": "thenral", "corrected": "தென்றல்", "end_index": 0, "start_index": 0}]	["தென்றல்", "தென்றல்.?!"]	f		2.551581006	0	f	\N	2025-11-17 14:54:00.82623+00	2025-11-17 14:54:03.755588+00	\N
8	1	தமிழ் tamil	தமிழ் tamil	f6e80df7-4621-4f2f-b33a-af1b5805929e	தமிழ்	2	model_a	completed	[{"type": "general", "reason": "Text was corrected", "original": "தமிழ் tamil", "corrected": "தமிழ்", "end_index": 0, "start_index": 0}]	["தமிழ்", "தமிழ்.?!"]	f		2.116098129	0	f	\N	2025-11-17 14:43:29.536309+00	2025-11-17 14:43:32.32359+00	\N
12	1	தமிழ்	தமிழ்&nbsp;	8ac7b41f-585d-4a22-95f4-262848d6da06	தமிழ்	1	model_a	completed	[]	["தமிழ்.?!"]	f		1.4134398639999999	0	f	\N	2025-11-17 14:48:29.219472+00	2025-11-17 14:48:30.972279+00	\N
9	1	தமிழ் tamil	தமிழ் tamil	0f0274f7-f948-4f18-82fc-0ae1975c779f	தமிழ்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'tamil' should be written in Tamil script as 'தமிழ்' for proper representation of the language.", "original": "tamil", "corrected": "தமிழ்", "end_index": 0, "start_index": 0}]	["தமிழ்", "தமிழ்.?!"]	f		2.052501411	0	f	\N	2025-11-17 14:43:37.382227+00	2025-11-17 14:43:39.802678+00	\N
13	1	தமிழ் தமிழ்	தமிழ்&nbsp;தமிழ்	ed44df67-c366-4699-ac80-482aa8743321	தமிழ் தமிழ்	2	model_a	completed	[{"type": "spelling", "reason": "Remove unnecessary space between words for proper word boundary.", "original": "தமிழ் தமிழ்", "corrected": "தமிழ் தமிழ்", "end_index": 0, "start_index": 0}]	["தமிழ் தமிழ்", "தமிழ் தமிழ்.?!"]	f		2.3206229	0	f	\N	2025-11-17 14:51:17.636321+00	2025-11-17 14:51:20.641882+00	\N
16	1	thenral	thenral	fba40849-460b-4d07-9661-772fc2f829c8	தென்றல்	1	model_a	completed	[{"type": "spelling", "reason": "The word 'thenral' is incorrectly spelled in Roman script; it should be spelled as 'தென்றல்' in Tamil script to maintain proper spelling rules.", "original": "thenral", "corrected": "தென்றல்", "end_index": 0, "start_index": 0}]	["தென்றல்", "தென்றல்.?!"]	f		1.127229561	0	f	\N	2025-11-17 15:07:35.944642+00	2025-11-17 15:07:37.709273+00	\N
15	1	today	today	3637c05d-cc78-4952-9a13-b85aa84f1a89	today	1	model_a	completed	[]	["today.?!"]	f		3.153440355	0	f	\N	2025-11-17 14:54:06.115195+00	2025-11-17 14:54:09.573109+00	\N
17	1	தஎனரஅல	தஎனரஅல	831e687f-e982-450b-9e9c-5078fda62b6f	தெனரியல்	1	model_a	completed	[{"type": "spelling", "reason": "Spelling correction to adhere to Tamil spelling rules and ensure proper word formation.", "original": "தஎனரஅல", "corrected": "தெனரியல்", "end_index": 0, "start_index": 0}]	["தெனரியல்", "தெனரியல்.?!"]	f		2.449843848	0	f	\N	2025-11-17 15:17:29.077915+00	2025-11-17 15:17:32.134872+00	\N
18	1	thenral	thenral	0e466ca9-0169-41b4-b948-1bffe4629fb1	தென்றல்	1	model_a	completed	[{"type": "spelling", "reason": "The word 'thenral' should be spelled as 'தென்றல்' to conform to Tamil spelling rules.", "original": "thenral", "corrected": "தென்றல்", "end_index": 0, "start_index": 0}]	["தென்றல்", "தென்றல்.?!"]	f		2.5143207199999997	0	f	\N	2025-11-17 15:26:03.493262+00	2025-11-17 15:26:06.620648+00	\N
22	1	தமிழ் thentral	தமிழ் thentral	c819401d-ac0c-4acd-bbb4-5b0577c2c6ee	தமிழ் செந்தமிழ்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'thentral' is a transliteration error; the correct term in Tamil is 'செந்தமிழ்' which refers to the classical Tamil language.", "original": "thentral", "corrected": "செந்தமிழ்", "end_index": 0, "start_index": 0}]	["தமிழ் செந்தமிழ்", "தமிழ் செந்தமிழ்.?!"]	f		3.438245015	0	f	\N	2025-11-17 17:10:01.626331+00	2025-11-17 17:10:05.408946+00	\N
19	1	thentral	thentral	8c37883a-ee22-4f93-af65-e25e9fa2aa93	தென்றல்	1	model_a	completed	[{"type": "spelling", "reason": "Spelling correction to adhere to Tamil phonetics and proper spelling rules.", "original": "thentral", "corrected": "தென்றல்", "end_index": 0, "start_index": 0}]	["தென்றல்", "தென்றல்.?!"]	f		1.675111406	0	f	\N	2025-11-17 15:26:12.697268+00	2025-11-17 15:26:14.671403+00	\N
20	1	நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	85e45fab-593e-4c35-a95b-392b1b518d53	நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	23	model_a	completed	[{"type": "punctuation", "reason": "Missing space after the comma for proper punctuation.", "original": "வலுப்படுத்துவதற்கும்,நம்", "corrected": "வலுப்படுத்துவதற்கும், நம்", "end_index": 0, "start_index": 0}, {"type": "clarity", "reason": "The word is correct but ensure it is used in the right context. Consider using 'புதுப்பிக்க' for clarity.", "original": "புதுப்பித்தல்", "corrected": "புதுப்பித்தல்", "end_index": 0, "start_index": 0}]	["நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.", "நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும்.?!", "இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.?!"]	f		9.361115297	0	f	\N	2025-11-17 15:28:39.492817+00	2025-11-17 15:28:49.240381+00	\N
25	1	தமிழ் தஎனடரஅல paalkani	தமிழ் தஎனடரஅல paalkani	4b5694ef-46f1-41f6-978f-73a5e8e8a798	தமிழ் தெனடரஅல பால்கனி	3	model_a	completed	[{"type": "spelling", "reason": "Incorrect spelling; the correct form is 'தெனடரஅல' which maintains the intended meaning.", "original": "தஎனடரஅல", "corrected": "தெனடரஅல", "end_index": 0, "start_index": 0}, {"type": "spelling", "reason": "Incorrect transliteration; the correct Tamil spelling is 'பால்கனி'.", "original": "paalkani", "corrected": "பால்கனி", "end_index": 0, "start_index": 0}]	["தமிழ் தெனடரஅல பால்கனி", "தமிழ் தெனடரஅல பால்கனி.?!"]	f		3.65300048	0	f	\N	2025-11-17 17:10:16.223907+00	2025-11-17 17:10:20.137343+00	\N
21	1	தமிழ் thenral	தமிழ் thenral	e063218b-dfa4-4424-ac1d-a7c9ef8c9752	தமிழ் தென்றல்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'thenral' should be spelled as 'தென்றல்' to follow proper Tamil spelling rules.", "original": "தமிழ் thenral", "corrected": "தமிழ் தென்றல்", "end_index": 0, "start_index": 0}]	["தமிழ் தென்றல்", "தமிழ் தென்றல்.?!"]	f		2.794386907	0	f	\N	2025-11-17 17:09:56.694281+00	2025-11-17 17:10:00.125845+00	\N
23	1	தமிழ் தஎனடரஅல	தமிழ் தஎனடரஅல	b08f3e12-7191-4535-999f-e6efc191ea0c	தமிழ் எனது மொழி.	2	model_a	completed	[{"type": "spelling", "reason": "Spelling correction needed for clarity and proper meaning; 'தஎனடரஅல' is not a valid word in Tamil.", "original": "தஎனடரஅல", "corrected": "எனது மொழி", "end_index": 0, "start_index": 0}]	["தமிழ் எனது மொழி.", "தமிழ் எனது மொழி.?!"]	f		2.680686911	0	f	\N	2025-11-17 17:10:06.354052+00	2025-11-17 17:10:09.292247+00	\N
24	1	தமிழ் தஎனடரஅல palkani	தமிழ் தஎனடரஅல palkani	d940db57-8ae7-4e4a-9acf-f63d57ccb83c	தமிழ் தெனடரஅல பற்கணி	3	model_a	completed	[{"type": "spelling", "reason": "Correct spelling of the word 'தெனடரஅல' to maintain proper Tamil spelling rules.", "original": "தஎனடரஅல", "corrected": "தெனடரஅல", "end_index": 0, "start_index": 0}, {"type": "spelling", "reason": "Transliteration correction to ensure proper Tamil representation of the word.", "original": "palkani", "corrected": "பற்கணி", "end_index": 0, "start_index": 0}]	["தமிழ் தெனடரஅல பற்கணி", "தமிழ் தெனடரஅல பற்கணி.?!"]	f		4.6382085669999995	0	f	\N	2025-11-17 17:10:12.523839+00	2025-11-17 17:10:17.420311+00	\N
28	1	தமிழ் ten பால்கனி	தமிழ் ten பால்கனி	e4b9d26c-e2d7-497a-a92a-f6a032e54efa	தமிழ் 10 பால்கனி	3	model_a	completed	[{"type": "clarity", "reason": "Use numerals for clarity and consistency in numerical representation.", "original": "ten", "corrected": "10", "end_index": 0, "start_index": 0}]	["தமிழ் 10 பால்கனி", "தமிழ் 10 பால்கனி.?!"]	f		2.553457468	0	f	\N	2025-11-17 17:10:36.62328+00	2025-11-17 17:10:39.434186+00	\N
38	1	தென்றல் தமிழ் thaay	தென்றல் தமிழ் thaay	afa539d6-8612-4f42-8b02-a66013cef237	தென்றல் தமிழ் தாய்	3	model_a	completed	[{"type": "spelling", "reason": "The word 'thaay' should be written in Tamil script as 'தாய்' to maintain proper spelling and context.", "original": "thaay", "corrected": "தாய்", "end_index": 0, "start_index": 0}]	["தென்றல் தமிழ் தாய்", "தென்றல் தமிழ் தாய்.?!"]	f		2.576718094	0	f	\N	2025-11-17 17:40:58.818692+00	2025-11-17 17:41:01.66723+00	\N
26	1	தமிழ் தஎனடரஅல paalkani	தமிழ் தஎனடரஅல paalkani	705ee7bc-f8b0-4ff8-b44f-cf5f3fbb6900	தமிழ் தனித்தன்மை பால் கணி	3	model_a	completed	[{"type": "spelling", "reason": "Spelling correction for the word 'தனித்தன்மை' which means 'uniqueness' in context.", "original": "தஎனடரஅல", "corrected": "தனித்தன்மை", "end_index": 0, "start_index": 0}, {"type": "spelling", "reason": "Transliteration correction to ensure proper Tamil spelling and pronunciation.", "original": "paalkani", "corrected": "பால் கணி", "end_index": 0, "start_index": 0}]	["தமிழ் தனித்தன்மை பால் கணி", "தமிழ் தனித்தன்மை பால் கணி.?!"]	f		2.8698447160000002	0	f	\N	2025-11-17 17:10:22.089915+00	2025-11-17 17:10:25.218965+00	\N
34	1	thentral	thentral	c883695e-f1ac-4c6d-b418-bfd47c3baffd	தென்றல்	1	model_a	completed	[{"type": "spelling", "reason": "The spelling 'thentral' is incorrect; the correct Tamil spelling is 'தென்றல்' which means 'breeze'.", "original": "thentral", "corrected": "தென்றல்", "end_index": 0, "start_index": 0}]	["தென்றல்", "தென்றல்.?!"]	f		1.952580893	0	f	\N	2025-11-17 17:40:29.512473+00	2025-11-17 17:40:31.870012+00	\N
27	1	தமிழ் தஎனடரஅல பால்கனி	தமிழ் தஎனடரஅல பால்கனி	7a67c0e4-36f4-4c16-b50e-749486024b94	தமிழ் தெனடரல பால்கனி	3	model_a	completed	[{"type": "spelling", "reason": "Spelling correction for proper Tamil word structure; 'தஎனடரஅல' is incorrect and should be 'தெனடரல'.", "original": "தஎனடரஅல", "corrected": "தெனடரல", "end_index": 0, "start_index": 0}]	["தமிழ் தெனடரல பால்கனி", "தமிழ் தெனடரல பால்கனி.?!"]	f		3.242616895	0	f	\N	2025-11-17 17:10:26.431928+00	2025-11-17 17:10:29.932329+00	\N
29	1	தமிழ் tentral பால்கனி	தமிழ் tentral பால்கனி	dcababf7-c000-4093-b6f9-cb53b0bd4ca5	தமிழ் தென்றல் பால்கனி	3	model_a	completed	[{"type": "spelling", "reason": "Incorrect spelling; 'tentral' should be corrected to 'தென்றல்' to follow Tamil spelling rules.", "original": "tentral", "corrected": "தென்றல்", "end_index": 0, "start_index": 0}]	["தமிழ் தென்றல் பால்கனி", "தமிழ் தென்றல் பால்கனி.?!"]	f		2.106873784	0	f	\N	2025-11-17 17:10:40.466242+00	2025-11-17 17:10:42.829738+00	\N
30	1	தமிழ்  பால்கனி	தமிழ்&nbsp; பால்கனி	4f0c028f-dff1-4574-90b4-9f4dd3c65989	தமிழ் பால்கனி	2	model_a	completed	[{"type": "general", "reason": "Text was corrected", "original": "தமிழ்  பால்கனி", "corrected": "தமிழ் பால்கனி", "end_index": 0, "start_index": 0}]	["தமிழ் பால்கனி", "தமிழ் பால்கனி.?!"]	f		1.369309326	0	f	\N	2025-11-17 17:10:45.610217+00	2025-11-17 17:10:47.235952+00	\N
31	1	தமிழ் sangam	தமிழ் sangam	7664edce-2dbb-4afc-b4eb-9901518c8bc6	தமிழ் சங்கம்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'sangam' should be written in Tamil script as 'சங்கம்' to maintain proper spelling and context.", "original": "sangam", "corrected": "சங்கம்", "end_index": 0, "start_index": 0}]	["தமிழ் சங்கம்", "தமிழ் சங்கம்.?!"]	f		2.500176699	0	f	\N	2025-11-17 17:26:19.655327+00	2025-11-17 17:26:22.513382+00	\N
35	1	தென்றல் tamil	தென்றல் tamil	07da6f97-edaf-4a08-b1ab-c0456bd8162f	தென்றல்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'tamil' should be corrected to 'தமிழ்' to properly represent the Tamil language in its native script.", "original": "tamil", "corrected": "தமிழ்", "end_index": 0, "start_index": 0}]	["தென்றல்", "தென்றல்.?!"]	f		2.464454805	0	f	\N	2025-11-17 17:40:46.901298+00	2025-11-17 17:40:49.721462+00	\N
32	1	தமிழ் sangam	தமிழ் sangam	984a7357-7c22-4f14-ae68-63d63c9ce023	தமிழ் சங்கம்	2	model_a	completed	[{"type": "spelling", "reason": "Spelling correction to ensure proper Tamil representation of the word 'sangam'.", "original": "sangam", "corrected": "சங்கம்", "end_index": 0, "start_index": 0}]	["தமிழ் சங்கம்", "தமிழ் சங்கம்.?!"]	f		2.769888554	0	f	\N	2025-11-17 17:26:29.659265+00	2025-11-17 17:26:32.789374+00	\N
33	1	தமிழ் singam	தமிழ் singam	9dbf062e-880d-4796-b9f4-328acf0da6ce	தமிழ் சிங்கம்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'singam' should be written in Tamil script as 'சிங்கம்' to maintain proper spelling and context.", "original": "singam", "corrected": "சிங்கம்", "end_index": 0, "start_index": 0}]	["தமிழ் சிங்கம்", "தமிழ் சிங்கம்.?!"]	f		2.231192743	0	f	\N	2025-11-17 17:26:36.810874+00	2025-11-17 17:26:39.301025+00	\N
36	1	தென்றல் தமிழ் thai	தென்றல் தமிழ் thai	b594afed-661d-44d5-bc42-5a665fbba117	தென்றல் தமிழ்	3	model_a	completed	[{"type": "spelling", "reason": "The word 'thai' is incorrect in this context; it should be 'தமிழ்' to refer to the Tamil language.", "original": "thai", "corrected": "தமிழ்", "end_index": 0, "start_index": 0}]	["தென்றல் தமிழ்", "தென்றல் தமிழ்.?!"]	f		1.867023761	0	f	\N	2025-11-17 17:40:51.86992+00	2025-11-17 17:40:54.00891+00	\N
37	1	தென்றல் தமிழ் thaai	தென்றல் தமிழ் thaai	ba517e0f-d807-4b09-98cc-b6c40bb66278	தென்றல் தமிழ் தாய்	3	model_a	completed	[{"type": "spelling", "reason": "The word 'thaai' should be corrected to the proper Tamil spelling 'தாய்' to maintain the intended meaning of 'mother' in Tamil.", "original": "thaai", "corrected": "தாய்", "end_index": 0, "start_index": 0}]	["தென்றல் தமிழ் தாய்", "தென்றல் தமிழ் தாய்.?!"]	f		3.198094008	0	f	\N	2025-11-17 17:40:56.284976+00	2025-11-17 17:40:59.755246+00	\N
39	1	தென்றல் தமிழ் thaa	தென்றல் தமிழ் thaa	b88fe895-49af-42cf-96c0-6c141e5e6a5c	தென்றல் தமிழ்	3	model_a	completed	[{"type": "spelling", "reason": "The word 'thaa' is incorrectly spelled and should be replaced with the correct Tamil word 'தமிழ்' to maintain proper spelling and meaning.", "original": "thaa", "corrected": "தமிழ்", "end_index": 0, "start_index": 0}]	["தென்றல் தமிழ்", "தென்றல் தமிழ்.?!"]	f		5.747558651	0	f	\N	2025-11-17 17:41:03.258838+00	2025-11-17 17:41:09.278135+00	\N
40	1	தமிழ் தென்றல் thenmo	தமிழ் தென்றல் thenmo	b439899b-b448-4242-8867-0120b50518aa	தமிழ் தென்றல்	3	model_a	completed	[{"type": "general", "reason": "Text was corrected", "original": "தமிழ் தென்றல் thenmo", "corrected": "தமிழ் தென்றல்", "end_index": 0, "start_index": 0}]	["தமிழ் தென்றல்", "தமிழ் தென்றல்.?!"]	f		0.889370455	0	f	\N	2025-11-17 17:52:18.890545+00	2025-11-17 17:52:20.112895+00	\N
49	1	தமிழ்	<b><i><u>தமிழ் </u></i></b>	a6f36b58-89aa-4df8-ab1e-fb352e748bdb	தமிழ்	1	model_a	completed	[]	["தமிழ்.?!"]	f		1.175634202	0	f	\N	2025-11-17 20:15:09.042834+00	2025-11-17 20:15:10.532659+00	\N
41	1	தமிழ் தென்றல் thenmoli	தமிழ் தென்றல் thenmoli	93a55f51-8468-4eb1-ba82-0a4f6c4da6f3	தமிழ் தென்றல்	3	model_a	completed	[{"type": "general", "reason": "Text was corrected", "original": "தமிழ் தென்றல் thenmoli", "corrected": "தமிழ் தென்றல்", "end_index": 0, "start_index": 0}]	["தமிழ் தென்றல்", "தமிழ் தென்றல்.?!"]	f		1.206202544	0	f	\N	2025-11-17 17:52:21.195005+00	2025-11-17 17:52:22.704372+00	\N
46	1	ராஜா chozhan	ராஜா chozhan	8bd54117-5720-47a5-b683-7e5994a9e3b2	ராஜா சோழன்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'chozhan' should be corrected to 'சோழன்' to adhere to proper Tamil spelling conventions.", "original": "chozhan", "corrected": "சோழன்", "end_index": 0, "start_index": 0}]	["ராஜா சோழன்", "ராஜா சோழன்.?!"]	f		2.307789065	0	f	\N	2025-11-17 17:56:10.536442+00	2025-11-17 17:56:13.107383+00	\N
42	1	தமிழ் தென்றல் raja	தமிழ் தென்றல் raja	13f12234-bac9-42d2-99c9-32fc298d3b53	தமிழ் தென்றல் ராஜா	3	model_a	completed	[{"type": "spelling", "reason": "Spelling correction to use the appropriate Tamil script for 'Tamil'.", "original": "tamil", "corrected": "தமிழ்", "end_index": 0, "start_index": 0}, {"type": "spelling", "reason": "Spelling correction to use the appropriate Tamil script for 'tendral'.", "original": "tendral", "corrected": "தென்றல்", "end_index": 0, "start_index": 0}, {"type": "spelling", "reason": "Spelling correction to use the appropriate Tamil script for 'raja'.", "original": "raja", "corrected": "ராஜா", "end_index": 0, "start_index": 0}]	["தமிழ் தென்றல் ராஜா", "தமிழ் தென்றல் ராஜா.?!"]	f		7.594418037	0	f	\N	2025-11-17 17:52:35.842783+00	2025-11-17 17:52:43.695098+00	\N
43	1	ராஜா cholan	ராஜா cholan	9ec0feb1-2772-4d9f-aceb-59e7c5d8a82e	ராஜா சோழன்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'cholaan' is incorrectly transliterated; it should be written in Tamil script as 'சோழன்' to maintain proper spelling and context.", "original": "cholaan", "corrected": "சோழன்", "end_index": 0, "start_index": 0}]	["ராஜா சோழன்", "ராஜா சோழன்.?!"]	f		3.447976117	0	f	\N	2025-11-17 17:55:51.146088+00	2025-11-17 17:55:57.292355+00	\N
44	1	ராஜா chollan	ராஜா chollan	6ebdd5f7-c68c-46c1-9d20-65c2c1cc09f4	ராஜா சோழன்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'chollan' is incorrectly transliterated; it should be written in Tamil script as 'சோழன்' to maintain proper spelling and context.", "original": "chollan", "corrected": "சோழன்", "end_index": 0, "start_index": 0}]	["ராஜா சோழன்", "ராஜா சோழன்.?!"]	f		3.825435446	0	f	\N	2025-11-17 17:55:54.279518+00	2025-11-17 17:55:58.452873+00	\N
47	1	தமிழ்	தமிழ்	93674e91-bfa2-4f39-90af-c4bd2cfef5b0	தமிழ்	1	model_a	completed	[]	["தமிழ்.?!"]	f		2.374866954	0	f	\N	2025-11-17 19:38:37.440893+00	2025-11-17 19:38:40.500156+00	\N
45	1	ராஜா chozhan	ராஜா chozhan	cc44efd0-c5b5-498b-9e48-79f162afa860	ராஜா சோழன்	2	model_a	completed	[{"type": "spelling", "reason": "The word 'chozhan' should be corrected to 'சோழன்' to adhere to proper Tamil spelling rules.", "original": "chozhan", "corrected": "சோழன்", "end_index": 0, "start_index": 0}]	["ராஜா சோழன்", "ராஜா சோழன்.?!"]	f		2.9926491200000003	0	f	\N	2025-11-17 17:56:01.525951+00	2025-11-17 17:56:04.787064+00	\N
48	1	தமிழ்	<b>தமிழ் </b>	8d2b809a-057f-4918-b3d4-b4572a1c460b	தமிழ்	1	model_a	completed	[]	["தமிழ்.?!"]	f		1.8343638009999998	0	f	\N	2025-11-17 20:15:04.296062+00	2025-11-17 20:15:06.823448+00	\N
50	1	தமிழ்	<b><i><u><font style="font-size: 28px;">தமிழ் </font></u></i></b>	2b62f97d-50e6-4c62-8ec2-e1ca27e7ed31	தமிழ்	1	model_a	completed	[]	["தமிழ்.?!"]	f		1.613478995	0	f	\N	2025-11-17 20:15:16.137006+00	2025-11-17 20:15:18.020087+00	\N
51	1	உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	<span style="font-size: 28px;"><b><i><u>உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம்.</u></i></b></span><div><span style="font-size: 28px;"><b><i><u>&nbsp;</u></i></b></span></div><div><span style="font-size: 28px;"><b><i><u>நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.</u></i></b></span></div><div><span style="font-size: 28px;"><b><i><u><br></u></i></b></span></div>	82fa991e-a830-4047-a5ab-7b1c772b92fe	உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும், உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	39	model_a	completed	[{"type": "punctuation", "reason": "Missing comma before 'உங்களுடைய' for clarity in the sentence structure.", "original": "நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய", "corrected": "நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும், உங்களுடைய", "end_index": 0, "start_index": 0}]	["உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும், உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.", "உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.?!", "glueup.?!", "com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம்.?!", "நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும், உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும்.?!", "இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.?!"]	f		5.981781218	0	f	\N	2025-11-17 20:20:10.695915+00	2025-11-17 20:20:17.085199+00	\N
52	1	உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	<div><span style="font-size: 28px;"><b><i><u>உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம்.</u></i></b></span></div><div><span style="font-size: 28px;"><b><i><u>&nbsp;</u></i></b></span></div><div><span style="font-size: 28px;"><b><i><u>நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.</u></i></b></span></div><div><span style="font-size: 28px;"><b><i><u><br></u></i></b></span></div>	79e3161f-5690-4d1e-b93a-6daedf5a2b7e	உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	39	model_a	completed	[{"type": "punctuation", "reason": "Missing space after comma for proper punctuation.", "original": "வலுப்படுத்துவதற்கும்,நம்", "corrected": "வலுப்படுத்துவதற்கும், நம்", "end_index": 0, "start_index": 0}]	["உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.", "உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.?!", "glueup.?!", "com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம்.?!", "நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும்.?!", "இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.?!"]	f		5.6794307029999995	0	f	\N	2025-11-17 20:20:35.77768+00	2025-11-17 20:20:41.796199+00	\N
53	1	உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம்.<div>&nbsp;</div><div>நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும்,நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும் உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.</div><div><br></div>	93af5c3c-dff9-4f7f-8740-867cd89240ae	உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும், உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.	39	model_a	completed	[{"type": "punctuation", "reason": "Missing space after the comma for proper punctuation.", "original": "வலுப்படுத்துவதற்கும்,நம்", "corrected": "வலுப்படுத்துவதற்கும், நம்", "end_index": 0, "start_index": 0}]	["உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.glueup.com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம். நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும், உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும். இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.", "உறுப்பினராகப் புதுப்பிக்க, உங்களுக்கு அனுப்பப்பட்ட புதுப்பித்தல் மின்னஞ்சலைப் பயன்படுத்தவும் அல்லது app.?!", "glueup.?!", "com இல் உள்நுழையவும், அங்கு நீங்கள் புதுப்பித்தல் தகவலைக் காணலாம்.?!", "நம் தமிழ் சமூகத்தை வலுப்படுத்துவதற்கும், நம் தமிழ் சொந்தங்கள் ஒன்றிணைவதற்கும், உங்களுடைய உறுப்பினர் பதிவை புதுப்பித்தல் மிக முக்கியமானதாகும்.?!", "இந்த அற்புதமான வாய்ப்பினை பயன்படுத்திக் கொண்டு அட்லாண்டா தமிழ் மன்றத்திற்கு ஆதரவு அளியுங்கள்.?!"]	f		4.744518069	0	f	\N	2025-11-17 20:21:20.86758+00	2025-11-17 20:21:25.871137+00	\N
54	1	படிக்க அதிகம் அட: டடப://tamil.oneindia.com/news/delhi/cji-gavai-exclude-creamy-layer-from-sc-reservation-751215.html?ref_source=OI-TA&ref_medium=Home-Page&ref_campaign=News-Cards	<div><br></div><div><br></div><div>படிக்க அதிகம் அட: டடப://tamil.oneindia.com/news/delhi/cji-gavai-exclude-creamy-layer-from-sc-reservation-751215.html?ref_source=OI-TA&amp;ref_medium=Home-Page&amp;ref_campaign=News-Cards</div>	f3bf6d83-35f2-4510-b25d-50844ac4ff0a	படிக்க அதிகம் அடிக்கடி: டடப://tamil.oneindia.com/news/delhi/cji-gavai-exclude-creamy-layer-from-sc-reservation-751215.html?ref_source=OI-TA&ref_medium=Home-Page&ref_campaign=News-Cards	4	model_a	completed	[{"type": "clarity", "reason": "The phrase 'அதிகம் அட:' is unclear and should be replaced with 'அதிகம் அடிக்கடி:' to convey the meaning of 'frequently' or 'often'.", "original": "அதிகம் அட:", "corrected": "அதிகம் அடிக்கடி:", "end_index": 0, "start_index": 0}]	["படிக்க அதிகம் அடிக்கடி: டடப://tamil.oneindia.com/news/delhi/cji-gavai-exclude-creamy-layer-from-sc-reservation-751215.html?ref_source=OI-TA&ref_medium=Home-Page&ref_campaign=News-Cards", "படிக்க அதிகம் அடிக்கடி: டடப://tamil.?!", "oneindia.?!", "com/news/delhi/cji-gavai-exclude-creamy-layer-from-sc-reservation-751215.?!", "html?!", "ref_source=OI-TA&ref_medium=Home-Page&ref_campaign=News-Cards.?!"]	f		3.311927775	0	f	\N	2025-11-17 20:59:39.912211+00	2025-11-17 20:59:43.620434+00	\N
61	1	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்ற	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்ற<div><br></div>	e72ba273-716f-4b66-9b74-4ac310bc2022	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்ற	60	model_a	completed	[{"type": "spelling", "reason": "'வயது' என்ற சொல்லுடன் 'பிரிவுகளின்' என்ற சொல் சேரும்போது, நிலைமொழியின் இறுதியில் உள்ள உகர ஈறு காரணமாக வலிக்கும் 'ப்' மிகும். இது புணர்ச்சி விதிப்படி வரும் மாற்றம்.", "original": "வயது பிரிவுகளின்", "corrected": "வயதுப் பிரிவுகளின்", "end_index": 0, "start_index": 0}, {"type": "grammar", "reason": "பன்மைச் செயலைக் குறிக்கும் 'நிகழ்ச்சிகள்' என்ற எழுவாய்க்குப் பொருத்தமான பலவின்பால் வினைமுற்றான 'நடைபெற்றன' என்பதே சரியான பயன்பாடு. 'நடைபெற்ற' என்பது பெயரெச்சமாக அமையும், இங்கு ஒரு முழுமையான வாக்கியத்திற்கு வினைமுற்று தேவை.", "original": "நடைபெற்ற", "corrected": "நடைபெற்றன.", "end_index": 0, "start_index": 0}]	[]	f		9.831430600000001	0	f	\N	2025-11-22 21:51:34.873743+00	2025-11-22 21:51:45.012658+00	\N
60	1	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்றன.	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்றன.<div><br></div>	38d2d0e8-3ba5-4a5e-9403-e2cf4f8835c1	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்றன.	60	model_a	completed	[{"type": "grammar", "reason": "உகர ஈற்றுப் பெயர்களுடன் வல்லினம் மிகும் விதிப்படி, 'வயது' என்ற சொல்லுடன் 'பிரிவுகளின்' என்ற சொல் சேரும்போது 'ப்' என்னும் வல்லெழுத்து மிகும்.", "original": "வயது பிரிவுகளின்", "corrected": "வயதுப் பிரிவுகளின்", "end_index": 0, "start_index": 0}, {"type": "grammar", "reason": "பெயரடையாக வரும் 'பல்சுவை' என்ற சொல்லுடன் 'கலை நிகழ்ச்சிகளை' என்ற சொல் சேரும்போது 'க்' என்னும் வல்லெழுத்து மிகும்.", "original": "பல்சுவை கலை நிகழ்ச்சிகளை", "corrected": "பல்சுவைக் கலை நிகழ்ச்சிகளை", "end_index": 0, "start_index": 0}, {"type": "grammar", "reason": "மகர ஈற்றுப் பெயர்களுடன் வல்லினம் மிகும் விதிப்படி, 'மன்றம்' என்ற சொல்லுடன் 'கலைக்குழுவின்' என்ற சொல் சேரும்போது 'க்' என்னும் வல்லெழுத்து மிகும்.", "original": "மன்ற கலைக்குழுவின்", "corrected": "மன்றக் கலைக்குழுவின்", "end_index": 0, "start_index": 0}]	[]	f		11.740484884	0	f	\N	2025-11-22 21:51:31.812756+00	2025-11-22 21:51:43.857963+00	\N
55	1	சரி பொருளாதார ரீதியில் முன்னேறியவர்கள் யார்? என்பதை எப்படி கண்டுபிடிப்பது? இதற்கான வரையரைகள் என்ன என்பது குறித்து சர்ச்சைகள் நீண்டுக்கொண்டே இருக்கின்றன. இந்நிலையில் இந்த கிரிமிலேயர் முறையை பட்டியல் சாதியினருக்கும் நீடிக்க வேண்டும் என்று கவாய் பேசியிருக்கிறார். 'இந்தியா மற்றும் 75 ஆண்டுகால இந்திய அரசியலமைப்பு' என்கிற தலைப்பின் கீழ் நடைபெற்ற நிகழ்ச்சியில் பங்கேற்றிருந்த கவாய், மேற்குறிப்பிட்டவாறு பேசியிருக்கிறார்.Read more at: https://tamil.oneindia.com/news/delhi/cji-gavai-exclude-creamy-layer-from-sc-reservation-751215.html?ref_source=OI-TA&ref_medium=Home-Page&ref_campaign=News-Cards	சரி பொருளாதார ரீதியில் முன்னேறியவர்கள் யார்? என்பதை எப்படி கண்டுபிடிப்பது? இதற்கான வரையரைகள் என்ன என்பது குறித்து சர்ச்சைகள் நீண்டுக்கொண்டே இருக்கின்றன. இந்நிலையில் இந்த கிரிமிலேயர் முறையை பட்டியல் சாதியினருக்கும் நீடிக்க வேண்டும் என்று கவாய் பேசியிருக்கிறார். 'இந்தியா மற்றும் 75 ஆண்டுகால இந்திய அரசியலமைப்பு' என்கிற தலைப்பின் கீழ் நடைபெற்ற நிகழ்ச்சியில் பங்கேற்றிருந்த கவாய், மேற்குறிப்பிட்டவாறு பேசியிருக்கிறார்.<div><br></div><div>Read more at: https://tamil.oneindia.com/news/delhi/cji-gavai-exclude-creamy-layer-from-sc-reservation-751215.html?ref_source=OI-TA&amp;ref_medium=Home-Page&amp;ref_campaign=News-Cards</div>	26ea1fc4-05b4-47a0-a756-f0cb71e2d71e	சரி, பொருளாதார ரீதியில் முன்னேறியவர்கள் யார் என்பதை எப்படி கண்டுபிடிப்பது? இதற்கான வரையறைகள் என்ன என்பது குறித்து சர்ச்சைகள் நீண்டுக்கொண்டே இருக்கின்றன. இந்நிலையில், இந்த கிரிமிலேயர் முறையை பட்டியல் சாதியினருக்கும் நீடிக்க வேண்டும் என்று கவாய் பேசியிருக்கிறார். 'இந்தியா மற்றும் 75 ஆண்டுகால இந்திய அரசியலமைப்பு' என்கிற தலைப்பின் கீழ் நடைபெற்ற நிகழ்ச்சியில் பங்கேற்றிருந்த கவாய், மேற்குறிப்பிட்டவாறு பேசியிருக்கிறார்.	45	model_a	completed	[{"type": "spelling", "reason": "Incorrect spelling; the correct term is 'வரையறைகள்' which means 'boundaries' or 'limits'.", "original": "வரையரைகள்", "corrected": "வரையறைகள்", "end_index": 0, "start_index": 0}, {"type": "punctuation", "reason": "Add a comma before 'இந்த கிரிமிலேயர்' for better sentence flow.", "original": "கவாய் பேசியிருக்கிறார்.", "corrected": "கவாய் பேசியிருக்கிறார்.", "end_index": 0, "start_index": 0}, {"type": "punctuation", "reason": "Add a comma for clarity and to separate clauses.", "original": "இந்நிலையில் இந்த கிரிமிலேயர் முறையை", "corrected": "இந்நிலையில், இந்த கிரிமிலேயர் முறையை", "end_index": 0, "start_index": 0}, {"type": "spelling", "reason": "Ensure proper spacing and spelling for clarity.", "original": "பட்டியல் சாதியினருக்கும்", "corrected": "பட்டியல் சாதியினருக்கும்", "end_index": 0, "start_index": 0}, {"type": "clarity", "reason": "Ensure consistent formatting and clarity in the title.", "original": "இந்தியா மற்றும் 75 ஆண்டுகால இந்திய அரசியலமைப்பு", "corrected": "இந்தியா மற்றும் 75 ஆண்டுகால இந்திய அரசியலமைப்பு", "end_index": 0, "start_index": 0}]	["சரி, பொருளாதார ரீதியில் முன்னேறியவர்கள் யார் என்பதை எப்படி கண்டுபிடிப்பது? இதற்கான வரையறைகள் என்ன என்பது குறித்து சர்ச்சைகள் நீண்டுக்கொண்டே இருக்கின்றன. இந்நிலையில், இந்த கிரிமிலேயர் முறையை பட்டியல் சாதியினருக்கும் நீடிக்க வேண்டும் என்று கவாய் பேசியிருக்கிறார். 'இந்தியா மற்றும் 75 ஆண்டுகால இந்திய அரசியலமைப்பு' என்கிற தலைப்பின் கீழ் நடைபெற்ற நிகழ்ச்சியில் பங்கேற்றிருந்த கவாய், மேற்குறிப்பிட்டவாறு பேசியிருக்கிறார்.", "சரி, பொருளாதார ரீதியில் முன்னேறியவர்கள் யார் என்பதை எப்படி கண்டுபிடிப்பது?!", "இதற்கான வரையறைகள் என்ன என்பது குறித்து சர்ச்சைகள் நீண்டுக்கொண்டே இருக்கின்றன.?!", "இந்நிலையில், இந்த கிரிமிலேயர் முறையை பட்டியல் சாதியினருக்கும் நீடிக்க வேண்டும் என்று கவாய் பேசியிருக்கிறார்.?!", "'இந்தியா மற்றும் 75 ஆண்டுகால இந்திய அரசியலமைப்பு' என்கிற தலைப்பின் கீழ் நடைபெற்ற நிகழ்ச்சியில் பங்கேற்றிருந்த கவாய், மேற்குறிப்பிட்டவாறு பேசியிருக்கிறார்.?!"]	f		7.019222946	0	f	\N	2025-11-17 20:59:44.74234+00	2025-11-17 20:59:52.076401+00	\N
57	1	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற<div><br></div>	4e2290da-ed4d-4eb7-a13d-21c939522c42	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற	60	model_a	completed	[{"type": "spelling", "reason": "'தமிழ்த் தாய்' என்பது ஒரு கூட்டுச் சொல். இரண்டு சொற்களையும் இணைத்து 'தமிழ்த்தாய்' என எழுதுவதே சரியான மரபு மற்றும் சந்தி விதிப்படி சரியானது.", "original": "தமிழ்த் தாய் வாழ்த்துடன்", "corrected": "தமிழ்த்தாய் வாழ்த்துடன்", "end_index": 0, "start_index": 0}, {"type": "grammar", "reason": "ஒரு வாக்கியம் முழுமையடைய வினைமுற்று அவசியம். 'நடைபெற' என்பது வினைமுற்று அல்ல. 'நிகழ்ச்சிகள்' என்ற பன்மைப் பெயருக்குப் பொருத்தமான, இறந்தகாலப் பன்மை வினைமுற்று 'நடைபெற்றன' என்பதாகும். இது வாக்கியத்தை நிறைவு செய்கிறது.", "original": "நடைபெற", "corrected": "நடைபெற்றன.", "end_index": 0, "start_index": 0}]	[]	f		8.586775475	0	f	\N	2025-11-22 21:44:39.283938+00	2025-11-22 21:44:48.224254+00	\N
56	1	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்றன.	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்றன.<div><br></div>	1e8ec483-a04d-4d3e-b7f7-9eff6ff5b0a7	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெற்றன.	60	model_a	completed	[{"type": "grammar", "reason": "இரு சொற்கள் இணைந்து ஒரு கூட்டுப் பெயரை உருவாக்கும்போது ('கலை' மற்றும் 'குழு'), புணர்ச்சி விதிப்படி, முதல் சொல் ஈற்றில் மெய்யெழுத்து இல்லாதபோது, வல்லெழுத்து 'க்' மிகும். 'கலைக் குழு' என்பதே சரியான இலக்கண வடிவம்.", "original": "கலைக்குழுவின்", "corrected": "கலைக் குழுவின்", "end_index": 0, "start_index": 0}]	[]	f		9.792608753	0	f	\N	2025-11-22 21:44:23.226812+00	2025-11-22 21:44:33.373296+00	\N
58	1	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெ	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெ<div><br></div>	111ef454-2e34-4de7-afda-07475985c7b0	திருவிழா, மன்ற இளம் இசைக்குழுவின் இனிய தமிழ்த் தாய் வாழ்த்துடன் தொடங்கியது. அதன் பின்னர், மன்றத்தின் முதல் பறை நடன நிகழ்ச்சி அரங்கேற்றப்பட்டது. பாரம்பரிய தமிழர் இசை மற்றும் நடனங்களை இணைத்து, பறை நடனக் குழுவினர் சிறந்த தொடக்கத்தை வழங்கினர். இதன் பின்னர், பல்வேறு வயது பிரிவுகளின் பங்கேற்பாளர்கள் நடனங்கள், பாடல்கள் மற்றும் பல்சுவை கலை நிகழ்ச்சிகளை வெளிப்படுத்தினர். மொத்தம் 50-க்கும் மேற்பட்ட குழுக்கள் மற்றும் 550-க்கும் மேற்பட்ட கலைஞர்கள் கலந்து கொண்ட நிகழ்ச்சிகள் மன்ற கலைக்குழுவின் திட்டமிடல் மற்றும் ஒருங்கிணைப்பில் அழகாக நடைபெ	60	model_a	completed	[{"type": "grammar", "reason": "வேற்றுமை உருபு (இன்) வரும்போது, நிலைமொழி ஈற்றுயிர் வருமொழி முதல்மெய் 'ப' வுடன் புணரும்போது 'ப்' தோன்ற வேண்டும். இது இயல்பு புணர்ச்சி விதி.", "original": "வயது பிரிவுகளின்", "corrected": "வயதுப் பிரிவுகளின்", "end_index": 0, "start_index": 0}, {"type": "grammar", "reason": "இருபெயரொட்டுப் பண்புத்தொகையில் வல்லினம் மிகும். இங்கு 'மன்ற' என்பது குழுவிற்கு அடைமொழியாக வந்து 'கலைக்குழு' என்ற பெயரைத் தழுவி வருவதால், வல்லினம் 'க்' மிக வேண்டும்.", "original": "மன்ற கலைக்குழுவின்", "corrected": "மன்றக் கலைக்குழுவின்", "end_index": 0, "start_index": 0}, {"type": "grammar", "reason": "வாக்கியம் முழுமையடையவில்லை. 'நிகழ்ச்சிகள்' என்பது பன்மைப் பெயர்ச்சொல் என்பதால், அதற்கு ஏற்ற பன்மை வினைமுற்று 'நடைபெற்றன' சேர்த்து வாக்கியத்தை முடிக்க வேண்டும்.", "original": "நடைபெ", "corrected": "நடைபெற்றன.", "end_index": 0, "start_index": 0}]	[]	f		7.188014539	0	f	\N	2025-11-22 21:45:11.301148+00	2025-11-22 21:45:18.750505+00	\N
59	1	னஒ இஉஎ ஒஉன	னஒ இஉஎ ஒஉன<div><br></div><div><br></div>	282cca87-f8bd-4554-ba63-ed1b73f03561	னஒ இஉஎ ஒஉன	3	model_a	completed	[]	[]	f		5.966383226	0	f	\N	2025-11-22 21:51:19.537006+00	2025-11-22 21:51:25.850498+00	\N
\.


--
-- Data for Name: tamil_words; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.tamil_words (id, tamil_text, transliteration, alternate_spellings, frequency, category, meaning, example, is_verified, source, user_confirmed, created_at, updated_at, deleted_at) FROM stdin;
1	வணக்கம்	vanakkam	["vanakam","vaṇakkam"]	1000	common	hello, greetings		t	manual_seed	0	2025-11-17 18:09:26.731407+00	2025-11-17 18:09:26.731407+00	\N
2	நன்றி	nandri	["nanri","naṉṟi"]	990	common	thank you		t	manual_seed	0	2025-11-17 18:09:26.966353+00	2025-11-17 18:09:26.966353+00	\N
3	சரி	sari	["chari"]	985	common	okay, correct		t	manual_seed	0	2025-11-17 18:09:27.146231+00	2025-11-17 18:09:27.146231+00	\N
4	தமிழ்	tamil	["thamizh","tamizh"]	980	noun	Tamil language		t	manual_seed	0	2025-11-17 18:09:27.326293+00	2025-11-17 18:09:27.326293+00	\N
5	நல்ல	nalla	["nallla"]	975	adjective	good		t	manual_seed	0	2025-11-17 18:09:27.506713+00	2025-11-17 18:09:27.506713+00	\N
6	இல்லை	illai	["illae","illē"]	970	common	no, not available		t	manual_seed	0	2025-11-17 18:09:27.685127+00	2025-11-17 18:09:27.685127+00	\N
7	இருக்கிறது	irukkradu	["irukkurathu","irukkirathu"]	965	verb	is, exists		t	manual_seed	0	2025-11-17 18:09:27.864174+00	2025-11-17 18:09:27.864174+00	\N
8	அது	athu	["adhu"]	960	pronoun	that		t	manual_seed	0	2025-11-17 18:09:28.042421+00	2025-11-17 18:09:28.042421+00	\N
9	இது	idhu	["ithu"]	955	pronoun	this		t	manual_seed	0	2025-11-17 18:09:28.224053+00	2025-11-17 18:09:28.224053+00	\N
10	வருகிறது	varukiradu	["varugiradu","varugirathu"]	950	verb	coming		t	manual_seed	0	2025-11-17 18:09:28.402878+00	2025-11-17 18:09:28.402878+00	\N
12	அரசன்	arasan	["arasann"]	940	noun	king		t	manual_seed	0	2025-11-17 18:09:28.762186+00	2025-11-17 18:09:28.762186+00	\N
13	ராணி	rani	["raani","rāṇi"]	935	proper_noun	queen		t	manual_seed	0	2025-11-17 18:09:28.940752+00	2025-11-17 18:09:28.940752+00	\N
14	அரசி	arasi	["arasī"]	930	noun	queen		t	manual_seed	0	2025-11-17 18:09:29.123183+00	2025-11-17 18:09:29.123183+00	\N
15	தலைவர்	thalaivar	["talaivar","talēvar"]	925	noun	leader		t	manual_seed	0	2025-11-17 18:09:29.304036+00	2025-11-17 18:09:29.304036+00	\N
16	அம்மா	amma	["ammā"]	920	noun	mother		t	manual_seed	0	2025-11-17 18:09:29.486667+00	2025-11-17 18:09:29.486667+00	\N
17	அப்பா	appa	["appā"]	915	noun	father		t	manual_seed	0	2025-11-17 18:09:29.665024+00	2025-11-17 18:09:29.665024+00	\N
18	அக்கா	akka	["akkā"]	910	noun	elder sister		t	manual_seed	0	2025-11-17 18:09:29.845155+00	2025-11-17 18:09:29.845155+00	\N
19	அண்ணா	anna	["aṇṇā","annā"]	905	noun	elder brother		t	manual_seed	0	2025-11-17 18:09:30.023992+00	2025-11-17 18:09:30.023992+00	\N
20	தம்பி	thambi	["tambi"]	900	noun	younger brother		t	manual_seed	0	2025-11-17 18:09:30.20402+00	2025-11-17 18:09:30.20402+00	\N
21	நாள்	naal	["nāl","nal"]	895	noun	day		t	manual_seed	0	2025-11-17 18:09:30.3839+00	2025-11-17 18:09:30.3839+00	\N
22	நேரம்	neram	["nēram"]	890	noun	time		t	manual_seed	0	2025-11-17 18:09:30.566212+00	2025-11-17 18:09:30.566212+00	\N
23	மனிதன்	manithan	["manidhan"]	885	noun	human, man		t	manual_seed	0	2025-11-17 18:09:30.749085+00	2025-11-17 18:09:30.749085+00	\N
24	பெண்	pen	["peṇ"]	880	noun	woman, girl		t	manual_seed	0	2025-11-17 18:09:30.928191+00	2025-11-17 18:09:30.928191+00	\N
25	ஆண்	aan	["āṇ"]	875	noun	man, male		t	manual_seed	0	2025-11-17 18:09:31.109918+00	2025-11-17 18:09:31.109918+00	\N
26	வீடு	veedu	["vīṭu","vedu"]	870	noun	house		t	manual_seed	0	2025-11-17 18:09:31.28908+00	2025-11-17 18:09:31.28908+00	\N
27	ஊர்	oor	["ūr"]	865	noun	town, village		t	manual_seed	0	2025-11-17 18:09:31.468621+00	2025-11-17 18:09:31.468621+00	\N
28	நகரம்	nakaram	["nagaram"]	860	noun	city		t	manual_seed	0	2025-11-17 18:09:31.650248+00	2025-11-17 18:09:31.650248+00	\N
29	தெரு	theru	["teru"]	855	noun	street		t	manual_seed	0	2025-11-17 18:09:31.837146+00	2025-11-17 18:09:31.837146+00	\N
30	பள்ளி	palli	["paḷḷi"]	850	noun	school		t	manual_seed	0	2025-11-17 18:09:32.016357+00	2025-11-17 18:09:32.016357+00	\N
31	தென்றல்	thendral	["thenral","tendral"]	845	noun	breeze		t	manual_seed	0	2025-11-17 18:09:32.196441+00	2025-11-17 18:09:32.196441+00	\N
32	காற்று	kaatru	["katru","kāṟṟu"]	840	noun	wind		t	manual_seed	0	2025-11-17 18:09:32.377382+00	2025-11-17 18:09:32.377382+00	\N
33	மழை	mazhai	["maḻai"]	835	noun	rain		t	manual_seed	0	2025-11-17 18:09:32.557256+00	2025-11-17 18:09:32.557256+00	\N
34	வானம்	vaanam	["vāṉam","vanam"]	830	noun	sky		t	manual_seed	0	2025-11-17 18:09:32.739876+00	2025-11-17 18:09:32.739876+00	\N
35	கடல்	kadal	["kaṭal"]	825	noun	sea, ocean		t	manual_seed	0	2025-11-17 18:09:32.920036+00	2025-11-17 18:09:32.920036+00	\N
36	மலை	malai	["mālai"]	820	noun	mountain		t	manual_seed	0	2025-11-17 18:09:33.099598+00	2025-11-17 18:09:33.099598+00	\N
37	ஆறு	aaru	["āṟu","aaru6"]	815	noun	river		t	manual_seed	0	2025-11-17 18:09:33.279806+00	2025-11-17 18:09:33.279806+00	\N
38	மரம்	maram	["maram"]	810	noun	tree		t	manual_seed	0	2025-11-17 18:09:33.45918+00	2025-11-17 18:09:33.45918+00	\N
39	மலர்	malar	["mallar"]	805	noun	flower		t	manual_seed	0	2025-11-17 18:09:33.642112+00	2025-11-17 18:09:33.642112+00	\N
40	புல்	pul	["pull"]	800	noun	grass		t	manual_seed	0	2025-11-17 18:09:33.823737+00	2025-11-17 18:09:33.823737+00	\N
41	நாய்	naai	["nāy","nay"]	795	noun	dog		t	manual_seed	0	2025-11-17 18:09:34.004714+00	2025-11-17 18:09:34.004714+00	\N
42	பூனை	poonai	["pūṉai"]	790	noun	cat		t	manual_seed	0	2025-11-17 18:09:34.184392+00	2025-11-17 18:09:34.184392+00	\N
43	பசு	pasu	["pacu"]	785	noun	cow		t	manual_seed	0	2025-11-17 18:09:34.366987+00	2025-11-17 18:09:34.366987+00	\N
44	மான்	maan	["māṉ"]	780	noun	deer		t	manual_seed	0	2025-11-17 18:09:34.552904+00	2025-11-17 18:09:34.552904+00	\N
45	யானை	yaanai	["yānai","yaanae"]	775	noun	elephant		t	manual_seed	0	2025-11-17 18:09:34.733997+00	2025-11-17 18:09:34.733997+00	\N
46	குதிரை	kuthirai	["kudirai"]	770	noun	horse		t	manual_seed	0	2025-11-17 18:09:34.914053+00	2025-11-17 18:09:34.914053+00	\N
47	சிங்கம்	singam	["simgam","ciṅkam"]	765	noun	lion		t	manual_seed	0	2025-11-17 18:09:35.094865+00	2025-11-17 18:09:35.094865+00	\N
48	புலி	puli	["pullē"]	760	noun	tiger		t	manual_seed	0	2025-11-17 18:09:35.275414+00	2025-11-17 18:09:35.275414+00	\N
49	குருவி	kuruvi	["kuruvē"]	755	noun	sparrow, small bird		t	manual_seed	0	2025-11-17 18:09:35.462328+00	2025-11-17 18:09:35.462328+00	\N
50	கோழி	kozhi	["kōḻi","kolzhi"]	750	noun	chicken		t	manual_seed	0	2025-11-17 18:09:35.642546+00	2025-11-17 18:09:35.642546+00	\N
51	சாப்பாடு	saappaadu	["sappadu","cāppāṭu"]	745	noun	food		t	manual_seed	0	2025-11-17 18:09:35.823147+00	2025-11-17 18:09:35.823147+00	\N
52	சோறு	soru	["choru","cōṟu"]	740	noun	cooked rice		t	manual_seed	0	2025-11-17 18:09:36.004463+00	2025-11-17 18:09:36.004463+00	\N
53	சம்பா	samba	["sampā","champa"]	735	noun	samba rice variety		t	manual_seed	0	2025-11-17 18:09:36.186429+00	2025-11-17 18:09:36.186429+00	\N
54	பாயசம்	payasam	["pāyacam"]	730	noun	sweet pudding		t	manual_seed	0	2025-11-17 18:09:36.367214+00	2025-11-17 18:09:36.367214+00	\N
55	இட்லி	idli	["iṭli"]	725	noun	idli (steamed rice cake)		t	manual_seed	0	2025-11-17 18:09:36.547954+00	2025-11-17 18:09:36.547954+00	\N
56	தோசை	dosai	["thosai","tōcai"]	720	noun	dosa (fermented crepe)		t	manual_seed	0	2025-11-17 18:09:36.728891+00	2025-11-17 18:09:36.728891+00	\N
57	வடை	vadai	["vaṭai","vada"]	715	noun	vada (fried lentil cake)		t	manual_seed	0	2025-11-17 18:09:36.914079+00	2025-11-17 18:09:36.914079+00	\N
58	பொங்கல்	pongal	["poṅkal"]	710	noun	pongal (rice dish)		t	manual_seed	0	2025-11-17 18:09:37.097228+00	2025-11-17 18:09:37.097228+00	\N
59	தயிர்	thayir	["tayir","tayiru"]	705	noun	curd, yogurt		t	manual_seed	0	2025-11-17 18:09:37.277295+00	2025-11-17 18:09:37.277295+00	\N
60	பால்	paal	["pāl","pal"]	700	noun	milk		t	manual_seed	0	2025-11-17 18:09:37.459159+00	2025-11-17 18:09:37.459159+00	\N
61	சிவப்பு	sivappu	["sivappu","civappu"]	695	adjective	red		t	manual_seed	0	2025-11-17 18:09:37.643341+00	2025-11-17 18:09:37.643341+00	\N
62	வெள்ளை	vellai	["veḷḷai"]	690	adjective	white		t	manual_seed	0	2025-11-17 18:09:37.824933+00	2025-11-17 18:09:37.824933+00	\N
63	கருப்பு	karuppu	["karuppu"]	685	adjective	black		t	manual_seed	0	2025-11-17 18:09:38.009623+00	2025-11-17 18:09:38.009623+00	\N
64	பச்சை	pachai	["paccai","paccē"]	680	adjective	green		t	manual_seed	0	2025-11-17 18:09:38.203095+00	2025-11-17 18:09:38.203095+00	\N
65	நீலம்	neelam	["nīlam"]	675	adjective	blue		t	manual_seed	0	2025-11-17 18:09:38.386495+00	2025-11-17 18:09:38.386495+00	\N
66	கண்	kan	["kaṇ"]	670	noun	eye		t	manual_seed	0	2025-11-17 18:09:38.566502+00	2025-11-17 18:09:38.566502+00	\N
67	கை	kai	["kae"]	665	noun	hand		t	manual_seed	0	2025-11-17 18:09:38.750135+00	2025-11-17 18:09:38.750135+00	\N
68	கால்	kaal	["kāl"]	660	noun	leg, foot		t	manual_seed	0	2025-11-17 18:09:38.930552+00	2025-11-17 18:09:38.930552+00	\N
69	தலை	thalai	["talai"]	655	noun	head		t	manual_seed	0	2025-11-17 18:09:39.111951+00	2025-11-17 18:09:39.111951+00	\N
70	வாய்	vaai	["vāy"]	650	noun	mouth		t	manual_seed	0	2025-11-17 18:09:39.291687+00	2025-11-17 18:09:39.291687+00	\N
71	செய்	sei	["sey","cey"]	645	verb	to do, make		t	manual_seed	0	2025-11-17 18:09:39.472119+00	2025-11-17 18:09:39.472119+00	\N
72	போ	po	["pō"]	640	verb	to go		t	manual_seed	0	2025-11-17 18:09:39.651777+00	2025-11-17 18:09:39.651777+00	\N
73	வா	va	["vā"]	635	verb	to come		t	manual_seed	0	2025-11-17 18:09:39.831496+00	2025-11-17 18:09:39.831496+00	\N
74	சொல்	sol	["coll","col"]	630	verb	to say, tell		t	manual_seed	0	2025-11-17 18:09:40.011672+00	2025-11-17 18:09:40.011672+00	\N
75	பார்	paar	["pār"]	625	verb	to see, look		t	manual_seed	0	2025-11-17 18:09:40.191756+00	2025-11-17 18:09:40.191756+00	\N
76	கேள்	kel	["kēl","kael"]	620	verb	to hear, listen		t	manual_seed	0	2025-11-17 18:09:40.371852+00	2025-11-17 18:09:40.371852+00	\N
77	எழுது	ezhuthu	["eluthu","eḻutu"]	615	verb	to write		t	manual_seed	0	2025-11-17 18:09:40.554119+00	2025-11-17 18:09:40.554119+00	\N
78	படி	padi	["paṭi"]	610	verb	to read		t	manual_seed	0	2025-11-17 18:09:40.743904+00	2025-11-17 18:09:40.743904+00	\N
79	சாப்பிடு	saappidu	["sappidu"]	605	verb	to eat		t	manual_seed	0	2025-11-17 18:09:40.927887+00	2025-11-17 18:09:40.927887+00	\N
80	குடி	kudi	["kuṭi"]	600	verb	to drink		t	manual_seed	0	2025-11-17 18:09:41.107575+00	2025-11-17 18:09:41.107575+00	\N
81	முருகன்	murugan	["murukaṉ"]	595	proper_noun	Lord Murugan		t	manual_seed	0	2025-11-17 18:09:41.288054+00	2025-11-17 18:09:41.288054+00	\N
82	விநாயகர்	vinayagar	["vināyakar","vinayakar"]	590	proper_noun	Lord Ganesha		t	manual_seed	0	2025-11-17 18:09:41.469595+00	2025-11-17 18:09:41.469595+00	\N
83	சிவன்	sivan	["civaṉ","shivan"]	585	proper_noun	Lord Shiva		t	manual_seed	0	2025-11-17 18:09:41.659516+00	2025-11-17 18:09:41.659516+00	\N
84	பார்வதி	parvathi	["pārvatī"]	580	proper_noun	Goddess Parvati		t	manual_seed	0	2025-11-17 18:09:41.840417+00	2025-11-17 18:09:41.840417+00	\N
85	லட்சுமி	lakshmi	["latchumi","lakṣmī"]	575	proper_noun	Goddess Lakshmi		t	manual_seed	0	2025-11-17 18:09:42.022962+00	2025-11-17 18:09:42.022962+00	\N
86	கோயில்	koil	["kōyil","kovil"]	570	noun	temple		t	manual_seed	0	2025-11-17 18:09:42.202537+00	2025-11-17 18:09:42.202537+00	\N
87	சந்தை	sandhai	["cantai"]	565	noun	market		t	manual_seed	0	2025-11-17 18:09:42.38492+00	2025-11-17 18:09:42.38492+00	\N
88	பண்ணை	pannai	["paṇṇai"]	560	noun	farm		t	manual_seed	0	2025-11-17 18:09:42.565874+00	2025-11-17 18:09:42.565874+00	\N
89	மருத்துவமனை	maruthuvamanai	["maruththuvamanai"]	555	noun	hospital		t	manual_seed	0	2025-11-17 18:09:42.746079+00	2025-11-17 18:09:42.746079+00	\N
90	பூங்கா	poongaa	["pūṅkā"]	550	noun	park, garden		t	manual_seed	0	2025-11-17 18:09:42.927703+00	2025-11-17 18:09:42.927703+00	\N
91	பேருந்து	perundhu	["pēruntu","bus"]	545	noun	bus		t	manual_seed	0	2025-11-17 18:09:43.108106+00	2025-11-17 18:09:43.108106+00	\N
92	ரயில்	rail	["rayil","train"]	540	noun	train		t	manual_seed	0	2025-11-17 18:09:43.28864+00	2025-11-17 18:09:43.28864+00	\N
93	கார்	car	["kār","carr"]	535	noun	car		t	manual_seed	0	2025-11-17 18:09:43.480982+00	2025-11-17 18:09:43.480982+00	\N
94	மோட்டார்	mottar	["mōṭṭār","motor"]	530	noun	motor, motorcycle		t	manual_seed	0	2025-11-17 18:09:43.662664+00	2025-11-17 18:09:43.662664+00	\N
95	விமானம்	vimanam	["vimāṉam","vimaanam"]	525	noun	airplane		t	manual_seed	0	2025-11-17 18:09:43.843851+00	2025-11-17 18:09:43.843851+00	\N
96	சந்தோஷம்	santhosham	["cantōṣam","sandhosham"]	520	noun	happiness, joy		t	manual_seed	0	2025-11-17 18:09:44.024576+00	2025-11-17 18:09:44.024576+00	\N
97	கோபம்	kobam	["kōpam","gopam"]	515	noun	anger		t	manual_seed	0	2025-11-17 18:09:44.207125+00	2025-11-17 18:09:44.207125+00	\N
98	அன்பு	anbu	["aṉpu","anbhu"]	510	noun	love		t	manual_seed	0	2025-11-17 18:09:44.387924+00	2025-11-17 18:09:44.387924+00	\N
99	துக்கம்	thukkam	["tukkam"]	505	noun	sorrow, sadness		t	manual_seed	0	2025-11-17 18:09:44.568092+00	2025-11-17 18:09:44.568092+00	\N
100	பயம்	bayam	["payam"]	500	noun	fear		t	manual_seed	0	2025-11-17 18:09:44.751615+00	2025-11-17 18:09:44.751615+00	\N
11	ராஜா	raja	["raaja","rāja"]	945	proper_noun	king, ruler		t	manual_seed	1	2025-11-17 18:09:28.583658+00	2025-11-17 18:18:47.607553+00	\N
\.


--
-- Data for Name: usages; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.usages (id, user_id, word_count, model_used, submission_id, date, created_at, updated_at, deleted_at) FROM stdin;
1	1	8	model_a	1	2025-11-16 20:04:15.90107+00	2025-11-16 20:04:16.197914+00	2025-11-16 20:04:16.197914+00	\N
2	1	1	model_a	2	2025-11-17 14:08:06.002549+00	2025-11-17 14:08:06.045887+00	2025-11-17 14:08:06.045887+00	\N
3	1	1	model_a	3	2025-11-17 14:15:28.413218+00	2025-11-17 14:15:28.739222+00	2025-11-17 14:15:28.739222+00	\N
4	1	1	model_a	4	2025-11-17 14:15:35.835231+00	2025-11-17 14:15:35.878115+00	2025-11-17 14:15:35.878115+00	\N
5	1	1	model_a	5	2025-11-17 14:18:07.716363+00	2025-11-17 14:18:07.759909+00	2025-11-17 14:18:07.759909+00	\N
6	1	1	model_a	6	2025-11-17 14:34:53.388652+00	2025-11-17 14:34:53.704473+00	2025-11-17 14:34:53.704473+00	\N
7	1	2	model_a	7	2025-11-17 14:34:55.561654+00	2025-11-17 14:34:55.604421+00	2025-11-17 14:34:55.604421+00	\N
8	1	2	model_a	8	2025-11-17 14:43:29.68063+00	2025-11-17 14:43:29.726505+00	2025-11-17 14:43:29.726505+00	\N
9	1	2	model_a	9	2025-11-17 14:43:37.518983+00	2025-11-17 14:43:37.563711+00	2025-11-17 14:43:37.563711+00	\N
10	1	3	model_a	10	2025-11-17 14:43:40.974732+00	2025-11-17 14:43:41.020422+00	2025-11-17 14:43:41.020422+00	\N
11	1	2	model_a	11	2025-11-17 14:48:25.264966+00	2025-11-17 14:48:25.307902+00	2025-11-17 14:48:25.307902+00	\N
12	1	1	model_a	12	2025-11-17 14:48:29.340258+00	2025-11-17 14:48:29.379746+00	2025-11-17 14:48:29.379746+00	\N
13	1	2	model_a	13	2025-11-17 14:51:17.813304+00	2025-11-17 14:51:17.856906+00	2025-11-17 14:51:17.856906+00	\N
14	1	1	model_a	14	2025-11-17 14:54:00.986026+00	2025-11-17 14:54:01.294316+00	2025-11-17 14:54:01.294316+00	\N
15	1	1	model_a	15	2025-11-17 14:54:06.246127+00	2025-11-17 14:54:06.288971+00	2025-11-17 14:54:06.288971+00	\N
16	1	1	model_a	16	2025-11-17 15:07:36.086503+00	2025-11-17 15:07:36.130489+00	2025-11-17 15:07:36.130489+00	\N
17	1	1	model_a	17	2025-11-17 15:17:29.216643+00	2025-11-17 15:17:29.260105+00	2025-11-17 15:17:29.260105+00	\N
18	1	1	model_a	18	2025-11-17 15:26:03.619969+00	2025-11-17 15:26:03.660524+00	2025-11-17 15:26:03.660524+00	\N
19	1	1	model_a	19	2025-11-17 15:26:12.826502+00	2025-11-17 15:26:12.868128+00	2025-11-17 15:26:12.868128+00	\N
20	1	23	model_a	20	2025-11-17 15:28:39.653083+00	2025-11-17 15:28:39.973431+00	2025-11-17 15:28:39.973431+00	\N
21	1	2	model_a	21	2025-11-17 17:09:56.837265+00	2025-11-17 17:09:56.879395+00	2025-11-17 17:09:56.879395+00	\N
22	1	2	model_a	22	2025-11-17 17:10:01.755723+00	2025-11-17 17:10:01.798097+00	2025-11-17 17:10:01.798097+00	\N
23	1	2	model_a	23	2025-11-17 17:10:06.439943+00	2025-11-17 17:10:06.482243+00	2025-11-17 17:10:06.482243+00	\N
24	1	3	model_a	24	2025-11-17 17:10:12.609903+00	2025-11-17 17:10:12.65304+00	2025-11-17 17:10:12.65304+00	\N
25	1	3	model_a	25	2025-11-17 17:10:16.310408+00	2025-11-17 17:10:16.352823+00	2025-11-17 17:10:16.352823+00	\N
26	1	3	model_a	26	2025-11-17 17:10:22.176335+00	2025-11-17 17:10:22.220579+00	2025-11-17 17:10:22.220579+00	\N
27	1	3	model_a	27	2025-11-17 17:10:26.517348+00	2025-11-17 17:10:26.559788+00	2025-11-17 17:10:26.559788+00	\N
28	1	3	model_a	28	2025-11-17 17:10:36.709135+00	2025-11-17 17:10:36.751309+00	2025-11-17 17:10:36.751309+00	\N
29	1	3	model_a	29	2025-11-17 17:10:40.551861+00	2025-11-17 17:10:40.595279+00	2025-11-17 17:10:40.595279+00	\N
30	1	2	model_a	30	2025-11-17 17:10:45.695803+00	2025-11-17 17:10:45.738917+00	2025-11-17 17:10:45.738917+00	\N
31	1	2	model_a	31	2025-11-17 17:26:19.797103+00	2025-11-17 17:26:20.101539+00	2025-11-17 17:26:20.101539+00	\N
32	1	2	model_a	32	2025-11-17 17:26:29.794317+00	2025-11-17 17:26:29.837472+00	2025-11-17 17:26:29.837472+00	\N
33	1	2	model_a	33	2025-11-17 17:26:36.897478+00	2025-11-17 17:26:36.940601+00	2025-11-17 17:26:36.940601+00	\N
34	1	1	model_a	34	2025-11-17 17:40:29.682797+00	2025-11-17 17:40:30.046098+00	2025-11-17 17:40:30.046098+00	\N
35	1	2	model_a	35	2025-11-17 17:40:47.034755+00	2025-11-17 17:40:47.08117+00	2025-11-17 17:40:47.08117+00	\N
36	1	3	model_a	36	2025-11-17 17:40:51.961211+00	2025-11-17 17:40:52.005948+00	2025-11-17 17:40:52.005948+00	\N
37	1	3	model_a	37	2025-11-17 17:40:56.377294+00	2025-11-17 17:40:56.422346+00	2025-11-17 17:40:56.422346+00	\N
38	1	3	model_a	38	2025-11-17 17:40:58.910253+00	2025-11-17 17:40:58.954978+00	2025-11-17 17:40:58.954978+00	\N
39	1	3	model_a	39	2025-11-17 17:41:03.349859+00	2025-11-17 17:41:03.394487+00	2025-11-17 17:41:03.394487+00	\N
40	1	3	model_a	40	2025-11-17 17:52:19.014988+00	2025-11-17 17:52:19.333458+00	2025-11-17 17:52:19.333458+00	\N
41	1	3	model_a	41	2025-11-17 17:52:21.330352+00	2025-11-17 17:52:21.374622+00	2025-11-17 17:52:21.374622+00	\N
42	1	3	model_a	42	2025-11-17 17:52:35.933826+00	2025-11-17 17:52:35.978455+00	2025-11-17 17:52:35.978455+00	\N
43	1	2	model_a	43	2025-11-17 17:55:51.347083+00	2025-11-17 17:55:51.391314+00	2025-11-17 17:55:51.391314+00	\N
44	1	2	model_a	44	2025-11-17 17:55:54.410016+00	2025-11-17 17:55:54.452843+00	2025-11-17 17:55:54.452843+00	\N
45	1	2	model_a	45	2025-11-17 17:56:01.615284+00	2025-11-17 17:56:01.658432+00	2025-11-17 17:56:01.658432+00	\N
46	1	2	model_a	46	2025-11-17 17:56:10.624362+00	2025-11-17 17:56:10.66737+00	2025-11-17 17:56:10.66737+00	\N
47	1	1	model_a	47	2025-11-17 19:38:37.607926+00	2025-11-17 19:38:37.652473+00	2025-11-17 19:38:37.652473+00	\N
48	1	1	model_a	48	2025-11-17 20:15:04.479202+00	2025-11-17 20:15:04.521955+00	2025-11-17 20:15:04.521955+00	\N
49	1	1	model_a	49	2025-11-17 20:15:09.177401+00	2025-11-17 20:15:09.221708+00	2025-11-17 20:15:09.221708+00	\N
50	1	1	model_a	50	2025-11-17 20:15:16.227166+00	2025-11-17 20:15:16.271518+00	2025-11-17 20:15:16.271518+00	\N
51	1	39	model_a	51	2025-11-17 20:20:10.863566+00	2025-11-17 20:20:11.191908+00	2025-11-17 20:20:11.191908+00	\N
52	1	39	model_a	52	2025-11-17 20:20:35.904643+00	2025-11-17 20:20:35.94881+00	2025-11-17 20:20:35.94881+00	\N
53	1	39	model_a	53	2025-11-17 20:21:20.95401+00	2025-11-17 20:21:20.997136+00	2025-11-17 20:21:20.997136+00	\N
54	1	4	model_a	54	2025-11-17 20:59:40.0769+00	2025-11-17 20:59:40.393406+00	2025-11-17 20:59:40.393406+00	\N
55	1	45	model_a	55	2025-11-17 20:59:44.874227+00	2025-11-17 20:59:44.923018+00	2025-11-17 20:59:44.923018+00	\N
56	1	60	model_a	56	2025-11-22 21:44:23.362756+00	2025-11-22 21:44:23.405125+00	2025-11-22 21:44:23.405125+00	\N
57	1	60	model_a	57	2025-11-22 21:44:39.422519+00	2025-11-22 21:44:39.464641+00	2025-11-22 21:44:39.464641+00	\N
58	1	60	model_a	58	2025-11-22 21:45:11.388456+00	2025-11-22 21:45:11.745537+00	2025-11-22 21:45:11.745537+00	\N
59	1	3	model_a	59	2025-11-22 21:51:19.669756+00	2025-11-22 21:51:19.712882+00	2025-11-22 21:51:19.712882+00	\N
60	1	60	model_a	60	2025-11-22 21:51:31.945113+00	2025-11-22 21:51:31.988507+00	2025-11-22 21:51:31.988507+00	\N
61	1	60	model_a	61	2025-11-22 21:51:34.961789+00	2025-11-22 21:51:35.004024+00	2025-11-22 21:51:35.004024+00	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, email, password_hash, name, role, subscription, subscription_end, is_active, created_at, updated_at, deleted_at) FROM stdin;
1	test@example.com	dummy_hash	Test User	writer	free	\N	t	2025-11-16 07:07:54.801152+00	2025-11-16 07:07:54.801152+00	\N
2	onepercentmoreyt@gmail.com	$2a$10$wEpjAjaxZBox3bdeBCBkgePfG22dVQK4Zz7VIlKqc3NHsYfzq5z/W	OnePercentMore	writer	free	\N	t	2025-11-22 21:27:30.14815+00	2025-11-22 21:27:30.14815+00	\N
3	palkani.r@gmail.com	$2a$10$qKsWQzy3E7AsgcZC9rPs5uhtWUJvMXUA2VJMGPgPea3iy/iqy6BnW	Palkani Rajendren	writer	free	\N	t	2025-11-22 21:44:09.011496+00	2025-11-22 21:44:09.011496+00	\N
\.


--
-- Data for Name: visit_events; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.visit_events (id, session_id, user_id, route, referrer, truncated_ip, user_agent_hash, country_code, device_type, occurred_at) FROM stdin;
1	f1c9f5e742e71c6c6843f3d30aa7c9e1da75904644825184a2070f10d61bf024	\N	/contact	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 01:22:01.904492+00
2	60813e6cd0e749f910b0b43acda61be2935a0fe932224043877b6c7b62bac563	\N	/how-to-use		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-21 01:27:02.765029+00
3	d5454db67155b08b9dfa3d417eff2262afcc1cd2c744478c4b7cb1b6a780150c	\N	/workspace	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 01:27:04.381075+00
4	613295a2c87697f3e78e237bb118f7c056d901555b7f2a3380b6e56ee942a500	\N	/login	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 01:27:04.456697+00
5	8e5e267ec756dd36e76ccd171d93b9053003f81630b324cda52f93723b2d80a1	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 01:27:07.254112+00
6	69fb5d80abcc9443a4d8c999c7e440ca531314fc468982aabce6f8cd8c965a7e	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 01:30:05.927425+00
7	7029dc82b891b1bb70c8d68c6c0dd3624b6b8b7fcd4a0ad68df3f4182cd08c6b	\N	/how-to-use	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 01:36:47.486301+00
8	ef7b7afb85aac17fe561d5cd09cc54bd25db14b23b81327e0bfa03db5866a159	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 01:41:18.559334+00
9	d273e0c872dcdf48c071ba6dafedf1213f9f2fd99492577675b58510e382788d	\N	/workspace	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:05:16.993694+00
10	a04c2c346194c0c41c212cccfad647f3bbc2ca73e826d185efcf3d3accf1b028	\N	/login	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:05:17.066693+00
11	074b9bd905ec2b58a5dbc89cb5664ba0dc5f71897d267f54969d6758e835912b	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:05:45.073511+00
12	d3fa6c842eb38ae170a5679d5aec353a0b12b50956c917dd630924b506043bac	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:11:02.001287+00
13	4bb2bb04a14415a1cbbca3010e173c1822ba2d325966a988c9f62ee3cab71d80	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:11:14.320706+00
14	508d5b010b1694c9385f4dd2bb132157494925bf6f3a5584e5390686aa69b868	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:11:23.311691+00
15	ecb880f3bc281689e950a164b5928ce5804d214b509b525760469e2741588a89	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:13:56.663213+00
16	06e6cbd087dfb282d29890d2c57013fec4f91b63cf0eeeeda43acb8bb963114f	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:14:03.772411+00
17	c4055acdf7cb36a081fd814f990d4b290cbe4b462f219c4e1bf99cc3924ecdfe	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:14:18.739108+00
18	88e239fa55b2d17d17455785bea18e70d80a795e4b5686310f86587c2e1a59d6	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:14:26.241112+00
19	e78365fd93d2c8e9acb3971a80d37307bdd8f10f75a69d49329ceadd009ed936	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:20:16.327512+00
20	501a84019b134e52978d9e1f5834bcba2e6d5cf77673772d5c749c30dc4ba366	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 02:26:35.661713+00
21	8376cb11442efdd6952363da6d56c1116c6fc866dbaf0c14cadce5d68a7c1b17	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:19:58.349837+00
22	b13abe3beda8bacd26223754b2f6923175698d9ce1b9bc80e3c5175188aa8605	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:28:52.391141+00
23	d5a6567e84b7424cbc1eb4b48a9a10d766b8efc0c5dc190435ec9f20cd64db0d	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:45:12.724567+00
24	34c36e0fea74b27ab45cc90b91e509c09ae4d16d259b52aa148e81041c4ee355	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:45:27.733638+00
25	897d56c00d7222d466ac58f1ce0a3244171b9ffadc75efbf796bfbda99173647	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:50:36.391504+00
27	598ba71ae1bed43f882f2473e22dbd8cf48d36cbb70766516e777c56b5275010	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:56:19.124807+00
28	4f0e8ed8c872fecff31c74e490519e79bea90582b8541f8431a5a7ad993dd2a3	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:56:23.682211+00
29	7cc7fce0555ea68e5507db7cf40de7fc9e1993426e245f0ee2744e2d31cfd19b	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 13:57:07.819754+00
30	1741f8e5c5ab337130c6612d82ec815a7175e2955ffdabdcd4464de0f022be04	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:15:59.135083+00
31	a7abb8dccef4ff02014bf82b784f582a765dab453a065f27f8ec945e7e4147f4	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:17:41.318136+00
32	e872e4a547e574ab21f40aa44e1e7f6a7bbb3145c22850eb30ad79fdce249b68	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:17:56.388151+00
33	2d16f9c7007a13fbc6877f124f7ac94609bcaf87be49d5660458e106335fa570	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:20:18.950739+00
34	27f33b9691dfd0cc03fc8599a6c181b442818ed131ceaa7ff450f5b2794dad1d	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:28:40.069476+00
35	fef6cb003ee2becd3d07a18bec47ad2277f19835d870e87ec7bd38aa8b93d700	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:43:27.893958+00
36	f4ac129b881987de6d54cb0440875e3e066271c628d0bbf19e049f4bc753cbdf	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:43:33.618464+00
37	2bb8334e5303ea9ae42abc7b8fb1f3c251901bc958eafe7e07396a58ce1e0f89	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:43:47.133318+00
38	a85b7bde004724360e60077b142caabb64f342ed541b73d3b9b495ce353d1793	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:44:17.683074+00
39	007bbf8e2dec97852dfac232b5934741d77461633fc937d4a01161cb263fedcf	\N	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:44:50.169792+00
40	55636968e624faa60c76b295ba076a99a71cf8a93db60b36d601596da98c6310	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 14:56:17.16031+00
41	d84e41a610f9e4dcc06a41ae396f1eb4f89d917dd77978caec59daf45082dd2d	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 15:10:33.764325+00
42	d0122f45cdec708b4e88f78b26f6460a15babaa09fe326af563dbc5030e46e3d	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 15:15:22.827061+00
43	7f9a6bc4c6eeb530ea740bf50d729e6cec57f391ff88aa51501feb39e5450320	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 15:15:27.494917+00
44	0d13eabd4603996bc8d54dfdd4221852448370fed67a720c25f9d5fb53489792	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 15:16:25.680313+00
45	047244a3dc78a9ce60e52cf0e21aec919ed2d003eb8c87a7801123b56f6fc702	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 15:58:26.512057+00
46	a345d1bda1b1fa3424c0bb82f25b4cce0600ffb411ec54d9d09becd29a9b7178	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 16:34:54.654066+00
47	7a37e97336e7e9af864d55ae6d6dce4013837aad0bc5285636ee84eef483b4a0	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-21 17:24:17.326457+00
48	6dd8e6bfc8d4e252ed46203855c90c92b8cbe43b5ab84ed933bedc7ba6ff6bbb	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 00:26:09.711047+00
49	277fb20afe187655a9e32c17bf52f0c521517031bf120c6ae1cd702a812970e6	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:07:55.967604+00
50	f820c829328b43228113689c5eddb52ca6baae46a39ba346651a824e11b073ef	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:08:47.796087+00
51	d809595a2c925971aea43f7cc82763f3db269a2cd4ff5ac78ab44a5f8e6cbf92	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:09:08.008049+00
52	1c2ab186b9db4859ae3c717f05eee45e2fab7c6cb36691ee5950ddd1b880c500	\N	/		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:09:41.319734+00
53	7eca29a6649605e00705dc7bab836e3f0900aed9984c51f0128d2370d64a5a55	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:09:58.576228+00
54	37d7e31fc8e58466b5c6738d335ee1c31e95f428a488c338f1235c4f19058e64	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:10:33.34839+00
55	f5d4637454c4ad54d6e28442ab5c3ab269866b6afe511c8ddd8738ce31e33086	\N	/login	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:19:29.509056+00
56	0806c8ce45e22210e3c9f3c8c2de807174d04985139cb9758feec08cc82da396	\N	/login		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:21:49.793197+00
57	ccf793009db61b90d4a3681736ef95acec72a9752e8760f67997ed5255390480	\N	/		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:22:18.483285+00
58	cbd02d7b769cbea5b4cce67a4eb3166f84112216ba3505b9a9ff7fde1985d9e9	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:22:19.56624+00
59	b34ed2c47cec5879e17cdf7c5edd6a67d648c7f9e3d4a6fec948758d82b54b36	\N	/v1/auth/social	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/login	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:27:22.511561+00
60	f7917ebabcb51a6acc6a93d985f748e54782ea8823ea132bb8b81222c6263c5b	\N	/v1/auth/social	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/login	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:27:29.990593+00
61	f28163585fe497a8cc2253bc1dcc2a813b52320b32eee4ba2428cd0cfc2a3adb	2	/auth/google-callback	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/login	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:27:30.48726+00
62	6b54263fc99106118d00e8e24b9061ee7a84e9ee510412ff642b20fac972710d	2	/dashboard	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/login	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:27:30.548417+00
63	bb9e6d51ac72946c61b7bcf2b29aa57e336d3f321c71041c388dc03822828b8e	2	/workspace	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/dashboard	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:27:37.043295+00
64	441be8e1e2e0a39ba6e46987a79c38ea10b0e172efb2268d6113f03ecb75ce2d	2	/gemini/analyze	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:27:57.375844+00
65	cfee1206497f37b99a18226afd01a9f5edd4eecb3dca809d28945ae6f29d6df4	2	/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:27:58.360651+00
66	c3500b8d0b06bfed3c149af68071096add72f5b16854a7ff18e468d4816d3043	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:30:39.226605+00
67	39b3eb35a0407c5f8399103e6e5236930c4923461efc477e55df2021d97eb46d	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:31:21.634868+00
68	b89b7304c8b834a13bc5df83dc1a7d52fc43b6344f8887d8f32fcffad2bc2cb9	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:32:02.655274+00
69	ca670944157967e3f244b3666824019a1b0f662c34c1eaa99176d2a331c373f9	\N	/dashboard		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:32:38.129467+00
70	cd889101671dfc85526836bdc78033ed03eec6adbe350ad8506e4011a57d51fc	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:33:54.410918+00
71	a2898af7058f8020325eac4ad0ec439e58f82c1e01305c686e376ea876509d02	\N	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:34:11.949498+00
72	f6f3a2fca225a3e9186f928fd25a2ba768002de3073adc55d7b11b177b760b5f	\N	/register		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:40:14.040119+00
73	31688689a8d2541a4f512df9465a10023eb63441a6aaa0e32e31ec46a998c4d2	\N	/register		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:40:49.535656+00
74	34776a482b01f757e5ebd83d4082c41e4bf9dee19daae0df83c835405cd23368	\N	/v1/auth/social	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/register	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:06.486391+00
75	49a59ab61982a68f7ea622523a64154e5d53aee3a02bdf1f9d81ebda1eba7298	3	/auth/google-callback	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/register	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:09.386623+00
76	0e314eeeea67c024e21967bd56ca742515ded8642584bd06ab6d397142ee59e5	3	/dashboard	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/register	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:09.447969+00
77	099105f64816e39e17997e6cb7407c18b6384c023d00eaf97fae35f8f35dab79	3	/workspace	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/dashboard	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:18.010512+00
78	3e4831e67eccee495c29481a76f2001c78559cd9e57cd1c7c3b334ca533c7173	3	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:22.191359+00
79	f3874364682945c3b732652f2b0482269974f8f887a737f3bbde5815fe683138	3	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:23.185552+00
80	44296537a7ed916943316b18b388c15d0f2edc87426de6352ea3fca0ea805e81	3	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:38.275758+00
81	a5857ac32de9badd923f2e58eb312b8ab395099a9cfce6e45017d094609d7e4d	3	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:44:39.242597+00
82	e4dff1a4daf838551b3f8023735648040e1c93e4e99150df61e9fc335b27cc40	3	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:45:10.267352+00
83	52f5748ea30a615708f631624c1f8ee679d078ec7edbde992d57769f8285bdac	3	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:45:11.259646+00
84	28cca266864ca5d23fa2e4ee72408a206a95ee930df53c70bdc44c0a4cac5798	\N	/		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:49:33.104772+00
85	86b95fd4d7feaba7b067507970f0c125f736f9e2290e4f74790ffda5eb46ee17	\N	/		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:49:45.720797+00
86	d106dd0ace1e5de3221095400ea4927e952fab0d06abc36e01d2854d2500ee23	\N	/v1/submit		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:49:53.425898+00
87	18356c86c4944354310cb2ada0d859452191870e9264e3fe14534ce7fcb9d5d2	\N	/		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:50:07.828279+00
88	4ba0d97e6bebaa37c5dd10f8018618664b4d8ef885b0402e947a13571a7de417	\N	/login	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:05.15735+00
89	80f40c5ae981d90bc1184194848d3d952c47ca0897758e08a5090e13cdc63691	1	/login	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/login	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:12.540398+00
90	e329def4cb6db1e7dde5a959f2d3534bfd4a97db53e6eb4a0e5f4e044c0dc70b	1	/dashboard	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/login	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:12.615324+00
91	c771a60dd016a94c6fee246654611f2d7749facb6a4a406e6c93ffedd756cd8d	1	/workspace	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/dashboard	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:15.262875+00
92	5ecc234a9c03f50b1f674d42bb877b26d9fe8e35042253734e53748db1ace703	1	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:19.493903+00
93	458ded773c62131aaf9740cf16b10dbe75561690d5c0eb9590212e7fcec13e73	1	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:30.785645+00
94	0a5bcbc9e4a0bd2764184792ea5d0255655d017d22a07b89e1e0c0c3ad8981f1	1	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:31.770457+00
95	f5443d674e9fa2b21ba6486dad97571290e1cbc32aaa5199e7eaaed9238dba41	1	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:33.823615+00
96	29e8a3fc9f3ab889fa2195791eecd1fb1acd7b2ea49dda93b0e32d2ae040c339	1	/v1/submit	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/workspace	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 21:51:34.829465+00
97	ca15c1e68ffdc47157ae6d62454030770b519b20780c68fcc0f1ac5a540973bb	\N	/		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 21:54:44.152586+00
98	7b4bd693479593fe9a0896b5738b6a27f20cfed09c472e1c2ee9b953fd739da2	\N	/contact		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 22:19:02.048076+00
99	f186bf0d225c9ec7c38071dae1912fe21dc3bf061f71cd19384e3a4b43030d3a	\N	/contact	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:20:18.166751+00
100	452e853004af07f0e63144374760239017a2b668ad5532b96cb896d1951d244d	\N	/v1/contact	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/contact	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:20:38.418931+00
101	b2ad70fb688d7984e8103cef68660b3bb3cc76a11904a790ef2cb551da482d8b	\N	/contact		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 22:22:14.799499+00
102	6987ba935abf293c266c6ddc8cc88119bde477585afe26262c9162cdfd6fe6ec	\N	/contact	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:23:26.538323+00
103	d4dc007fbf368bc7b0d731487ec8411cdc8d615a3c74026b66e4804675e58c1e	\N	/v1/contact	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/contact	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:23:43.92571+00
104	a351fd08d5d87bbb9fcc7419d6b54da1c7adc3b51e082d2c7ea0672141557eb0	\N	/contact		127.0.0	65839b743e58c647c9bfbff093c83ae1d0574fe7d29f90eff86f47b04240e3d9		desktop	2025-11-22 22:25:08.894609+00
105	54c63364f2be180a2889d603a01c273df91fe300b33c5d9f37f3464b3f85d8bd	\N	/register	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:26:27.04829+00
106	6944c934fdb4cf5d6d1412113b67e3dbd0561f00eda779994e0417c19222aa8d	\N	/v1/auth/social	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/register	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:26:39.106853+00
107	97cce43dacd53cada4a2a4c7c94e48863458703d8fef39e3825033eecc8665fb	3	/auth/google-callback	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/register	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:26:39.765519+00
108	2cefb2dd771882d4e48be83455ef8ca5ac5455eeba179fd166893dab883a8784	3	/dashboard	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/register	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:26:39.839271+00
109	0f5af37a48c778cf251a2708412e516d73e5d72201e8a1ad559db0332779fa24	3	/account	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/dashboard	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:26:42.489853+00
110	5d9d4045ecfe5625f623dc6068f7e240db71def7f1d536f7506022bc12d4e0c0	3	/dashboard	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/account	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:26:47.398186+00
111	8a81f28bbcf4033fbebd655b663cce193ed1c64e576bce460f6fc86b4852bb59	3	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/dashboard	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-22 22:26:56.828282+00
112	c76d7c7985024de21bceaf40969c3a180b9ca15122985133dbbaa9c48be26cb0	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 14:33:27.615765+00
113	2aa51a340b73dd772747a559a3a89bc6a239d37318aac6840c8e57557467d2ca	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 14:49:41.704072+00
114	5ec3e08cf0bbede046eb064b37007a7ab3bab428b3523f81c63cb503033cc376	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 15:09:25.288799+00
115	9fbd110b08e034efcc86d7bb8a2ff071b66919ae9e71f33ec8f2bb849ba4688c	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 15:09:25.354567+00
116	2adefbaf3c21b7ea0f95f877bb713df3c247f91bc8a1f527a775d33ff4c18f9e	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 16:43:31.469053+00
117	9e49e318cb79cefd57e7912a94e7295d595613e7cf0ab2550fec9148417b8808	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 17:59:04.3316+00
118	c49712f7ef02c6cad5e83d266ea5782010ba04dcc49c64f7e2d470ae02afa0d1	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 18:38:10.165173+00
119	fb6e283666b5d71ad4b7e68020a0ea2ec0d9e65e2b5746e10ff1bcf0cc3e44d5	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-23 19:30:32.282841+00
120	e211b4897cb9995dcf5e7274bbedaeb5c729a463a6ce7203c1910d377d66f718	\N	/	https://13b33564-147e-4422-8b66-f3f99e4393e8-00-1e66vo6x25cex.riker.replit.dev/__replco/workspace_iframe.html	127.0.0	c4726851c44f4a551e906be951d099bc339f78de8d0f1fa45d2e279aac3efeff		desktop	2025-11-24 14:37:38.021346+00
\.


--
-- Name: activity_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.activity_events_id_seq', 1, false);


--
-- Name: contact_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.contact_messages_id_seq', 2, true);


--
-- Name: daily_activity_stats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.daily_activity_stats_id_seq', 1, false);


--
-- Name: daily_visit_stats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.daily_visit_stats_id_seq', 1, false);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 3, true);


--
-- Name: submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.submissions_id_seq', 61, true);


--
-- Name: tamil_words_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.tamil_words_id_seq', 100, true);


--
-- Name: usages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.usages_id_seq', 61, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: visit_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.visit_events_id_seq', 120, true);


--
-- Name: activity_events activity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: daily_activity_stats daily_activity_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.daily_activity_stats
    ADD CONSTRAINT daily_activity_stats_pkey PRIMARY KEY (id);


--
-- Name: daily_visit_stats daily_visit_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.daily_visit_stats
    ADD CONSTRAINT daily_visit_stats_pkey PRIMARY KEY (id);


--
-- Name: tamil_words idx_tamil_words_transliteration; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tamil_words
    ADD CONSTRAINT idx_tamil_words_transliteration UNIQUE (transliteration);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: tamil_words tamil_words_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tamil_words
    ADD CONSTRAINT tamil_words_pkey PRIMARY KEY (id);


--
-- Name: usages usages_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usages
    ADD CONSTRAINT usages_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visit_events visit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.visit_events
    ADD CONSTRAINT visit_events_pkey PRIMARY KEY (id);


--
-- Name: idx_activity_events_event_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_activity_events_event_type ON public.activity_events USING btree (event_type);


--
-- Name: idx_activity_events_occurred_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_activity_events_occurred_at ON public.activity_events USING btree (occurred_at);


--
-- Name: idx_activity_events_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_activity_events_user_id ON public.activity_events USING btree (user_id);


--
-- Name: idx_category; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_category ON public.tamil_words USING btree (category);


--
-- Name: idx_contact_messages_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_contact_messages_user_id ON public.contact_messages USING btree (user_id);


--
-- Name: idx_daily_activity_stats_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_daily_activity_stats_date ON public.daily_activity_stats USING btree (date);


--
-- Name: idx_daily_visit_stats_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_daily_visit_stats_date ON public.daily_visit_stats USING btree (date);


--
-- Name: idx_frequency; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_frequency ON public.tamil_words USING btree (frequency);


--
-- Name: idx_payments_deleted_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payments_deleted_at ON public.payments USING btree (deleted_at);


--
-- Name: idx_payments_invoice_number; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_payments_invoice_number ON public.payments USING btree (invoice_number);


--
-- Name: idx_payments_transaction_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_payments_transaction_id ON public.payments USING btree (transaction_id);


--
-- Name: idx_payments_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id);


--
-- Name: idx_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_submissions_deleted_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_submissions_deleted_at ON public.submissions USING btree (deleted_at);


--
-- Name: idx_submissions_request_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_submissions_request_id ON public.submissions USING btree (request_id);


--
-- Name: idx_submissions_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_submissions_user_id ON public.submissions USING btree (user_id);


--
-- Name: idx_tamil_text; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tamil_text ON public.tamil_words USING btree (tamil_text);


--
-- Name: idx_tamil_words_deleted_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tamil_words_deleted_at ON public.tamil_words USING btree (deleted_at);


--
-- Name: idx_transliteration; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transliteration ON public.tamil_words USING btree (transliteration);


--
-- Name: idx_transliteration_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_transliteration_unique ON public.tamil_words USING btree (transliteration);


--
-- Name: idx_usages_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_usages_date ON public.usages USING btree (date);


--
-- Name: idx_usages_deleted_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_usages_deleted_at ON public.usages USING btree (deleted_at);


--
-- Name: idx_usages_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_usages_user_id ON public.usages USING btree (user_id);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_verified; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_verified ON public.tamil_words USING btree (is_verified);


--
-- Name: idx_visit_events_occurred_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_visit_events_occurred_at ON public.visit_events USING btree (occurred_at);


--
-- Name: idx_visit_events_session_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_visit_events_session_id ON public.visit_events USING btree (session_id);


--
-- Name: idx_visit_events_user_agent_hash; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_visit_events_user_agent_hash ON public.visit_events USING btree (user_agent_hash);


--
-- Name: idx_visit_events_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_visit_events_user_id ON public.visit_events USING btree (user_id);


--
-- Name: activity_events fk_activity_events_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT fk_activity_events_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: contact_messages fk_contact_messages_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT fk_contact_messages_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: refresh_tokens fk_refresh_tokens_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: usages fk_usages_submission; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usages
    ADD CONSTRAINT fk_usages_submission FOREIGN KEY (submission_id) REFERENCES public.submissions(id);


--
-- Name: payments fk_users_payments; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT fk_users_payments FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: submissions fk_users_submissions; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT fk_users_submissions FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: usages fk_users_usage; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usages
    ADD CONSTRAINT fk_users_usage FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: visit_events fk_visit_events_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.visit_events
    ADD CONSTRAINT fk_visit_events_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict 0n2oYJmqU2kmdF9RJssdEMa15RKs2gY5TZ5Qgt4BlqlbZN4xMertf6RMbtxs4AR

