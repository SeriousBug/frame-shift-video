# Frame Shift Video - Project Summary

## Project Overview

Self-hosted video conversion web service using FFmpeg, built with Next.js, TypeScript, and Tailwind CSS. Designed for personal use with a simple drag-and-drop interface for video conversion jobs.

## Key Features

- File upload and server-local file selection
- Video format conversion with customizable settings
- Manual FFmpeg command input for advanced users
- Drag-and-drop job queue reordering (React DnD Kit)
- SQLite database for job persistence and history
- Pushover and Discord notifications
- Job queue survives server restarts

## Technical Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, React DnD Kit
- **Backend**: Next.js API routes, SQLite, FFmpeg
- **Development**: ESLint, Prettier, Husky git hooks

## Project Structure

```
frame-shift-video/
├── src/
│   ├── app/                 # Next.js App Router pages
│   ├── components/          # React components
│   ├── lib/                 # Utilities and database
│   └── types/               # TypeScript type definitions
├── public/                  # Static assets
├── data/                    # SQLite database
├── uploads/                 # Uploaded video files
├── outputs/                 # Converted video files
└── README.md               # Detailed project documentation
```

## Current Status

✅ **Completed:**

- Next.js project setup with TypeScript
- Tailwind CSS configuration
- ESLint, Prettier, Husky setup
- Comprehensive project planning and documentation

🔄 **Next Steps:**

1. Set up SQLite database schema
2. Create main UI components
3. Implement FFmpeg integration
4. Add drag-and-drop functionality
5. Build notification systems

## Important Notes

- **Security**: Self-hosted only - allows direct FFmpeg execution
- **Dependencies**: Requires FFmpeg installed on host system
- **Database**: SQLite for simplicity and portability
- **Notifications**: Pushover API and Discord webhooks

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

## Reference

See `README.md` for complete project documentation, architecture details, and setup instructions.
