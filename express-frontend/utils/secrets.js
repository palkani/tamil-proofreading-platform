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

async function getSecretFromManager(secretName) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
  
  if (!projectId) {
    console.log('[Secrets] No GCP project ID found, skipping Secret Manager');
    return null;
  }

  try {
    const client = getSecretManagerClient();
    if (!client) return null;

    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    console.log(`[Secrets] Fetching secret: ${secretName}`);
    
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload.data.toString('utf8');
    
    console.log(`[Secrets] Successfully fetched: ${secretName}`);
    return payload;
  } catch (error) {
    console.log(`[Secrets] Failed to fetch ${secretName}:`, error.message);
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
    console.log(`[Secrets] ${secretName} loaded from environment variable`);
    secretsCache[secretName] = value;
    return value;
  }
  
  value = await getSecretFromManager(secretName);
  
  if (value) {
    secretsCache[secretName] = value;
    process.env[envName] = value;
    return value;
  }
  
  console.log(`[Secrets] ${secretName} not found in environment or Secret Manager`);
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
  
  for (const secret of secrets) {
    await getSecret(secret.name, secret.env);
  }
  
  console.log('[Secrets] Secrets loading complete');
}

module.exports = {
  getSecret,
  loadAllSecrets,
  getSecretFromManager,
};
