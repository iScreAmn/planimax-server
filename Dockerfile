# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production \
    PORT=5055

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S api -G nodejs

COPY --from=deps --chown=api:nodejs /app/node_modules ./node_modules
COPY --chown=api:nodejs . .

USER api
EXPOSE 5055

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:5055/api/health || exit 1

CMD ["node", "server.js"]
