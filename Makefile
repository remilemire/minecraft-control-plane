# Makefile

.PHONY: up down restart reset logs install build dev test lint format check all

all: up install check

# ================================
# ------------ Docker ------------
# ================================

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose down
	docker compose up -d

nuke:
	docker compose down -v --remove-orphans
	docker compose build --no-cache

logs:
	docker compose logs -f

# ================================
# ------------- Node -------------
# ================================

install: 
	npm ci --prefix backend
	npm ci --prefix frontend

build dev format lint test:
	npm run $@ --prefix backend
	npm run $@ --prefix frontend

check:
	$(MAKE) format
	$(MAKE) lint
	$(MAKE) test