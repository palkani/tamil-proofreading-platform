-- =============================================================================
-- Supabase RLS (Row Level Security) - Fix "RLS Disabled in Public" vulnerabilities
-- =============================================================================
-- Run this in Supabase Dashboard: SQL Editor → New query → paste → Run
--
-- What this does:
--   - Enables RLS on all public tables that exist (skips missing tables).
--   - With RLS enabled and NO permissive policies, anon/authenticated roles
--     cannot read or write any rows via PostgREST. Your backend using the
--     service_role key or direct Postgres connection bypasses RLS, so API
--     and server-side access continue to work.
--
-- Fixes:
--   - "RLS Disabled in Public" for all listed tables
--   - "Sensitive Columns Exposed" (e.g. visit_events.session_id) by locking
--     down API access via RLS
--
-- If you later need to allow Supabase client (anon/authenticated) access to
-- specific tables (e.g. public blog_posts read-only), add policies after
-- running this script.
-- =============================================================================

DO $$
DECLARE
  tables text[] := ARRAY[
    'affiliate_audit_logs', 'affiliates', 'affiliate_earnings', 'billing_audit_logs',
    'blog_posts', 'contact_messages', 'daily_activity_stats', 'daily_visit_stats',
    'email_verifications', 'feature_flags', 'fx_rates', 'newsletter_subscribers',
    'payment_events', 'invoices', 'referrals', 'refresh_tokens', 'submissions',
    'suggestion_accept_events', 'subscriptions', 'usages', 'visit_events', 'users',
    'activity_events', 'payments', 'password_reset_tokens', 'plans', 'suggestion_limits',
    'draft_groups', 'tamil_words', 'phonetic_variants', 'tamil_bigrams', 'tamil_phrases'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS enabled on public.%', t;
    ELSE
      RAISE NOTICE 'Table public.% does not exist, skipping', t;
    END IF;
  END LOOP;
END $$;
