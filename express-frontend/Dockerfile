FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY express-frontend/package*.json ./

# Install dependencies
RUN npm install --production && npm install tailwindcss postcss autoprefixer concurrently

# Copy application code
COPY express-frontend/ .

# Build CSS
RUN npm run build:css

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:5000/ || exit 1

# Start server
CMD ["npm", "start"]
