HOST ?= $(or $(APP_HOST),127.0.0.1)
PORT ?= $(or $(APP_PORT),8000)
ENV ?= $(or $(APP_ENV),development)

DEV = $(if $(filter development,$(ENV)),1,0)

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

default: install

$(VENV):
	python3 -m venv $(VENV)

install: $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install $(if $(DEV),"-e .[dev]",.)

run:
	$(PYTHON) -m uvicorn app.main:app $(if $(DEV),--reload,) --host $(HOST) --port $(PORT)

migrate:
	$(PYTHON) -m alembic upgrade head

format:
	$(PYTHON) -m ruff format .

lint:
	$(PYTHON) -m ruff check . --fix

test:
	$(PYTHON) -m pytest

clean:
	rm -rf __pycache__
	rm -rf build *.egg-info

check: format lint test

.PHONY: default install run format lint test clean check migrate