import { loadRootEnv } from './load-root-env.mjs';

// Pull GOOGLE_GENAI_API_KEY / SUPABASE_URL / SendGrid from the repo-root .env
// files so the chatbot reuses the credentials the rest of the monorepo already
// has. Next has already loaded frontend/.env* by this point, and these never
// override — so a chatbot-specific value still wins.
loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The chatbot's server modules (Gemini, service-role Supabase) must never be
  // bundled for the browser. `server-only` enforces this at import time; this
  // list is the belt to that suspenders and keeps the client bundle small.
  serverExternalPackages: ['@google/genai'],
};

export default nextConfig;
