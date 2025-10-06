# Frame Shift Video - Self-Hosted Video Converter

A self-hosted web service for video conversion and compression using FFmpeg. Built with Next.js, TypeScript, and Tailwind CSS.

## Overview

Frame Shift Video provides a simple web interface for converting and compressing video files using FFmpeg. Perfect for personal use, this self-hosted solution offers full control over your video processing workflow.

## Features

### Core Functionality
- **File Management**: Upload files or select from server-local files
- **Video Conversion**: Convert between various video formats
- **Compression**: Optimize video files with customizable settings
- **Manual FFmpeg Commands**: Direct FFmpeg command input for advanced users
- **Queue Management**: Drag-and-drop reordering of conversion jobs
- **Persistent Queue**: Jobs survive server restarts and resume automatically

### User Interface
- **Single Page Application**: Clean, intuitive interface
- **Real-time Progress**: Live updates on conversion status
- **Drag & Drop Reordering**: Using React DnD Kit (except for active jobs)
- **Responsive Design**: Works on desktop and mobile devices

### Notifications
- **Pushover Integration**: Mobile push notifications for job completion
- **Discord Webhooks**: Channel notifications for team workflows
- **Configurable Alerts**: Customize notification preferences

### Data Persistence
- **SQLite Database**: Tracks all conversions and job history
- **Job Recovery**: Automatically resumes incomplete jobs on restart
- **History Tracking**: Complete audit trail of all conversions

## Technical Architecture

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **React DnD Kit**: Drag-and-drop functionality

### Backend
- **Next.js API Routes**: RESTful API endpoints
- **SQLite**: Lightweight database for job tracking
- **FFmpeg**: Video processing engine
- **Node.js**: Server-side JavaScript runtime

### Development Tools
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Husky**: Git hooks for code quality
- **TypeScript**: Static type checking

## Database Schema

```sql
-- Conversion jobs table
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  output_path TEXT,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  ffmpeg_command TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  order_index INTEGER DEFAULT 0
);

-- Notification settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

## API Endpoints

### Jobs Management
- `GET /api/jobs` - List all jobs
- `POST /api/jobs` - Create new conversion job
- `PUT /api/jobs/:id` - Update job (reorder, cancel)
- `DELETE /api/jobs/:id` - Delete job
- `POST /api/jobs/:id/restart` - Restart failed job

### File Management
- `GET /api/files` - List server files
- `POST /api/upload` - Upload new file
- `GET /api/download/:id` - Download converted file

### System
- `GET /api/status` - System status and current job
- `POST /api/settings` - Update notification settings

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- FFmpeg installed on system
- Git

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd frame-shift-video

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your settings

# Initialize database
npm run db:init

# Start development server
npm run dev
```

### Environment Variables
```env
# Pushover API
PUSHOVER_APP_TOKEN=your_app_token
PUSHOVER_USER_KEY=your_user_key

# Discord Webhook
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# File paths
UPLOAD_DIR=./uploads
OUTPUT_DIR=./outputs

# Database
DATABASE_URL=./data/jobs.db
```

## Usage

1. **Access the Web Interface**: Navigate to `http://localhost:3000`
2. **Upload or Select Files**: Choose files for conversion
3. **Configure Settings**: Select output format and quality settings
4. **Queue Jobs**: Add multiple jobs to the conversion queue
5. **Reorder Queue**: Drag and drop to reorder pending jobs
6. **Monitor Progress**: Watch real-time conversion progress
7. **Download Results**: Access converted files when complete

## Development Roadmap

### Phase 1: Core Setup ✅
- [x] Next.js project initialization
- [x] TypeScript configuration
- [x] Tailwind CSS setup
- [x] ESLint, Prettier, Husky setup

### Phase 2: Basic Infrastructure
- [ ] SQLite database setup and schema
- [ ] File upload and management system
- [ ] Basic UI layout and components

### Phase 3: Video Processing
- [ ] FFmpeg integration
- [ ] Job queue system
- [ ] Progress tracking and UI updates

### Phase 4: Advanced Features
- [ ] Drag-and-drop reordering with React DnD Kit
- [ ] Job persistence and restart logic
- [ ] Notification integrations (Pushover, Discord)

### Phase 5: Polish
- [ ] Error handling and validation
- [ ] Performance optimizations
- [ ] Documentation and deployment guides

## Security Considerations

⚠️ **Important**: This application is designed for self-hosted, personal use only. It allows direct FFmpeg command execution, which could be dangerous in multi-user or public environments.

### Safety Measures for Self-Hosting
- Run behind a firewall or VPN
- Use strong authentication if exposed to network
- Regular backups of conversion jobs and settings
- Monitor system resources during heavy conversions

## Contributing

This is a personal project, but contributions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues, feature requests, or questions, please open a GitHub issue.