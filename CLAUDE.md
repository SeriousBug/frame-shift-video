# Frame Shift Video - Developer Guide

## What This Is

Self-hosted web service for queueing and managing FFmpeg video conversion jobs. Users can drag-and-drop to reorder the job queue, browse the server filesystem to select source files, and receive notifications when jobs complete.

## Technologies

- **Runtime**: Bun (backend server, SQLite, WebSocket)
- **Frontend**: Vite, React 19, TypeScript, TanStack Router, TanStack Query
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui, React DnD Kit (drag-and-drop)
- **Backend**: Bun HTTP server, integrated WebSocket, built-in SQLite
- **Video Processing**: FFmpeg (external dependency)
- **Notifications**: Pushover API, Discord Webhooks
- **Testing**: Vitest
- **Code Quality**: ESLint, Prettier, Husky

## Architecture

**Separated frontend-backend architecture:**

- **Vite dev server (port 3000)**: Serves React UI during development with HMR
- **Bun server (port 3001)**: HTTP API, WebSocket, SQLite database, FFmpeg job processor
- **Production**: Bun server serves pre-built static files from `dist/` and handles all requests

The Bun server is the single source of truth for job state and queue management, eliminating synchronization issues between the API and WebSocket.

## Codebase Layout

### Frontend (`/src`)

- **`/src/routes/`**: TanStack Router pages
  - `index.tsx`: Job list/dashboard
  - `convert/index.tsx`: File selection
  - `convert/configure.tsx`: FFmpeg configuration
- **`/src/components/`**: React components
  - `job-list.tsx`: Main job queue with drag-and-drop
  - `job-card.tsx`: Individual job display
  - `file-browser-modal.tsx`: Server file browser
  - `conversion-config.tsx`: FFmpeg preset/command configuration
- **`/src/lib/`**: Frontend utilities
  - `api.ts`: API client functions
  - `api-hooks.ts`: TanStack Query hooks
  - `ffmpeg-command.ts`: FFmpeg command builder
  - `ffmpeg-executor.ts`: FFmpeg process execution

### Backend (`/server`)

- **`index.ts`**: Main server entry point, HTTP + WebSocket setup
- **`routes.ts`**: API route handlers
- **`websocket.ts`**: WebSocket server for real-time updates
- **`database.ts`**: SQLite connection and schema
- **`db-service.ts`**: Database query layer
- **`job-processor.ts`**: Job queue manager, processes FFmpeg jobs
- **`notification-service.ts`**: Pushover and Discord integrations
- **`static.ts`**: Static file serving for production
- **`/server/handlers/`**: API endpoint implementations
  - `jobs.ts`: Job CRUD, retry, reorder endpoints
  - `files.ts`: File system browsing
  - `file-selections.ts`: File selection state

### Configuration

- **`package.json`**: Scripts and dependencies
- **`vite.config.ts`**: Vite dev server config with proxy to Bun server
- **`tsconfig.json`**: TypeScript compiler options
- **`Dockerfile`**: Production container image
- **`.env.example`**: Environment variable documentation

### Tests

- **`/src/test/`**: Test files (Vitest)
  - `ffmpeg-executor.test.ts`: Unit tests for FFmpeg execution
  - `job-processor.test.ts`: Job queue processor tests
  - Integration tests for FFmpeg progress parsing

## Database Schema

SQLite database in `/data/jobs.db`:

- **`jobs`**: Conversion job records (id, filename, paths, status, progress, FFmpeg command, order)
- **`settings`**: Key-value configuration store (notifications, etc.)

Migrations run automatically on server startup via `db-service.ts`.

## Job Processing Flow

1. User creates job via web UI
2. Job saved to database with `pending` status
3. Job processor picks up next pending job
4. FFmpeg process spawned with progress parsing
5. Progress updates broadcast via WebSocket
6. On completion, notifications sent (if configured)
7. Job marked `completed` or `failed` in database

## WebSocket Events

- `job-update`: Real-time job status and progress changes
- `job-created`: New job added to queue
- `job-deleted`: Job removed from queue
- `active-jobs-count`: Number of currently processing jobs

## Development Workflow

```bash
# Start both Vite and Bun servers (recommended)
npm run dev

# Or start individually:
npm run dev:client  # Vite only (port 3000)
npm run dev:server  # Bun only (port 3001)

# Run tests
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:ui     # With Vitest UI

# Linting and formatting
npm run lint
npm run format

# Production build
npm run build       # Builds frontend to dist/
npm run start       # Starts Bun server (serves from dist/)
```

## Docker Build

The Dockerfile uses a multi-stage build:

1. **Builder stage**: Installs dependencies, builds frontend
2. **Production stage**: Alpine Linux, copies built artifacts, installs FFmpeg
3. Final image: ~200MB

## API Endpoints

- `GET /api/jobs` - List all jobs with counts by status
- `POST /api/jobs` - Create new job
- `PATCH /api/jobs/:id` - Update job (reorder)
- `DELETE /api/jobs/:id` - Delete job
- `POST /api/jobs/:id/retry` - Retry failed job
- `POST /api/jobs/reorder` - Reorder multiple jobs
- `GET /api/files?path=...` - Browse filesystem
- `GET /api/file-selections` - Get selected files for conversion
- `POST /api/file-selections` - Save file selections
- `DELETE /api/file-selections` - Clear selections
