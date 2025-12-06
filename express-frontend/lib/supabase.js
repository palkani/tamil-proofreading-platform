const { createServerClient } = require('@supabase/ssr');

try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available or .env.local doesn't exist - ok in production
}

function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { url, key };
}

const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = getSupabaseConfig();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Warning: Missing SUPABASE_URL or SUPABASE_ANON_KEY - auth features disabled');
}

function createClient(req, res) {
  const { url, key } = getSupabaseConfig();
  
  if (!url || !key) {
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'Supabase not configured' } }),
        getSession: async () => ({ data: { session: null }, error: { message: 'Supabase not configured' } }),
        signInWithPassword: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        signUp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null }),
        resetPasswordForEmail: async () => ({ error: { message: 'Supabase not configured' } }),
        signInWithOAuth: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      }
    };
  }
  
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.K_SERVICE || 
                       (req.get && req.get('x-forwarded-proto') === 'https');
  
  return createServerClient(
    url,
    key,
    {
      cookies: {
        get(name) {
          return req.cookies[name];
        },
        set(name, value, options) {
          res.cookie(name, value, {
            ...options,
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: options.maxAge || 365 * 24 * 60 * 60 * 1000,
            domain: isProduction ? '.prooftamil.com' : undefined
          });
        },
        remove(name, options) {
          res.clearCookie(name, {
            ...options,
            domain: isProduction ? '.prooftamil.com' : undefined
          });
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
