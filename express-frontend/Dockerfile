FROM node:18-slim

WORKDIR /app

# Copy package files
COPY express-frontend/package*.json ./

# Install dependencies
RUN npm install --production && npm install tailwindcss postcss autoprefixer concurrently

# Copy application code
COPY express-frontend/ .

# Build CSS
RUN npm run build:css

# Expose port expected by hosting environment (Vercel sets PORT=8080)
EXPOSE 8080

# Health check - use curl instead of wget for slim image
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const port = process.env.PORT || 5000; require('http').get(`http://localhost:${port}/`, (r) => process.exit(r.statusCode === 200 ? 0 : 1));" || exit 1

# Start server
CMD ["npm", "start"]
