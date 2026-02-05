/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_TRANSLITERATOR_BASE_URL:
      process.env.NEXT_PUBLIC_TRANSLITERATOR_BASE_URL,
  },
};

module.exports = nextConfig;

