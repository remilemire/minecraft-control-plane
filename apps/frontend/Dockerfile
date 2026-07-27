# apps/frontend/Dockerfile

# Dev-only image: in prod the SPA is built inside the backend's image (see
# apps/backend/Dockerfile) and served same-origin — there is no frontend
# container.

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
WORKDIR /app/apps/frontend
CMD ["npm", "run", "dev"]
