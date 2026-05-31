BACKEND_RUN := docker compose run --rm backend uv run

.PHONY: format lint test check clean revision migrate downgrade logs

format:
	$(BACKEND_RUN) ruff format .

lint:
	$(BACKEND_RUN) ruff check . --fix

test:
	$(BACKEND_RUN) pytest

check: format lint test

migrate:
	$(BACKEND_RUN) alembic upgrade head

MESSAGE ?= migration
revision:
	$(BACKEND_RUN) alembic revision --autogenerate -m "$(MESSAGE)"

REV ?= -1
downgrade:
	$(BACKEND_RUN) alembic downgrade $(REV)

logs:
	docker compose logs backend -f

clean:
	rm -rf __pycache__
	rm -rf build *.egg-info
	rm -rf .DS_STORE
