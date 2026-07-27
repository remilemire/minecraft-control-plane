# apps/minecraft-controller/Dockerfile

# ================================
# ------------- Base -------------
# ================================

FROM node:23-alpine AS base

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
WORKDIR /app/apps/minecraft-controller
CMD ["npm", "run", "dev"]

# ================================
# ----------- Builder ------------
# ================================

FROM base AS builder
COPY . .
RUN pnpm --filter @minecraft-control-plane/shared build \
  && pnpm --filter @minecraft-control-plane/minecraft-controller build

# ================================
# ---------- Production ----------
# ================================

FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=builder /app/apps/minecraft-controller/dist ./dist
CMD ["node", "dist/server.js"]
