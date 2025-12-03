const { createServerClient } = require('@supabase/ssr');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Warning: Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

function createClient(req, res) {
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return req.cookies[name];
        },
        set(name, value, options) {
          res.cookie(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: options.maxAge || 365 * 24 * 60 * 60 * 1000
          });
        },
        remove(name, options) {
          res.clearCookie(name, options);
        },
      },
    }
  );
}

async function getUser(req, res) {
  try {
    const supabase = createClient(req, res);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.log('[Supabase] getUser error:', error.message);
      return null;
    }
    return user;
  } catch (err) {
    console.error('[Supabase] getUser exception:', err.message);
    return null;
  }
}

async function getSession(req, res) {
  try {
    const supabase = createClient(req, res);
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.log('[Supabase] getSession error:', error.message);
      return null;
    }
    return session;
  } catch (err) {
    console.error('[Supabase] getSession exception:', err.message);
    return null;
  }
}

module.exports = {
  createClient,
  getUser,
  getSession,
  SUPABASE_URL,
  SUPABASE_ANON_KEY
};
