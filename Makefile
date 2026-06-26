.PHONY: backend frontend install

install:
	pip install -r backend/requirements.txt
	cd adpilot-ai-pilot && bun install

backend:
	cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd adpilot-ai-pilot && bun dev

dev:
	@echo "Start backend: make backend"
	@echo "Start frontend: make frontend"
