#!/usr/bin/env node

/**
 * Load Testing Script for ProofTamil
 * Tests system capability to handle 1000+ concurrent users
 * 
 * Usage: node scripts/load-test.js [target_url] [concurrent_users] [duration_seconds]
 * Example: node scripts/load-test.js https://www.prooftamil.com 100 30
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const TARGET_URL = process.argv[2] || 'https://www.prooftamil.com';
const CONCURRENT_USERS = parseInt(process.argv[3]) || 100;
const DURATION_SECONDS = parseInt(process.argv[4]) || 30;

// HTTP Agent with high concurrency settings
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: CONCURRENT_USERS,
  maxFreeSockets: Math.floor(CONCURRENT_USERS / 2),
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: CONCURRENT_USERS,
  maxFreeSockets: Math.floor(CONCURRENT_USERS / 2),
  rejectUnauthorized: true,
});

// Test endpoints with their methods and sample payloads
const ENDPOINTS = [
  // High-traffic read endpoints
  { path: '/', method: 'GET', weight: 20, name: 'Homepage' },
  { path: '/how-to-use', method: 'GET', weight: 5, name: 'How-to-use' },
  { path: '/tools/ai-content-writer', method: 'GET', weight: 5, name: 'AI Writer Page' },
  { path: '/blog', method: 'GET', weight: 10, name: 'Blog List' },
  
  // API endpoints
  { 
    path: '/api/ime/suggest?q=van&mode=smart&limit=5', 
    method: 'GET', 
    weight: 30, 
    name: 'IME Suggest' 
  },
  { 
    path: '/api/transliterate', 
    method: 'POST', 
    weight: 15,
    name: 'Transliterate',
    body: JSON.stringify({ text: 'vanakkam' }),
    headers: { 'Content-Type': 'application/json' }
  },
  { 
    path: '/api/gemini/analyze', 
    method: 'POST', 
    weight: 10,
    name: 'Gemini Analyze',
    body: JSON.stringify({ text: 'வணக்கம் நண்பா', options: { mode: 'quick' } }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    path: '/api/newsletter/count',
    method: 'GET',
    weight: 5,
    name: 'Newsletter Count'
  },
];

// Stats tracking
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  rateLimited: 0,
  timeouts: 0,
  errors: {},
  latencies: [],
  byEndpoint: {},
  startTime: null,
  endTime: null,
};

// Initialize endpoint stats
ENDPOINTS.forEach(ep => {
  stats.byEndpoint[ep.name] = {
    requests: 0,
    success: 0,
    failed: 0,
    rateLimited: 0,
    avgLatency: 0,
    minLatency: Infinity,
    maxLatency: 0,
    latencies: [],
  };
});

// Weighted random endpoint selection
function selectEndpoint() {
  const totalWeight = ENDPOINTS.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const endpoint of ENDPOINTS) {
    random -= endpoint.weight;
    if (random <= 0) return endpoint;
  }
  return ENDPOINTS[0];
}

// Make a single request
function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(endpoint.path, TARGET_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: endpoint.method,
      agent: isHttps ? httpsAgent : httpAgent,
      headers: {
        'User-Agent': 'ProofTamil-LoadTest/1.0',
        'Accept': 'text/html,application/json',
        ...(endpoint.headers || {}),
      },
      timeout: 30000,
    };
    
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        const endpointStats = stats.byEndpoint[endpoint.name];
        
        stats.totalRequests++;
        endpointStats.requests++;
        stats.latencies.push(latency);
        endpointStats.latencies.push(latency);
        endpointStats.minLatency = Math.min(endpointStats.minLatency, latency);
        endpointStats.maxLatency = Math.max(endpointStats.maxLatency, latency);
        
        if (res.statusCode === 429) {
          stats.rateLimited++;
          endpointStats.rateLimited++;
          resolve({ success: false, rateLimited: true, latency });
        } else if (res.statusCode >= 200 && res.statusCode < 400) {
          stats.successfulRequests++;
          endpointStats.success++;
          resolve({ success: true, latency, status: res.statusCode });
        } else {
          stats.failedRequests++;
          endpointStats.failed++;
          const errKey = `${res.statusCode}`;
          stats.errors[errKey] = (stats.errors[errKey] || 0) + 1;
          resolve({ success: false, latency, status: res.statusCode });
        }
      });
    });
    
    req.on('error', (err) => {
      const latency = Date.now() - startTime;
      stats.totalRequests++;
      stats.failedRequests++;
      stats.byEndpoint[endpoint.name].requests++;
      stats.byEndpoint[endpoint.name].failed++;
      
      const errKey = err.code || err.message;
      stats.errors[errKey] = (stats.errors[errKey] || 0) + 1;
      
      if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        stats.timeouts++;
      }
      
      resolve({ success: false, error: err.message, latency });
    });
    
    req.on('timeout', () => {
      stats.timeouts++;
      req.destroy();
    });
    
    if (endpoint.body) {
      req.write(endpoint.body);
    }
    
    req.end();
  });
}

// Virtual user simulation
async function virtualUser(userId, endTime) {
  while (Date.now() < endTime) {
    const endpoint = selectEndpoint();
    await makeRequest(endpoint);
    
    // Small random delay between requests (100-500ms) to simulate real user
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
  }
}

// Calculate percentile
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Print results
function printResults() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const rps = stats.totalRequests / duration;
  
  console.log('\n' + '='.repeat(70));
  console.log('                    LOAD TEST RESULTS');
  console.log('='.repeat(70));
  
  console.log(`\nTarget: ${TARGET_URL}`);
  console.log(`Concurrent Users: ${CONCURRENT_USERS}`);
  console.log(`Duration: ${duration.toFixed(1)}s`);
  
  console.log('\n--- OVERALL STATS ---');
  console.log(`Total Requests:     ${stats.totalRequests}`);
  console.log(`Requests/Second:    ${rps.toFixed(2)}`);
  console.log(`Successful:         ${stats.successfulRequests} (${(stats.successfulRequests/stats.totalRequests*100).toFixed(1)}%)`);
  console.log(`Failed:             ${stats.failedRequests} (${(stats.failedRequests/stats.totalRequests*100).toFixed(1)}%)`);
  console.log(`Rate Limited (429): ${stats.rateLimited} (${(stats.rateLimited/stats.totalRequests*100).toFixed(1)}%)`);
  console.log(`Timeouts:           ${stats.timeouts}`);
  
  if (stats.latencies.length > 0) {
    const avg = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
    console.log('\n--- LATENCY (ms) ---');
    console.log(`Average:  ${avg.toFixed(0)}ms`);
    console.log(`P50:      ${percentile(stats.latencies, 50)}ms`);
    console.log(`P90:      ${percentile(stats.latencies, 90)}ms`);
    console.log(`P95:      ${percentile(stats.latencies, 95)}ms`);
    console.log(`P99:      ${percentile(stats.latencies, 99)}ms`);
    console.log(`Min:      ${Math.min(...stats.latencies)}ms`);
    console.log(`Max:      ${Math.max(...stats.latencies)}ms`);
  }
  
  console.log('\n--- BY ENDPOINT ---');
  console.log('-'.repeat(70));
  console.log('Endpoint'.padEnd(20) + 'Reqs'.padStart(8) + 'OK'.padStart(8) + 
              'Fail'.padStart(8) + '429'.padStart(8) + 'AvgMs'.padStart(10) + 'P95'.padStart(8));
  console.log('-'.repeat(70));
  
  for (const [name, ep] of Object.entries(stats.byEndpoint)) {
    if (ep.requests === 0) continue;
    const avg = ep.latencies.length > 0 
      ? (ep.latencies.reduce((a, b) => a + b, 0) / ep.latencies.length).toFixed(0)
      : 'N/A';
    const p95 = ep.latencies.length > 0 ? percentile(ep.latencies, 95) : 'N/A';
    
    console.log(
      name.padEnd(20) +
      String(ep.requests).padStart(8) +
      String(ep.success).padStart(8) +
      String(ep.failed).padStart(8) +
      String(ep.rateLimited).padStart(8) +
      String(avg).padStart(10) +
      String(p95).padStart(8)
    );
  }
  
  if (Object.keys(stats.errors).length > 0) {
    console.log('\n--- ERROR BREAKDOWN ---');
    for (const [err, count] of Object.entries(stats.errors)) {
      console.log(`  ${err}: ${count}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  
  // Pass/Fail criteria
  const successRate = stats.successfulRequests / stats.totalRequests;
  const rateLimitRate = stats.rateLimited / stats.totalRequests;
  
  console.log('\n--- ASSESSMENT ---');
  
  if (successRate >= 0.95 && rateLimitRate < 0.05) {
    console.log('✅ PASS: System handles load well');
    console.log(`   - Success rate: ${(successRate * 100).toFixed(1)}% (target: ≥95%)`);
    console.log(`   - Rate limit rate: ${(rateLimitRate * 100).toFixed(1)}% (target: <5%)`);
  } else if (successRate >= 0.90) {
    console.log('⚠️  WARNING: System shows strain under load');
    console.log(`   - Success rate: ${(successRate * 100).toFixed(1)}% (target: ≥95%)`);
    console.log(`   - Rate limit rate: ${(rateLimitRate * 100).toFixed(1)}% (target: <5%)`);
  } else {
    console.log('❌ FAIL: System cannot handle this load');
    console.log(`   - Success rate: ${(successRate * 100).toFixed(1)}% (target: ≥95%)`);
    console.log(`   - Rate limit rate: ${(rateLimitRate * 100).toFixed(1)}% (target: <5%)`);
  }
  
  console.log('\n');
}

// Main execution
async function main() {
  console.log('='.repeat(70));
  console.log('           ProofTamil Load Test');
  console.log('='.repeat(70));
  console.log(`\nTarget:      ${TARGET_URL}`);
  console.log(`Users:       ${CONCURRENT_USERS} concurrent`);
  console.log(`Duration:    ${DURATION_SECONDS} seconds`);
  console.log(`Endpoints:   ${ENDPOINTS.length} different paths`);
  console.log('\nStarting load test...\n');
  
  stats.startTime = Date.now();
  const endTime = stats.startTime + (DURATION_SECONDS * 1000);
  
  // Create virtual users
  const users = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    users.push(virtualUser(i, endTime));
  }
  
  // Progress indicator
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const remaining = Math.max(0, DURATION_SECONDS - elapsed);
    process.stdout.write(`\rProgress: ${elapsed.toFixed(0)}s / ${DURATION_SECONDS}s | Requests: ${stats.totalRequests} | RPS: ${(stats.totalRequests / elapsed).toFixed(1)} `);
  }, 1000);
  
  // Wait for all users to complete
  await Promise.all(users);
  
  clearInterval(progressInterval);
  stats.endTime = Date.now();
  
  printResults();
}

main().catch(console.error);
