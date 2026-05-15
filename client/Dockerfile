# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ── Stage 2: Serve static files via Nginx ────────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config is mounted at runtime from deploymentV2/nginx/default.conf
# so client-side routing and the /api proxy are handled there.

EXPOSE 80
