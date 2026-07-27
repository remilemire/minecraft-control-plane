# apps/frontend/Dockerfile

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
WORKDIR /app/apps/frontend
CMD ["npm", "run", "dev"]

# ================================
# ----------- Builder ------------
# ================================

FROM base AS builder
COPY . .
RUN npm run build

# ================================
# ---------- Production ----------
# ================================

FROM nginx:alpine AS prod
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
