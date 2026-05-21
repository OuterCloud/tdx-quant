.PHONY: dev dev-services backend frontend build lint migrate test clean

# Container runtime (nerdctl for Rancher Desktop containerd mode)
COMPOSE := nerdctl compose

# Development
dev-services:
	$(COMPOSE) -f docker-compose.dev.yaml up -d

dev: dev-services
	@echo "Services started. Run 'make backend' and 'make frontend' in separate terminals."

backend:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

frontend:
	cd frontend && pnpm dev

# Build
build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

# Database
migrate:
	cd backend && uv run alembic upgrade head

migrate-new:
	cd backend && uv run alembic revision --autogenerate -m "$(msg)"

# Lint & Format
lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && pnpm lint

format:
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && pnpm format

# Test
test:
	cd backend && uv run pytest

# Clean
clean:
	$(COMPOSE) down -v
	rm -rf backend/.venv frontend/node_modules
