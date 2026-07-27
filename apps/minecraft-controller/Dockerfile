# apps/minecraft-controller/Dockerfile

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
WORKDIR /app/apps/minecraft-controller
CMD ["npm", "run", "dev"]

# ================================
# ----------- Builder ------------
# ================================

FROM base AS builder
COPY . .
RUN pnpm --filter @minecraft-control-plane/shared build \
  && pnpm --filter @minecraft-control-plane/minecraft-controller build

# Flatten to a prod-only install (workspace deps are symlinks otherwise).
# Legacy deploy packs by npm-pack rules, so the `files` fields in this
# package's and shared's package.json carry dist/ past .gitignore; the
# asserts turn any packing drift into a build failure.
RUN pnpm --filter @minecraft-control-plane/minecraft-controller --prod deploy --legacy /deploy \
  && test -f /deploy/dist/server.js \
  && test -f /deploy/node_modules/@minecraft-control-plane/shared/dist/errors.js

# ================================
# ---------- Production ----------
# ================================

# Runs as root: the container must read the docker socket, whose gid on the
# host is unpredictable. The bearer token and the dedicated compose network
# remain the security boundary.
FROM node:22-alpine AS prod

ENV NODE_ENV=production

WORKDIR /app
COPY --from=builder /deploy .

EXPOSE 8000
CMD ["node", "dist/server.js"]
