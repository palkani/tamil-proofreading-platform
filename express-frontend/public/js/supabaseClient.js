const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || '';

let supabaseClient = null;

async function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[Supabase] Configuration not available');
    return null;
  }
  
  if (supabaseClient) return supabaseClient;
  
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }
  
  return null;
}

async function supabaseSignup(email, password, name = '') {
  const client = await initSupabase();
  if (!client) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { name, full_name: name }
    }
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { 
    success: true, 
    user: data.user,
    session: data.session,
    needsConfirmation: !data.session
  };
}

async function supabaseLogin(email, password) {
  const client = await initSupabase();
  if (!client) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, user: data.user, session: data.session };
}

async function supabaseLogout() {
  const client = await initSupabase();
  if (!client) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  const { error } = await client.auth.signOut();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

async function supabaseGetUser() {
  const client = await initSupabase();
  if (!client) return null;
  
  const { data: { user } } = await client.auth.getUser();
  return user;
}

async function supabaseGetSession() {
  const client = await initSupabase();
  if (!client) return null;
  
  const { data: { session } } = await client.auth.getSession();
  return session;
}

async function supabaseSignInWithGoogle() {
  const client = await initSupabase();
  if (!client) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/auth/callback'
    }
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, url: data.url };
}

async function getSupabaseAccessToken() {
  const session = await supabaseGetSession();
  return session?.access_token || null;
}

async function authenticatedFetch(url, options = {}) {
  const token = await getSupabaseAccessToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(url, {
    ...options,
    headers
  });
}

function listenToAuthChanges(callback) {
  initSupabase().then(client => {
    if (client) {
      client.auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
    }
  });
}

window.SupabaseAuth = {
  init: initSupabase,
  signup: supabaseSignup,
  login: supabaseLogin,
  logout: supabaseLogout,
  getUser: supabaseGetUser,
  getSession: supabaseGetSession,
  signInWithGoogle: supabaseSignInWithGoogle,
  getAccessToken: getSupabaseAccessToken,
  authenticatedFetch,
  listenToAuthChanges
};
