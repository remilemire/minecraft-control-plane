# apps/backend/Dockerfile

# ================================
# ------------- Base -------------
# ================================

FROM node:22-alpine AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/minecraft-controller/package.json ./apps/minecraft-controller/
COPY packages/shared/package.json ./packages/shared/

RUN corepack enable && pnpm install --frozen-lockfile

# ================================
# --------- Development ----------
# ================================

FROM base AS dev
WORKDIR /app/apps/backend
CMD ["npm", "run", "dev"]

# ================================
# ----------- Builder ------------
# ================================

FROM base AS builder
COPY . .

# Baked into the frontend bundle by Vite (public, not a secret). The frontend
# is built here because the prod image serves it same-origin.
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN pnpm --filter @minecraft-control-plane/shared build \
  && pnpm --filter @minecraft-control-plane/backend build \
  && pnpm --filter @minecraft-control-plane/frontend build

# Flatten to a prod-only install (workspace deps are symlinks otherwise).
# Legacy deploy packs by npm-pack rules, so the `files` fields in the
# backend's and shared's package.json are what carry dist/ and migrations/
# past .gitignore; the asserts turn any packing drift into a build failure.
RUN pnpm --filter @minecraft-control-plane/backend --prod deploy --legacy /deploy \
  && test -f /deploy/dist/server.js \
  && test -f /deploy/migrations/meta/_journal.json \
  && test -f /deploy/node_modules/@minecraft-control-plane/shared/dist/errors.js

# ================================
# ---------- Production ----------
# ================================

FROM node:22-alpine AS prod

ARG VCS_REF=unknown
LABEL org.opencontainers.image.revision=$VCS_REF

ENV NODE_ENV=production
ENV SPA_DIR=/app/public

WORKDIR /app
COPY --from=builder /deploy .
COPY --from=builder /app/apps/frontend/dist ./public

EXPOSE 8000
USER node
CMD ["node", "dist/server.js"]
