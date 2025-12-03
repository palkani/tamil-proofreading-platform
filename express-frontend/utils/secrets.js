let SecretManagerServiceClient = null;
let secretsCache = {};
let secretManagerClient = null;

function getSecretManagerClient() {
  if (!secretManagerClient) {
    try {
      if (!SecretManagerServiceClient) {
        SecretManagerServiceClient = require('@google-cloud/secret-manager').SecretManagerServiceClient;
      }
      secretManagerClient = new SecretManagerServiceClient();
    } catch (error) {
      console.log('[Secrets] Secret Manager not available');
      return null;
    }
  }
  return secretManagerClient;
}

async function getSecretFromManager(secretName) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
  
  if (!projectId) {
    return null;
  }

  try {
    const client = getSecretManagerClient();
    if (!client) return null;

    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 3000)
    );
    
    const fetchPromise = client.accessSecretVersion({ name });
    
    const [version] = await Promise.race([fetchPromise, timeoutPromise]);
    const payload = version.payload.data.toString('utf8');
    
    console.log(`[Secrets] Fetched: ${secretName}`);
    return payload;
  } catch (error) {
    return null;
  }
}

async function getSecret(secretName, envVarName = null) {
  const envName = envVarName || secretName;
  
  if (secretsCache[secretName]) {
    return secretsCache[secretName];
  }
  
  let value = process.env[envName];
  
  if (value) {
    secretsCache[secretName] = value;
    return value;
  }
  
  value = await getSecretFromManager(secretName);
  
  if (value) {
    secretsCache[secretName] = value;
    process.env[envName] = value;
    return value;
  }
  
  return null;
}

async function loadAllSecrets() {
  console.log('[Secrets] Loading...');
  
  const secrets = [
    { name: 'GOOGLE_CLIENT_ID', env: 'GOOGLE_CLIENT_ID' },
    { name: 'GOOGLE_CLIENT_SECRET', env: 'GOOGLE_CLIENT_SECRET' },
    { name: 'RESEND_API_KEY', env: 'RESEND_API_KEY' },
    { name: 'SESSION_SECRET', env: 'SESSION_SECRET' },
    { name: 'VITE_SUPABASE_URL', env: 'VITE_SUPABASE_URL' },
    { name: 'VITE_SUPABASE_ANON_KEY', env: 'VITE_SUPABASE_ANON_KEY' },
  ];
  
  try {
    await Promise.all(secrets.map(s => getSecret(s.name, s.env)));
  } catch (error) {
    console.log('[Secrets] Error:', error.message);
  }
  
  console.log('[Secrets] Done');
}

module.exports = {
  getSecret,
  loadAllSecrets,
  getSecretFromManager,
};
