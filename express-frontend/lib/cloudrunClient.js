const { getSession, createClient } = require('./supabase');

const CLOUD_RUN_BASE_URL = process.env.BACKEND_URL || 'https://api.prooftamil.com';

async function getAuthHeaders(req, res) {
  const supabase = createClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
    headers['X-Supabase-Auth'] = 'true';
  }
  
  return { headers, session };
}

async function refreshTokenIfNeeded(req, res) {
  const supabase = createClient(req, res);
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    return null;
  }
  
  const expiresAt = session.expires_at * 1000;
  const now = Date.now();
  const bufferTime = 60 * 1000;
  
  if (expiresAt - now < bufferTime) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed?.session;
  }
  
  return session;
}

async function cloudRunFetch(req, res, endpoint, options = {}) {
  const session = await refreshTokenIfNeeded(req, res);
  const { headers } = await getAuthHeaders(req, res);
  
  const response = await fetch(`${CLOUD_RUN_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });
  
  if (response.status === 401 && session) {
    console.log('[CloudRun] Token rejected, session may be invalid');
  }
  
  return response;
}

async function processText(req, res, text, mode = 'correct') {
  try {
    const response = await cloudRunFetch(req, res, '/api/v1/process', {
      method: 'POST',
      body: JSON.stringify({ text, mode })
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API error: ${response.status} - ${error}` };
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function transliterate(req, res, text) {
  try {
    const response = await cloudRunFetch(req, res, '/api/v1/transliterate', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API error: ${response.status} - ${error}` };
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function analyzeTamilText(req, res, text) {
  try {
    const response = await cloudRunFetch(req, res, '/api/v1/analyze', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `API error: ${response.status} - ${error}` };
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  cloudRunFetch,
  getAuthHeaders,
  processText,
  transliterate,
  analyzeTamilText,
  CLOUD_RUN_BASE_URL
};
