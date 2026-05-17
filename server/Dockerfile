# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

RUN npx prisma generate

COPY . .
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/dist            ./dist
COPY --from=builder /app/node_modules    ./node_modules
COPY --from=builder /app/prisma          ./prisma
COPY --from=builder /app/package.json    .

COPY entrypoint.sh      /entrypoint.sh
COPY scripts/seed-admin.js ./scripts/seed-admin.js
RUN chmod +x /entrypoint.sh

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
