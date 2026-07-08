# Makefile

.PHONY: up down restart reset logs install build dev test lint format check all

all: up install check

# ================================
# ------------ Docker ------------
# ================================

up:
	docker compose up --build -d

down:
	docker compose down

restart:
	$(MAKE) down
	$(MAKE) up

nuke:
	docker compose down -v --remove-orphans
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-db:
	docker compose logs db -f

logs-backend:
	docker compose logs backend -f

logs-frontend:
	docker compose logs frontend -f

logs-minecraft:
	docker compose logs minecraft -f

# ================================
# ------------- Node -------------
# ================================

install: 
	pnpm install --frozen-lockfile

build dev test format lint:
	npm run $@ --workspaces --if-present

check:
	$(MAKE) format
	$(MAKE) lint
	$(MAKE) test