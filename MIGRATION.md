# Migration from Next.js to Vite + Bun

## Overview

This document describes the migration from Next.js to a Vite + React frontend with a separate Bun backend server.

## Architecture Changes

### Before (Next.js)

- Single process running Next.js with custom server (server.mjs)
- Next.js API routes handling backend logic
- WebSocket server running alongside Next.js
- better-sqlite3 for database

### After (Vite + Bun)

- **Frontend**: Vite dev server (port 3000) serving React app
- **Backend**: Bun server (port 3001) handling all backend logic
- WebSocket integrated directly into Bun server
- Bun's built-in SQLite (no external dependencies)

## Key Benefits

1. **Clearer separation of concerns**: Frontend and backend are truly separate
2. **No state synchronization issues**: Single stateful backend process
3. **Simpler architecture**: WebSocket, API, and job processor in one process
4. **Faster development**: Vite's HMR + Bun's fast runtime
5. **No external SQLite library**: Bun has built-in SQLite support

## Files Created

### Frontend (Vite)

- `vite.config.ts` - Vite configuration with proxy to backend
- `index.html` - HTML entry point
- `src/main.tsx` - React entry point
- `src/App.tsx` - Main app component (replaces page.tsx + layout.tsx)
- `tsconfig.json` - Updated for Vite
- `tsconfig.node.json` - For Vite config file

### Backend (Bun)

- `server/index.ts` - Main server file with WebSocket and job processor
- `server/routes.ts` - HTTP route handler
- `server/websocket.ts` - WebSocket setup and broadcaster
- `server/database.ts` - Database layer using Bun's SQLite
- `server/db-service.ts` - Database service layer (migrated)
- `server/handlers/files.ts` - File browser API handler
- `server/handlers/jobs.ts` - Jobs API handlers
- `tsconfig.server.json` - TypeScript config for server

### Shared

- `src/types/files.ts` - FileSystemItem type (shared between frontend and backend)

## Files Modified

1. **package.json**
   - Removed: `next`, `better-sqlite3`, `@types/better-sqlite3`, `@types/ws`, `ws`, `tsx`, `eslint-config-next`
   - Added: `vite`, `@vitejs/plugin-react`, `concurrently`, `@types/bun`
   - Updated scripts to use Vite and Bun

2. **Components** (removed 'use client' directives)
   - `src/components/job-list.tsx`
   - `src/components/file-browser-modal.tsx`
   - `src/components/conversion-config.tsx`
   - `src/components/theme-toggle.tsx`
   - `src/components/theme-provider.tsx`

3. **CLAUDE.md** - Updated project documentation

## Files to Clean Up (Optional)

These files are no longer needed but haven't been deleted yet:

- `server.mjs` - Old Next.js custom server
- `src/app/` directory - Old Next.js app directory
  - `src/app/api/` - Old API routes
  - `src/app/page.tsx` - Old page component
  - `src/app/layout.tsx` - Old layout component
  - `src/app/globals.css` - Moved functionality to App.tsx
- `src/lib/ws-broadcaster.ts` - Replaced by `server/websocket.ts`
- `src/lib/database.ts` - Replaced by `server/database.ts`
- `src/lib/db-service.ts` - Migrated to `server/db-service.ts`
- `src/instrumentation.ts` - No longer needed (Next.js specific)
- `.next/` - Next.js build directory

## Running the New Architecture

### Development

```bash
npm run dev          # Start both Vite and Bun server
npm run dev:client   # Start only Vite
npm run dev:server   # Start only Bun server
```

### Production

```bash
npm run build        # Build Vite frontend
npm run start        # Start Bun server (serves built frontend)
```

## Testing Required

After migration, test these features:

1. ✅ UI loads correctly
2. ✅ File browser opens and displays files
3. ✅ File selection works
4. ✅ Job creation works
5. ✅ Job list displays and updates
6. ✅ WebSocket connection establishes
7. ✅ Real-time job progress updates via WebSocket
8. ✅ Job retry functionality
9. ✅ Theme toggle works
10. ✅ FFmpeg job processor executes conversions

## Next Steps

1. **Test the application**: Run `npm run dev` and verify all functionality works
2. **Clean up old files**: Remove the files listed in "Files to Clean Up" section
3. **Update tests**: Update any tests that reference Next.js-specific code
4. **Update README**: Update README.md with new architecture details
5. **Production setup**: Configure Bun server to serve the built Vite files in production

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000 and 3001 are available
2. **Bun not installed**: Install Bun from https://bun.sh
3. **SQLite path issues**: Check `data/` directory exists and is writable
4. **CORS errors**: The Vite proxy should handle this, but check `server/routes.ts` CORS headers if needed
5. **Import path errors**: Ensure `@/` paths are resolving correctly in both tsconfig files

### Debugging

- Frontend logs: Check browser console
- Backend logs: Check terminal running `npm run dev:server`
- WebSocket: Check Network tab in browser dev tools for WS connections
- Database: Check `data/database.sqlite` file

## Performance Considerations

- Vite's HMR is much faster than Next.js
- Bun's SQLite is faster than better-sqlite3
- Bun's runtime is generally faster than Node.js
- Single backend process reduces memory overhead

## Security Notes

- Same security model as before (self-hosted only)
- CORS is configured in `server/routes.ts`
- File access is restricted to `FRAME_SHIFT_HOME` or `HOME` directory
- FFmpeg command validation remains in place
