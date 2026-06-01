# frontend/Dockerfile

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

FROM base as dev

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
COPY . .

# ================================
# ----------- Builder ------------
# ================================

FROM base as builder

RUN npm run build

# ================================
# ---------- Production ----------
# ================================

FROM nginx:alpine AS prod

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80