# Frame Shift Video - Developer Guide

## What This Is

Self-hosted web service for queueing and managing FFmpeg video conversion jobs. Users can browse the server filesystem to select source files and receive notifications when jobs complete.

## Architecture Overview

**Separated frontend-backend architecture:**

- **Vite dev server**: Serves React UI during development with HMR
- **Bun server**: HTTP API, WebSocket, SQLite database, FFmpeg job processor
- **Production**: Bun server serves pre-built static files from `dist/` and handles all requests

The Bun server is the single source of truth for job state and queue management.

### Instance Types (Distributed Architecture)

Frame Shift Video supports three instance types for distributed processing:

**Standalone (default)**: Single server that does everything - serves UI, manages jobs, and runs FFmpeg.

**Leader-Follower**: Distributed setup for horizontal scaling:

- **Leader instance**: Serves the UI, creates jobs, manages the queue, but delegates FFmpeg execution to followers
- **Follower instances**: Execute FFmpeg jobs received from the leader and report progress back

**Key requirements for distributed setup:**

- **Shared filesystem**: Leader and all followers MUST have access to the same filesystem with identical paths. Mount the same network drive/NFS on all instances.
- **Authentication**: Leader and followers authenticate using a shared token (HMAC-based) to prevent unauthorized access.
- **Job distribution**: Leader uses "first available" strategy to distribute jobs to followers.
- **Failure handling**: If a follower fails or becomes unresponsive, the job is marked as failed (no automatic retry).

Configuration via environment variables:

- `INSTANCE_TYPE`: `standalone`, `leader`, or `follower`
- `SHARED_TOKEN`: Required for leader/follower instances (must be identical on all instances)
- `FOLLOWER_URLS`: Required for leader (comma-separated list of follower URLs)
- `LEADER_URL`: Required for followers (URL of the leader instance)

See `.env.example` for detailed configuration examples.

## Key Components (Terminology)

- **File picker**: The page with "Select Files for Conversion" text (`/src/routes/convert/index.tsx`)
- **Conversion page** / **Config page**: The page with "Configure Conversion" text (`/src/routes/convert/configure.tsx`)
- **Job queue**: The "Video jobs" list on the home page (`/src/components/job-list.tsx`)
- **File picker cursor**: The `key` parameter used for pagination on the file picker page

## Important Architectural Patterns

### File Picker State (Server-Side)

The file picker state is **entirely server-side**. The client acts as a thin client—it just sends requests like "expand this folder" or "select this file", and the backend responds with the entire contents of what the file picker should display.

The file picker renders as a tree visually, but **it's internally flattened**. The server returns a flat list; nested items are rendered with padding. This allows efficient rendering with `react-virtuoso`.

### Pagination & Cursors

Any list of files or jobs can be **unbounded in length**, so we use `react-virtuoso` and pagination.

Pagination is done using **opaque cursors**. The server responds with a cursor that the client must include in the next request. Internally, cursors contain JSON-encoded data for flexibility.

### Database Patterns

- **JSON fields**: Anything stored in the database that we won't need to query by can go into a JSON-encoded string stored in a TEXT field.
- **Indexes**: Database operations should make good use of indexes.
- **No SKIP/OFFSET**: Avoid expensive & non-scalable options like `SKIP` or `OFFSET`. Use cursor-based pagination instead.

Database schema is defined in `/server/database.ts`. Migrations run automatically on startup via `/server/db-service.ts`.

## Technology Stack

- **Runtime**: Bun (backend server, SQLite, WebSocket, testing)
- **Frontend**: Vite, React 19, TypeScript, TanStack Router, TanStack Query
- **Styling**: Tailwind CSS
- **Backend**: Bun HTTP server, integrated WebSocket, built-in SQLite
- **Video Processing**: FFmpeg (external dependency)
- **Notifications**: See `/server/notification-service.ts`

## Directory Structure

### Frontend (`/src`)

- **`/src/routes/`**: TanStack Router pages (file picker, config page, job queue)
- **`/src/components/`**: React components (job cards, file browser, conversion config)
- **`/src/lib/`**: Frontend utilities (API client, TanStack Query hooks, FFmpeg command builder)

### Backend (`/server`)

- **`index.ts`**: Main server entry point, HTTP + WebSocket setup, instance type detection
- **`routes.ts`**: API route definitions (see here for endpoint list)
- **`websocket.ts`**: WebSocket server for real-time updates
- **`database.ts`**: SQLite connection and schema
- **`db-service.ts`**: Database query layer
- **`job-processor.ts`**: Job queue manager, processes FFmpeg jobs (standalone/leader)
- **`leader-distributor.ts`**: Distributes jobs to follower instances (leader mode only)
- **`follower-executor.ts`**: Executes jobs received from leader (follower mode only)
- **`auth.ts`**: Authentication utilities for leader-follower communication
- **`notification-service.ts`**: Notification integrations
- **`/server/handlers/`**: API endpoint implementations (jobs, files, file selections, worker)

### Tests

- **`/src/test/`**: Test files using Bun's built-in test runner

## WebSocket Events

See `/server/websocket.ts` for event definitions. Websocket events update page as conversions make progress or complete.

## Development Workflow

```bash
# Start both Vite and Bun servers (recommended)
bun run dev

# Run tests
bun run test

# Linting
bun run lint

# Read Github issue
gh issue view 1234 --repo SeriousBug/frame-shift-video
```
