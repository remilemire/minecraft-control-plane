# backend/Makefile

.PHONY: format lint test check clean revision migrate downgrade logs install

install:
	uv sync

format:
	uv run ruff format .

lint:
	uv run ruff check . --fix

test:
	uv run pytest

check: format lint test

migrate:
	docker compose run --rm backend uv run alembic upgrade head

MESSAGE ?= migration
revision:
	docker compose run --rm backend uv run alembic revision --autogenerate -m "$(MESSAGE)"

REV ?= -1
downgrade:
	docker compose run --rm backend uv run alembic downgrade $(REV)

logs:
	docker compose logs backend -f

clean:
	find . -type d -name "__pycache__" -prune -exec rm -rf {} +
	find . -type d -name "*.egg-info" -prune -exec rm -rf {} +
	rm -rf build
	find . -name ".DS_Store" -delete
