# Frontend: Express (same app as Vercel / express-frontend)
# docker-compose "frontend" service uses this; Vercel deploys express-frontend directly.
FROM node:18-slim

WORKDIR /app

# Copy package files (context is repo root)
COPY express-frontend/package*.json ./

# Install dependencies
RUN npm install --production && npm install tailwindcss postcss autoprefixer concurrently

# Copy application code
COPY express-frontend/ .

# Build CSS
RUN npm run build:css

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const port = process.env.PORT || 5000; require('http').get(`http://localhost:${port}/`, (r) => process.exit(r.statusCode === 200 ? 0 : 1));" || exit 1

CMD ["npm", "start"]
