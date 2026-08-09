import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reuse the monorepo's existing credentials.
 *
 * GOOGLE_GENAI_API_KEY, SUPABASE_URL and the SendGrid key are already
 * configured in the repo-root .env / .env.local for the Go backend and the
 * Express app. Rather than making you paste them into a second file — and then
 * keep two copies in sync through every rotation — this pulls them in.
 *
 * Precedence, highest first:
 *   1. real process.env (CI secrets, host dashboard)
 *   2. frontend/.env.local, frontend/.env   (Next has already loaded these)
 *   3. <repo root>/.env.local, <repo root>/.env
 *
 * dotenv never overwrites a variable that is already set, so loading in that
 * order means a chatbot-specific override in frontend/.env.local always wins
 * over the shared root value.
 *
 * SERVERLESS CAVEAT: this runs when the Node process starts (next dev,
 * next start, npm run ingest). On Vercel/Lambda the config is evaluated at
 * BUILD time, not per request, so the root .env is not readable at runtime —
 * set the variables in the host's dashboard there. See CHATBOT_README.md.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * Synchronous on purpose: scripts/ingest.ts is transpiled to CJS by tsx, where
 * a top-level `await` on this is a build error. createRequire loads dotenv
 * (a CJS module) without one.
 */
export function loadRootEnv() {
  const loaded = [];

  let dotenv;
  try {
    dotenv = createRequire(import.meta.url)('dotenv');
  } catch {
    // dotenv is a devDependency. On a production install (--omit=dev) it is
    // absent, and env should be coming from the host anyway — so skip quietly.
    return loaded;
  }

  for (const file of ['.env.local', '.env']) {
    const path = resolve(repoRoot, file);
    if (!existsSync(path)) continue;
    dotenv.config({ path, override: false, quiet: true });
    loaded.push(path);
  }

  return loaded;
}
