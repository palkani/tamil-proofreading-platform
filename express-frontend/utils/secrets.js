const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

let secretsCache = {};
let secretManagerClient = null;

function getSecretManagerClient() {
  if (!secretManagerClient) {
    try {
      secretManagerClient = new SecretManagerServiceClient();
    } catch (error) {
      console.log('[Secrets] Secret Manager client not available:', error.message);
      return null;
    }
  }
  return secretManagerClient;
}

async function getSecretFromManager(secretName, timeoutMs = 5000) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
  
  if (!projectId) {
    return null;
  }

  try {
    const client = getSecretManagerClient();
    if (!client) return null;

    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );
    
    const fetchPromise = client.accessSecretVersion({ name });
    
    const [version] = await Promise.race([fetchPromise, timeoutPromise]);
    const payload = version.payload.data.toString('utf8');
    
    console.log(`[Secrets] Fetched from Secret Manager: ${secretName}`);
    return payload;
  } catch (error) {
    console.log(`[Secrets] Could not fetch ${secretName}: ${error.message}`);
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
    console.log(`[Secrets] ${secretName} from env`);
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
  console.log('[Secrets] Loading secrets...');
  
  const secrets = [
    { name: 'GOOGLE_CLIENT_ID', env: 'GOOGLE_CLIENT_ID' },
    { name: 'GOOGLE_CLIENT_SECRET', env: 'GOOGLE_CLIENT_SECRET' },
    { name: 'RESEND_API_KEY', env: 'RESEND_API_KEY' },
    { name: 'SESSION_SECRET', env: 'SESSION_SECRET' },
  ];
  
  try {
    await Promise.all(secrets.map(s => getSecret(s.name, s.env)));
  } catch (error) {
    console.log('[Secrets] Error loading secrets:', error.message);
  }
  
  console.log('[Secrets] Done');
}

module.exports = {
  getSecret,
  loadAllSecrets,
  getSecretFromManager,
};
