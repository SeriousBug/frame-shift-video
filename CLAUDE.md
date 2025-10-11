# Frame Shift Video - Project Summary

## Project Overview

Self-hosted video conversion web service using FFmpeg, built with Vite + React frontend and Bun backend. Designed for personal use with a simple drag-and-drop interface for video conversion jobs.

## Key Features

- File upload and server-local file selection
- Video format conversion with customizable settings
- Manual FFmpeg command input for advanced users
- Drag-and-drop job queue reordering (React DnD Kit)
- SQLite database for job persistence and history
- Pushover and Discord notifications
- Job queue survives server restarts
- Real-time updates via WebSocket integration

## Technical Stack

- **Frontend**: Vite, React 19, TypeScript, Tailwind CSS, React DnD Kit
- **Backend**: Bun runtime with built-in SQLite, WebSocket server, FFmpeg integration
- **Development**: ESLint, Prettier, Husky git hooks, Vitest

## Architecture

The application uses a **separated frontend-backend architecture**:

- **Vite (port 3000)**: Serves the React UI with hot module reloading
- **Bun Server (port 3001)**: Handles API routes, WebSocket connections, SQLite database, and job processing
- **Proxying**: Vite proxies `/api` requests to the Bun server during development

This architecture eliminates state synchronization issues by:

- Running a single stateful backend server (Bun)
- WebSocket server integrated directly with the HTTP server
- Job processor running in the same process as the API and WebSocket

## Current Status

✅ **Completed:**

- Vite + React frontend setup with TypeScript
- Bun backend server with integrated WebSocket
- SQLite database using Bun's built-in support
- API routes (files, jobs, job retry)
- Job processor with automatic queue management
- Real-time job updates via WebSocket
- Tailwind CSS configuration
- ESLint, Prettier, Husky setup
- Database service layer with migrations
- Vitest testing framework setup

🔄 **Next Steps:**

1. Add drag-and-drop job queue reordering
2. Build notification systems (Pushover, Discord)
3. Add file upload functionality
4. Improve error handling and logging

## Important Notes

- **Security**: Self-hosted only - allows direct FFmpeg execution
- **Dependencies**: Requires FFmpeg and Bun installed on host system
- **Database**: SQLite with Bun's built-in driver (no external dependencies)
- **Notifications**: Pushover API and Discord webhooks (planned)
- **Real-time Updates**: WebSocket integrated with Bun server for live progress updates

## Development Commands

```bash
npm run dev          # Start both Vite and Bun server (concurrently)
npm run dev:client   # Start Vite dev server only
npm run dev:server   # Start Bun server only
npm run build        # Build Vite frontend for production
npm run start        # Start production Bun server
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:ui      # Run tests with UI dashboard
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

## Reference

See `README.md` for complete project documentation, architecture details, and setup instructions.
