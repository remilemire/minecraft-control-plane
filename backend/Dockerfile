# backend/Dockerfile

# ================================
# ------------- Base -------------
# ================================

FROM node:23-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# ================================
# --------- Development ----------
# ================================

FROM base AS dev

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ================================
# ----------- Builder ------------
# ================================

FROM base AS builder

RUN npm run build

# ================================
# ---------- Production ----------
# ================================

FROM node:22-alpine AS prod

COPY --from=builder /app/dist ./dist

EXPOSE 8000

CMD ["npm", "run", "start"]