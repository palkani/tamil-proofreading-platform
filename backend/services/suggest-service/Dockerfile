FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# Install deps (Cloud Run build step should have network access)
RUN npm ci --omit=dev || npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=build /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]


