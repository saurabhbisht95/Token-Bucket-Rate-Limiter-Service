FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY vite.config.js ./
COPY frontend ./frontend

RUN npm run build

FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY migrations ./migrations
COPY --from=frontend-builder /app/public ./public

EXPOSE 8080

CMD ["node", "src/server.js"]
