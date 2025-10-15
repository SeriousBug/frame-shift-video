# Copilot Instructions for AI Coding Agents

## Project Overview

Frame Shift Video is a self-hosted video conversion service. It features a React frontend (Vite, TanStack Router/Query, shadcn/ui) and a Bun backend (HTTP API, WebSocket, SQLite, FFmpeg job processor). The backend manages all job state and queue logic, serving both API and static files in production.

## Key Architecture

- **Frontend (`src/`)**: React app, TanStack Router for navigation, TanStack Query for API state, Tailwind for styling. Components and routes are organized by feature.
- **Backend (`server/`)**: Bun HTTP server, SQLite database, job queue, notification integrations. API endpoints and WebSocket events are defined in `routes.ts`, `websocket.ts`, and `/handlers/`.
- **Database**: SQLite, auto-migrated on startup. Jobs and settings tables. See `database.ts` and `db-service.ts`.
- **Notifications**: Discord and Pushover via environment variables, handled in `notification-service.ts`.

## Developer Workflow

- **Start dev servers**: `npm run dev` (Vite + Bun)
- **Run tests**: `npm run test` (Vitest)
- **Lint/format**: `npm run lint`, `npm run format`
- **Build**: `npm run build` (frontend), `npm run start` (production server)
- **Docker**: Multi-stage build, see `Dockerfile` and README for usage.

## Patterns & Conventions

- **Job lifecycle**: Jobs are created via API/UI, stored in SQLite, processed by `job-processor.ts`, and updated via WebSocket.
- **WebSocket events**: Real-time job updates (`job-update`, `job-created`, etc.)
- **API endpoints**: `/api/jobs`, `/api/files`, `/api/file-selections` (see `routes.ts` and `/handlers/`)
- **Frontend state**: TanStack Query for API data, stores for UI state.
- **File browser**: Server-side file selection, see `file-picker-service.ts` and related handlers.
- **Testing**: Vitest for unit/integration tests, especially for job processing and FFmpeg logic.

## External Dependencies

- **FFmpeg**: Must be installed and available in PATH for job processing.
- **Bun**: Required for backend/server.
- **Discord/Pushover**: Optional, for notifications (set via env vars).

## Security

- **No authentication**: Do NOT expose to public internet. See README for warnings.

## Example Files

- `src/routes/index.tsx`: Job dashboard
- `server/job-processor.ts`: Job queue logic
- `server/notification-service.ts`: Notification integration
- `server/handlers/jobs.ts`: Job API endpoints
- `src/lib/ffmpeg-command.ts`: FFmpeg command builder

## Quick Reference

- **Start dev**: `npm run dev`
- **Run tests**: `npm run test`
- **Build**: `npm run build`
- **API**: See `routes.ts` and `/handlers/`
- **WebSocket**: See `websocket.ts`

---

For more details, see `README.md` and comments in key files. Update this document if major architectural changes are made.
